# ScrumMap: Locally Hosted AI-Assisted Software Documentation & Task Generation Framework
by: Oswaldo Carretero | z23741656 | ocarreteropa2023@fau.edu
___
## Problem Statement

Agile software development environments evolve rapidly due to continuous stakeholder feedback, iterative feature delivery, and frequent design changes. While this approach improves product adaptability and customer alignment, it introduces overhead in maintaining accurate technical documentation and project planning artifacts.

---
## Target Users

**Engineering teams** struggle to keep up with the demands of documenting and planning for these changes, often resorting to manual processes that are time-consuming and error-prone. Additionally, evolving requirements and design modifications require **Scrum Masters**, and **Project Leads** to repeadtedly analyze updated documentation and manually create new epics, user stories, and development tasks, which is a tedious process.

---
## Proposed Solution

To solve these challenges, this project proposes integrating locally hosted LLMs as core execution layers within a deterministic verifier loop to transform raw stakeholders' requirements and large-scale codebases into verified, traceable, and compilable software development artifacts. In other words, this framework would offer a secure, end-to-end, on-premise software solution designed to:
- Protect proprietary codebase assets while maintaining high engineering efficiency.
- Automate the generation of technical documentation
- Map business requirements directly to granular, developer-ready task tickets
- Generate source-code annotation/explanation with strict governance and security compliance

Unlike typical Retrieval-Augmented Generation (RAG) frameworks that rely on vector similarity metrics to retrieve code snippets for large language models, **ScrumMap** employs an advanced hybrid approach that combines semantic understanding with architectural strictness.

---

## How It Works

ScrumMap is a framework that prioritizes deterministic API-First execution over Probabilistic-Interface interaction. It operates entirely within a single workstation's environment where all services are isolated inside a unified rootless `Podman pod`. First, it ingests the raw binary multi-part stream of the `.zip` archive in fixed **1MB chunks** and pipes them directly to temporary storage on disk. During decompression, it purifies functional components. Once decompressed, it constructs high-resolution AST traceability indexes. To comply with **Zero-Data Retention**, immediately after static AST symbol extraction and intermediate schema caching are completed, the framework recursively wipes the **raw unzipped codebase directories and files** from disk. Skeletal stubs and annotations are generated dynamically from cached database symbol indexes, ensuring no source code is retained on disk. Stakeholder's requirements are also processed and refined using deterministic rules. and then evaluated against the compiled codebase AST indexes and database schemas. This is then fed into the LLM to translate the gap analysis into developer-ready-task cards, any ambiguities in this step is resolved interactively with a human-in-the-loop layer. All operations from a codebase ingestion event (`ZIP_CODEBASE_UPLOAD`) to a requirements optimization query are hashed and recorded in a tamper-proof `SQLite database` transaction ledger to guarantee absolute enterprise audit accountability.

```
┌─────────────────------─┐ 1. Structural Elim. & Syntactic Dil. ┌────────────────────────┐
│  User Codebase         │ -----------------------------------► │ Optimized Code Context │
│(Up to 2.0GB-compressed)│    (SQLite Cryptographic Ledger)     │ (SQLite Symbol Index)  │
└──────────────────------┘                                      └───-────┬─----──────────┘
                                                                         |           
                                                                         | 2. SpecMap TLR
                                                                         ▼
┌──────────────────┐       3. SNL Verifier-Optimizer Loop       ┌────────────────────────┐
│ PM Requirements  │ -----------------------------------------► │ Verified Requirements  │
│ (NL / Drafts)    │                                            │ (Structured Nat. Lang.)│
└───────────--─────┘                                            └───────────┬─------─────┘
                                                                            |
    ┌─----------------------------------------------------------------------┘
    |                                                                          
    ├─► 4. Bidirectional Modeling & UML Consistency Checks => Automated PlantUML Diagrams
    |                                                                                      
    ├─► 5. Reverse Engineering & Enriched Task Generation  => Epics, Stories & Code Pointers
    |                                                                                      
    ├─► 6. Deductive Software Architecture Recovery        => Conformance & Component Mapping
    |                                                                                      
    └─► 7. Annotations, Explanations & PDF Export          => Code Explanations & PDF Report
```

### Step 1: Uploading and Preprocessing the Codebase (The Clutter Filter)
When a user uploads a compressed codebase folder (supporting sizes up to 2.0 GB) the framework enforces a strict, single-channel binary ingestion stream to prevent memory crashes. Upon receiving the archive, the FastAPI backend worker buffers the file using a non-blocking chunked stream (in fixed 1MB chunks) and pipes them directly to temporary storage on disk. It then initiates a two-stage **Context Optimization** pre-processing pipeline to manage computational costs (exhausting GPU memory) and reduce reasoning noise associated with processing every raw text token through a local LLM (semantic decay).

**Pre-Processing Pipeline:**
* **Phase 1 (Structural Elimination):** Before full archive extraction, Python's zipfile module sweeps the compressed repository tree and strips out non-functional files, asset formats (images, videos, CSS, HTML layouts), third-party package folders (e.g., `node_modules`, `vendor`), and lock files. Unzip operations are skipped on-the-fly for files and directories that do not contain core business logic.
* **Phase 2 (Syntactic Dilution):** After archive extraction, the remaining logic-carrying files (e.g., `.java`, `.py`, `.cpp`, `.js`) are syntactically scrubbed to remove excessive comments, whitespaces, and non-functional log statements.

To prevent administrative manipulation of the codebase and the generated artifacts, all model responses are hashed and appended to a SQLite database, creating a **Chained Ledger Verification**, an immutable audit trail that ensures transparency and accountability within the enterprise environment.

### Step 2: SpecMap and Code Indexing (Setting up Traceability Link Recovery)
The framework avoids direct document-to-code mapping. Instead, it systematically narrows down search scopes via a four-stage hierarchical discovery process:
* **Folder Discovery:** Maps functional specifications to target folder paths by matching high-level requirements with generated folder descriptions.
* **File Discovery:** Automatically compiles markdown schemas (`folder_structure.md`) detailing each module's purpose.
* **Code Symbol Discovery:** Uses **Universal Ctags** to extract granular definitions (functions, macros, classes, variables, etc.) with precise line-number boundaries. Employs DFS file-tree traversal for **top-down coverage** with a **10% overlap rate** across parent-child directory boundaries to prevent knowledge gaps.
* **Validation & Gap Analysis:** Compares extracted definitions against functional requirements to assign statuses (Implemented, Partially, Not Implemented, or Not Applicable.)

To enable complex cross-file queries to return results in seconds, the framework builds high-resolution index mappings of codebase structures and dependency graphs. Subsequent developer prompts, Q&A rounds, and task generation passes use these optimized indexes to target specific files and symbols directly rather than traversing raw directories repeatedly, minimizing prompt overhead and token costs.

### Step 3: Requirements Ingestion (The Verifier-Optimizer Loop)
Raw requirements submitted by stakeholders are frequently ambiguous, incomplete, or non-atomic. Given that a prerequisite for SDLC automation is to transform these requirements into Structured Natural Language (SNL), we pass these requirements through the **Verifier-Optimizer Loop** that does the following:
1. **SNL Formalization:** The input is converted into **Structured Natural Language (SNL)** based on standardized **RUPPs templates** (such as If-Condition, When-Condition, Actor-Initiated Actions, and Where-Condition that use `advcl` and `nmod` dependencies to isolate conditional triggers from the primary action).
2. **Rule-Based Verification:** A deterministic NLP engine (built with *spaCy*) analyzes the parsed RUPPs structure against the codebase's database schema and API definitions. It identifies defects and classifies requirements into four categories: *Correct, Incorrect, Missing,* and *Extra (Hallucinated)*.
3. **Interactive Ambiguity Resolution (Human-in-the-Loop):** If the verifier detects critical omissions—for example, if a database model requires an `expire_date` field, but the Product Manager's requirement draft does not mention it—the app halts execution. It automatically generates targeted, contextual questions and comments them onto the ticket dashboard to request human clarification.
4. **Optimization:** Once resolved, the optimizer applies syntactic transformation rules to emit clean, uniform, and machine-readable requirements.

The SNL output from the Verifier-Optimizer loop serves as the **Single Source of Truth** for all downstream SDLC artifacts.

### Step 4: Automating Technical Documentation (Objective 1)
Using the verified SNL requirements and the cached codebase model, the framework bridges the gap between technical implementation and stakeholder requirements via:
* **Bidirectional UML Modeling:** Structural **Class Diagrams** and behavioral **Sequence Diagrams** rendered natively via PlantUML.
* **Diagram Consistency Verification:** A specialized consistency checker validates that the lifelines, message signatures, and control loops (e.g., `alt`, `loop`, `opt` fragments) in the sequence diagrams align with the classes, attributes, and relationships defined in the class diagrams, flagging discrepancies using deterministic heuristic checks.
* **System Deployment and Technical Guides:** System constraints, dependencies, API documentation, build configurations, and step-by-step deployment instructions.

### Step 5: Requirements-to-Task Generation (Objective 2)
The framework maps high-level backlog items to implementation constructs through a hybrid SpecMap and Deductive Software Architecture Recovery (DSAR) pipeline:

* **Intermediate Architectural Abstraction Layer (Bridging Agile Stories)**

  To resolve the semantic gap between high-level Agile user stories and low-level source code symbols, the framework establishes a top-down architectural bridge before initiating code mapping:
    * **Actor-Oriented Clustering:** Raw user stories are parsed using part-of-speech (POS) tagging heuristics to extract actors. Stories are then grouped by actor and clustered via **unsupervised K-Means clustering** and **Sentence-BERT (SBERT)** semantic embeddings to identify cohesive functional subsystems and eliminate backlog redundancy.
    * **Deductive Architectural Alignment:** These functional clusters are deductively mapped to a standardized, layered Reference Architecture (Presentation layer, Application layer, Domain Service layer, and Technical Service layer).

* **Hierarchical SpecMap Recovery Pipeline**

  Once aligned to the Reference Architecture, the system navigates down the codebase structure from **Folder Discovery** all the way to **Validation & Gap Analysis**.

* **Bifurcated Ticket Enrichment Pipeline**
  
  The framework translates the gap analysis into detailed development tickets (Jira/GitLab format) using two processing modes:
  * **Reverse Engineering Mode:** For existing Implemented or Partially Implemented codebase.
    * **Code Pointers:** Exact file locations and line ranges that require modifications.
    * **Edge-Case Discovery:** Automatic extraction of error handling, try-catch blocks, and validation guardrails to enrich "Unhappy Path" acceptance criteria.
    * **Domino Effect Analysis:** Structural reference analysis that highlights dependent modules, REST APIs, or database boundaries that could be affected by the changes, preventing regression risks.
  * **Forward Engineering Mode:** For missing Not Implemented or Not Applicable codebase.
    * **Skeletal Code Synthesis:** Triggers code generation to synthesize compilable Java class skeletons and method stubs in a temp directory.
    * **Code Pointers:** Maps the development ticket to these newly synthesized skeletons.
    * **Acceptance Criteria Generation:** Generates "Unhappy Path" edge cases as formal **Given-When-Then (GWT) Acceptance Criteria** derived from RUPPs conditional templates.

### Step 6: Code Annotation & Explanation (Objective 3)
The framework processes source files and outputs a traceable, properly annotated version of the code:
* Every modified file is injected with clear, non-intrusive annotations mapping specific code statements directly back to their originating RUPPs requirements (ensuring bi-directional reverse traceability).
* The dashboard displays detailed explanations of the changes alongside direct references to the specific requirements that drove them, eliminating implementation guesswork.

### Step 7: Local Rendering & PDF Output
To finalize the sprint cycle, the framework aggregates the technical documentation, PlantUML diagrams, enriched Jira stories, edge cases, and code pointers into a highly polished, corporate-compliant report:
* The report is compiled using a lightweight, Python-native **`fpdf2` document compiler** module.
* Diagrams are proportionally scaled to fit A4 print margins, with automated readability warnings appended if a diagram is scaled down significantly.
* A professionally styled **PDF document** is generated and delivered directly to the dashboard, avoiding heavy external compiler toolchains (such as Java-based Apache FOP or LaTeX) on the host workstation.

---

## Shortcommings

While ScrumMap successfully automates the requirement-to-backlog pipeline within a secure corporate workstation, it has the following operational and architectural constraints:
* **Dependency on Remote PlantUML Renderer:** Although the core code purification and indexing occur entirely locally and offline, diagram rendering relies on the public PlantUML proxy (`http://www.plantuml.com/plantuml/`). In a strict, air-gapped offline corporate environment, diagram image rendering will fail unless a dedicated, local Java/Graphviz PlantUML container is spun up inside the pod.
* **No Native Live Git Integrations:** The generated stubs and annotated code files are delivered as a downloaded `.zip` package. The platform does not directly write modifications to the local directory's git branches or automatically commit updates, requiring manual developer copy-paste or extraction.
* **Lack of Scalability:** ScrumMap is designed for a single workstation and a single developer at a time. It does not support multiple developers working on the same project simultaneously or across multiple workstations. It also does not support multiple projects running simultaneously.
* **Lack of Database Encryption:** The backend does not support database encryption, which is a security concern for sensitive projects.
* **Lack of Cryptographic Shredding:** The backend does not support cryptographic shredding, which is a security concern for sensitive projects.

---

## Future Scope

To address current limitations and expand ScrumMap's enterprise capabilities, the following features are planned for future iterations:
* **Fully Offline PlantUML Server Container:** Integrate a local, Java/Graphviz-based PlantUML server directly inside the rootless `scrummap-pod` container definition. This will enable completely air-gapped workstations to render vector SVGs natively without making outbound calls to the public PlantUML proxy.
* **Native Workspace Git Bindings:** Add write permissions to local workstation folder mounts under Git, allowing ScrumMap to automatically create feature branches, inject inline annotations directly into the codebase, and stage commit drafts for developer review.
* **Distributed Multi-Workstation & On-Premise LLM Cluster:** Scale ScrumMap from an isolated single-workstation container pod to a distributed system running across many workstations (operating both on-premise and securely off-premise). Implement real-time synchronization channels for developer collaboration and route inference queries to a shared local LLM cluster housed entirely on-premise to preserve full data sovereignty.

---

## Demo Video Link
