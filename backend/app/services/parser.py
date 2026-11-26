from dataclasses import dataclass
import re
from tree_sitter_language_pack import get_parser


@dataclass
class Symbol:
    kind: str
    name: str
    signature: str
    start_line: int
    end_line: int


@dataclass
class ImportRef:
    module: str
    line: int


@dataclass
class ParsedFile:
    symbols: list[Symbol]
    imports: list[ImportRef]


def _text(node, source: bytes) -> str:
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _name(node, source: bytes) -> str:
    name_node = node.child_by_field_name("name")
    if name_node is not None:
        return _text(name_node, source).strip()
    for child in node.children:
        if child.type in {"identifier", "property_identifier", "type_identifier"}:
            return _text(child, source).strip()
    return "anonymous"


def parse_source(content: str, language: str) -> ParsedFile:
    lang = {"python": "python", "javascript": "javascript", "typescript": "typescript", "tsx": "tsx"}.get(language)
    if not lang:
        return ParsedFile([], [])
    source = content.encode("utf-8")
    try:
        tree = get_parser(lang).parse(source)
    except Exception as exc:
        raise ValueError(f"Tree-sitter parser unavailable for {language}") from exc
    symbols: list[Symbol] = []
    imports: list[ImportRef] = []
    symbol_types = {"function_definition": "function", "function_declaration": "function", "generator_function_declaration": "function", "class_definition": "class", "class_declaration": "class", "method_definition": "method"}
    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        if node.type in symbol_types:
            name = _name(node, source)
            sig = _text(node, source).splitlines()[0][:500].strip() if node.end_byte > node.start_byte else name
            symbols.append(Symbol(symbol_types[node.type], name, sig, node.start_point.row + 1, node.end_point.row + 1))
        elif node.type == "variable_declarator":
            value = node.child_by_field_name("value")
            name_node = node.child_by_field_name("name")
            if value is not None and name_node is not None and value.type in {"arrow_function", "function_expression"}:
                symbols.append(Symbol("function", _text(name_node, source), _text(node, source).splitlines()[0][:500].strip(), node.start_point.row + 1, node.end_point.row + 1))
        if node.type in {"import_statement", "import_from_statement", "export_statement"}:
            raw = _text(node, source).strip()
            module = ""
            if language == "python":
                match = re.match(r"(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", raw)
                module = (match.group(1) or match.group(2)) if match else ""
            else:
                match = re.search(r"(?:from\s*)?['\"]([^'\"]+)['\"]", raw)
                module = match.group(1) if match else ""
            if module:
                imports.append(ImportRef(module, node.start_point.row + 1))
        stack.extend(reversed(node.children))
    symbols.sort(key=lambda item: (item.start_line, item.name))
    imports.sort(key=lambda item: (item.line, item.module))
    return ParsedFile(symbols, imports)


def chunk_source(content: str, chunk_lines: int = 90, overlap: int = 12) -> list[tuple[int, int, str]]:
    lines = content.splitlines()
    if not lines:
        return []
    chunks = []
    start = 0
    while start < len(lines):
        end = min(len(lines), start + chunk_lines)
        body = "\n".join(lines[start:end])
        chunks.append((start + 1, end, body))
        if end == len(lines):
            break
        start = max(start + 1, end - overlap)
    return chunks
