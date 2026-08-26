import pytest
from fastapi.testclient import TestClient
from backend.app.config import settings

def test_pm_unauthorized_route_access(test_client):
    """
    Asserts that a Product Manager is blocked from direct codebase upload and ledger verification.
    """
    pm_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_PRODUCT_MANAGER}
    
    # 1. Attempt upload codebase (Blocked: allowed roles are ["LEAD_DEVELOPER", "SYSTEM_ADMIN"])
    resp_upload = test_client.post(
        "/api/codebase/upload?project_id=test_proj&version_tag=v1",
        files={"codebase_zip": ("test.zip", b"dummy content", "application/zip")},
        headers=pm_headers
    )
    assert resp_upload.status_code == 403, "PM must be blocked from uploading codebases."
    assert "not authorized" in resp_upload.json()["detail"]
    
    # 2. Attempt ledger verify (Blocked: allowed roles are ["SECURITY_AUDITOR", "SYSTEM_ADMIN"])
    resp_ledger = test_client.get("/api/ledger/verify", headers=pm_headers)
    assert resp_ledger.status_code == 403, "PM must be blocked from verification endpoint."

def test_auditor_lockout(test_client):
    """
    Asserts that a Security Auditor is blocked from project initialization and backlog generation.
    """
    auditor_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_SECURITY_AUDITOR}
    
    # 1. Attempt create project (Blocked: allowed roles are ["PRODUCT_MANAGER", "SYSTEM_ADMIN"])
    resp_proj = test_client.post(
        "/api/projects",
        json={"name": "Auditor Forbidden Project", "description": "Should fail"},
        headers=auditor_headers
    )
    assert resp_proj.status_code == 403, "Auditor must be blocked from project creation."
    
    # 2. Attempt generate backlog (Blocked: allowed roles are ["PRODUCT_MANAGER", "SYSTEM_ADMIN"])
    resp_backlog = test_client.post(
        "/api/backlog/generate",
        json={"project_id": "proj_123", "sprint_goal": "Integrate payments", "ast_symbols": []},
        headers=auditor_headers
    )
    assert resp_backlog.status_code == 403, "Auditor must be blocked from generating backlog."

def test_admin_override(test_client):
    """
    Asserts that a System Admin succeeds across multiple endpoints (Admin override).
    """
    admin_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_SYSTEM_ADMIN}
    
    # 1. Project creation
    resp_proj = test_client.post(
        "/api/projects",
        json={"name": "Admin Authorized Project", "description": "Admin override test"},
        headers=admin_headers
    )
    assert resp_proj.status_code == 201, "Admin project creation must succeed."
    
    # 2. Ledger verification
    resp_ledger = test_client.get("/api/ledger/verify", headers=admin_headers)
    assert resp_ledger.status_code == 200, "Admin ledger verification must succeed."

def test_unauthenticated_request(test_client):
    """
    Asserts that requests without a valid header or unrecognized role key are blocked with 403.
    """
    # Missing header
    resp_missing = test_client.get("/api/ledger/verify")
    assert resp_missing.status_code == 403
    
    # Invalid key
    resp_invalid = test_client.get(
        "/api/ledger/verify",
        headers={"X-ScrumMap-Role-Key": "invalid_or_fake_secret"}
    )
    assert resp_invalid.status_code == 403
