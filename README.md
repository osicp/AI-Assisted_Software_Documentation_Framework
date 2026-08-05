# HIEScrum: Locally Hosted AI-Assisted Software Documentation & Task Generation Framework

HIEScrum is an end-to-end, locally hosted web application designed to:
- Automate technical documentation generation 
- Map business requirements directly to granular, developer-ready task tickets 
- Generate source-code annotation/explanation with strict governance and security compliance

By integrating advanced local language models as core execution layers within a deterministic verifier loop, the framework bridges the "automation valleys" in traditional Agile and DevSecOps processes by transforming raw stakeholders' requirements and large-scale codebases (up to 10GB) into verified, traceable, and compilable software development artifacts.

---

## How It Works

The framework operates entirely within a single workstation's rootless containerized boundary. It ingests the raw binary multi-part stream of the `.zip` archive in fixed **1MB chunks** and pipes them directly to transient storage on disk. During decompression, it purifies functional components. Once decompressed, it constructs high-resolution AST traceability indexes, and generates context-enriched, developer-ready Jira Epics, code annotations and PDF reports. All operations from a codebase ingestion event (`ZIP_CODEBASE_UPLOAD`) to a requirements optimization query are hashed and recorded on a tamper-proof SQLite transaction ledger to guarantee absolute enterprise audit accountability.

```
┌─────────────────------─┐ 1. Structural Elimination & Syntactic Dilution   ┌─────────────────────────┐
│  User Codebase         │ ---------------------------------------------─-► │ Optimized Code Context  │
│(Up to 10 GB-compressed)│         (SQLite Cryptographic Ledger)            │ (In-Memory LLM Cache)   │
└──────────────────------┘                                                  └────────────┬────────────┘
                                                                                         |
                                                                                         | 2. SpecMap TLR
                                                                                         ▼
┌──────────────────┐      3. SNL Verifier-Optimizer Loop                    ┌─────────────────────────┐
│ PM Requirements  │ ----------------------------------------------------─► │ Verified Requirements   │
│ (NL / Drafts)    │                                                        │ (Structured Nat. Lang.) │
└───────────--─────┘                                                        └────────────┬─-----──────┘
                                                                                         |
    ┌─----------------------------------------------------------------------------------─┘
    |                                                                                      
    ├─► 4. Bidirectional Modeling & UML Consistency Checks => Automated PlantUML Diagrams
    |                                                                                      
    ├─► 5. Reverse Engineering & Enriched Task Generation  => Granular Jira Epics, Stories & Code Pointers
    |                                                                                      
    ├─► 6. Deductive Software Architecture Recovery        => Target Conformance & Component Mapping
    |                                                                                      
    └─► 7. Annotations, Explanations & PDF Export          => Compiled Code Stubs, Explanations & PDF Report
```

### Step 1: Uploading and Preprocessing the Codebase (The Clutter Filter)
When a user uploads a compressed codebase folder (supporting sizes up to 10GB), processing every raw text token through a local Large Language Model (LLM) is computationally expensive and introduces reasoning noise. To resolve this, HIESCRUM runs a two-stage **Context Optimization** pre-processing pipeline:
* **Structural Elimination:** The application sweeps the repository tree and strips out non-functional files, asset formats (images, videos, CSS, HTML layouts), third-party package folders (e.g., `node_modules`, `vendor`), and lock files.
* **Syntactic Dilution:** The framework scrubs the remaining logic-carrying files (e.g., `.java`, `.py`, `.cpp`, `.js`) to remove excessive comments, whitespaces, and non-functional log statements.

To prevent administrative manipulation of the codebase and the generated artifacts, all model responses are hashed and appended to a SQLite database, creating a **Chained Ledger Verification:**, an immutable audit trail that ensures transparency and accountability within the enterprise environment.

### Step 2: Code Caching (Setting Up the "Local Memory")
Rather than reloading and analyzing the entire codebase for every subsequent query or requirement, this app leverages advanced **Long-Context Caching** (such as Gemini 1.5 Pro or local vLLM cache allocations).
* The cleaned codebase structure and dependency graphs are indexed and cached in-memory **exactly once**.
* Subsequent developer prompts, Q&A rounds, and task generation passes query directly against this pre-warmed cache. This mechanism **greatly reduces operational compute cost and latency**, enabling complex cross-file queries to return results in seconds.

### Step 3: Requirements Ingestion (The Verifier-Optimizer Loop)
Raw requirements submitted by stakeholders are frequently ambiguous, incomplete, or non-atomic. This app passes these through the **Verifier-Optimizer Loop**:
1. **SNL Formalization:** The input is converted into **Structured Natural Language (SNL)** based on standardized **RUPPs templates** (such as If-Condition, When-Condition, and Actor-Initiated Actions).
2. **Rule-Based Verification:** A deterministic NLP engine (built with *spaCy*) analyzes the parsed RUPPs structure against the codebase's database schema and API definitions. It identifies defects and classifies requirements into four categories: *Correct, Incorrect, Missing,* and *Extra (Hallucinated)*.
3. **Interactive Ambiguity Resolution (Human-in-the-Loop):** If the verifier detects critical omissions—for example, if a database model requires an `expire_date` field, but the Product Manager's requirement draft does not mention it—the app halts execution. It automatically generates targeted, contextual questions and comments them onto the ticket dashboard to request human clarification.
4. **Optimization:** Once resolved, the optimizer applies syntactic transformation rules to emit clean, uniform, and machine-readable requirements.

### Step 4: Automating Technical Documentation (Objective 1)
Using the verified SNL requirements and the cached codebase model, the framework automatically syntheses structured technical documentation:
* **Bidirectional UML Modeling:** The app generates structural **Class Diagrams** and behavioral **Sequence Diagrams** rendered natively via PlantUML.
* **Diagram Consistency Verification:** A specialized consistency checker validates that the lifelines, message signatures, and control loops (e.g., `alt`, `loop`, `opt` fragments) in the sequence diagrams align with the classes, attributes, and relationships defined in the class diagrams, flaggng discrepancies using deterministic heuristic checks.
* **System Deployment and Technical Guides:** The app automatically generates system constraints, dependencies, API documentation, build configurations, and step-by-step deployment instructions.

### Step 5: Requirements-to-Task Generation (Objective 2)
The framework maps requirements to implementations through a hierarchical mapping strategy (SpecMap):
* **Hierarchical SpecMap Recovery:** Instead of executing a simple text search, the system progressively narrows the search space from **Folder Discovery** (mapping requirements to high-level modules) to **File Discovery** (using dynamically cached `folder_structure.md` indexes), and finally to **Code Symbol Discovery** (utilizing **Universal Ctags** and **Tree-Sitter** to identify functions, macros, structs, constants, configurations, and database schemas).
* **Ticket Enrichment:** It translates the gap analysis (*Implemented, Partially Implemented, or Not Implemented*) into granular development tickets (Jira/GitLab format) pre-populated with:
  * **Code Pointers:** Exact file locations and line ranges that require modifications.
  * **Edge-Case Discovery:** Automatic extraction of error handling, try-catch blocks, and validation guardrails to enrich "Unhappy Path" acceptance criteria.
  * **Domino Effect Analysis:** Structural reference analysis that highlights dependent modules, REST APIs, or database boundaries that could be affected by the changes, preventing regression risks.

### Step 6: Code Annotation & Explanation (Objective 3)
This app processes your source files and outputs a traceable, properly annotated version of the code:
* Every modified file is injected with clear, non-intrusive annotations mapping specific code statements directly back to their originating RUPPs requirements (ensuring bi-directional reverse traceability).
* The dashboard displays detailed explanations of the changes alongside direct references to the specific requirements that drove them, eliminating implementation guesswork.

### Step 7: Local Rendering & PDF Output
To finalize the sprint cycle, the application aggregates the technical documentation, PlantUML diagrams, enriched Jira stories, edge cases, and code pointers into a highly polished, corporate-compliant report:
* The data is compiled into standard **DocBook XML** or **Markdown**.
* It is run through local styling sheets (using print-ready compilers like FPDF2 or LaTeX) to output a static, professionally styled **PDF document** delivered directly to the dashboard.

---

## Deployed Link

---

## Demo Video Link
