# Requirements: Unified Salesforce-Style Dashboard Layout

**Priority**: Ensure functionality is not compromised.

---

## 1. Visual Theme (Salesforce CRM Theme)
*   Redesign the UI visual theme to match the light-mode Salesforce CRM aesthetic (Salesforce Lightning Design System).
*   Use standard corporate colors: light-gray backgrounds (`#F3F2F1`), crisp white card panels, and a primary Salesforce blue (`#0070D2`) header bar.
*   Align the layout more with the detailed unified layout proposed in `dashboard_mockup.md` (Slide 2: Detailed Production Layout with All Controls).

## 2. Role-Based Visibility (Strict RBAC Tab/Card Filtering)
*   Instead of just validating role access at the API level, **physically hide tabs and cards** from the UI if the current active role context does not have access permissions.
*   For example:
    *   **Admin Portal** and the **Ledger Transaction Table** must only render when the **System Admin** or **Security Auditor** role is active.
    *   **ZIP Upload Ingestion** and **UML rendering** controls must only render when **Lead Developer** or **System Admin** is active.

## 3. Inline Help Tooltips ("i" Icons)
*   Include a small info `"i"` icon in the top-right corner of all dashboard cards.
*   Hovering the cursor over this icon must display a brief description of the card's purpose (e.g. detailing what the ledger auditor checks, or explaining the metrics in the KPIs panel).

## 4. Typography Enhancement (Bigger Text)
*   Increase the font size of all text and data labels inside the dashboard cards to improve readability.

## 5. Workflow-Oriented Tab Ordering
*   Re-order the navigation options to follow a logical, left-to-right software engineering workflow:
    1.  **Ingest & Map** (Upload Codebase + Goal & Requirements config).
    2.  **Backlog Kanban & Gantt** (Visual planning).
    3.  **Code Trace & UML** (Architectural consistency & AST code views).
    4.  **Auditor Console & PDF** (Ledger scans & compliance compiles).
    5.  **Analytics & KPIs** (Performance dashboard).
    6.  **Configuration & Keys** (Admin Portal settings).

## 6. Consolidate & Combine Tabs
*   Merge adjacent tabs to prevent layout fragmentation (e.g. combining requirements config and backlog tracking; combining PlantUML diagrams and the AST code explorer).

---

*Note: Focus on keeping all existing functional workflows, ledger cryptographic chains, and telemetry APIs intact (except for refactoring to the proposed unified layout layout).*
