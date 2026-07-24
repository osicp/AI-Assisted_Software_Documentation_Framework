# Technical Design & Data Model Specifications (v3)

This specification details the technical design, logical schema definitions, data optimization loops, and operational metrics for the framework.

---

## 1. Local Database Strategy: Zero-Configuration SQLite

To eliminate on-premises deployment friction and provide developers with a lightweight local testing environment, this app implements an in-process, relational **SQLite database (`governance.db`)** .

### 1.1 Local SQLite vs. Enterprise PostgreSQL
For single-workstation testing, SQLite is selected over PostgreSQL due to key operational advantages:
* **Zero Network Latency**: SQLite runs as an in-process library, reading and writing transaction blocks directly to host drives. This eliminates network socket overhead and loopback latency, resulting in faster write speeds during rapid parsing cycles.
* **Reduced Dependency Footprint**: It eliminates the requirement to deploy and manage a separate PostgreSQL container on the developer's computer, saving RAM and CPU cycles.
* **Portable State**: The complete system configuration, interaction logs, and cryptographic chains are encapsulated in a single file on disk (`./data/governance.db`), which can be backed up or inspected using basic administrative tools.
* **Seamless Migration**: SQLite's relational schema is fully SQL-92 compliant, allowing teams to transition to PostgreSQL or Supabase when moving from local validation to a shared team network.

---

## 2. Cryptographic Chained Write-Ahead Ledger

Every interaction with the external LLM must be auditable and immutable. VeriMap-HIE implements a local, cryptographically chained write-ahead transaction ledger modeled after secure distributed systems.

### 2.1 The Hashing Formula
Every block $B_n$ committed to the database is linked to the preceding block $B_{n-1}$ via backward-linked SHA-256 signatures. The hash $H_n$ of block $B_n$ is computed as:

$$H_n = \text{SHA256}(H_{n-1} \parallel B_n.timestamp \parallel B_n.operator\_id \parallel B_n.action\_type \parallel B_n.payload)$$

Any row-level change, log deletion, or administrative override immediately breaks the signature chain ($H_n \neq H_{stored}$), alerting security auditors to database tampering.

### 2.2 Relational SQLite Schemas
The database is built on four core ANSI SQL tables:

```sql
-- 1. On-Premises Project Definitions
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Codebase Ingestion Logs
CREATE TABLE codebase_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    archive_name TEXT NOT NULL,
    archive_hash TEXT NOT NULL,          -- SHA-256 hash of the uploaded ZIP
    raw_size_bytes INTEGER NOT NULL,     -- Original ZIP size
    purified_size_bytes INTEGER NOT NULL, -- Compressed size after noise filtering
    ctags_status TEXT DEFAULT 'PENDING',  -- AST parsing execution state
    purged_at TIMESTAMP,                 -- Zero-Data Retention verification stamp
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- 3. Immutably Chained Security Ledger
CREATE TABLE write_ahead_ledger (
    block_id INTEGER PRIMARY KEY AUTOINCREMENT,
    previous_hash TEXT NOT NULL,         -- SHA-256 signature of block (n-1)
    stored_hash TEXT NOT NULL,           -- SHA-256 signature of current block (n)
    timestamp TEXT NOT NULL,             -- Transaction execution time
    operator_id TEXT NOT NULL,           -- User account (e.g., SM, Product Manager)
    action_type TEXT NOT NULL,           -- ZIP_CODEBASE_UPLOAD, ENRICH_TICKET, etc.
    payload TEXT NOT NULL                -- Full JSON text of prompts, responses, or metadata
);

-- 4. Backlog Tickets (Jira Enriched Output)
CREATE TABLE backlog_items (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    snl_obligation TEXT NOT NULL,        -- Standardized natural language requirement
    code_pointers TEXT,                  -- JSON string of files and line ranges
    ripple_effects TEXT,                 -- JSON string of cascading dependency impacts
    unhappy_paths TEXT,                  -- JSON string of exception validation boundaries
    verification_tax INTEGER DEFAULT 0,  -- Metric tracking HIE prompt iterations
    FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

---

## 3. Requirements Verifier-Optimizer Pipeline

Raw requirement drafts must be structured into unambiguous, atomic inputs before code symbol mapping occurs. VeriMap-HIE implements a two-stage **Verifier-Optimizer Loop** grounded in the *VeriGen Requirements Engineering* model:

```
                  ┌────────────────────────────────────────┐
                  │       Raw Text Requirements Draft      │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼ (Parsing NLP Rules)
                  ┌────────────────────────────────────────┐
                  │    RUPPs Conditional Template Form     │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                      ┌──────────────────────────────┐
                      │    LLM Requirements Verifier │
                      └──────────────┬───────────────┘
                                     │
                 Categorizes into:   │
                 - Correct           ├─────────────────────────┐
                 - Incorrect         │                         │
                 - Missing           │                         ▼
                 - Extra             │                 Apply Transformation
                                     │                        Rules:
                                     │                 - CD-1: Class Candidate
                                     │                 - CD-2: Compound Nouns
                                     ▼                 - CD-8: Lemmatization
                  ┌────────────────────────────────────────┐   - SD-5: alt Fragments
                  │     VeriGen-Optimized SNL Outputs      │
                  └────────────────────────────────────────┘
```

### 3.1 Stage 1: Verified Requirements Formalization (The Verifier)
An NLP processing thread parses free-flowing natural language drafts into **Structured Natural Language (SNL)** conforming to RUPPs conditional templates:
* **Format**: `[When <conditions>] THE SYSTEM SHALL provide [Actor] with the ability to <process> [Object]`.
* **Classification**: A rule-based parser (utilizing POS-tagging and tokenization) maps raw specifications to SNL statements, categorizing them into four distinct states [464, 466]:
  1. *Correct*: Standardized statement maps cleanly to a valid requirement.
  2. *Incorrect*: Structurally deficient or ambiguous RUPPs formulations.
  3. *Missing*: Explicit source features found in code units but omitted in the documentation.
  4. *Extra*: Fabricated or hallucinated claims generated by the model with no source-code grounding.

### 3.2 Stage 2: Automated Structural Optimization (The Optimizer)
To correct ambiguities on-the-fly, the optimizer applies syntactic transformation rules derived from your notebook's research:
* **Rule CD-1 (Noun-Based Class Candidates)**: Converts all singularized and proper nouns (singularized via Lemmatization) into base class candidates (e.g., `Books` $\rightarrow$ `Book`).
* **Rule CD-2 (Compound Noun Unification)**: Groups consecutive noun tags into CamelCase models (`Book` + `ID` $\rightarrow$ `BookId`).
* **Rule CD-8 (Lemmatization of Operations)**: Standardizes verb indicators into their infinite base form (e.g., `validates` $\rightarrow$ `validate()`, `checks` $\rightarrow$ `check()`).
* **Rule SD-5 (alt Fragment Mapping)**: Captures conditional words (`if`, `else`, `when`) within SNL specifications to automatically construct PlantUML/Mermaid `alt`/`opt` diagram control blocks.

The result is a standardized SNL layout that serves as the basis for error-free UML generation and class mappings.

---

## 4. Sizing Metric: Hybrid Intelligence Effort (HIE)

Traditional software sizing techniques (such as Function Points or Lines of Code) fail to estimate development complexity in environments utilizing generative AI assistants. This app replaces static metrics with the **Hybrid Intelligence Effort (HIE)** framework.

### 4.1 Measuring the "Verification Tax"
In LLM-assisted pipelines, generating code is fast; **reading, auditing, and validating generated files is the development bottleneck.** 
We define actual engineering effort as a factor of the **"Verification Tax"** ($V_{tax}$), calculated dynamically from transaction metadata:

$$V_{tax} = \sum (P_{iter} + C_{prompts} + M_{diff} + F_{val})$$

Where:
* $P_{iter}$ = Total number of prompt-response-refinement iteration cycles.
* $C_{prompts}$ = Count of corrective prompts issued by the operator to resolve model drift or logic bugs.
* $M_{diff}$ = Manual edit distance (measured via Git diff) required to integrate code skeletons into the codebase.
* $F_{val}$ = Frequency of local validation failures (such as unit test breaks or compile errors).

By capturing the HIE metric directly from interaction logs, Scrum Masters can generate accurate sprint estimates and project milestones grounded in historical team telemetry.
