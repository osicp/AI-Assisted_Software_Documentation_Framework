# Locally Hosted AI-Assisted Software Documentation & Task Generation Framework

 This is an enterprise-grade, locally hosted, and fully air-gapped web application designed to automate technical documentation generation, requirement-to-task translation, and source-code annotation/explanation with strict governance and security compliance. 

The framework bridges the "automation valleys" in traditional Agile and DevSecOps processes by transforming raw stakeholders' requirements and large-scale codebases (up to 10GB) into verified, traceable, and compilable software development artifacts [548, 550, 558].

---

## How It Works

The system functions through a multi-stage deterministic and generative pipeline that translates unstructured business requests and source repositories into highly detailed development plans, technical documents, and clean architectural baselines.

```
+------------------+     1. Structural Elimination & Syntactic Dilution     +-------------------------+
|  User Codebase   | -----------------------------------------------------> | Optimized Code Context  |
|  (Up to 10 GB)   |                                                        | (In-Memory LLM Cache)   |
+------------------+                                                        +-------------------------+
                                                                                         |
                                                                                         | 2. SpecMap TLR
                                                                                         v
+------------------+     3. SNL Verifier-Optimizer Loop                     +-------------------------+
| PM Requirements  | -----------------------------------------------------> | Verified Requirements   |
| (NL / Drafts)    |                                                        | (Structured Nat. Lang.) |
+------------------+                                                        +-------------------------+
                                                                                         |
         +-------------------------------------------------------------------------------+
         |
         |---> 4. Bidirectional Modeling & UML Consistency Checks  ===> Automated PlantUML Diagrams
         |
         |---> 5. Reverse Engineering & Enriched Task Generation   ===> Granular Jira Epics, Stories & Code Pointers
         |
         |---> 6. Deductive Software Architecture Recovery         ===> Target Conformance & Component Mapping
         |
         |---> 7. Annotations, Explanations & PDF Export           ===> Compiled Code Stubs, Explanations & PDF Report
```

### Step 1: Uploading and Preprocessing the Codebase (The Clutter Filter)
When a user uploads a codebase folder (supporting sizes up to 10GB), processing every raw text token through a local Large Language Model (LLM) is computationally expensive and introduces reasoning noise. To resolve this, VeriMap-HIE runs a two-stage **Context Optimization** pre-processing pipeline:
* **Structural Elimination:** The application sweeps the repository tree and strips out non-functional files, asset formats (images, videos, CSS, HTML layouts), third-party package folders (e.g., `node_modules`, `vendor`), and lock files. This process reduces the overall codebase size.
* **Syntactic Dilution:** The framework scrubs the remaining logic-carrying files (e.g., `.java`, `.py`, `.cpp`, `.js`) to remove excessive comments, whitespaces, and non-functional log statements, leaving a purified semantic core that represents the system's true functional space.

### Step 2: Code Caching (Setting Up the "Local Memory")
Rather than reloading and analyzing the entire codebase for every subsequent query or requirement, this app leverages advanced **Long-Context Caching** (such as Gemini 1.5 Pro or local vLLM cache allocations).
* The cleaned codebase structure and dependency graphs are indexed and cached in-memory **exactly once**.
* Subsequent developer prompts, Q&A rounds, and task generation passes query directly against this pre-warmed cache. This mechanism yields a **79% reduction in operational compute cost and latency**, enabling complex cross-file queries to return results in seconds.

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
* It is run through local styling sheets (using print-ready compilers like FPDF2 or LaTeX) to output a static, professionally styled **PDF document** delivered directly to your Studio panel.

---

## Setup & Deployment Guidelines

This app is designed to be hosted locally on corporate workstation or secure private clouds, ensuring total intellectual property protection and offline execution.

### 1. Local System Installation

#### Prerequisites
* **Operating System:** Ubuntu 22.04+ / Debian 11+ / macOS Ventura+
* **System Binaries:** `universal-ctags` (for AST symbol mapping), `graphviz` & `plantuml` (for rendering UML graphics)
* **Python Runtime:** Python 3.11 or 3.12 (with `venv` and `pip`)
* **Node.js Runtime:** Node.js v18+ (with `npm`)

#### Execution Commands
```bash
# 1. Update system package repository and install system binaries
sudo apt-get update
sudo apt-get install -y universal-ctags graphviz plantuml git curl

# 2. Clone the repository and navigate to the project directory
git clone https://github.com/your-org/THISAPP.git
cd THISAPP

# 3. Initialize the Python virtual environment and activate it
python3 -m venv venv
source venv/bin/activate

# 4. Install asynchronous backend dependencies & NLP linguistic libraries
pip install -r backend/requirements.txt
python -m spacy download en_core_web_sm

# 5. Navigate to the frontend UI layer, install dependencies, and build assets
cd frontend
npm install
npm run build
```

### 2. Multi-Service Docker Configuration

Docker Compose is utilized to orchestrate and isolate the backend analysis engines, the PostgreSQL database, and the offline LLM inference node.

#### `docker-compose.yml`
```yaml
version: '3.8'

services:
  # Fast-API Backend Core Engine
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
      - shared_code_cache:/workspace/cache
    environment:
      - DATABASE_URL=postgresql://verimap_admin:secure_password@db:5432/verimap_governance
      - LOCAL_LLM_URL=http://llm-inference:11434
      - SECURE_SANDBOX_TIMEOUT=180
    depends_on:
      - db
      - llm-inference
    restart: unless-stopped

  # React Single Page App UI
  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
    restart: unless-stopped

  # Secure PostgreSQL DB for Auditing, Guardrails, and RBAC Management
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: verimap_governance
      POSTGRES_USER: verimap_admin
      POSTGRES_PASSWORD: secure_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  # Air-Gapped Local Inference Engine (Ollama Hosting Qwen3-Coder)
  llm-inference:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "11434:11434"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped

volumes:
  pgdata:
  ollama_data:
  shared_code_cache:
```

### 3. CLI Initialization & Administration Commands

The administrative CLI tool (`THISAPP-cli`) manages the local deployment database state, runs diagnostic health checks, and pre-warms the self-hosted LLM files.

```bash
# 1. Connect to PostgreSQL and apply the enterprise governance and RBAC schemas
THISAPP-cli db upgrade --url "postgresql://verimap_admin:secure_password@db:5432/verimap_governance"

# 2. Execute system-level environment analysis diagnostics (Validates AST libraries and spaCy models)
THISAPP-cli doctor

# 3. Pull and pre-load the domain-specific open-source LLM directly onto the GPU
THISAPP-cli models pull qwen3-coder:30b-instruct-fp8

# 4. Seed default system guardrail rules (blacklisted CLI strings and script execution policies)
THISAPP-cli seed-guardrails

# 5. Launch all application microservices locally
THISAPP-cli start --host 0.0.0.0 --port 3000
```

---

## Enterprise Governance, Security & Administrative Layer

To ensure corporate compliance and safe execution within enterprise environments, THISAPP implements three core security pillars:

### 1. Robust Role-Based Access Control (RBAC)
The database enforces strict RBAC limits to restrict access based on organizational roles:
* **`ADMIN`:** Full access to system configs, audit logs, and security guardrails.
* **`SCRUM_MASTER`:** Full access to task generation, sprint estimates, and HIE metrics.
* **`PRODUCT_MANAGER`:** Access to requirement ingestion, SNL optimization, and Jira ticket exports.
* **`LEAD_DEVELOPER`:** Access to code pointers, class diagrams, annotated code downloads, and dry-run execution.
* *Project-Level Isolation:* Codebases are assigned to specific user permission groups; unauthorized developers cannot index or access cached repo metrics.

### 2. Tamper-Proof Cryptographic AI Interaction Ledger
All queries, prompts, and corrective human-in-the-loop iterations are recorded in an append-only cryptographic ledger:
* Every entry contains a unique SHA-256 `block_hash` calculated from its content (prompt, LLM response, user ID, project ID, session ID) and the `previous_hash` of the immediately preceding ledger block.
* Attempting to delete or alter historical prompts breaks the hash chain, triggering instant discrepancy reports during routine audit checks to ensure absolute transparency.

### 3. Configurable Guardrails & Security Interception
Because LLMs exhibit probabilistic behavior, the local sandbox runs continuous validation filters:
* **Shell Command Verification:** A system-level interceptor matches all generated build/deployment instructions against a pre-compiled blacklist of malicious commands (e.g., `rm -rf /`, `wget`, `curl`, `chmod +x`).
* **In-Process Sandboxing:** Code compilation and skeletal validation tests are executed in constrained, temporary, and network-isolated processes with strict memory and CPU runtime thresholds, preventing runaway scripts or container breakouts.

---

## Process-Driven Metrics: Tracking Hybrid Intelligence Effort (HIE)

Traditional Story Points and lines-of-code metrics fail to represent the actual developer effort in LLM-assisted environments because writing initial code becomes rapid and cheap.  The real bottleneck shifts to reviewing, debugging, and validating generated code (known as the **"Verification Tax"**) .

THISAPP evaluates software estimation using **Hybrid Intelligence Effort (HIE)**:
* **Iterative Reasoning Cycles:** The system logs the number of prompt-response iterations and complete generate-evaluate-correct loops required to produce a valid, compliant artifact.
* **Human Oversight Effort:** The system uses git diff tracking to measure the precise **Edit Distance** (manual corrections applied by developers) and counts the number of validation failures before a code block meets the acceptance criteria.
* **Sprint Forecasting:** By running linear regression models over these logged HIE variables, Scrum Masters can accurately forecast future ticket complexity and estimate true engineering hours, leading to predictable release cycles.
