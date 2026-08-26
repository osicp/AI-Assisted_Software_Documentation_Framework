import pytest
import tempfile
import shutil
import os
import sqlite3
from unittest.mock import patch
from fastapi.testclient import TestClient

# Add workspace backend to path
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.config import settings
from backend.app.main import app
from backend.app.ledger import init_governance_db

@pytest.fixture(scope="session", autouse=True)
def setup_test_settings():
    # Store old values
    old_db = settings.DATABASE_PATH
    old_upload = settings.UPLOAD_DIR
    
    # Create temporary directory for database and uploads
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_governance.db")
    test_upload_dir = os.path.join(temp_dir, "test_uploads")
    os.makedirs(test_upload_dir, exist_ok=True)
    
    # Assign temporary paths to configuration settings singleton
    settings.DATABASE_PATH = test_db_path
    settings.UPLOAD_DIR = test_upload_dir
    settings.ZDR_COMPLIANCE = True
    
    # Configure distinct role keys to enforce RBAC
    settings.ROLE_KEY_PRODUCT_MANAGER = "rk_pm_test_secret"
    settings.ROLE_KEY_SCRUM_MASTER = "rk_sm_test_secret"
    settings.ROLE_KEY_LEAD_DEVELOPER = "rk_dev_test_secret"
    settings.ROLE_KEY_SECURITY_AUDITOR = "rk_audit_test_secret"
    settings.ROLE_KEY_SYSTEM_ADMIN = "rk_admin_test_secret"
    settings.LEDGER_HMAC_KEY = "rk_hmac_test_secret"
    
    # Initialize clean SQLite governance tables in the temporary database
    init_governance_db()
    
    yield
    
    # Cleanup temp directory
    shutil.rmtree(temp_dir, ignore_errors=True)
    
    # Restore settings
    settings.DATABASE_PATH = old_db
    settings.UPLOAD_DIR = old_upload

@pytest.fixture(autouse=True)
def clean_db():
    conn = sqlite3.connect(settings.DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM write_ahead_ledger")
    cursor.execute("DELETE FROM backlog_items")
    cursor.execute("DELETE FROM codebase_versions")
    cursor.execute("DELETE FROM projects")
    conn.commit()
    conn.close()

@pytest.fixture
def test_client():
    return TestClient(app)

@pytest.fixture(autouse=True)
def mock_llm_gateway():
    default_response = (
        '{"is_ambiguous": false, "questions": [], "epics": [{"epic_id": "EPIC-01", "title": "Mock Epic", "user_stories": [{"id": "STORY-01", "role": "User", "action": "test", "benefit": "succeed", "story_points": 3.0, "code_pointers": [], "ripple_effects": [], "unhappy_paths": []}]}]}',
        {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}
    )
    with patch("backend.app.backlog_generator.call_llm_gateway", return_value=default_response) as mock_call:
        yield mock_call
