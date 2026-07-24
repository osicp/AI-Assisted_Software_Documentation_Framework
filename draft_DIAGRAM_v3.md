# System Modeling Specification (v3)

This document provides fully compiled, standardized **Mermaid.js diagram definitions** that map the core operational workflows and database topologies direct ZIP-ingestion architecture.

---

## 1. Workstation Container Pod Topology (Deployment View)

This blueprint maps the network and filesystem isolation boundaries of the local, rootless **Podman container pod** (`THISAPP-pod`), highlighting secure loopback ports and mounted host storage boundaries.

```mermaid
graph TD
    subgraph Host Workstation OS [Host Developer Workstation]
        subgraph Local Pod [THISAPP-pod - Network Namespace Shared]
            ReactApp[React UI Dashboard Container<br>Port 3000]
            FastAPIWorker[FastAPI Backend Worker Container<br>Port 8000]
        end

        HostCtags[Universal Ctags Binary<br>/usr/bin/ctags]
        HostStorage[(Host Persistent Storage<br>./local_data)]
    end

    subgraph Secure External Intranet
        FAUProxy[FAU Trussed.ai Secure Proxy<br>trussed.hpc.fau.edu]
    end

    %% Network flows
    DeveloperBrowser[Developer Web Browser] -->|Port 3000| ReactApp
    DeveloperBrowser -->|Port 8000: API Streams| FastAPIWorker
    ReactApp -->|Proxy Loopback| FastAPIWorker
    FastAPIWorker -->|Port 443: HTTPS TRUSSED_API_KEY| FAUProxy

    %% Vol maps
    FastAPIWorker -->|v3 Mount: '/workspace/data' :Z, :U| HostStorage
    FastAPIWorker -->|Executes AST Parsing| HostCtags
```

---

## 2. Ingestion & On-The-Fly Noise Purging (Activity Flow)

This diagram details the step-by-step unzipping execution, illustrating how the background worker filters non-functional folders to optimize local storage boundaries and data leakage risks.

```mermaid
stateDiagram-v2
    [*] --> IngestReceived : POST /api/ingest (payment-service.zip)
    IngestReceived --> StreamToDisk : Stream 1MB Chunks to Host Drive
    StreamToDisk --> InitializeZipFile : Create Read-Only zipfile.ZipFile File Handle

    state ZipExtractionLoop {
        [*] --> EvaluateFilePath : Read Next Zip Entry Name
        EvaluateFilePath --> CheckIgnorePatterns : Does file path contain ignore patterns?<br>(node_modules/, .git/, build/, .lock)
        
        CheckIgnorePatterns --> DiscardStream : Yes (Structural Elimination)
        DiscardStream --> CheckNextFile : Skip Writing Payload to Disk
        
        CheckIgnorePatterns --> PurifySourceFile : No (Source File Identified)
        PurifySourceFile --> ExtractToDisk : Strip Comments, Spacing, and Logs<br>(Syntactic Dilution)
        ExtractToDisk --> CheckNextFile : Write Cleaned File to Temp Directory
        
        CheckNextFile --> EvaluateFilePath : More Files Exist
        CheckNextFile --> LoopComplete : All Files Processed
    }

    LoopComplete --> RunCtagsAnalysis : Execute Universal Ctags on Cleaned Code base
    RunCtagsAnalysis --> RegisterASTMetadata : Generate {filename}_structure.md and Symbol Tables
    RegisterASTMetadata --> TriggerBackgroundPurge : Indexing Complete
    TriggerBackgroundPurge --> CleanDiskSpace : Wipe Raw Extraction Folders (Zero-Data Retention)
    CleanDiskSpace --> [*] : Return Project Ingestion Success Receipt
```

---

## 3. End-to-End Interaction Sequence Diagram

This trace maps the sequential interaction path of a requirement validation cycle, showing how local SQLite chains coordinate with offloaded FAU proxy caches.

```mermaid
sequenceDiagram
    autonumber
    actor Developer as Workstation Developer
    participant UI as React UI Dashboard
    participant API as FastAPI Ingestion Backend
    participant DB as Local SQLite (governance.db)
    participant FAU as FAU Trussed.ai Proxy

    %% Code Ingestion Flow
    Developer->>UI: Select pre-packaged ZIP archive (under 50MB)
    UI->>API: Stream ZIP file in chunked POST multipart request
    Note over API: Streams 1MB chunks to disk & filters node_modules on-the-fly
    API->>API: Execute Universal Ctags AST Symbol Indexing
    API->>DB: Write Ingest Log & Recalculate SHA-256 Backward Link Block
    API->>UI: Return Ingestion Complete Receipt

    %% Requirements refinement
    Developer->>UI: Input raw textual requirements draft
    UI->>API: POST /api/refine (raw text)
    API->>API: Execute NLP POS Tokenizer (spacy)
    Note over API: Categorize requirements into Correct, Incorrect, and Missing
    API->>UI: Return categorized RUPPs template obligations console

    %% Prompt enrichment & Caching
    Developer->>UI: Trigger Backlog Sizing & Ticket Generation
    UI->>API: POST /api/generate-tickets
    API->>FAU: Route requests using TRUSSED_API_KEY with Context Cache Active
    Note over FAU: Gemini caches optimized codebase layout; reduces tokens by up to 79%
    FAU-->>API: Return enriched backlog items (Code Pointers, Domino Risks)
    API->>DB: Append transaction block to Ledger & Update Hash Chains
    API-->>UI: Deliver completed backlog cards & tickets
    UI-->>Developer: Display visual task metrics and Gantt Sizing estimates
```

---

## 4. Backlog and Immutably Chained Database (Class Diagram)

This schema displays the entity relationships of the local, zero-configuration SQLite transaction database (`governance.db`).

```mermaid
classDiagram
    class Project {
        +TEXT id
        +TEXT name
        +TEXT description
        +TIMESTAMP created_at
    }

    class CodebaseVersion {
        +TEXT id
        +TEXT project_id
        +TEXT archive_name
        +TEXT archive_hash
        +INTEGER raw_size_bytes
        +INTEGER purified_size_bytes
        +TEXT ctags_status
        +TIMESTAMP purged_at
    }

    class WriteAheadLedger {
        +INTEGER block_id
        +TEXT previous_hash
        +TEXT stored_hash
        +TEXT timestamp
        +TEXT operator_id
        +TEXT action_type
        +TEXT payload
    }

    class BacklogItem {
        +TEXT id
        +TEXT project_id
        +TEXT title
        +TEXT actor_role
        +TEXT snl_obligation
        +TEXT code_pointers
        +TEXT ripple_effects
        +TEXT unhappy_paths
        +INTEGER verification_tax
    }

    Project "1" *-- "many" CodebaseVersion : tracks
    Project "1" *-- "many" BacklogItem : contains
    CodebaseVersion "1" --> "1" WriteAheadLedger : records upload hash chain
    BacklogItem "many" --> "1" WriteAheadLedger : records transaction history
```
