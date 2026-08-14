# =============================================================================
# SCRUMMAP BACKLOG GENERATOR & LLM GATEWAY INTERFACE (backlog_generator.py)
# =============================================================================
import re
import json
import httpx
from typing import List, Dict, Any, Optional
from backend.app.config import settings

def get_mock_llm_response(prompt: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Returns standard mock structured Agile backlog JSON for fallback and offline tests.
    '''
    mock_data = {
      "epics": [
        {
          "epic_id": "EPIC-01",
          "title": "Payment Core Processing",
          "user_stories": [
            {
              "id": "STORY-42",
              "role": "Librarian",
              "action": "reserve a book",
              "benefit": "the database remains optimized",
              "story_points": 5.0,
              "code_pointers": [
                {
                  "file": "src/main/java/com/enterprise/OrderService.java",
                  "lines": "10-25",
                  "symbols": ["processOrder()"]
                }
              ],
              "ripple_risks": [
                "Database locks if connection pools are saturated"
              ],
              "unhappy_paths": [
                "Given a user is logged in, When the Order ID is negative, Then throw IllegalArgumentException"
              ]
            }
          ]
        }
      ]
    }
    return json.dumps(mock_data)

def call_llm_gateway(prompt: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Sends prompt to FAU Trussed.ai API gateway, falling back to mock response on failure/offline.
    '''
    # Verify API key is configured
    if settings.LLM_PROVIDER == "trussed" and not settings.TRUSSED_API_KEY.lower().startswith("your_"):
        headers = {
            "Authorization": f"Bearer {settings.TRUSSED_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": settings.LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2
        }
        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(settings.TRUSSED_API_URL, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
        except Exception:
            pass
    elif settings.LLM_PROVIDER == "openai-compatible" and settings.OPENAI_BASE_URL:
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY or ''}",
            "Content-Type": "application/json"
        }
        url = settings.OPENAI_BASE_URL
        if not url.endswith("/chat/completions"):
            url = url.rstrip("/") + "/chat/completions"
        payload = {
            "model": settings.LOCAL_LLM_MODEL or "default",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2
        }
        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
        except Exception:
            pass
            
    return get_mock_llm_response(prompt)

def generate_backlog_items(
    sprint_goal: str,
    ast_symbols: List[Dict[str, Any]],
    refined_requirements: Optional[str] = None
) -> Dict[str, Any]:
    # Use triple-single quotes for docstring
    '''
    Combines sprint metadata, AST structures, and refined requirement statements
    to compile the LLM prompt, querying the API gateway to parse JSON backlog tickets.
    '''
    # Summarize symbol list to avoid token limit issues
    symbols_summary = json.dumps(ast_symbols[:40], indent=2)
    
    prompt = f"""
    You are an expert Agile Product Manager and Software Architect.
    Analyze the following sprint goal, codebase symbols list, and requirements, and output a sprint backlog structured strictly in JSON format.
    
    Sprint Goal: {sprint_goal}
    Codebase AST Symbols:
    {symbols_summary}
    Refined Requirements:
    {refined_requirements or "None provided"}
    
    Respond ONLY with a raw JSON block matching this schema:
    {{
      "epics": [
        {{
          "epic_id": "EPIC-XX",
          "title": "Epic Title",
          "user_stories": [
            {{
              "id": "STORY-XX",
              "role": "User Role",
              "action": "perform action",
              "benefit": "gain benefit",
              "story_points": 5.0,
              "code_pointers": [
                {{
                  "file": "path/to/File.java",
                  "lines": "start-end",
                  "symbols": ["methodName()"]
                }}
              ],
              "ripple_risks": ["Risk description"],
              "unhappy_paths": ["GWT acceptance criteria description"]
            }}
          ]
        }}
      ]
    }}
    """
    
    llm_resp = call_llm_gateway(prompt)
    try:
        if "```" in llm_resp:
            match = re.search(r'```(?:json)?([\s\S]*?)```', llm_resp)
            if match:
                llm_resp = match.group(1).strip()
        return json.loads(llm_resp)
    except Exception:
        return json.loads(get_mock_llm_response(prompt))

if __name__ == "__main__":
    test_symbols = [{"name": "processOrder", "kind": "method", "path": "src/main/java/com/enterprise/OrderService.java"}]
    backlog = generate_backlog_items("Implement orders processing", test_symbols)
    print("Standalone Backlog Generation Output:")
    print(json.dumps(backlog, indent=2))
