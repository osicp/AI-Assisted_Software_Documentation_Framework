# =============================================================================
# SCRUMMAP AST SYMBOL PARSER (parser.py)
# =============================================================================
import subprocess
import os
import json
from typing import List, Dict, Any

class CtagsUnavailableError(RuntimeError):
    # Use triple-single quotes for docstring
    '''Raised when Universal Ctags is missing or fails, instead of silently returning fabricated symbol data.'''
    pass

def compile_ast_ctags_index(purified_workspace_dir: str) -> List[Dict[str, Any]]:
    # Use triple-single quotes for docstring
    '''
    Invokes the native Universal Ctags executable to extract code structures
    mapping classes, method definitions, signatures, and file line boundaries.
    Raises CtagsUnavailableError on failure rather than returning placeholder
    data — silently feeding fabricated symbols into backlog/code_pointers
    generation is worse than a caught, explicit failure.
    '''
    symbols = []
    abs_workspace_dir = os.path.abspath(purified_workspace_dir)
    cmd = [
        "ctags",
        "-R",                               # Recursive walk
        "--output-format=json",             # JSON streaming output format
        "--fields=+n+p+s+i",                # Output line numbers, signatures, inheritance
        "--languages=Java,Python,C++,C",     # Target languages
        abs_workspace_dir
    ]
    
    # Ensure Homebrew path is searched on macOS host
    env = os.environ.copy()
    if "/opt/homebrew/bin" not in env.get("PATH", ""):
        env["PATH"] = f"/opt/homebrew/bin:{env.get('PATH', '')}"
        
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, env=env)
        for line in result.stdout.splitlines():
            if line.strip():
                symbol_data = json.loads(line)
                abs_path = symbol_data.get("path")
                rel_path = os.path.relpath(abs_path, abs_workspace_dir) if abs_path else None
                symbols.append({
                    "name": symbol_data.get("name"),
                    "kind": symbol_data.get("kind"),
                    "path": rel_path,
                    "line": symbol_data.get("line"),
                    "signature": symbol_data.get("signature"),
                    "scope": symbol_data.get("scope")
                })
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        raise CtagsUnavailableError(
            f"Universal Ctags failed or is not installed ({e}). AST symbol indexing "
            f"cannot proceed for '{purified_workspace_dir}'. Install Universal Ctags "
            f"(SETUP.md §1.2) or verify the binary is on PATH inside the container."
        ) from e

    return symbols
