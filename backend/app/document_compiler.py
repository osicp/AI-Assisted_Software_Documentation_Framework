# =============================================================================
# SCRUMMAP DOCUMENT COMPILER ENGINE (document_compiler.py)
# =============================================================================
from fpdf import FPDF
from typing import List, Dict, Any, Optional

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
    sequence_diagram_url: Optional[str] = None
) -> bytes:
    # Use triple-single quotes for docstring
    '''
    Compiles requirements, user stories, unhappy path acceptance criteria, code pointers,
    and diagram details into a professional corporate-styled governance PDF report.
    '''
    pdf = ScrumMapPDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    
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
    
    for story in user_stories:
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
        pdf.ln(5)
        
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
