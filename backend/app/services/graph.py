from collections import defaultdict, deque
from pathlib import PurePosixPath
from sqlalchemy.orm import Session
from app.db.models import RepositoryFile, Dependency


def _resolve(source_path: str, module: str, paths: set[str]) -> str | None:
    if not module or not module.startswith("."):
        # Python package imports are matched by suffix only when unambiguous.
        candidate_parts = module.replace(".", "/")
        candidates = [candidate_parts + suffix for suffix in (".py", "/__init__.py", ".js", ".jsx", ".ts", ".tsx")]
        exact = [path for path in paths if path in candidates or path.endswith("/" + candidate_parts + ".py")]
        return exact[0] if len(exact) == 1 else None
    parent = str(PurePosixPath(source_path).parent)
    base = str(PurePosixPath(parent, module)).replace("\\", "/")
    while "/./" in base:
        base = base.replace("/./", "/")
    parts = []
    for part in base.split("/"):
        if part == "..":
            if parts:
                parts.pop()
        elif part and part != ".":
            parts.append(part)
    base = "/".join(parts)
    candidates = [base + suffix for suffix in (".py", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.ts", "/index.tsx", "/__init__.py")]
    return next((path for path in candidates if path in paths), None)


def build_graph(db: Session, repository_id: str) -> dict:
    files = db.query(RepositoryFile).filter_by(repository_id=repository_id).all()
    deps = db.query(Dependency).join(RepositoryFile, Dependency.source_file_id == RepositoryFile.id).filter(RepositoryFile.repository_id == repository_id).all()
    by_id = {file.id: file for file in files}
    nodes = [{"id": file.id, "path": file.path, "language": file.language, "size": file.size_bytes} for file in files]
    edges = [{"id": dep.id, "source": dep.source_file_id, "target": dep.target_file_id, "import": dep.import_text, "line": dep.line, "resolved": dep.resolved} for dep in deps if dep.target_file_id in by_id]
    return {"nodes": nodes, "edges": edges}


def analyze_impact(db: Session, repository_id: str, file_id: str) -> dict:
    target = db.query(RepositoryFile).filter_by(id=file_id, repository_id=repository_id).first()
    if not target:
        return {"error": "File not found in this repository."}
    files = db.query(RepositoryFile).filter_by(repository_id=repository_id).all()
    deps = db.query(Dependency).join(RepositoryFile, Dependency.source_file_id == RepositoryFile.id).filter(RepositoryFile.repository_id == repository_id).all()
    reverse: dict[str, list[str]] = defaultdict(list)
    for dep in deps:
        if dep.resolved and dep.target_file_id:
            reverse[dep.target_file_id].append(dep.source_file_id)
    queue = deque([(target.id, [target.id])])
    seen = {target.id}
    affected = []
    while queue:
        current, path = queue.popleft()
        for dependent in reverse[current]:
            if dependent in seen:
                continue
            seen.add(dependent)
            next_path = path + [dependent]
            affected.append({"file_id": dependent, "path": next_path})
            queue.append((dependent, next_path))
    file_map = {f.id: f.path for f in files}
    return {"target": {"file_id": target.id, "path": target.path}, "affected": [{"file_id": row["file_id"], "path": file_map[row["file_id"]], "dependency_path": [file_map.get(item, item) for item in row["path"]]} for row in affected], "heuristic": True, "reasoning": "Impact follows statically resolved import edges. Dynamic imports, reflection, runtime wiring and external callers may not be represented."}
