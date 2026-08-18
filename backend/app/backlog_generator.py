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

class LLMGatewayError(Exception):
    '''Custom exception raised when connection to the remote LLM fails or times out.'''
    pass

def call_llm_gateway(prompt: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Sends prompt to FAU Trussed.ai API gateway, raising LLMGatewayError on failure/offline.
    '''
    # Verify API key is configured
    if settings.LLM_PROVIDER == "trussed":
        if settings.TRUSSED_API_KEY.lower().startswith("your_"):
            raise LLMGatewayError("LLM API gateway access key is unconfigured. Please configure TRUSSED_API_KEY inside scrummap.env.")
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
                else:
                    raise LLMGatewayError(f"Trussed API Gateway returned status code {resp.status_code}: {resp.text}")
        except Exception as e:
            if isinstance(e, LLMGatewayError):
                raise e
            raise LLMGatewayError(f"Trussed API Gateway connection failure or timeout: {str(e)}")
            
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
                else:
                    raise LLMGatewayError(f"Local LLM Gateway returned status code {resp.status_code}: {resp.text}")
        except Exception as e:
            if isinstance(e, LLMGatewayError):
                raise e
            raise LLMGatewayError(f"Local LLM Gateway connection failure or timeout: {str(e)}")
            
    raise LLMGatewayError("LLM Provider is not correctly configured inside configuration settings.")

def find_closest_valid_class(name: str, valid_names: set) -> str:
    if not name or not valid_names:
        return ""
    name_lower = name.lower().strip()
    if name in valid_names:
        return name
    # Exact case-insensitive match
    for v in valid_names:
        if v.lower() == name_lower:
            return v
    # Substring match
    for v in valid_names:
        if name_lower in v.lower() or v.lower() in name_lower:
            return v
    return ""

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
      ],
      "sequence_flow": [
        {{
          "sender": "CallerClass",
          "receiver": "ReceiverClass",
          "message": "methodName()"
        }}
      ]
    }}

    For the "sequence_flow" array:
    - Trace the sequence diagram message flows to fulfill the sprint goal.
    - You must ONLY use class names defined in the Codebase AST Symbols list, or the newly planned classes. Do NOT invent or hallucinate other class names.
    """
    
    llm_resp = call_llm_gateway(prompt)
    try:
        if "```" in llm_resp:
            match = re.search(r'```(?:json)?([\s\S]*?)```', llm_resp)
            if match:
                llm_resp = match.group(1).strip()
        res_data = json.loads(llm_resp)
        
        # Extract valid class names
        existing_classes = [s["name"] for s in ast_symbols if s.get("kind") == "class"]
        proposed_classes = set()
        for epic in res_data.get("epics", []):
            for story in epic.get("user_stories", []):
                action_str = story.get("action", "")
                match = re.search(r'`([^`]+)`', action_str)
                if match:
                    proposed_classes.add(match.group(1).strip())
                if story.get("code_pointers"):
                    for ptr in story["code_pointers"]:
                        file_name = ptr.get("file", "").split("/")[-1]
                        if file_name:
                            name = file_name.split(".")[0]
                            if name and name not in ("main", "index"):
                                proposed_classes.add(name)
        
        valid_names = set(existing_classes + list(proposed_classes))
        
        sanitized_flow = []
        for step in res_data.get("sequence_flow", []):
            sender = step.get("sender", "").strip().lstrip("+-#~ ")
            receiver = step.get("receiver", "").strip().lstrip("+-#~ ")
            msg = step.get("message", "executeTask()").strip()
            if not sender or not receiver:
                continue
            
            clean_sender = find_closest_valid_class(sender, valid_names) or sender
            clean_receiver = find_closest_valid_class(receiver, valid_names) or receiver
            
            # Re-strip clean names just in case fuzzy match retained or returned prefixes
            clean_sender = clean_sender.lstrip("+-#~ ")
            clean_receiver = clean_receiver.lstrip("+-#~ ")
            
            if clean_sender == clean_receiver and clean_sender not in existing_classes:
                clean_sender = "User"
                
            sanitized_flow.append({
                "sender": clean_sender,
                "receiver": clean_receiver,
                "message": msg
            })
            
        res_data["sequence_flow"] = sanitized_flow
        return res_data
    except Exception as e:
        raise LLMGatewayError(f"Failed to parse LLM response as JSON backlog blocks: {str(e)}. Raw response was: {llm_resp[:300]}")

if __name__ == "__main__":
    test_symbols = [{"name": "processOrder", "kind": "method", "path": "src/main/java/com/enterprise/OrderService.java"}]
    backlog = generate_backlog_items("Implement orders processing", test_symbols)
    print("Standalone Backlog Generation Output:")
    print(json.dumps(backlog, indent=2))
