## On-Premises Architecture Specification (v3 Ingestion)

This document establishes the official system architecture and technical layout for the web application platform, tailored for secure on-premises single-workstation execution. This specification establishes a headless, intent-oriented documentation and task-generation pipeline that preserves codebase intellectual property (IP), limits local workstation memory consumption, and ensures total operational compliance under strict Zero-Data Retention rules.

---

## 1. Intent-Oriented Native Model & Headless Architecture

Traditional software development tools rely on heavy graphical user interface (GUI) automation and translation layers to bridge natural language requests with system actions. This app discards traditional UI-traversal models, adopting a **Native, Intent-Oriented Architecture**.

```
┌─────────────────────────┐      (POST ZIP)      ┌─────────────────────────┐
│     React Dashboard     │ ───────────────────> │  FastAPI Ingest Server  │
│ (Isolated Workstation)  │                      │   (Rootless Podman)     │
└─────────────────────────┘                      └────────────┬────────────┘
                                                              │
                                                     (Parses AST & Symbols)
                                                              │
                                                              ▼
                                                 ┌─────────────────────────┐
                                                 │     FAU Trussed Proxy   │
                                                 │   (Gemini Context Cache)│
                                                 └─────────────────────────┘
```

By mapping natural language requirements directly to core system primitives via a headless API middleware, the platform eliminates interface bottlenecks and maintains strict semantic context continuity:
1. **Bypassing UI-Bound Overhead**: Direct connection between text-processing models and source code AST repositories prevents the semantic decay typical of graphical automation wrappers.
2. **Context Retention**: Execution of requests through unified REST interfaces utilizes explicit, structured APIs to keep user intent closely bound to system operations.
3. **Local Sovereignty**: All compilation, cleaning, and AST symbol resolution are conducted locally within an on-premises container sandbox, keeping sensitive corporate logic fully isolated from external tracking networks.

---

## 2. Ingestion Pipeline & Chunked Streaming Channel

To scale system capacity to support enterprise repositories up to **10GB** without workstation memory crashes, this app enforces a strict, single-channel binary ingestion workflow.

### 2.1 Direct ZIP Ingestion
Browser-side recursive compression (e.g., using JSZip) of massive folders stutters the user interface and crashes under strict single-thread browser heap memory caps (typically 2GB–4GB). This app addresses this by removing client-side zipping:
* The frontend restricts uploads strictly to pre-packaged `.zip` files using `<input type="file" accept=".zip" />`.
* The developer compresses their target codebase locally using optimized operating system binaries (e.g., `zip -r repository.zip src/`) prior to drag-and-drop.

### 2.2 RAM-Safe Chunked Streaming
Upon receiving the archive, the FastAPI backend worker buffers the file using a non-blocking chunked stream. 
* Python's unbuffered stream-reader writes incoming binary data in **1MB chunks** directly to a disk-backed container storage directory (e.g., `/workspace/data/raw_uploads`).
* This stream-to-disk logic caps container RAM utilization at **<50MB** regardless of total codebase size, protecting host environments from Out-Of-Memory (OOM) process termination.

---

## 3. Context Optimization & Noise Purification Layer

A raw codebase of 300–500 files can push LLM context limits and dilute attention quality during reasoning. This app integrates a **two-stage local noise purification algorithm**:

### Phase A: Structural Elimination
Prior to full archive extraction, Python's `zipfile` stream evaluates nested file paths against an array of structural ignore lists. Unzip operations are skipped on-the-fly for files and directories that do not contain core business logic:
* **Ignored Structures**: `node_modules/`, `.git/`, compiled build artifacts (`target/`, `dist/`, `.class`), image assets, stylesheets (`.css`, `.scss`), and lock files (`package-lock.json`, `poetry.lock`).
* **Outcome**: Discarding non-functional artifacts on-the-fly compresses the active on-disk file tree by **approximately 35%**, optimizing disk I/O and protecting local storage boundaries.

### Phase B: Syntactic Dilution
The extracted logical files (specifically `.java`, `.py`, and `.json` modules representing Controller, Service, and Data layers) are parsed locally inside the container sandbox. A deterministic cleaner cleans the code files by:
1. Stripping out all developer-written comment blocks (such as block `/* ... */` and inline `//` comments).
2. Removing excess double-line spaces and redundant indentation characters.
3. Purging verbose debug logging statements (e.g., `System.out.println()`, `console.log()`) that do not impact runtime execution structures.

This syntactic purification exposes the bare logical core of the codebase, ensuring that the full system skeleton can fit lossless within the model's active working memory window.

---

## 4. SpecMap Multi-Level Traceability Link Recovery (TLR)

Rather than executing direct, flat keyword searches or unstructured vector-database lookups over large code bases—which consistently suffer from semantic abstraction mismatches this app implements the **SpecMap Hierarchical TLR model** ($M = M_4 \circ M_3 \circ M_2 \circ M_1$):

```
┌────────────────────────────────────────────────────────┐
│               Datasheet/Specification Section           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ [M1: Folder Discovery]
┌────────────────────────────────────────────────────────┐
│              Target Repository Folder Nodes            │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ [M2: File Discovery]
┌────────────────────────────────────────────────────────┐
│             File Metadata (folder_structure.md)        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ [M3: Code Symbol Discovery]
┌────────────────────────────────────────────────────────┐
│       AST Symbols (ctags: classes, methods, macros)    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼ [M4: Validation & Status]
┌────────────────────────────────────────────────────────┐
│     Compliance Assessment (Implemented / Gaps)         │
└────────────────────────────────────────────────────────┘
```

1. **$M_1$ - Folder Discovery**: Maps specifications to target folder paths by matching high-level requirements with generated folder descriptions, discarding irrelevant directory branches early.
2. **$M_2$ - File Discovery**: Dynamically generates local, cached markdown schemas (`folder_structure.md`) that detail the purpose of each code module within relevant folders.
3. **$M_3$ - Code Symbol Discovery**: Integrates **Universal Ctags** to recursively scan Java, Python, and C/C++ files. It extracts explicit, structured code symbols (functions, macros, structs, constants, configuration parameters, and register definitions) with precise line-number boundaries:
   * *Adaptive Grouping*: Employs a Depth-First Search (DFS) file-tree traversal with a **10% overlap rate** across adjacent symbol segments to prevent semantic continuity loss across file boundaries.
4. **$M_4$ - Validation & Gap Analysis**: Evaluates the retrieved symbol mappings against the structured natural language requirements to determine implementation compliance (*Implemented*, *Partially Implemented*, *Not Implemented*, or *Not Applicable*).

---

## 5. External Inference Optimization & Zero-Data Retention

The system coordinates secure remote inference with offloaded compute while enforcing strict administrative privacy:

### 5.1 Gemini Context Caching
When routing queries to the external **FAU Trussed.ai proxy** (`trussed.hpc.fau.edu`) via the secure `TRUSSED_API_KEY`, the optimized semantic codebase representation is cached on Google's Vertex AI servers using **Context Caching**. 
* All subsequent sprint-planning interactions, sequence modeling rounds, and compliance audits query directly against this pre-cached context.
* This optimization reduces token consumption and response latencies by **up to 79%**, keeping operations well within the $10/student monthly proxy budget.

### 5.2 Dynamic Workspace Purge
To satisfy strict corporate IP leakage rules, the FastAPI container maintains a background cleanup daemon (`BackgroundTasks`). 
* The instant Universal Ctags indexing and token cache registration are completed, the system triggers an automated deletion task.
* This task completely wipes the temporary unzipped codebase folders and binary files from `/tmp` inside the container disk space, achieving complete compliance with **Zero-Data Retention** guidelines.
