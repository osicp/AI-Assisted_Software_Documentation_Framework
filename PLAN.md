# ScrumMap: System Implementation & Rollout Plan

This document establishes the step-by-step execution roadmap, system specifications, architectural blueprints, deployment guides, and risk-mitigated strategies to implement **ScrumMap** on a secure corporate workstation.

---

## 1. Use Cases & Technical Specification

### 1.1 Core Stakeholder Matrix
*   **Product Managers (PMs)**: Need to translate raw, ambiguous stakeholder requirements into structured, unambiguous Backlog Epics and user stories without introducing functional gaps.
*   **Scrum Masters (SMs) & Project Leads**: Require precise, telemetry-driven task sizing (Story Points) and dependency maps to plan predictable sprint milestones.
*   **Lead Developers & Software Architects**: Need direct codebase references (Code Pointers), auto-generated skeletal code bootstraps, and inline requirement annotations to eliminate development guesswork.
*   **Security Auditors & Compliance Officers**: Demand verifiable proof that proprietary codebases remain completely isolated and that all administrative actions are immutably logged for governance.

### 1.2 Constraints
1.  **Workstation Isolation**: The entire system must execute locally on a single corporate developer workstation with **zero internet dependencies**.
2.  **Codebase Scale**: The ingestion pipeline must support massive industrial repositories up to **2.0 GB** in compressed size without memory-related container crashes.
3.  **Zero-Data Retention (ZDR)**: Raw uploaded ZIP archives and structurally-eliminated build/asset directories (`node_modules`, `.git`, `target`, `dist`, etc.) must be deleted immediately after purification. The purified, diluted source tree — with proprietary build artifacts, binaries, and stripped comments/logging already removed — is retained on disk, mapped to its `codebase_versions` row, until the project or version is explicitly deleted.

### 1.3 Technical Implementation Challenges
*   **Memory Saturation during ZIP Ingestion**: Buffering large multi-gigabyte ZIP archives in memory triggers container out-of-memory (OOM) crashes on resource-capped corporate workstations.
*   **Semantic Decay & Token Bloat**: Sending massive, unpurified code files (with comments, lockfiles, and build outputs) to an LLM exhausts context limits, introduces reasoning noise, and inflates API costs.
*   **Forward vs. Reverse Traceability Gaps**: Mapping high-level Agile user stories to concrete classes, methods, and line ranges requires bridging the semantic gap between high-level human intents and low-level source symbols.

---

## 2. Deployment & System Architecture (Single-Workstation Pod)

ScrumMap is deployed as an API-first, headless, native intent-oriented system packaged inside a unified, rootless container pod namespace (`scrummap-pod`) to enforce total loopback isolation.

```
+-----------------------------------------------------------------------------+
|                               scrummap-pod                                  |
|                                                                             |
|   +-----------------------------+        +-----------------------------+    |
|   |     scrummap-frontend       |        |      scrummap-backend       |    |
|   |     (React / Next.js)       |        |         (FastAPI)           |    |
|   |         Port 3000           |        |         Port 8000           |    |
|   +----------------+------------+        +--------------+--------------+    |
|                    |                                    |                   |
|                    +---------- Local Loopback ----------+                   |
|                                      |                                      |
+--------------------------------------|--------------------------------------+
                                       | (Rootless Volume Bindings)
                                       v
                        +----------------------------------+
                        | Host Directory: /local/path/data |
                        | Mount flags: rw, Z, U            |
                        +----------------------------------+
```

### 2.1 Network Topology & Isolation
*   **Local Host Loopback Only**: The pod binds services strictly to `127.0.0.1` (`Port 3000` for frontend, `Port 8000` for backend). No external network ports are opened on the workstation's intranet card, preventing network intrusion.
*   **Inter-Container Routing**: Frontend and Backend containers communicate within the same virtual network namespace inside the pod over the local bridge, removing public port-forwarding requirements.
*   **Two-Layer Bind Model**: Inside each container, services bind to `0.0.0.0` — this is safe because that address only resolves within the container's own isolated network namespace. The actual host-facing security boundary is enforced separately by Podman's port-publish flags (`-p ${BIND_ADDRESS}:PORT:PORT`), which restrict the mapped ports to the loopback interface (`127.0.0.1`) on the host itself. Binding the in-container process to `127.0.0.1` instead would make it unreachable through the published port under rootless Podman's default networking.

---

## 3. Containerization Plan (Rootless Podman Implementation)

### 3.1 Podman Container Specifications
The deployment runs on rootless **Podman** to satisfy security guidelines that restrict root-privileged Docker daemons on corporate workstations.

```dockerfile
# Containerfile.backend (FastAPI Ingestion & Parsing Core)
FROM python:3.12-slim

# Install system dependencies for Universal Ctags
RUN apt-get update && apt-get install -y --no-install-recommends \
    universal-ctags \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Pre-fetch NLP models at BUILD time so the running container needs no internet access,
# consistent with the "zero internet dependencies" runtime constraint (PLAN.md §1.2).
RUN python -m spacy download en_core_web_sm
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-mpnet-base-v2')"

# Copy files into a subfolder named 'backend' to preserve the 'backend.app' package hierarchy inside /workspace
COPY . ./backend
ENV PYTHONPATH=/workspace
EXPOSE 8000
# Binds 0.0.0.0 inside the container's own isolated network namespace.
# Host-facing exposure is restricted separately via Podman's -p ${BIND_ADDRESS}:8000:8000 flag.
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 3.2 Security Mount Flags (`rw,Z,U`)
When mounting directories from the host machine to store SQLite databases or compile documents, Podman requires specific namespace parameters:
*   **`:Z` (Shared SELinux contexts)**: Instructs Podman to automatically rewrite the host directory’s SELinux label to match the container's virtual security context, resolving the file access blocks common on enterprise machines.
*   **`:U` (User Namespace Mapping)**: Maps the host developer's non-root UID (e.g., UID `1000`) to the virtual root/user UID inside the container namespace, ensuring that created files are owned by the host developer instead of a privileged host-root user.

### 3.3 Setup Orchestration Commands
Container startup is declared once in `podman-compose.yaml` (SETUP.md §5, Script 2) and invoked via a single command — the `bootstrap_workstation.sh` script (SETUP.md §5, Script 1) runs exactly this, after its own prerequisite checks and host directory setup:
```bash
podman-compose -f podman-compose.yaml --in-pod scrummap-pod up -d --build
```
`--in-pod` groups both services into one shared network namespace (the "scrummap-pod" model), so the frontend reaches the backend via plain `http://localhost:8000` rather than service-name DNS. Published ports, volume mounts, and the `scrummap.env` reference are all declared in the compose file itself rather than as raw `podman run` flags.

---

## 4. Step-by-Step Build Blueprint (4-Day Sprint)

The following matrix organizes the physical tasks required to build, test, and deploy ScrumMap within a single 4-day sprint:

### Day 1: Project Scaffolding, Hardened Database Schema, Streaming Ingestion & Noise Purification Filters
*   **Back-End Setup**: Scaffold FastAPI directory layout. Create Python `virtualenv`, configure standard Pydantic configuration schemas, and load `scrummap.env` parameters.
*   **Role-Key Authentication Gateway**: Implement `backend/app/auth.py`'s `resolve_operator_role` FastAPI dependency, matching the `X-ScrumMap-Role-Key` header against the five configured role keys. Wire it into every write endpoint (`upload`, `refine`, `generate`) and the ledger `verify` endpoint before any other endpoint logic is built, so every subsequent ledger write carries a trusted `operator_id`.
*   **SQLite Database Schema Construction**: Establish the relational database (`governance.db`) on disk. Implement the standard projects, versions, items, and audit-trail tables.
*   **Concurrent Transaction Configuration**: Run direct SQLite connection pragmas to optimize database read/write speeds over solid-state drives:
    ```sql
    PRAGMA journal_mode=WAL;      -- WAL mode allows concurrent database reads without locking
    PRAGMA synchronous=NORMAL;    -- Reduces disk sync operations to accelerate transaction commits
    PRAGMA foreign_keys=ON;       -- Enforces complete referential integrity
    ```
*   **1MB Chunked Streaming Upload (`POST /api/codebase/upload`)**: Write the asynchronous FastAPI file streaming endpoints. Use chunked byte offset buffers to read the file directly to host disk, preserving constant memory. The destination path is built from `settings.UPLOAD_DIR` (never hardcoded), `project_id`/`version_tag` are sanitized before touching the filesystem, a UUID suffix prevents collisions between concurrent/repeat uploads, and the running byte count is checked against `settings.MAX_ZIP_SIZE_BYTES` so an oversized upload is aborted mid-stream rather than fully written to disk first:
    ```python
    import re
    import uuid

    _SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")  # allows dots for semver-style version tags (e.g. v1.0)

    @app.post("/api/codebase/upload")
    async def upload_codebase(file: UploadFile, project_id: str, version_tag: str):
        if not (_SAFE_ID_PATTERN.match(project_id) and _SAFE_ID_PATTERN.match(version_tag)):
            raise HTTPException(status_code=400, detail="project_id/version_tag must be alphanumeric (with '-'/'_').")
        if not file.filename.lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Only .zip archives are accepted.")

        temp_zip_path = os.path.join(settings.UPLOAD_DIR, f"{project_id}_{version_tag}_{uuid.uuid4().hex}.zip")
        bytes_written = 0
        with open(temp_zip_path, "wb") as f_out:
            while chunk := await file.read(1024 * 1024):  # Enforces constant 1MB memory footprint
                bytes_written += len(chunk)
                if bytes_written > settings.MAX_ZIP_SIZE_BYTES:
                    f_out.close()
                    os.remove(temp_zip_path)
                    raise HTTPException(status_code=413, detail="Upload exceeds MAX_ZIP_SIZE_BYTES.")
                f_out.write(chunk)
    ```
*   **Structural Noise Purification Module**: Build the extraction script to execute **Structural Elimination**—dynamically scanning the unzipped directory tree and skipping the extraction of build, asset, and lock configurations (`node_modules`, `target`, `.git`). Combined with Syntactic Dilution (below), both stages together compress codebase disk size by **~35%**.
*   **Syntactic Dilution Module**: Implement regex sweeps to strip comments, extraneous whitespace, and logging statements from codebase files.

### Day 2: Static AST Symbol Indexing, Deductive SAR Clustering & Long-Context Caching Proxy
*   **Universal Ctags Integration**: Write the background subprocess execution script to run `universal-ctags` over the purified directory. Save class, method, struct, and file-range boundaries to a cached database-backed symbol metadata catalog.
*   **Intermediate Architectural Abstraction Layer (Actor Clustering)**: Implement **spaCy POS-tagging heuristics** inside `sbert_clustering.py` to extract actors following the narrative prefix "As a...". Use the locally executed SBERT model (`paraphrase-mpnet-base-v2`) to translate narrative user stories into high-dimensional semantic vectors and cluster them using **K-Means** to remove redundancies.
*   **Deductive Software Architecture Recovery (SAR)**: Develop the mapping logic that maps the identified functional clusters into a standardized layered reference architecture (Presentation, Application, Domain, Technical Services).
*   **Heuristic-based UML consistency checkers**: Integrate diagram consistency validators directly into `uml_generator.py` to map lifelines against class and method boundaries, catching mismatches natively.
*   **FAU Trussed.ai proxy with Context Caching**: Configure OpenAI SDK bindings, branching on `settings.LLM_PROVIDER` so the documented offline fallback (LM Studio / local open-weight models) is actually reachable, not just described in `scrummap.env`:
    ```python
    from openai import OpenAI
    from backend.app.config import settings

    if settings.LLM_PROVIDER == "openai-compatible":
        client = OpenAI(base_url=settings.OPENAI_BASE_URL, api_key=settings.OPENAI_API_KEY)
    else:
        client = OpenAI(base_url=settings.TRUSSED_API_URL, api_key=settings.TRUSSED_API_KEY)
    ```
    Register AST symbol maps and raw requirements into the Google Gemini 2.5 Pro Context Cache once to achieve **79% token budget savings** across iterative developer queries.

### Day 3: Front-End Next.js / React Stepper Dashboard & PDF Document Compilation
*   **Single-Page React JS Interface**: Build Next.js visual layouts incorporating sidebar routing.
*   **Operational Deployment Stepper View**: Render progressive workflow indicators to display real-time extraction, indexing, and auditing updates.
*   **Interactive UML Canvas**: Integrate Mermaid.js and PlantUML rendering hooks inside an interactive SVG viewing panel. Write heuristic-based UML consistency checkers.
*   **Bifurcated Backlog Dashboard**: Build the Kanban, Gantt, and Git side-by-side Unified Diff panels.
*   **Structured PDF Compiler (`fpdf2` integration)**: Construct the document generation engine using the Python-native `fpdf2` library. This compiles sprint details (UML diagram links, clustered backlog user stories, and code traceability indices) directly into a styled PDF.
*   **PDF Compiler Automation**: Standardize the formatting layouts and trigger programmatic streams to generate compilable reports instantly, avoiding heavy external Java Runtime Environment (JRE) or Apache FOP toolchains on the host workstation.

### Day 4: Integration Testing, Tamper Auditing & Podman Packaging
*   **Cryptographic Ledger Audit**: Test `backend/ledger_verifier.py` to sequentially compute HMAC-SHA256 backward chains and ensure unauthorized database overrides are instantly detected.
*   **Zero-Data Retention (ZDR) Execution**: Run validation tests ensuring that raw, decompressed codebase directories are recursively deleted by FastAPI background workers the instant AST symbol compilation completes.
*   **Workstation Deployment Packaging**: Bundle backend and frontend services into standard Containerfiles. Test the system inside the rootless `scrummap-pod` on the development workstation.

---

## 5. Database Schema Design & Optimization Strategy

To provide zero-friction local setups without the network overhead of heavy database server containers, ScrumMap standardizes on an in-process, relational **SQLite database (`governance.db`)**.

### 5.1 Database Schema (ANSI SQL DDL)
*Authoritative schema source: `backend/app/ledger.py`'s `init_governance_db()` (SETUP.md Phase 2, File B). This DDL listing mirrors that code for readability during the build blueprint — when the schema changes, update both together.*
```sql
-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Codebase Versions Table
CREATE TABLE IF NOT EXISTS codebase_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version_tag TEXT NOT NULL,
    zip_checksum TEXT NOT NULL,          -- SHA-256 hash of the uploaded ZIP
    purified_size_bytes INTEGER NOT NULL, -- Compressed size after noise filtering
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 3. Backlog Items Table
CREATE TABLE IF NOT EXISTS backlog_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    codebase_version_id TEXT NOT NULL,   -- Snapshot code_pointers were computed against
    title TEXT NOT NULL,
    description TEXT,
    actor_role TEXT NOT NULL,
    snl_requirements TEXT NOT NULL,      -- RUPPs formalized natural language
    hie_story_points REAL NOT NULL,      -- Hybrid Intelligence Effort sizing
    code_pointers TEXT,                  -- JSON string containing files and line ranges
    ripple_effects TEXT,                 -- JSON string containing dependency mapping
    unhappy_paths TEXT,                  -- JSON string containing exception constraints
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (codebase_version_id) REFERENCES codebase_versions(id)
);

-- 4. Cryptographically Chained Hashing Ledger Table (Tamper-Proof Audit)
CREATE TABLE IF NOT EXISTS write_ahead_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,                     -- Nullable: not all transactions are project-scoped
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    operator_id TEXT NOT NULL,           -- User account (e.g., SM, Product Manager)
    transaction_type TEXT NOT NULL,      -- ZIP_CODEBASE_UPLOAD, BACKLOG_GENERATION
    payload TEXT NOT NULL,               -- Full JSON transaction metadata
    payload_hash TEXT NOT NULL,          -- SHA-256 of the JSON payload
    block_signature TEXT NOT NULL,       -- HMAC-SHA256 of (payload_hash + prev_block_signature)
    prev_block_signature TEXT NOT NULL,  -- Signature of block (n-1) to lock the chain
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### 5.2 Relational Entity-Relationship Diagram (ERD)
See DESIGN.md §4.2 for the visual ERD (mermaid) — kept in one place, alongside the authoritative schema source note, to avoid a second diagram drifting out of sync with the DDL above.

### 5.3 Transaction Chaining Formula
Every transaction ledger block $B_n$ is linked to the preceding block signature $H_{n-1}$ using a backward-chained, HMAC-SHA256 keyed hashing algorithm:
$$H_n = \text{HMAC-SHA256}(K_{ledger},\ H_{n-1} \parallel B_n.timestamp \parallel B_n.project\_id \parallel B_n.operator\_id \parallel B_n.transaction\_type \parallel B_n.payload\_hash)$$
Where $K_{ledger}$ (`LEDGER_HMAC_KEY`) is a secret stored outside `governance.db`. If any past record is modified, the signature chain immediately breaks ($H_n \neq H_{stored}$), alerting auditors to database tampering — and because the key is required to recompute a valid $H_n$, this holds even against an attacker who edits the row and attempts to recompute the chain forward.

---

## 6. Caching Strategy (Gemini 2.5 Context Caching)

### 6.1 Key-Value (KV) Context Caching Architecture
Instead of reloading and analyzing the entire codebase representing millions of tokens for every subsequent requirement check or diagram rendering cycle, ScrumMap uses **Long-Context Caching** through the secure **FAU Trussed.ai proxy**.

```
                             [ First Request ]
                                     │
                    (Purified Logic Core + AST symbol map)
                                     ▼
                      ┌─────────────────────────────┐
                      │    FAU HPC Trussed Proxy    │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │ Google Gemini Context Cache │
                      └──────────────┬──────────────┘
                                     │ (Pre-warms in-memory cache)
                                     ▼
                             [ Next Requests ]
                                     │
                         (Only send delta request)
                                     ▼
                      ┌─────────────────────────────┐
                      │   Cache Hit: 79% Savings    │
                      └─────────────────────────────┘
```

1.  **Cache Registration (Exactly Once)**: The backend uploads the codebase's purified logical core and compiled ctags AST symbol maps to the FAU Trussed Gemini endpoint. The model registers this context in its active in-memory cache.
2.  **Iterative Delta Query Execution**: For all subsequent user prompts, sprint backlog adjustments, and document compilation tasks, the frontend only sends the new requirement delta. Gemini executes the query against the cached logical core, returning results in seconds.
3.  **Cost and Latency Reductions**: This strategy eliminates redundant token transmission, securing up to **79% token budget savings** and drastically reducing operational request latency.

---

## 7. Security & Costs Optimization (Workstation Hardening)

### 7.1 Secrets Management & Environment Isolation
*   **Strict Host Configuration**: Private passwords and credentials are saved locally in `scrummap.env`. This file is added to the system `.gitignore` and is never committed to Version Control.
*   **Public Templates**: The public repository only contains `scrummap.env.example`, which replaces sensitive parameters with safe dummy placeholders.
*   **API Exposure Defenses**: All calls to the FAU Trussed.ai proxy are executed strictly server-side by the FastAPI worker. No backend API keys are exposed to the React Next.js client-side bundles.
*   **Role-Key RBAC Enforcement**: Per-role access keys (`ROLE_KEY_PRODUCT_MANAGER`, `ROLE_KEY_SCRUM_MASTER`, `ROLE_KEY_LEAD_DEVELOPER`, `ROLE_KEY_SECURITY_AUDITOR`, `ROLE_KEY_SYSTEM_ADMIN`) are stored in `scrummap.env` alongside `TRUSSED_API_KEY` and are subject to the same never-commit handling. The backend derives every ledger `operator_id` from which key was presented (`backend/app/auth.py`), so client-supplied identity claims are never trusted directly.

### 7.2 Workstation Security Hardening

#### SQL Injection Defense: Parameterized Queries
ScrumMap does not rely on a character/keyword blocklist to defend against SQL injection — blocklists of this kind are a well-known anti-pattern, since they're trivially bypassable (e.g. `1 OR 1=1` contains no special characters or SQL keywords) and simultaneously reject legitimate free text (a requirement like "the system shall **update** the user's session" contains both a blocked keyword and a blocked character).
Instead, every database write in `ledger.py` uses parameterized queries (`?` placeholders passed as a separate tuple, never string-interpolated into the SQL text) — this is what actually prevents injection, regardless of what a user types into a requirements field or an administrative text box. Natural language requirements text is stored and compared as opaque string data; it is never concatenated into a SQL statement.

#### Zip-Bomb Denial-of-Service (DoS) Interception
To prevent resource-exhaustion attacks where tiny ZIP archives decompress into gigabytes of data and saturate workstation disk storage, the FastAPI backend applies strict validation thresholds:
*   **Maximum Compressed File Size**: Cap at **2.0 GB**.
*   **Decompression Expansion Limits**: Absolute cap at **50,000 files** or an expansion ratio exceeding **10x**. If any limit is crossed, extraction is immediately aborted.
*   **Absolute Uncompressed-Size Ceiling**: Independent of the ratio check, total decompressed size is also capped at **5x `MAX_ZIP_SIZE_BYTES`** (10 GB by default). This catches highly-compressible archives that stay under the 10x ratio while still expanding large enough to saturate workstation disk storage.

#### Directory Traversal Guardrails
The extraction utility verifies that every decompressed file path resolves strictly within the isolated `/tmp/scrummap_uploads/` workspace, blocking extraction patterns containing parent traversal sequences (`../`). Zip entries flagged as symlinks (via the archive's stored Unix file mode) are rejected outright, rather than extracted — a symlink target isn't caught by the path-traversal check on the entry's own filename, but following it after extraction would still escape the sandbox.

#### Per-Upload Workspace Isolation
`/tmp/scrummap_uploads` (`UPLOAD_DIR`) is a single shared mount, not a per-request sandbox on its own — the actual extraction target for each upload must be a freshly-created, owner-only subdirectory:
```python
import tempfile

extract_target_dir = tempfile.mkdtemp(prefix="scrummap_", dir=settings.UPLOAD_DIR)
extract_and_purify_zip(zip_file_path, extract_target_dir)
```
`tempfile.mkdtemp` creates the directory with mode `0700` by default, so even if two uploads are being processed concurrently, neither can read the other's in-progress extraction — and (combined with `HOST_UPLOAD_DIR` itself being `chmod 700` on the host) no other local account on the workstation can list or read into `UPLOAD_DIR` at all.

### 7.3 Cost-Optimization Design
*   **Local NLP Model Execution**: The framework executes intensive NLP tasks—such as part-of-speech tagging (spaCy), sentence embeddings (SBERT), and K-Means clustering—locally on the workstation using free, open-source models, reserving LLM credits for advanced reasoning.
*   **Token Trim Heuristics**: Syntactic Dilution (comment/whitespace/log stripping) reduces LLM-facing token counts, on top of the disk-size reduction already achieved by Structural Elimination. This is a distinct metric measured in tokens rather than bytes — removing whole directories and shrinking the verbosity of remaining files affect different budgets (disk storage vs. LLM context window).

### 7.4 Security Audit Plan
Security auditors execute `backend/ledger_verifier.py` to audit database integrity. This utility recalculates backward-chained HMAC-SHA256 signatures, flagging manual row edits or administrative log deletions.

### 7.5 Student Token Billing & Cost Estimation
Based on FAU Trussed.ai pricing guidelines, bills are compiled per million tokens (input + output):
*   **Workstation Scale**: Assuming a typical medium codebase is indexed once (producing 350,000 cached tokens) and is queried 5 times during a sprint:
    *   *Without Caching*: 5 queries × 350,000 tokens = 1,750,000 tokens.
    *   *With Context Caching (79% Token Savings)*: 1 cache write (350,000 tokens) + 5 delta queries (approx. 5,000 tokens each = 25,000 tokens) = 375,000 tokens.
    *   *Savings*: (1,750,000 − 375,000) / 1,750,000 ≈ **78.6%**, rounding to the ~79% target even at this low reuse count — savings improve further as the same cached context is queried more times within a sprint. Reduces the student's default **$10/month budget** footprint from heavy development costs to pennies.

---

## 8. Success Metrics & Performance KPIs

The system evaluates operational success and pipeline stability using four standardized Performance KPIs:

| Success Category | Performance KPI | Target Threshold | Verification Method |
| :--- | :--- | :--- | :--- |
| **System Latency** | DB WAL transaction write latency | **< 5ms** | Background logging timers (Section 7.3) |
| **Data Compression** | Combined structural + syntactic size reduction | **~35% size reduction** | File-size audit counters (Section 7.3) |
| **Compute Savings** | LLM API token budget savings | **79% reduction** | Context Caching graph monitors (Section 7.4) |
| **Human Efficiency** | Verification Tax ($V_{tax}$) scaling | **V_tax < 5 for simple tasks** | Telemetry logs (Section 7.4) |

---

## 9. Technical Decision Rationale (Why We Built This Way)

### 9.1 Database Engine: SQLite vs. PostgreSQL
*   **The Decision**: **SQLite** was chosen as ScrumMap's core relational database engine.
*   **The Rationale**: Traditional enterprise applications rely on PostgreSQL, which requires deploying a separate database container, exposing local network sockets, and configuring network credentials.
    *   *SQLite is serverless and runs in-process*, reading and writing transaction blocks directly to host storage. This avoids local network latency and eliminates connection pool overhead.
    *   *SQLite simplifies workstation state*: the complete system state, interactions, and audit ledger are encapsulated in a single, portable database file (`governance.db`), making backups easy.

### 9.2 Containerization Daemon: Podman vs. Docker
*   **The Decision**: **Podman** was selected as the mandated container runtime.
*   **The Rationale**: Docker requires a background root-privileged daemon to manage container files. This daemon represents a significant security vulnerability on corporate developer workstations.
    *   *Podman runs daemonless and rootless in user-space*, enforcing secure host boundary isolation.
    *   Podman supports native, unified network namespaces (**Container Pods**) directly out of the box, allowing multiple containers (Next.js and FastAPI) to share a secure local loopback and run securely behind enterprise firewalls.

---

*Compiled and verified for immediate workstation development.*
