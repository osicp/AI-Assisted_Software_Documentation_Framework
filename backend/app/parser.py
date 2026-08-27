# =============================================================================
# SCRUMMAP AST SYMBOL PARSER (parser.py)
# =============================================================================
import subprocess
import os
import json
import re
from typing import List, Dict, Any, Optional, TypedDict

class CtagsUnavailableError(RuntimeError):
    # Use triple-single quotes for docstring
    '''Raised when Universal Ctags is missing or fails, instead of silently returning fabricated symbol data.'''
    pass

class ASTSymbol(TypedDict, total=False):
    name: str
    kind: str
    path: Optional[str]
    line: Optional[int]
    signature: Optional[str]
    scope: Optional[str]

def _build_ctags_command(abs_workspace_dir: str) -> List[str]:
    '''
    Builds the CLI command list to invoke Universal Ctags.
    '''
    return [
        "ctags",
        "-R",                               # Recursive walk
        "--exclude=.git",
        "--exclude=.next",
        "--output-format=json",             # JSON streaming output format
        "--fields=+n+p+s+S+i",              # Output line numbers, scope, method signatures (S, not s), inheritance
        "--languages=Java,Python,C++,C,JavaScript,TypeScript",     # Target languages
        abs_workspace_dir
    ]

def _parse_ctags_line(line: str, abs_workspace_dir: str) -> Optional[ASTSymbol]:
    '''
    Parses a single JSON line output from Universal Ctags.
    '''
    if not line.strip():
        return None
    try:
        symbol_data = json.loads(line)
    except json.JSONDecodeError:
        return None
        
    abs_path = symbol_data.get("path")
    rel_path = os.path.relpath(abs_path, abs_workspace_dir) if abs_path else None
    
    return ASTSymbol(
        name=symbol_data.get("name"),
        kind=symbol_data.get("kind"),
        path=rel_path,
        line=symbol_data.get("line"),
        signature=symbol_data.get("signature"),
        scope=symbol_data.get("scope")
    )

def _extract_relationships(abs_workspace_dir: str, symbols: List[ASTSymbol]) -> List[ASTSymbol]:
    '''
    Extracts class usage relationships by searching class name occurrences within class files.
    '''
    relationships: List[ASTSymbol] = []
    class_symbols = [s for s in symbols if s.get("kind") == "class"]
    class_names = {s["name"]: s for s in class_symbols}
    
    for c_name, c_sym in class_names.items():
        rel_path = c_sym.get("path")
        if not rel_path:
            continue
        file_path = os.path.join(abs_workspace_dir, rel_path)
        if not os.path.exists(file_path):
            continue
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            words = set(re.findall(r"\b\w+\b", content))
            for other_name in class_names:
                if other_name != c_name and other_name in words:
                    relationships.append(ASTSymbol(
                        name=f"{c_name} --> {other_name}",
                        kind="relationship",
                        path=rel_path,
                        line=1,
                        signature=other_name,
                        scope=c_name
                    ))
        except Exception:
            pass
            
    return relationships

def compile_ast_ctags_index(purified_workspace_dir: str) -> List[ASTSymbol]:
    # Use triple-single quotes for docstring
    '''
    Invokes the native Universal Ctags executable to extract code structures
    mapping classes, method definitions, signatures, and file line boundaries.
    Raises CtagsUnavailableError on failure rather than returning placeholder
    data — silently feeding fabricated symbols into backlog/code_pointers
    generation is worse than a caught, explicit failure.
    '''
    symbols: List[ASTSymbol] = []
    abs_workspace_dir = os.path.abspath(purified_workspace_dir)
    cmd = _build_ctags_command(abs_workspace_dir)
    
    # Ensure Homebrew path is searched on macOS host
    env = os.environ.copy()
    if "/opt/homebrew/bin" not in env.get("PATH", ""):
        env["PATH"] = f"/opt/homebrew/bin:{env.get('PATH', '')}"
        
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, env=env)
        for line in result.stdout.splitlines():
            parsed = _parse_ctags_line(line, abs_workspace_dir)
            if parsed:
                symbols.append(parsed)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        raise CtagsUnavailableError(
            f"Universal Ctags failed or is not installed ({e}). AST symbol indexing "
            f"cannot proceed for '{purified_workspace_dir}'. Install Universal Ctags "
            f"(SETUP.md §1.2) or verify the binary is on PATH inside the container."
        ) from e

    # Extract class associations using static imports/usage analysis
    relationships = _extract_relationships(abs_workspace_dir, symbols)
    symbols.extend(relationships)

    return symbols
