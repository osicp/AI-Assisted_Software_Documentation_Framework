# =============================================================================
# SCRUMMAP PLANTUML GENERATION & DIAGRAM CONSISTENCY ENGINE (uml_generator.py)
# =============================================================================
import re
import zlib
import base64
import string
import os
from typing import List, Dict, Any

def plantuml_encode(plantuml_text: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Compresses PlantUML text using zlib and encodes it using PlantUML's
    custom Base64-like alphabet (digits + uppercase + lowercase + '-_')
    to create url-safe rendering links.
    '''
    plantuml_alphabet = string.digits + string.ascii_uppercase + string.ascii_lowercase + '-_'
    base64_alphabet = string.ascii_uppercase + string.ascii_lowercase + string.digits + '+/'
    
    b64_to_plantuml = bytes.maketrans(base64_alphabet.encode('utf-8'), plantuml_alphabet.encode('utf-8'))
    
    zlibbed_str = zlib.compress(plantuml_text.encode('utf-8'))
    compressed_string = zlibbed_str[2:-4] # strip zlib headers
    
    return base64.b64encode(compressed_string).translate(b64_to_plantuml).decode('utf-8')

def generate_class_diagram(ast_symbols: List[Dict[str, Any]]) -> str:
    # Use triple-single quotes for docstring
    '''
    Compiles a set of AST ctags symbols into a valid PlantUML class diagram code block.
    '''
    classes = {}
    for sym in ast_symbols:
        path = sym.get("path") or ""
        # Get relative filename for class grouping
        filename = os.path.basename(path) if path else "Codebase"
        
        scope = sym.get("scope")
        name = sym.get("name")
        kind = sym.get("kind")
        
        # If class symbol, register it
        if kind == "class":
            classes[name] = {"methods": [], "fields": [], "filename": filename}
        # If method symbol within class scope, append it
        elif kind in ("method", "member", "function") and scope:
            if scope not in classes:
                classes[scope] = {"methods": [], "fields": [], "filename": filename}
            sig = sym.get("signature") or "()"
            classes[scope]["methods"].append(f"+{name}{sig}")

    # Emit PlantUML class format
    lines = ["@startuml", "skinparam classAttributeIconSize 0"]
    for c_name, c_data in classes.items():
        lines.append(f"class {c_name} << {c_data['filename']} >> {{")
        for m in c_data["methods"]:
            lines.append(f"  {m}")
        lines.append("}")
    lines.append("@enduml")
    return "\n".join(lines)

def generate_sequence_diagram(flow_steps: List[Dict[str, Any]]) -> str:
    # Use triple-single quotes for docstring
    '''
    Creates a PlantUML sequence diagram from a sequential list of caller/receiver flows.
    Each flow step should be a dict: {'sender': 'Alice', 'receiver': 'Bob', 'message': 'processOrder(id)'}
    '''
    lines = ["@startuml"]
    for step in flow_steps:
        sender = step.get("sender", "Client")
        receiver = step.get("receiver", "Server")
        msg = step.get("message", "call")
        lines.append(f"{sender} -> {receiver} : {msg}")
    lines.append("@enduml")
    return "\n".join(lines)

def strip_plantuml_comments(text: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Filters out PlantUML single-line and multi-line comments from the markup text.
    '''
    # Remove multi-line comments: /' ... '/
    text = re.sub(r"/'[\s\S]*?'/", "", text)
    # Remove single-line comments: lines starting with optional whitespace followed by '
    cleaned_lines = []
    for line in text.splitlines():
        if not line.strip().startswith("'"):
            cleaned_lines.append(line)
    return "\n".join(cleaned_lines)

def verify_diagram_consistency(class_diagram_text: str, sequence_diagram_text: str) -> Dict[str, Any]:
    # Use triple-single quotes for docstring
    '''
    Parses class diagrams to extract classes and methods, then scans sequence diagrams
    to verify that all communicating lifelines exist as classes, and that all method
    signatures are defined inside the target class.
    '''
    class_diagram_text = strip_plantuml_comments(class_diagram_text)
    sequence_diagram_text = strip_plantuml_comments(sequence_diagram_text)
    # 1. Parse Class Diagram
    # Match: class ClassName <<Stereotype>> or interface ClassName
    class_blocks = re.findall(r'(?:class|interface)\s+(\w+)(?:\s+<<([\s\S]*?)>>)?\s*(?:\{([\s\S]*?)\})?', class_diagram_text)
    
    class_methods = {}
    planned_classes = set()
    for class_name, stereotype, block_content in class_blocks:
        class_methods[class_name] = set()
        if stereotype and "planned" in stereotype.lower():
            planned_classes.add(class_name)
        if block_content:
            # Find methods: search for patterns like +methodName(args) or methodName() or similar
            methods = re.findall(r'(?:[+\-#~]?\s*)(\w+)\s*\(', block_content)
            for m in methods:
                class_methods[class_name].add(m)

    # 2. Parse Sequence Diagram
    # Match: participant ParticipantName or database ParticipantName, etc. (supporting optional "Name" as Alias quotes)
    declared_participants = set(re.findall(r"(?:participant|actor|boundary|control|entity|database)\s+(?:(?:(?:\"[^\"]+\"|'[^']+')\s+as\s+)?(\w+))", sequence_diagram_text))
    # Explicitly track actors to skip class validation (representing human operators)
    actor_participants = set(re.findall(r"actor\s+(?:(?:(?:\"[^\"]+\"|'[^']+')\s+as\s+)?(\w+))", sequence_diagram_text))
    # Match: A -> B: message
    arrows = re.findall(r'(\w+)\s*-(?:-)?(?:>|x)\s*(\w+)\s*:\s*(.*)', sequence_diagram_text)
    
    discovered_participants = set()
    messages = []
    for sender, receiver, msg_label in arrows:
        discovered_participants.add(sender)
        discovered_participants.add(receiver)
        # Parse method name (word characters strictly followed by an open parenthesis)
        method_match = re.match(r'^\s*(\w+)\s*\(', msg_label)
        method_name = method_match.group(1) if method_match else None
        messages.append((sender, receiver, method_name))
        
    all_sequence_participants = declared_participants.union(discovered_participants)
    
    # 3. Perform Consistency Audits
    compromised_blocks = []
    
    # Audit A: Check if sequence participants are defined in Class Diagram
    for p in all_sequence_participants:
        # Ignore standard actors (like User or Client) or explicitly declared actors
        if p.lower() in ("user", "client", "customer") or p in actor_participants:
            continue
        if p not in class_methods:
            # Check if this participant is declared as Planned in the sequence diagram text: e.g. "participant p <<Planned>>"
            is_planned_seq = re.search(r'(?:participant|actor|boundary|control|entity|database)\s+' + re.escape(p) + r'\s+<<\s*Planned\s*>>', sequence_diagram_text, re.IGNORECASE)
            if is_planned_seq:
                planned_classes.add(p)
                continue
            compromised_blocks.append({
                "type": "MISSING_CLASS",
                "detail": f"Participant '{p}' in sequence diagram is not defined in class diagram."
            })
            
    # Audit B: Check if message calls exist as methods in target receiver class
    for sender, receiver, method in messages:
        if receiver in class_methods and method:
            # Skip checking basic response returns or non-code labels
            if method.lower() in ("return", "response", "ack", "ok"):
                continue
            if receiver in planned_classes:
                # Soft validation: bypass checks for planned target classes
                continue
            if method not in class_methods[receiver]:
                compromised_blocks.append({
                    "type": "MISSING_METHOD",
                    "detail": f"Method '{method}' called on '{receiver}' is not defined inside class '{receiver}'."
                })
                
    return {
        "status": "SUCCESS" if not compromised_blocks else "INCONSISTENT",
        "compromised_blocks": compromised_blocks,
        "scanned_classes": len(class_methods),
        "scanned_messages": len(messages)
    }

# Standalone execution verify
if __name__ == "__main__":
    import os
    mock_class_diag = """
    @startuml
    class OrderService {
      +processOrder(orderId)
      +cancelOrder()
    }
    class PaymentProcessor {
      +authorizePayment(token)
    }
    @enduml
    """
    
    mock_seq_diag = """
    @startuml
    Client -> OrderService : processOrder(101)
    OrderService -> PaymentProcessor : authorizePayment(tok_abc)
    OrderService -> PaymentProcessor : invalidMethodCall()
    @enduml
    """
    
    # Run audit check
    result = verify_diagram_consistency(mock_class_diag, mock_seq_diag)
    print("Standalone Consistency Check Output:")
    import json
    print(json.dumps(result, indent=2))
