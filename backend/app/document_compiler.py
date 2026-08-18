# =============================================================================
# SCRUMMAP DOCUMENT COMPILER ENGINE (document_compiler.py)
# =============================================================================
from fpdf import FPDF
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

# The only diagram-rendering host this app itself ever generates URLs for
# (see uml_generator.py's render_uml). class_diagram_url/sequence_diagram_url
# are client-supplied, so fetching an unrestricted URL here would let any
# authenticated caller use this endpoint as an SSRF proxy into internal
# network addresses.
_TRUSTED_DIAGRAM_HOSTS = {"www.plantuml.com"}

def _is_trusted_diagram_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and parsed.hostname in _TRUSTED_DIAGRAM_HOSTS

class ScrumMapPDF(FPDF):
    def header(self):
        self.set_font("helvetica", "B", 12)
        self.cell(0, 10, "ScrumMap Enterprise Software Governance & Requirements Report", border=0, new_x="LMARGIN", new_y="NEXT", align="C")
        self.line(10, 20, 200, 20)
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}} - Cryptographically Ledgered Governance Report", border=0, align="C")

def compile_pdf_report(
    project_name: str,
    project_description: Optional[str],
    user_stories: List[Dict[str, Any]],
    class_diagram_url: Optional[str] = None,
    sequence_diagram_url: Optional[str] = None,
    project_id: Optional[str] = None,
    include_timeline: Optional[bool] = False
) -> bytes:
    # Use triple-single quotes for docstring
    '''
    Compiles requirements, user stories, unhappy path acceptance criteria, code pointers,
    and diagram details into a professional corporate-styled governance PDF report.
    '''
    pdf = ScrumMapPDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    
    # Query cryptographic ledger block for this project
    ledger_info = None
    if project_id:
        try:
            from backend.app.ledger import get_db_connection
            conn = get_db_connection()
            # Enable row factory to read column names
            import sqlite3
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, timestamp, operator_id, payload_hash, block_signature FROM write_ahead_ledger WHERE project_id = ? ORDER BY id DESC LIMIT 1",
                (project_id,)
            )
            row = cursor.fetchone()
            if row:
                ledger_info = {
                    "block_id": row["id"],
                    "timestamp": row["timestamp"],
                    "operator": row["operator_id"],
                    "hash": row["payload_hash"],
                    "signature": row["block_signature"]
                }
            conn.close()
        except Exception:
            pass
    
    # 1. Title Section
    pdf.set_font("helvetica", "B", 20)
    pdf.cell(0, 15, f"Project: {project_name}", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "", 10)
    desc = project_description or "No description provided."
    pdf.multi_cell(0, 8, f"Description: {desc}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    
    # 2. Sprint Backlog Section
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Sprint Backlog & Requirements", new_x="LMARGIN", new_y="NEXT")
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)
    
    current_epic = None
    for story in user_stories:
        epic_title = story.get("epic_title")
        if epic_title and epic_title != current_epic:
            current_epic = epic_title
            pdf.ln(4)
            pdf.set_font("helvetica", "B", 12)
            pdf.set_text_color(30, 41, 59) # Slate 800 dark color for headers
            pdf.cell(0, 8, f"Epic: {current_epic}", new_x="LMARGIN", new_y="NEXT")
            pdf.line(10, pdf.get_y(), 120, pdf.get_y())
            pdf.set_text_color(0, 0, 0) # Reset back to default black
            pdf.ln(2)

        sid = story.get("id", "STORY-XX")
        role = story.get("role", "User")
        action = story.get("action", "perform action")
        benefit = story.get("benefit", "gain value")
        pts = story.get("story_points", 0.0)
        
        # Sanitize LLM-injected prefixes to prevent duplication
        role_str = role.strip()
        if role_str.lower().startswith("as a "):
            role_str = role_str[5:]
        elif role_str.lower().startswith("as "):
            role_str = role_str[3:]
            
        action_str = action.strip()
        if action_str.lower().startswith("i want to "):
            action_str = action_str[10:]
        elif action_str.lower().startswith("want to "):
            action_str = action_str[8:]
            
        benefit_str = benefit.strip()
        if benefit_str.lower().startswith("so that "):
            benefit_str = benefit_str[8:]
        elif benefit_str.lower().startswith("so "):
            benefit_str = benefit_str[3:]

        pdf.set_font("helvetica", "B", 11)
        pdf.multi_cell(0, 6, f"{sid}: As a {role_str}, I want to {action_str} so that {benefit_str} [Est: {pts} SP]", new_x="LMARGIN", new_y="NEXT")
        
        # Unhappy Paths
        pdf.set_font("helvetica", "I", 9)
        paths = story.get("unhappy_paths", [])
        if paths:
            pdf.cell(10)
            pdf.cell(0, 6, "Acceptance Criteria & Unhappy Paths:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 9)
            for path in paths:
                pdf.cell(15)
                pdf.multi_cell(0, 5, f"- {path}", new_x="LMARGIN", new_y="NEXT")
                
        # Code Pointers
        pointers = story.get("code_pointers", [])
        if pointers:
            pdf.cell(10)
            pdf.set_font("helvetica", "B", 9)
            pdf.cell(0, 6, "Traceability Code Pointers:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 9)
            for p in pointers:
                p_file = p.get("file", "unknown")
                p_lines = p.get("lines", "unknown")
                p_syms = ", ".join(p.get("symbols", []))
                pdf.cell(15)
                pdf.multi_cell(0, 5, f"- File: {p_file} (Lines: {p_lines}) [Symbols: {p_syms}]", new_x="LMARGIN", new_y="NEXT")
                
        # Ripple Risks & Side-Effects
        risks = story.get("ripple_risks", []) or story.get("ripple_effects", [])
        if isinstance(risks, str):
            try:
                import json
                risks = json.loads(risks)
            except Exception:
                risks = [risks]
        if risks and isinstance(risks, list):
            pdf.cell(10)
            pdf.set_font("helvetica", "B", 9)
            pdf.set_text_color(180, 83, 9) # Amber 700 risk color
            pdf.cell(0, 6, "Ripple Risks & Side-Effects:", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0) # Reset back to default black
            pdf.set_font("helvetica", "", 9)
            for r in risks:
                pdf.cell(15)
                pdf.multi_cell(0, 5, f"- {r}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)
        
    # 2.5 Audit Ledger Verification Block
    if ledger_info:
        pdf.ln(5)
        pdf.set_font("helvetica", "B", 10)
        pdf.set_text_color(30, 41, 59) # Slate 800 dark color for headers
        pdf.cell(0, 8, "Cryptographic Ledger Audit Verification Block", new_x="LMARGIN", new_y="NEXT")
        pdf.line(10, pdf.get_y(), 120, pdf.get_y())
        pdf.set_text_color(0, 0, 0) # Reset back to default black
        pdf.ln(2)
        pdf.set_font("helvetica", "", 8)
        
        info_txt = (
            f"Ledger Transaction ID: block_{ledger_info['block_id']}\n"
            f"Commit Timestamp: {ledger_info['timestamp']} UTC\n"
            f"Authorized Operator: {ledger_info['operator']}\n"
            f"Payload SHA-256 Hash: {ledger_info['hash']}\n"
            f"Block Signature (HMAC): {ledger_info['signature']}"
        )
        pdf.multi_cell(0, 4, info_txt, border=1, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)
        
    # 2.6 Sprint Milestones & Timeline Section
    if include_timeline:
        pdf.add_page()
        pdf.set_font("helvetica", "B", 14)
        pdf.cell(0, 10, "Sprint Milestones & Timeline", new_x="LMARGIN", new_y="NEXT")
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(5)
        
        pdf.set_font("helvetica", "", 10)
        pdf.multi_cell(0, 6, "The following timeline illustrates developer milestones mapped automatically by the Deductive Software Architecture Recovery (SAR) engine.", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
        
        # Recalculate schedule values identically to the frontend Gantt algorithm
        dev_a_time = 0
        dev_b_time = 0
        total_days = 10
        
        # Render a structured PDF Milestones Table
        pdf.set_font("helvetica", "B", 10)
        pdf.set_fill_color(241, 245, 249) # Light slate background for headers
        pdf.cell(30, 8, "Story ID", border=1, fill=True)
        pdf.cell(50, 8, "Schedule Window", border=1, fill=True)
        pdf.cell(110, 8, "Target Milestone", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font("helvetica", "", 9)
        for idx, story in enumerate(user_stories):
            pts = story.get("story_points", 3.0)
            
            # Map story points to duration days matching frontend Gantt logic
            if pts <= 1:
                duration = 1
            elif pts <= 2:
                duration = 1.5
            elif pts <= 3:
                duration = 2
            elif pts <= 5:
                duration = 3
            else:
                duration = 5
                
            if idx % 2 == 0:
                start = dev_a_time
                dev_a_time = min(total_days, dev_a_time + duration)
            else:
                start = dev_b_time
                dev_b_time = min(total_days, dev_b_time + duration)
                
            end = min(total_days, start + duration)
            week_num = 1 if start < 5 else 2
            
            # Resolve target class name using the backticks / filename parser
            action_str = story.get("action", "")
            import re
            match = re.search(r'`([^`]+)`', action_str)
            if match:
                target_name = match.group(1)
            else:
                pointers = story.get("code_pointers", [])
                if pointers and isinstance(pointers, list):
                    file_path = pointers[0].get("file", "")
                    filename = file_path.split("/")[-1].replace(".java", "") if "/" in file_path else file_path.replace(".java", "")
                    target_name = filename if filename else "Module"
                else:
                    clean_action = re.sub(r'^(implement a new |implement a |dispatch |handle |manage |manage connection |throwing a specific |using a cached state |dispatch transaction outcomes via a )', '', action_str, flags=re.IGNORECASE)
                    target_name = " ".join(clean_action.split()[:2])
            
            # Render Milestone Row
            pdf.cell(30, 8, story.get("id", "STORY-XX"), border=1)
            pdf.cell(50, 8, f"Sprint W{week_num} (Day {int(start) + 1}-{int(end)})", border=1)
            pdf.cell(110, 8, f"'{target_name}'", border=1, new_x="LMARGIN", new_y="NEXT")
            
        pdf.ln(10)
        
    # 3. Diagrams Section
    if class_diagram_url or sequence_diagram_url:
        import httpx
        import io
        
        if class_diagram_url:
            pdf.add_page()
            pdf.set_font("helvetica", "B", 14)
            pdf.cell(0, 10, "System Architecture: Class Diagram", new_x="LMARGIN", new_y="NEXT")
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(5)
            
            img_embedded = False
            if _is_trusted_diagram_url(class_diagram_url):
                try:
                    resp = httpx.get(class_diagram_url, timeout=10.0)
                    if resp.status_code == 200:
                        img_data = io.BytesIO(resp.content)
                        pdf.image(img_data, w=180)
                        img_embedded = True
                except Exception:
                    pass

            if not img_embedded:
                pdf.set_font("helvetica", "I", 10)
                pdf.multi_cell(0, 6, f"Class Diagram URL: {class_diagram_url}\n(Note: Visual diagram embedding skipped due to connection timeout or rendering server offline.)", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(10)

        if sequence_diagram_url:
            pdf.add_page()
            pdf.set_font("helvetica", "B", 14)
            pdf.cell(0, 10, "System Behavior: Sequence Diagram", new_x="LMARGIN", new_y="NEXT")
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(5)
            
            img_embedded = False
            if _is_trusted_diagram_url(sequence_diagram_url):
                try:
                    resp = httpx.get(sequence_diagram_url, timeout=10.0)
                    if resp.status_code == 200:
                        img_data = io.BytesIO(resp.content)
                        pdf.image(img_data, w=180)
                        img_embedded = True
                except Exception:
                    pass

            if not img_embedded:
                pdf.set_font("helvetica", "I", 10)
                pdf.multi_cell(0, 6, f"Sequence Diagram URL: {sequence_diagram_url}\n(Note: Visual diagram embedding skipped due to connection timeout or rendering server offline.)", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(10)
        
    return bytes(pdf.output())

if __name__ == "__main__":
    test_stories = [
        {
            "id": "STORY-42",
            "role": "Librarian",
            "action": "reserve a book",
            "benefit": "the database remains optimized",
            "story_points": 5.0,
            "code_pointers": [{"file": "OrderService.java", "lines": "10-25", "symbols": ["processOrder"]}],
            "unhappy_paths": ["Given empty card number, When order processing starts, Then abort and raise IllegalArgumentException"]
        }
    ]
    pdf_bytes = compile_pdf_report("E-Commerce Core", "Test Project Payment System", test_stories)
    print(f"Standalone PDF compiler success. Size generated: {len(pdf_bytes)} bytes.")
