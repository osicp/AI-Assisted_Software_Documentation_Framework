# =============================================================================
# SCRUMMAP CONTEXT OPTIMIZER (optimizer.py)
# =============================================================================
import re
import zipfile
import os
import stat
import shutil
import logging
from backend.app.config import settings

logger = logging.getLogger("optimizer")

# Directories and files with no functional business logic
BLACK_LIST_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.css', '.scss', '.html', '.svg', '.lock')
BLACK_LIST_DIRS = {'node_modules', '.git', '.next', 'dist', 'target', '.idea', '.vscode'}

def dilute_syntactic_structure(file_content: str, file_ext: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Syntactic Dilution: Strips multi-line blocks, comments, and empty logs
    to shrink the token context window footprint while respecting string literals.
    '''
    if file_ext in ('.java', '.js', '.ts', '.cpp', '.h'):
        out = []
        i = 0
        n = len(file_content)
        in_string = None
        escaped = False
        while i < n:
            char = file_content[i]
            
            if in_string:
                out.append(char)
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == in_string:
                    in_string = None
                i += 1
                continue
                
            if char in ('"', "'", '`'):
                in_string = char
                out.append(char)
                i += 1
                continue
                
            if i + 1 < n and file_content[i:i+2] == '//':
                i += 2
                while i < n and file_content[i] not in ('\n', '\r'):
                    i += 1
                continue
                
            if i + 1 < n and file_content[i:i+2] == '/*':
                i += 2
                while i + 1 < n and file_content[i:i+2] != '*/':
                    i += 1
                i += 2
                continue
                
            out.append(char)
            i += 1
            
        file_content = "".join(out)
        file_content = re.sub(r'(System\.out\.print|console\.log|printf)\([\s\S]*?\);', '', file_content)
        
    elif file_ext == '.py':
        out = []
        i = 0
        n = len(file_content)
        in_string = None
        escaped = False
        while i < n:
            char = file_content[i]
            
            if in_string:
                out.append(char)
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                else:
                    if in_string in ('"""', "'''"):
                        if i + 2 < n and file_content[i:i+3] == in_string:
                            out.append(file_content[i+1:i+3])
                            in_string = None
                            i += 3
                            continue
                    elif char == in_string:
                        in_string = None
                i += 1
                continue
                
            if i + 2 < n and file_content[i:i+3] in ('"""', "'''"):
                line_start = i
                is_assignment = False
                while line_start > 0 and file_content[line_start - 1] not in ('\n', '\r'):
                    line_start -= 1
                line_prefix = file_content[line_start:i]
                if '=' in line_prefix and '==' not in line_prefix and '!=' not in line_prefix and '+=' not in line_prefix:
                    is_assignment = True
                
                if not is_assignment:
                    target_quote = file_content[i:i+3]
                    i += 3
                    while i + 2 < n and file_content[i:i+3] != target_quote:
                        i += 1
                    i += 3
                    continue
                else:
                    in_string = file_content[i:i+3]
                    out.append(in_string)
                    i += 3
                    continue
                
            if char in ('"', "'"):
                in_string = char
                out.append(char)
                i += 1
                continue
                
            if char == '#':
                while i < n and file_content[i] not in ('\n', '\r'):
                    i += 1
                continue
                
            out.append(char)
            i += 1
            
        file_content = "".join(out)
        
    # Standardize whitespace and strip trailing blank spaces
    file_content = os.linesep.join([line.rstrip() for line in file_content.splitlines() if line.strip()])
    return file_content

def extract_and_purify_zip(zip_file_path: str, extract_target_dir: str):
    # Use triple-single quotes for docstring
    '''
    Scans zip file structures on-the-fly, running Structural Elimination:
    Skips non-functional configurations, assets, and binaries to contribute to compress size by ~35%.
    '''
    os.makedirs(extract_target_dir, exist_ok=True)
    file_count = 0
    
    with zipfile.ZipFile(zip_file_path, 'r') as archive:
        # Zip-Bomb protection: expansion ratio + absolute uncompressed-size ceiling.
        # member.file_size is read from the central directory - no decompression needed.
        compressed_size = os.path.getsize(zip_file_path)
        total_uncompressed = sum(member.file_size for member in archive.infolist())

        if compressed_size > 0 and (total_uncompressed / compressed_size) > settings.MAX_EXPANSION_RATIO:
            raise ValueError(
                f"Zip-Bomb detected: expansion ratio ({total_uncompressed / compressed_size:.1f}x) "
                f"exceeds the {settings.MAX_EXPANSION_RATIO}x limit."
            )
        max_uncompressed_bytes = settings.MAX_ZIP_SIZE_BYTES * settings.MAX_UNCOMPRESSED_BYTES_MULTIPLIER
        if total_uncompressed > max_uncompressed_bytes:
            raise ValueError(
                f"Zip-Bomb detected: total decompressed size ({total_uncompressed} bytes) exceeds "
                f"the absolute ceiling ({max_uncompressed_bytes} bytes)."
            )

        for member in archive.infolist():
            # Apply Zip-Bomb protection (file count)
            file_count += 1
            if file_count > settings.MAX_FILE_COUNT:
                raise ValueError(f"Zip-Bomb detected: Decompressed file count exceeded limit ({settings.MAX_FILE_COUNT} files).")

            # Reject symlink entries outright (zip-slip via symlink, not just path traversal)
            if stat.S_ISLNK(member.external_attr >> 16):
                raise PermissionError(f"Symlink entry rejected: '{member.filename}' is a symlink, not a regular file.")

            # Directory Traversal Guardrail
            # Standardize backslashes to forward slashes for cross-platform validation safety
            standardized_filename = member.filename.replace("\\", "/")
            normalized_path = os.path.normpath(standardized_filename)
            if normalized_path.startswith("..") or os.path.isabs(normalized_path):
                raise PermissionError("Traversal exploit detected: Compressed path points outside execution boundary.")
                
            # Filter directories
            path_parts = set(normalized_path.split(os.sep))
            if path_parts.intersection(BLACK_LIST_DIRS):
                continue
                
            # Filter non-functional extensions (Structural Elimination)
            if normalized_path.endswith(BLACK_LIST_EXTENSIONS):
                continue
                
            # Skip directory entries explicitly to avoid reading contents
            if member.is_dir():
                os.makedirs(os.path.join(extract_target_dir, normalized_path), exist_ok=True)
                continue
                
            # Decompress and apply Syntactic Dilution to source code files on-the-fly
            target_path = os.path.join(extract_target_dir, normalized_path)
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            
            file_ext = os.path.splitext(normalized_path)[1].lower()
            if file_ext in ('.java', '.js', '.ts', '.cpp', '.h', '.py'):
                try:
                    raw_content = archive.read(member).decode("utf-8", errors="ignore")
                    diluted_content = dilute_syntactic_structure(raw_content, file_ext)
                    with open(target_path, "w", encoding="utf-8") as f:
                        f.write(diluted_content)
                except Exception:
                    archive.extract(member, extract_target_dir)
            else:
                archive.extract(member, extract_target_dir)

            # Restore original Unix file permissions (e.g. execution bits) safely
            attr = member.external_attr >> 16
            if attr > 0:
                try:
                    # Mask out SETUID, SETGID, and sticky bits, preserving only standard permissions
                    os.chmod(target_path, attr & 0o777)
                except OSError as e:
                    logger.warning(f"Could not restore Unix file permissions for '{target_path}': {e}")
