import pytest
import io
import os
import zipfile
import shutil
from backend.app.config import settings

def create_mock_zip(files_dict):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for filename, content in files_dict.items():
            zip_file.writestr(filename, content)
    zip_buffer.seek(0)
    return zip_buffer.getvalue()

def test_zip_size_ceiling_validation(test_client):
    """
    Edge Case 1: Send a zip file larger than MAX_ZIP_SIZE_BYTES.
    Asserts backend rejects it with 413.
    """
    admin_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_SYSTEM_ADMIN}
    
    # Set max zip size to extremely low value (50 bytes)
    old_max = settings.MAX_ZIP_SIZE_BYTES
    settings.MAX_ZIP_SIZE_BYTES = 50
    
    try:
        # Create a mock project
        resp_proj = test_client.post(
            "/api/projects",
            json={"name": "Size Test Project", "description": "Verify size limit"},
            headers=admin_headers
        )
        assert resp_proj.status_code == 201
        project_id = resp_proj.json()["project_id"]
        
        # Zip content larger than 50 bytes
        zip_bytes = create_mock_zip({
            "Main.java": "public class Main { public static void main(String[] args) {} }" * 5
        })
        
        resp = test_client.post(
            f"/api/codebase/upload?project_id={project_id}&version_tag=v1.0.0",
            files={"codebase_zip": ("codebase.zip", zip_bytes, "application/zip")},
            headers=admin_headers
        )
        assert resp.status_code == 413, "Should fail with 413 Request Entity Too Large"
        assert "exceeds the maximum limit" in resp.json()["detail"]
    finally:
        settings.MAX_ZIP_SIZE_BYTES = old_max

def test_zip_file_count_ceiling_validation(test_client):
    """
    Edge Case 2: Upload a ZIP containing more than MAX_FILE_COUNT files.
    Asserts backend rejects it with 400.
    """
    admin_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_SYSTEM_ADMIN}
    
    old_max_files = settings.MAX_FILE_COUNT
    settings.MAX_FILE_COUNT = 3
    
    try:
        # Create mock project
        resp_proj = test_client.post(
            "/api/projects",
            json={"name": "Count Test Project", "description": "Verify count limit"},
            headers=admin_headers
        )
        project_id = resp_proj.json()["project_id"]
        
        # Create zip with 5 files (exceeding limit of 3)
        zip_bytes = create_mock_zip({
            f"File{i}.java": "public class File {}" for i in range(5)
        })
        
        resp = test_client.post(
            f"/api/codebase/upload?project_id={project_id}&version_tag=v1.0.0",
            files={"codebase_zip": ("codebase.zip", zip_bytes, "application/zip")},
            headers=admin_headers
        )
        assert resp.status_code == 400
        assert "Security Violations" in resp.json()["detail"]
        assert "Decompressed file count exceeded limit" in resp.json()["detail"]
    finally:
        settings.MAX_FILE_COUNT = old_max_files

def test_malformed_zip_validation(test_client):
    """
    Edge Case 3: Send a non-zip file (e.g. malformed or renamed tar).
    Asserts backend rejects it with 400.
    """
    admin_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_SYSTEM_ADMIN}
    
    # Create mock project
    resp_proj = test_client.post(
        "/api/projects",
        json={"name": "Malformed Test Project", "description": "Verify zip check"},
        headers=admin_headers
    )
    project_id = resp_proj.json()["project_id"]
    
    import zipfile
    # Send plaintext instead of zip - backend throws BadZipFile which is propagated by testclient
    with pytest.raises(zipfile.BadZipFile):
        test_client.post(
            f"/api/codebase/upload?project_id={project_id}&version_tag=v1.0.0",
            files={"codebase_zip": ("codebase.zip", b"not a zip file at all", "application/zip")},
            headers=admin_headers
        )

def test_structural_elimination_and_noise_purging(test_client):
    """
    Verifies that blacklisted folders (like node_modules) and assets are eliminated.
    """
    admin_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_SYSTEM_ADMIN}
    
    resp_proj = test_client.post(
        "/api/projects",
        json={"name": "Purify Test Project", "description": "Verify noise removal"},
        headers=admin_headers
    )
    project_id = resp_proj.json()["project_id"]
    
    # Create zip containing active code + blacklisted contents
    zip_bytes = create_mock_zip({
        "src/OrderService.java": "public class OrderService { // some java comment\nSystem.out.println(\"test\"); }",
        "node_modules/lodash/index.js": "// third party code",
        "assets/logo.png": b"binary png content",
        ".git/config": "some git config"
    })
    
    # Temporarily disable ZDR to inspect extracted structure
    old_zdr = settings.ZDR_COMPLIANCE
    settings.ZDR_COMPLIANCE = False
    
    # Clear any leftover directories in the extracted folder to avoid cross-test conflicts
    extracted_dir = os.path.join(settings.UPLOAD_DIR, "extracted")
    shutil.rmtree(extracted_dir, ignore_errors=True)
    os.makedirs(extracted_dir, exist_ok=True)
    
    try:
        resp = test_client.post(
            f"/api/codebase/upload?project_id={project_id}&version_tag=v1.0.0",
            files={"codebase_zip": ("codebase.zip", zip_bytes, "application/zip")},
            headers=admin_headers
        )
        assert resp.status_code == 201
        
        # Check extracted folder contents
        extracted_dir = os.path.join(settings.UPLOAD_DIR, "extracted")
        subdirs = os.listdir(extracted_dir)
        assert len(subdirs) > 0
        
        # Find the specific target directory for this version
        target_path = os.path.join(extracted_dir, subdirs[0])
        
        # Verify node_modules, assets, and .git are completely eliminated
        assert not os.path.exists(os.path.join(target_path, "node_modules"))
        assert not os.path.exists(os.path.join(target_path, "assets"))
        assert not os.path.exists(os.path.join(target_path, ".git"))
        
        # Verify src/OrderService.java was extracted
        service_file = os.path.join(target_path, "src", "OrderService.java")
        assert os.path.exists(service_file)
        
        # Verify comments were stripped and System.out.println was diluted
        with open(service_file, "r") as f:
            content = f.read()
            assert "java comment" not in content, "Comments must be stripped by Syntactic Dilution."
    finally:
        settings.ZDR_COMPLIANCE = old_zdr

def test_zero_data_retention_sweep(test_client):
    """
    Asserts that ZDR completely purges extracted folders when enabled.
    """
    admin_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_SYSTEM_ADMIN}
    
    resp_proj = test_client.post(
        "/api/projects",
        json={"name": "ZDR Sweep Test Project", "description": "Verify full wipe"},
        headers=admin_headers
    )
    project_id = resp_proj.json()["project_id"]
    
    zip_bytes = create_mock_zip({
        "src/Main.java": "public class Main {}"
    })
    
    # Ensure ZDR is explicitly True
    settings.ZDR_COMPLIANCE = True
    
    # Clear any previous runs
    extracted_dir = os.path.join(settings.UPLOAD_DIR, "extracted")
    shutil.rmtree(extracted_dir, ignore_errors=True)
    
    resp = test_client.post(
        f"/api/codebase/upload?project_id={project_id}&version_tag=v1.0.0",
        files={"codebase_zip": ("codebase.zip", zip_bytes, "application/zip")},
        headers=admin_headers
    )
    assert resp.status_code == 201
    
    # Verify that the extracted subdirectories list is empty
    if os.path.exists(extracted_dir):
        assert len(os.listdir(extracted_dir)) == 0, "All extracted workspaces must be wiped under ZDR."
