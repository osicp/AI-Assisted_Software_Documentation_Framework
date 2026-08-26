import os
import sys
import unittest
from fastapi.testclient import TestClient

# Add workspace backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app
from backend.app.config import settings

class TestAmbiguityResolution(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.headers = {
            "X-ScrumMap-Role-Key": settings.ROLE_KEY_PRODUCT_MANAGER
        }
        # First, ensure there is a project and codebase version in the test DB
        import uuid
        project_name = f"Test Project for Ambiguity {uuid.uuid4().hex[:6]}"
        resp = self.client.post(
            "/api/projects",
            json={"name": project_name, "description": "Verify validation flow"},
            headers=self.headers
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.project_id = data["project_id"]

        # Insert a fake codebase version tag so that generation doesn't fail on "No codebase version found"
        import sqlite3
        conn = sqlite3.connect(settings.DATABASE_PATH)
        cursor = conn.cursor()
        version_id = f"test_version_{uuid.uuid4().hex[:6]}"
        cursor.execute(
            "INSERT INTO codebase_versions (id, project_id, version_tag, zip_checksum, purified_size_bytes) VALUES (?, ?, ?, ?, ?)",
            (version_id, self.project_id, "v1.0.0", "checksum123", 1000)
        )
        conn.commit()
        conn.close()

    def test_ambiguity_resolution_flow(self):
        # 1. Hit generate endpoint with an ambiguous requirements text
        payload = {
            "project_id": self.project_id,
            "sprint_goal": "Implement order checkout service",
            "ast_symbols": [
                {"name": "OrderController", "kind": "class", "path": "OrderController.java"},
                {"name": "CheckoutService", "kind": "class", "path": "CheckoutService.java"}
            ],
            "refined_requirements": "The system should checkout orders. Make sure to validate everything, check limits, and charge card."
        }
        
        # When we send it without answers, it should analyze and potentially return CLARIFICATION_NEEDED.
        # Since we use Trussed LLM in the background, we might hit the real gateway.
        # Let's perform the call and check the response structure.
        resp = self.client.post("/api/backlog/generate", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        
        # If it returned CLARIFICATION_NEEDED, test providing answers
        if data.get("status") == "CLARIFICATION_NEEDED":
            print("Successfully triggered CLARIFICATION_NEEDED validation step.")
            questions = data["questions"]
            self.assertTrue(len(questions) > 0)
            
            # 2. Resubmit with answers populated
            answers = {q: "Standard default mock answer to resolve gap." for q in questions}
            payload["answers"] = answers
            
            resp_resolved = self.client.post("/api/backlog/generate", json=payload, headers=self.headers)
            self.assertEqual(resp_resolved.status_code, 200)
            data_resolved = resp_resolved.json()
            self.assertIn("epics", data_resolved)
            print("Successfully bypassed validation and generated backlog using user answers.")
        else:
            # If the LLM deemed it not ambiguous, it will directly return the epics backlog.
            # This is also a successful validation pass.
            self.assertIn("epics", data)
            print("LLM deemed requirements not ambiguous and proceeded directly to backlog generation.")

if __name__ == "__main__":
    unittest.main()
