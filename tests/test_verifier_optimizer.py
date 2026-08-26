import pytest
from unittest.mock import patch
from backend.app.sbert_clustering import extract_actors_from_stories, cluster_and_align_backlog
from backend.app.config import settings

def test_gwt_rupps_actor_extraction_via_spacy():
    """
    Verifies that the spaCy-driven actor tagger tokenizes and extracts the actor noun phrase
    following the "As a/an" prefix.
    """
    stories = [
        "As a Customer, I want to checkout my cart.",
        "As an Enterprise System Administrator, I want to view write-ahead transaction logs.",
        "As a guest developer, I want to test stubs."
    ]
    
    actors = extract_actors_from_stories(stories)
    assert actors[0] == "Customer", "Should extract simple singular noun."
    assert actors[1] == "Enterprise System Administrator", "Should extract multi-word contiguous proper nouns."
    assert actors[2] == "guest developer", "Should successfully extract guest developer."

def test_architectural_layer_alignment():
    """
    Asserts SBERT and K-Means backlog clustering aligns stories to the correct reference layers.
    """
    stories = [
        "As a user I want to click a button on the billing page screen",
        "As a developer I want to call the checkout API controller route",
        "As an auditor I want to calculate hash chains and validate inputs"
    ]
    
    # Run SBERT clustering
    alignment = cluster_and_align_backlog(stories, n_clusters=2)
    assert len(alignment) == 3
    
    # Assert layer mapping logic
    assert alignment[0]["architectural_layer"] == "Presentation [Pr]"
    assert alignment[1]["architectural_layer"] == "Application Services [Ap]"
    assert alignment[2]["architectural_layer"] == "Domain Services [Do]"

def test_missing_dependency_ambiguity_trigger(test_client):
    """
    Asserts that if the requirements are ambiguous, the Verifier-Optimizer halts execution,
    returns status=CLARIFICATION_NEEDED, and raises targeted questions.
    """
    pm_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_PRODUCT_MANAGER}
    
    # 1. Register project
    resp_proj = test_client.post(
        "/api/projects",
        json={"name": "Ambiguity Test Project", "description": "Verification flow"},
        headers=pm_headers
    )
    project_id = resp_proj.json()["project_id"]
    
    # 2. Mock check_requirements_ambiguity to return True with a targeted question
    mock_ambiguous_resp = (
        '{"is_ambiguous": true, "questions": ["What is the default expiration range for Vouchers?"]}',
        {}
    )
    
    payload = {
        "project_id": project_id,
        "sprint_goal": "Implement order vouchers",
        "ast_symbols": [{"name": "VoucherService", "kind": "class", "path": "VoucherService.java"}],
        "refined_requirements": "Create a new voucher generation service. It must validate inputs."
    }
    
    with patch("backend.app.backlog_generator.call_llm_gateway", return_value=mock_ambiguous_resp):
        resp = test_client.post("/api/backlog/generate", json=payload, headers=pm_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "CLARIFICATION_NEEDED"
        assert "What is the default expiration range for Vouchers?" in data["questions"]

def test_ambiguity_resolution_with_answers(test_client):
    """
    Asserts that resubmitting with answers bypassed the ambiguity check and compiles the backlog.
    """
    pm_headers = {"X-ScrumMap-Role-Key": settings.ROLE_KEY_PRODUCT_MANAGER}
    
    # Register project
    resp_proj = test_client.post(
        "/api/projects",
        json={"name": "Answers Test Project", "description": "Verification flow"},
        headers=pm_headers
    )
    project_id = resp_proj.json()["project_id"]
    
    # Insert codebase version tag in database to pass foreign key check
    import sqlite3
    conn = sqlite3.connect(settings.DATABASE_PATH)
    cursor = conn.cursor()
    version_id = "ver_test_gen"
    cursor.execute(
        "INSERT INTO codebase_versions (id, project_id, version_tag, zip_checksum, purified_size_bytes) VALUES (?, ?, ?, ?, ?)",
        (version_id, project_id, "v1.0.0", "checksum123", 100)
    )
    conn.commit()
    conn.close()
    
    # Payload including resolved answers
    payload = {
        "project_id": project_id,
        "sprint_goal": "Implement order vouchers",
        "ast_symbols": [{"name": "VoucherService", "kind": "class", "path": "VoucherService.java"}],
        "refined_requirements": "Create a new voucher generation service. It must validate inputs.",
        "answers": {"What is the default expiration range for Vouchers?": "30 days from creation."}
    }
    
    # Mock LLM backlog generation response
    mock_backlog_json = (
        '{"epics": [{"epic_id": "EPIC-01", "title": "Vouchers", "user_stories": [{"id": "STORY-01", "role": "PM", "action": "create voucher", "benefit": "optimal", "story_points": 5.0, "code_pointers": [{"file": "VoucherService.java", "lines": "10-25", "symbols": ["create"]}], "ripple_effects": [], "unhappy_paths": []}]}]}',
        {"prompt_tokens": 100, "completion_tokens": 100, "total_tokens": 200}
    )
    
    with patch("backend.app.backlog_generator.call_llm_gateway", return_value=mock_backlog_json):
        resp = test_client.post("/api/backlog/generate", json=payload, headers=pm_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "epics" in data
        assert data["epics"][0]["title"] == "Vouchers"
