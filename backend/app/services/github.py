import re
from pathlib import PurePosixPath
from urllib.parse import quote, urlparse
import httpx
from app.core.config import get_settings

IGNORED_DIRS = {".git", "node_modules", "vendor", "dist", "build", "coverage", ".next", "__pycache__", ".venv", "venv", "target", "generated", "third_party"}
SUPPORTED = {".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".ts": "typescript", ".tsx": "typescript"}


class GitHubError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def validate_github_url(value: str) -> tuple[str, str, str]:
    try:
        parsed = urlparse(value.strip())
        port = parsed.port
    except ValueError as exc:
        raise GitHubError("Enter a valid public GitHub repository URL.") from exc
    if parsed.scheme not in {"http", "https"} or parsed.hostname != "github.com" or port or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise GitHubError("Enter a public GitHub URL like https://github.com/owner/repository.")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) != 2 or any(part in {".", ".."} for part in parts):
        raise GitHubError("Use a repository URL only (owner/repository), without a subpath.")
    owner, repo = parts
    repo = re.sub(r"\.git$", "", repo, flags=re.I)
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", repo):
        raise GitHubError("The owner or repository name contains unsupported characters.")
    return owner, repo, f"{owner}/{repo}"


def _ignored(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return not parts or path.startswith("/") or ".." in parts or any(part in IGNORED_DIRS for part in parts[:-1])


def fetch_public_repository(owner: str, repo: str) -> tuple[dict, list[dict]]:
    settings = get_settings()
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "RepoMind-AI"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    timeout = httpx.Timeout(settings.github_timeout_seconds)
    try:
        with httpx.Client(timeout=timeout, headers=headers, follow_redirects=False) as api_client, httpx.Client(timeout=timeout, follow_redirects=False) as raw_client:
            response = api_client.get(f"https://api.github.com/repos/{owner}/{repo}")
            if response.status_code == 404:
                raise GitHubError("Repository not found or not public.", 404)
            if response.status_code == 403 and response.headers.get("X-RateLimit-Remaining") == "0":
                raise GitHubError("GitHub API rate limit reached. Try again later or configure a read-only token.", 429)
            if response.status_code >= 400:
                raise GitHubError(f"GitHub rejected the repository request ({response.status_code}).", response.status_code)
            metadata = response.json()
            if metadata.get("private"):
                raise GitHubError("Only public repositories are supported.", 403)
            branch = metadata.get("default_branch") or "main"
            branch_path = quote(branch, safe="/-._~")
            tree_response = api_client.get(f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch_path}?recursive=1")
            if tree_response.status_code >= 400:
                raise GitHubError(f"Could not read repository tree ({tree_response.status_code}).", tree_response.status_code)
            tree = tree_response.json()
            if tree.get("truncated"):
                raise GitHubError("GitHub truncated this repository tree. Use a smaller repository for this MVP.", 413)
            candidates = []
            for entry in tree.get("tree", []):
                if entry.get("type") != "blob":
                    continue
                path = entry.get("path", "")
                if _ignored(path):
                    continue
                language = SUPPORTED.get(PurePosixPath(path).suffix.lower())
                if not language:
                    continue
                size = int(entry.get("size") or 0)
                if size <= 0 or size > settings.max_file_bytes:
                    continue
                candidates.append((entry, language, size))
            candidates = candidates[:settings.max_repo_files]
            files = []
            total = 0
            for entry, language, size in candidates:
                if total + size > settings.max_total_bytes:
                    break
                path = entry["path"]
                raw_path = quote(path, safe="/@-._~")
                raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch_path}/{raw_path}"
                # This client has no API Authorization header: the optional token stays on api.github.com only.
                raw = raw_client.get(raw_url, headers={"Accept": "text/plain", "User-Agent": "RepoMind-AI"})
                if raw.status_code != 200 or raw.url.host != "raw.githubusercontent.com":
                    continue
                content = raw.content
                if len(content) > settings.max_file_bytes or b"\x00" in content:
                    continue
                try:
                    text_content = content.decode("utf-8")
                except UnicodeDecodeError:
                    continue
                files.append({"path": path, "language": language, "size_bytes": len(content), "sha": entry.get("sha"), "content": text_content})
                total += len(content)
            return metadata, files
    except GitHubError:
        raise
    except httpx.TimeoutException as exc:
        raise GitHubError("GitHub request timed out. Try again later.", 504) from exc
    except httpx.HTTPError as exc:
        raise GitHubError("Could not connect to GitHub.", 502) from exc
