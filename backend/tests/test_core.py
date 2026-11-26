import pytest
from app.services.github import GitHubError, validate_github_url
from app.services.parser import parse_source, chunk_source


def test_valid_github_url_normalizes_git_suffix():
    assert validate_github_url("https://github.com/pallets/itsdangerous.git") == ("pallets", "itsdangerous", "pallets/itsdangerous")


@pytest.mark.parametrize("value", ["https://evil.example/owner/repo", "https://github.com/owner/repo/tree/main", "https://github.com/owner/repo?x=1", "https://github.com:invalid/owner/repo", "file:///etc/passwd", "https://user:pass@github.com/owner/repo"])
def test_invalid_github_urls_are_rejected(value):
    with pytest.raises(GitHubError):
        validate_github_url(value)


def test_tree_sitter_extracts_python_symbols_and_imports():
    result = parse_source("from pathlib import Path\n\ndef load_settings(path):\n    return Path(path)\n\nclass Index:\n    pass\n", "python")
    assert [(symbol.kind, symbol.name) for symbol in result.symbols] == [("function", "load_settings"), ("class", "Index")]
    assert result.imports[0].module == "pathlib"
    assert result.symbols[0].start_line == 3


def test_tree_sitter_extracts_typescript_functions_classes_and_imports():
    result = parse_source("import { readFile } from './files';\nexport function boot(): void {}\nexport class Engine {}\nconst helper = () => true;\n", "typescript")
    names = {symbol.name for symbol in result.symbols}
    assert {"boot", "Engine", "helper"}.issubset(names)
    assert result.imports[0].module == "./files"


def test_chunking_preserves_line_ranges_and_content():
    source = "\n".join(f"line {number}" for number in range(1, 201))
    chunks = chunk_source(source, chunk_lines=80, overlap=10)
    assert chunks[0][0:2] == (1, 80)
    assert chunks[1][0] == 71
    assert chunks[-1][1] == 200
    assert "line 1" in chunks[0][2]


def test_unsupported_language_returns_empty_parse():
    assert parse_source("text", "markdown").symbols == []
