# =============================================================================
# SCRUMMAP CONTEXT OPTIMIZER (optimizer.py)
# =============================================================================
import re
import zipfile
import os
import stat
import shutil
from backend.app.config import settings

# Directories and files with no functional business logic
BLACK_LIST_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.css', '.scss', '.html', '.svg', '.lock')
BLACK_LIST_DIRS = {'node_modules', '.git', '.next', 'dist', 'target', '.idea', '.vscode'}

def dilute_syntactic_structure(file_content: str, file_ext: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Syntactic Dilution: Strips multi-line blocks, comments, and empty logs
    to shrink the token context window footprint.
    '''
    if file_ext in ('.java', '.js', '.ts', '.cpp', '.h'):
        # Strip multi-line comments
        file_content = re.sub(r'/\*.*?\*/', '', file_content, flags=re.DOTALL)
        # Strip single-line comments
        file_content = re.sub(r'//.*$', '', file_content, flags=re.MULTILINE)
        # Strip logging traces (e.g. system.out.println, console.log)
        file_content = re.sub(r'(System\.out\.print|console\.log|printf)\(.*?\);', '', file_content)
    elif file_ext == '.py':
        # Strip triple-quote docstrings
        file_content = re.sub(r'"""(.*?)"""', '', file_content, flags=re.DOTALL)
        file_content = re.sub(r"'''(.*?)'''", '', file_content, flags=re.DOTALL)
        # Strip single-line comments
        file_content = re.sub(r'#.*$', '', file_content, flags=re.MULTILINE)
        
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
            normalized_path = os.path.normpath(member.filename)
            if normalized_path.startswith("..") or os.path.isabs(normalized_path):
                raise PermissionError("Traversal exploit detected: Compressed path points outside execution boundary.")
                
            # Filter directories
            path_parts = set(normalized_path.split(os.sep))
            if path_parts.intersection(BLACK_LIST_DIRS):
                continue
                
            # Filter non-functional extensions (Structural Elimination)
            if normalized_path.endswith(BLACK_LIST_EXTENSIONS):
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

            # Restore original Unix file permissions (e.g. execution bits)
            attr = member.external_attr >> 16
            if attr > 0:
                try:
                    os.chmod(target_path, attr)
                except OSError:
                    # Non-fatal: ignore permission errors on unsupported filesystems
                    pass
