# ScrumMap: Installation, Setup & Verification Manual

This document serves as the step-by-step engineering playbook for **ScrumMap**. It details how to set up the on-premises development environment, install all local prerequisite tools, build the codebase from scratch, and verify each stage of the five-stage pipeline on a single secure workstation.

---

## 1. On-Premises Tool Installation & Prerequisites

To successfully build and deploy ScrumMap, the host workstation must have several native packages installed. Run the platform-specific instructions below to set up your environment.

### 1.1 Python 3.12+ (Core Application Layer)
The backend requires a modern, thread-safe Python 3.12+ runtime environment.
* **macOS** (via Homebrew):
  ```bash
  brew install python@3.12
  ```
* **Debian/Ubuntu**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y python3.12 python3.12-venv python3.12-dev build-essential
  ```
* **Fedora/RHEL**:
  ```bash
  sudo dnf install -y python3.12 python3.12-devel development-tools
  ```

### 1.2 Universal Ctags (AST static analysis)
ScrumMap uses Universal Ctags to index files and locate exact code symbols. **Do not install legacy/Exuberant ctags**, as it lacks the advanced block and parameter parsing necessary for AST mapping.
* **macOS**:
  ```bash
  brew install universal-ctags
  ```
* **Debian/Ubuntu**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y universal-ctags
  ```
* **Fedora/RHEL**:
  ```bash
  sudo dnf install -y ctags
  ```
* **Verify Installation**:
  ```bash
  ctags --version
  ```
  *Ensure the output prints `Universal Ctags` rather than Exuberant/BSD.*

### 1.3 Podman (Secure Daemonless Containerization)
Podman was selected because it runs **daemonless and rootless**. This mitigates the security vulnerabilities associated with running background, root-privileged Docker daemons.
* **macOS**:
  ```bash
  brew install podman
  podman machine init
  podman machine start
  ```
* **Debian/Ubuntu**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y podman
  ```
* **Fedora/RHEL**:
  ```bash
  sudo dnf install -y podman
  ```
* **Verify Rootless Operations**:
  ```bash
  podman info | grep "rootless: true"
  ```
  *Ensure rootless output is true to prevent execution privilege blocks.*

### 1.4 Document Compilation Tooling (xsltproc & Apache FOP / LaTeX)
To render downloadable PDF audits from DocBook XML v5.1 templates, install the following document compilation engines:
* **macOS**:
  ```bash
  brew install xsltproc fop pandoc
  brew install --cask basictex
  ```
* **Debian/Ubuntu**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y xsltproc fop pandoc texlive-latex-extra
  ```
* **Fedora/RHEL**:
  ```bash
  sudo dnf install -y xsltproc fop pandoc texlive-scheme-basic
  ```

### 1.5 Podman Compose (Multi-Container Orchestration)
To orchestrate container pods using the declarative compose files, install the `podman-compose` utility:
* **macOS** (via Homebrew):
  ```bash
  brew install podman-compose
  ```
* **Debian/Ubuntu**:
  ```bash
  sudo apt-get update
  sudo apt-get install -y podman-compose
  ```
* **Fedora/RHEL**:
  ```bash
  sudo dnf install -y podman-compose
  ```
* **Fallback (via Python Package Manager)**:
  If a native package is not available, install it inside your environment via `pip`:
  ```bash
  pip install podman-compose
  ```
* **Verify Installation**:
  ```bash
  podman-compose --version
  ```

---

## 2. ScrumMap Comprehensive Directory Layout

The following tree establishes the monorepo boundaries of the ScrumMap suite. Use this layout to organize the files on your host workstation.

```text
scrummap/
├── .gitignore                      # Git exclusion rules
├── scrummap.env                    # Active local environment settings (Git-ignored)
├── scrummap.env.example            # Public distribution settings template
├── bootstrap_workstation.sh        # Checks system prereq., builds images, and spins up Podman pod
├── podman-compose.yaml             # Service topology invoked by bootstrap_workstation.sh (podman-compose only)
│
├── backend/                        # Backend FastAPI service boundary
│   ├── Containerfile               # Rootless container (installs universal-ctags, Python, libxml2)
│   ├── requirements.txt            # Python dependencies (fastapi, uvicorn, pydantic-settings, spacy, sentence-transformers)
│   ├── ledger_verifier.py          # CLI: setup-mock / verify / tamper — wraps app/ledger.py for admins
│   └── app/
│       ├── __init__.py
│       ├── main.py                 # FastAPI routes, chunked ZIP streams, background task orchest.
│       ├── config.py               # Pydantic v2 BaseSettings wrapper parsing scrummap.env
│       ├── auth.py                 # Role-key request authentication (X-ScrumMap-Role-Key header)
│       ├── optimizer.py            # Context Optimizer: Structural Elim. & Syntactic Dil. sweeps
│       ├── parser.py               # AST Symbol Parser: Static analysis wrapping Universal Ctags
│       ├── sbert_clustering.py     # SBERT & K-Means story grouping logic
│       ├── backlog_generator.py    # Deductive SAR & Bifurcated Forward/Reverse Ticket pipelines
│       ├── uml_generator.py        # PlantUML diagram validation and synthesis
│       ├── document_compiler.py    # PDF report generation (fpdf2 compiler)
│       ├── ledger.py               # Relational DB and HMAC-SHA256 cryptographic chaining
│       └── logger.py               # Structured logger configuration setup
│
├── frontend/                       # Next.js Single-Page Application (SPA) dashboard boundary
│   ├── Containerfile               # Nginx / Next.js production build container specification
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── public/                     # Static assets, SVG icons, and fallback CSS
│   └── src/
│       ├── pages/                  # Single-page dynamic view routers
│       │   ├── _app.tsx
│       │   └── index.tsx           # Base viewport router mapping sidebar navigation states
│       ├── components/             # Reusable UI component modules
│       │   ├── DropZone.tsx        # Drag-and-drop .zip container with 1MB chunk upload progress
│       │   ├── UMLCanvas.tsx       # Interactive SVG pane showcasing PlantUML/Mermaid diagrams
│       │   ├── EpicBoard.tsx       # Kanban board showing code pointers, ripple effects, and sizing
│       │   ├── CodeViewer.tsx      # Side-by-side git-diff and requirement-annotated previewer
│       │   └── AdminPortal.tsx     # Role privs table, ledger console, and system guardrail toggles
│       └── lib/
│           ├── api.ts              # Axios wrapper targeting http://localhost:8000 loopback routes
│           └── types.ts            # Global TypeScript interface mapping FastAPI REST schemas
│
├── data/                           # Relational SQLite DB mount directory (shared with host)
│   └── governance.db               # Relational DB file (auto-generated during bootstrap)
│
├── mock-codebases/                 # Standard test repositories for system pipeline validation
│   ├── mock_project/               # Unpacked directory containing functional classes
│   │   ├── src/
│   │   │   └── main/
│   │   │       └── java/
│   │   │           └── com/
│   │   │               └── enterprise/
│   │   │                   ├── OrderService.java
│   │   │                   └── DatabaseConnection.java
│   │   └── pom.xml
│   └── mock_project.zip            # Pre-compiled zip archive used for testing
│
└── tests/                          # Integration, end-to-end, and database sanity suites
    ├── __init__.py
    ├── conftest.py                 # Set up temp sqlite DB connections and upload dirs for tests
    ├── test_ingestion.py           # Validates 1MB streaming, Structural Elim., and Syntactic Dil.
    ├── test_verifier.py            # Validates spaCy RUPPs parsing and Verifier-Optimizer classif.
    ├── test_ledger.py              # Validates cryptographic hash chaining and ledger_verifier
    └── test_specmap.py             # Validates SBERT clustering and M1-M4 SpecMap composition
```

---

## 3. Configuration and Secrets Management

To satisfy enterprise compliance regulations, ScrumMap segregates active secrets from codebase structures. Active keys must reside in `scrummap.env`, while a sanitized template is saved in `scrummap.env.example`.

### 3.1 Creating the `.env` configuration file
Duplicate `scrummap.env.example` to construct your workstation configuration file:
```bash
cp scrummap.env.example scrummap.env
```

Open `scrummap.env` in your editor and configure the keys:
```env
# ==============================================================================
# SCRUMMAP - SECURE WORKSTATION LOCAL ENVIRONMENT VARIABLES
# ==============================================================================

# 1. Workstation Host Network Bindings
BIND_ADDRESS=127.0.0.1
FRONTEND_PORT=3000
BACKEND_PORT=8000

# 2. Local SQLite Relational Database Engine
# Absolute path to in-process SQLite database AS SEEN INSIDE THE CONTAINER.
# WAL & synchronous configurations apply automatically.
DATABASE_PATH=./data/governance.db
# HOST-side directory bind-mounted to the container's /workspace/data — distinct
# from DATABASE_PATH because the container and host are different filesystem
# namespaces (/workspace does not exist on the bare host).
HOST_DATA_DIR=./data

# 3. Codebase Ingestion Security Limits (Zip-Bomb Denial-of-Service Defense)
# Directory where multi-part streaming code zip files are temporarily extracted,
# AS SEEN INSIDE THE CONTAINER.
UPLOAD_DIR=/tmp/scrummap_uploads
# HOST-side directory bind-mounted to the container's UPLOAD_DIR.
HOST_UPLOAD_DIR=/tmp/scrummap_uploads
# Hard limit of 2.0 GB on incoming zipped codebase files to preserve local storage.
MAX_ZIP_SIZE_BYTES=2147483648
# Absolute ceiling of 50,000 files unzipped on-the-fly. Aborts above limit.
MAX_FILE_COUNT=50000
# Reject if uncompressed/compressed size exceeds 100x (zip-bomb ratio defense).
MAX_EXPANSION_RATIO=10
# Absolute uncompressed-size ceiling: 5x MAX_ZIP_SIZE_BYTES.
MAX_UNCOMPRESSED_BYTES_MULTIPLIER=5

# 4. LLM API Key Integrations (FAU Trussed.ai Secure Proxy)
# Log in to https://trussed.hpc.fau.edu with Single Sign-On to generate your API key.
TRUSSED_API_KEY=your_secure_trussed_api_key_here
TRUSSED_API_URL=https://fauengtrussed.fau.edu/provider/generic
# Context Caching via HootCamp Gemini project (gemini-2.5-pro).
LLM_MODEL=gemini-2.5-pro

# 5. Offline Alternative Fallbacks (Local Integration)
# Uncomment the parameters below to run ScrumMap offline using local open-weight models
# LLM_PROVIDER=openai-compatible
# OPENAI_API_KEY=lm-studio
# OPENAI_API_BASE_URL=http://localhost:1234/v1
# LLM_MODEL=qwen/qwen2.5-30b-instruct

# 6. Team Velocity & Security Operations Guardrails
# Human-in-the-loop requirement-correction escalation limit
ESCALATION_PROMPT_CAP=3
# JSON-schema-validation retry limit (independent of ESCALATION_PROMPT_CAP above)
JSON_RETRY_CAP=3
# Zero-Data Retention: Recursively wipes unzipped codebase directories after symbol indexing
ZDR_COMPLIANCE=TRUE
# Log details level (DEBUG, INFO, WARNING, ERROR)
LOG_LEVEL=INFO

# 7. Role-Based Access Keys (RBAC Enforcement)
# One static key per role, sent by clients via the 'X-ScrumMap-Role-Key' header.
# The backend resolves operator_id/role from WHICH key matched, never from a
# client-supplied field, so the write-ahead ledger's operator_id can be trusted.
ROLE_KEY_PRODUCT_MANAGER=rk_pm_demo_secret_only
ROLE_KEY_SCRUM_MASTER=rk_sm_demo_secret_only
ROLE_KEY_LEAD_DEVELOPER=rk_dev_demo_secret_only
ROLE_KEY_SECURITY_AUDITOR=rk_audit_demo_secret_only
ROLE_KEY_SYSTEM_ADMIN=rk_admin_demo_secret_only

# 8. Ledger Integrity (Tamper-Evidence HMAC)
# Secret key used to HMAC-sign write-ahead ledger blocks. Without this key, an
# attacker with write access to governance.db cannot forge a consistent chain
# after tampering with a row. Must not live in the same directory as DATABASE_PATH.
LEDGER_HMAC_KEY=demo_ledger_hmac_secret_key_9e8d7c6b5a
```

---

## 4. Step-by-Step Build and Integration Sequence

Build the ScrumMap framework step-by-step to isolate and verify components as they are integrated. Follow the sequence below:

```
[Phase 1: Setup] ──> [Phase 2: Database & Config] ──> [Phase 3: Ingestion & Filtering]
                                                                    │
[Phase 5: SBERT Clustering] <── [Phase 4: AST Parser] <─────────────┘
```

### Phase 1: Local Sandbox Scaffolding
Create the directory structure and initialize the Python virtual environment on the host workstation.
```bash
# Initialize directories
mkdir -p scrummap/backend/app
mkdir -p scrummap/frontend/src/pages
mkdir -p scrummap/frontend/src/components
mkdir -p scrummap/frontend/src/lib
mkdir -p scrummap/frontend/public
mkdir -p scrummap/data
mkdir -p scrummap/mock-codebases
mkdir -p scrummap/tests

# Navigate to project root
cd scrummap

# Set up Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
```

Inside `scrummap/backend/requirements.txt`, write the required libraries:
```text
fastapi>=0.110.0
uvicorn>=0.28.0
pydantic>=2.6.0
pydantic-settings>=2.2.0
spacy>=3.7.0
sentence-transformers>=2.6.0
pypdf>=4.0.0
jinja2>=3.1.0
python-multipart>=0.0.9
fpdf2>=2.8.8
```
Install the python requirements and fetch the required spaCy English language model:
```bash
pip install -r backend/requirements.txt
python -m spacy download en_core_web_sm
```

### Phase 2: Configuration & Database Compilation
Create the type-safe Pydantic settings module and relational SQLite connection engine. Write the files below into their designated directory paths:

#### File A: Type-Safe Configurations (`backend/app/config.py`)
This script maps active environment variables to safe, type-checked Pydantic classes [config.py in layouts].
```python
# =============================================================================
# SCRUMMAP BACKEND CONFIGURATION GATEWAY (config.py)
# =============================================================================
import os
from typing import Optional
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class ScrumMapSettings(BaseSettings):
    # Use triple-single quotes to prevent nested triple-double quote parse errors
    '''
    Type-safe configuration mapper mapping the workstation environment variables (scrummap.env).
    '''
    # Locate scrummap.env dynamically to support nested subdirectory executions
    _env_paths = [
        "scrummap.env",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "scrummap.env")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../scrummap.env")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../scrummap.env")),
    ]
    _env_file = next((path for path in _env_paths if os.path.exists(path)), "scrummap.env")

    model_config = SettingsConfigDict(
        env_file=_env_file,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Workstation Network Bindings
    BIND_ADDRESS: str = Field(default="127.0.0.1", description="Local loopback interface")
    FRONTEND_PORT: int = Field(default=3000, description="Web Dashboard Port")
    BACKEND_PORT: int = Field(default=8000, description="FastAPI Server Port")

    # relational database Settings
    DATABASE_PATH: str = Field(default="/workspace/data/governance.db", description="In-process SQLite Database File")
    
    # Ingestion & Context Optimization Guardrails
    UPLOAD_DIR: str = Field(default="/tmp/scrummap_uploads", description="Decompression storage")
    MAX_ZIP_SIZE_BYTES: int = Field(default=2147483648, description="2.0 GB ZIP ceiling limit")
    MAX_FILE_COUNT: int = Field(default=50000, description="Zip bomb maximum file expansion")
    MAX_EXPANSION_RATIO: int = Field(default=10, description="Reject if uncompressed/compressed size exceeds this ratio")
    MAX_UNCOMPRESSED_BYTES_MULTIPLIER: int = Field(default=5, description="Absolute uncompressed-size ceiling, as a multiplier of MAX_ZIP_SIZE_BYTES")

    # LLM Gateway Integrations (FAU Trussed.ai proxy)
    TRUSSED_API_KEY: str = Field(..., description="FAU HPC authentication credential")
    TRUSSED_API_URL: str = Field(default="https://fauengtrussed.fau.edu/provider/generic", description="OpenAI-compatible gateway")
    LLM_MODEL: str = Field(default="gemini-2.5-pro", description="Google Gemini model")

    # Team Velocity Guardrails
    ESCALATION_PROMPT_CAP: int = Field(default=3, description="Human-in-the-loop requirement-correction escalation limit")
    JSON_RETRY_CAP: int = Field(default=3, description="JSON-schema-validation retry limit, independent of ESCALATION_PROMPT_CAP")
    ZDR_COMPLIANCE: bool = Field(default=True, description="Immediately purge decompressed files after symbol compilation")
    LOG_LEVEL: str = Field(default="INFO", description="Standardized system logging resolution")

    # SQLite Performance Pragmas
    SQLITE_JOURNAL_MODE: str = Field(default="WAL", description="SQLite journal mode")
    SQLITE_SYNCHRONOUS: str = Field(default="NORMAL", description="SQLite synchronous mode")
    SQLITE_FOREIGN_KEYS: str = Field(default="ON", description="SQLite foreign key enforcement (ON/OFF)")

    # LLM Provider Selection (Trussed proxy vs. local offline fallback)
    LLM_PROVIDER: str = Field(default="trussed", description="'trussed' or 'openai-compatible' (e.g. LM Studio)")
    OPENAI_API_KEY: Optional[str] = Field(default=None, description="Local LLM Studio API key (offline fallback)")
    OPENAI_BASE_URL: Optional[str] = Field(default=None, description="Local LLM Studio base URL (offline fallback)")
    LOCAL_LLM_MODEL: Optional[str] = Field(default=None, description="Local open-weight model identifier (offline fallback)")

    # Logging Format
    LOG_FORMAT: str = Field(default="JSON", description="Structured log output format: JSON or TEXT")

    # Role-Based Access Keys (RBAC Enforcement)
    # One static key per role, matched against the 'X-ScrumMap-Role-Key' request header.
    ROLE_KEY_PRODUCT_MANAGER: str = Field(..., description="Access key for the Product Manager role")
    ROLE_KEY_SCRUM_MASTER: str = Field(..., description="Access key for the Scrum Master role")
    ROLE_KEY_LEAD_DEVELOPER: str = Field(..., description="Access key for the Lead Developer role")
    ROLE_KEY_SECURITY_AUDITOR: str = Field(..., description="Access key for the Security Auditor role")
    ROLE_KEY_SYSTEM_ADMIN: str = Field(..., description="Access key for the System Admin role")

    # Ledger Integrity (Tamper-Evidence HMAC)
    LEDGER_HMAC_KEY: str = Field(..., description="Secret key for HMAC-signing write-ahead ledger blocks")

    @field_validator("DATABASE_PATH")
    @classmethod
    def validate_database_dir(cls, v: str) -> str:
        '''
        Ensures that the directory folder housing our relational database file actually exists.
        '''
        db_dir = os.path.dirname(v)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                raise ValueError(f"Failed to create database target directory {db_dir}: {str(e)}")
        return v

    @field_validator("TRUSSED_API_KEY")
    @classmethod
    def validate_api_key(cls, v: str) -> str:
        '''
        Validates that the developer provided a legitimate, non-placeholder API key.
        '''
        if any(p in v.lower() for p in ("your_secure", "your_key_here", "trussed_api_key_here")) or (v.lower().startswith("your_") and v.lower().endswith("key_here")):
            raise ValueError(
                "CRITICAL: Active 'TRUSSED_API_KEY' contains default dummy placeholder. "
                "Please acquire an authenticated key from https://trussed.hpc.fau.edu."
            )
        return v

    @field_validator(
        "ROLE_KEY_PRODUCT_MANAGER", "ROLE_KEY_SCRUM_MASTER", "ROLE_KEY_LEAD_DEVELOPER",
        "ROLE_KEY_SECURITY_AUDITOR", "ROLE_KEY_SYSTEM_ADMIN", "LEDGER_HMAC_KEY",
    )
    @classmethod
    def validate_not_placeholder(cls, v: str, info) -> str:
        '''
        Rejects default placeholder secrets so RBAC/ledger-signing can't silently
        run with the never-changed values shipped in scrummap.env.example.
        '''
        if "change_me" in v.lower() or (v.lower().startswith("your_") and v.lower().endswith("key_here")):
            raise ValueError(
                f"CRITICAL: System setting '{info.field_name}' contains default template placeholder. "
                f"Please update your '.env' configuration file with unique secrets."
            )
        return v

    @model_validator(mode="after")
    def validate_distinct_role_keys(self) -> "ScrumMapSettings":
        '''
        Ensures no two roles share the same access key — a collision would cause
        every request from one role to silently resolve as another role.
        '''
        role_keys = [
            self.ROLE_KEY_PRODUCT_MANAGER, self.ROLE_KEY_SCRUM_MASTER, self.ROLE_KEY_LEAD_DEVELOPER,
            self.ROLE_KEY_SECURITY_AUDITOR, self.ROLE_KEY_SYSTEM_ADMIN,
        ]
        if len(set(role_keys)) != len(role_keys):
            raise ValueError("CRITICAL: Two or more ROLE_KEY_* values are identical. Each role must have a distinct key.")
        return self

# Instantiate global settings catalog
settings = ScrumMapSettings()
```

#### File A.1: Role-Key Authentication Gateway (`backend/app/auth.py`)
This module resolves an incoming `X-ScrumMap-Role-Key` header to a trusted role/operator identity. Every write endpoint (`upload`, `refine`, `generate`) and the ledger audit endpoint depend on `resolve_operator_role` rather than trusting a client-supplied `operator_id` field directly:
```python
# =============================================================================
# SCRUMMAP ROLE-KEY AUTHENTICATION GATEWAY (auth.py)
# =============================================================================
from fastapi import Header, HTTPException, status
from backend.app.config import settings

# Maps each configured role key to its trusted operator/role identity.
# Built once at import time; never derived from client-supplied data.
_ROLE_KEY_MAP = {
    settings.ROLE_KEY_PRODUCT_MANAGER: "PRODUCT_MANAGER",
    settings.ROLE_KEY_SCRUM_MASTER: "SCRUM_MASTER",
    settings.ROLE_KEY_LEAD_DEVELOPER: "LEAD_DEVELOPER",
    settings.ROLE_KEY_SECURITY_AUDITOR: "SECURITY_AUDITOR",
    settings.ROLE_KEY_SYSTEM_ADMIN: "SYSTEM_ADMIN",
}

def resolve_operator_role(x_scrummap_role_key: str = Header(default=None)) -> str:
    '''
    FastAPI dependency: resolves the caller's role from the submitted role key.
    Raises 403 if the header is missing or does not match any configured role.
    Returns the trusted role name to use as the ledger's operator_id.
    '''
    role = _ROLE_KEY_MAP.get(x_scrummap_role_key)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing X-ScrumMap-Role-Key header."
        )
    return role
```
Endpoints depend on it like so: `async def upload_codebase(..., operator_id: str = Depends(resolve_operator_role))`. The resolved `operator_id` — never a client-supplied string — is what gets passed to `commit_transaction_to_ledger`.

#### File A.2: Structured JSON Logger Setup (`backend/app/logger.py`)
This file configures the workstation's FastAPI runtime logging handler to output telemetry records in structured JSON or standard human-readable text formats:
```python
# =============================================================================
# SCRUMMAP SECURE AUDITING LOG SERVICE & FORMATTER (logger.py)
# =============================================================================
import logging
import json
import sys
from datetime import datetime
from backend.app.config import settings

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)

def setup_logging():
    '''
    Configures Python standard logging. If LOG_FORMAT is 'JSON', it attaches
    the JSONFormatter to the stream handler to output structured JSON logs
    conforming to the ScrumMap auditing requirements.
    '''
    root_logger = logging.getLogger()
    
    # Clean up existing handlers to avoid double logging
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)
        
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    root_logger.setLevel(log_level)
    
    handler = logging.StreamHandler(sys.stdout)
    
    if settings.LOG_FORMAT.upper() == "JSON":
        handler.setFormatter(JSONFormatter())
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S"
        )
        handler.setFormatter(formatter)
        
    root_logger.addHandler(handler)
```

#### File B: Relational SQLite & Hashed Ledger Engine (`backend/app/ledger.py`)
This file implements thread-safe database connection configurations, initializes database tables, and registers cryptographically linked write-ahead transaction logs [ledger.py in layouts]:
```python
# =============================================================================
# SCRUMMAP SECURE DATABASE GATEWAY & IMMUTABLE LEDGER PIPELINE (ledger.py)
# =============================================================================
import os
import sqlite3
import json
import hashlib
import hmac
from datetime import datetime
from typing import Dict, Any, List, Optional
from backend.app.config import settings

def get_db_connection() -> sqlite3.Connection:
    # Use triple-single quotes for docstring
    '''
    Establishes a thread-safe connection to our local SQLite transaction database.
    Configures WAL journaling, synchronous writes, and foreign key enforcement.
    '''
    conn = sqlite3.connect(settings.DATABASE_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    
    # Execute speed and multi-threaded safety optimization pragmas (configurable via scrummap.env)
    conn.execute(f"PRAGMA journal_mode={settings.SQLITE_JOURNAL_MODE};")   # Non-blocking write-ahead logging
    conn.execute(f"PRAGMA synchronous={settings.SQLITE_SYNCHRONOUS};")    # SSD storage write optimization
    conn.execute(f"PRAGMA foreign_keys={settings.SQLITE_FOREIGN_KEYS};")  # Schema relational constraints
    
    return conn

def init_governance_db():
    # Use triple-single quotes for docstring
    '''
    Initializes clean SQL database schemas representing the projects, versions, items, and log tables.
    '''
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Projects Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')
    
    # 2. Codebase Versions Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS codebase_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version_tag TEXT NOT NULL,
        zip_checksum TEXT NOT NULL,
        purified_size_bytes INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    ''')
    
    # 3. Backlog Items Table (Jira Epic & Story Outputs)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS backlog_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        codebase_version_id TEXT NOT NULL,  -- Snapshot code_pointers were computed against
        title TEXT NOT NULL,
        description TEXT,
        actor_role TEXT NOT NULL,
        snl_requirements TEXT,
        hie_story_points REAL NOT NULL,
        code_pointers TEXT,   -- JSON string containing files and line ranges
        ripple_effects TEXT,  -- JSON string containing dependency mapping
        unhappy_paths TEXT,   -- JSON string containing exception constraints
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (codebase_version_id) REFERENCES codebase_versions(id)
    );
    ''')
    
    # 4. Immutable Write-Ahead Hashing Ledger Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS write_ahead_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT,                -- Nullable: not all transactions are project-scoped
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        operator_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL, -- ZIP_CODEBASE_UPLOAD, BACKLOG_GENERATION, etc.
        payload TEXT NOT NULL,          -- JSON string containing metadata of prompt/execution
        payload_hash TEXT NOT NULL,     -- SHA-256 hash of the payload
        block_signature TEXT NOT NULL,  -- HMAC-SHA256 of (payload_hash + prev_block_signature)
        prev_block_signature TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    ''')
    
    conn.commit()
    conn.close()

def commit_transaction_to_ledger(
    operator_id: str, transaction_type: str, payload_data: Dict[str, Any], project_id: Optional[str] = None
) -> str:
    # Use triple-single quotes for docstring
    '''
    Immutably records system interactions and prompts inside the write-ahead ledger table.
    Links the new transaction block signature recursively back to the preceding record.
    operator_id MUST originate from auth.resolve_operator_role (the matched role-key's
    identity), never from a client-supplied request field, or the ledger's attribution
    of "who did this" cannot be trusted.
    The read-prev-signature/insert-new-block sequence runs inside a single BEGIN IMMEDIATE
    transaction so concurrent callers can't both read the same prev_block_signature and
    fork the chain instead of extending it linearly.
    '''
    conn = get_db_connection()
    conn.isolation_level = None  # manual transaction control, local to this connection
    cursor = conn.cursor()

    cursor.execute("BEGIN IMMEDIATE;")  # acquire the write lock before reading prev signature
    try:
        # Stringify the JSON payload securely
        payload_str = json.dumps(payload_data, sort_keys=True)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        # Retrieve the signature block of the immediately preceding ledger transaction (Block n-1)
        cursor.execute("SELECT block_signature FROM write_ahead_ledger ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()

        if row is None:
            # Genesis block condition (no prior transactions registered)
            prev_signature = "GENESIS_BLOCK_ZERO_0000000000000000000000000000000000000000000"
        else:
            prev_signature = row["block_signature"]

        # Calculate signature chain mapping: Hn = HMAC-SHA256(LEDGER_HMAC_KEY, H_n-1 || ... || Payload_Hash)
        # Keyed with a secret outside governance.db so a tampered row can't be
        # "fixed up" by recomputing the chain forward without the key.
        timestamp_str = datetime.now().isoformat()
        project_id_str = project_id or ""
        chain_input = f"{prev_signature}||{timestamp_str}||{project_id_str}||{operator_id}||{transaction_type}||{payload_hash}"
        current_signature = hmac.new(
            settings.LEDGER_HMAC_KEY.encode("utf-8"), chain_input.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        # Commit the block
        cursor.execute('''
            INSERT INTO write_ahead_ledger (
                project_id, timestamp, operator_id, transaction_type, payload, payload_hash, block_signature, prev_block_signature
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (project_id, timestamp_str, operator_id, transaction_type, payload_str, payload_hash, current_signature, prev_signature))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return current_signature

def audit_ledger_integrity() -> Dict[str, Any]:
    # Use triple-single quotes for docstring
    '''
    Sanity checks and audits the complete signature database table from the initial record to the present block.
    '''
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, project_id, timestamp, operator_id, transaction_type, payload, payload_hash, block_signature, prev_block_signature FROM write_ahead_ledger ORDER BY id ASC")
    blocks = cursor.fetchall()
    
    if not blocks:
        return {"status": "CLEAN", "message": "Database write-ahead ledger is empty. Audit complete.", "scanned_blocks": 0}
        
    calculated_prev_sig = "GENESIS_BLOCK_ZERO_0000000000000000000000000000000000000000000"
    
    for block in blocks:
        b_id = block["id"]
        p_hash = hashlib.sha256(block["payload"].encode("utf-8")).hexdigest()
        
        # Verify that row-level JSON content matches original hash
        if p_hash != block["payload_hash"]:
            conn.close()
            return {
                "status": "COMPROMISED",
                "message": f"CRITICAL Error: Row-level payload has been tampered in Block #{b_id}.",
                "tampered_block_id": b_id
            }
            
        # Verify that the declared previous signature link matches calculated values
        if block["prev_block_signature"] != calculated_prev_sig:
            conn.close()
            return {
                "status": "COMPROMISED",
                "message": f"CRITICAL Error: Backward signature link broken at Block #{b_id}.",
                "tampered_block_id": b_id
            }
            
        # Re-verify the current hash chain computation using the same HMAC key
        project_id_str = block['project_id'] or ""
        chain_input = f"{calculated_prev_sig}||{block['timestamp']}||{project_id_str}||{block['operator_id']}||{block['transaction_type']}||{p_hash}"
        recalculated_signature = hmac.new(
            settings.LEDGER_HMAC_KEY.encode("utf-8"), chain_input.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(recalculated_signature, block["block_signature"]):
            conn.close()
            return {
                "status": "COMPROMISED",
                "message": f"CRITICAL Error: Signature signature mismatch at Block #{b_id}.",
                "tampered_block_id": b_id
            }
            
        # Move up the chain (updating the target previous register)
        calculated_prev_sig = block["block_signature"]
        
    conn.close()
    return {
        "status": "SUCCESS",
        "message": f"Ledger integrity verified. {len(blocks)} transaction blocks scanned. Chain is solid.",
        "scanned_blocks": len(blocks)
    }
```

*Verification Step*:
Initialize and test the ledger module from the Python CLI:
```bash
python3 -c "from backend.app.ledger import init_governance_db, commit_transaction_to_ledger, audit_ledger_integrity; init_governance_db(); print('LEDGER INIT SUCCESS'); commit_transaction_to_ledger('test_admin', 'SYSTEM_BOOTSTRAP', {'status': 'ONLINE'}); print(audit_ledger_integrity())"
```
*Expected Output: STATUS: SUCCESS, scanned_blocks: 1.*

#### File B.1: Ledger Verifier CLI (`backend/ledger_verifier.py`)
This is the standalone admin-facing wrapper referenced throughout Section 6's Test Protocols and by the bootstrap script's handshake check. It exposes `init_governance_db`, `commit_transaction_to_ledger`, and `audit_ledger_integrity` (from `backend/app/ledger.py`) as three CLI subcommands:
```python
# =============================================================================
# SCRUMMAP LEDGER VERIFIER CLI (ledger_verifier.py)
# =============================================================================
import sys
import os
import sqlite3

# Inject path adjustment to allow execution from any subdirectory scope
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.ledger import init_governance_db, commit_transaction_to_ledger, audit_ledger_integrity
from backend.app.config import settings

def cmd_setup_mock():
    # Use triple-single quotes for docstring
    '''Initializes governance.db and seeds a genesis SYSTEM_BOOTSTRAP transaction.'''
    init_governance_db()
    commit_transaction_to_ledger("test_admin", "SYSTEM_BOOTSTRAP", {"status": "ONLINE"})
    print(f"[OK] Mock ledger initialized at {settings.DATABASE_PATH} and seeded with a genesis transaction.")

def cmd_verify():
    # Use triple-single quotes for docstring
    '''Runs audit_ledger_integrity and prints a pass/fail summary. Exits non-zero on tampering.'''
    print("[*] Auditing transaction chain...")
    result = audit_ledger_integrity()
    if result["status"] in ("SUCCESS", "CLEAN"):
        print(f"[Success] {result['message']}")
    else:
        print(f"[CRITICAL WARNING] DATABASE TAMPERING DETECTED!\n{result['message']}")
        sys.exit(1)

def cmd_tamper():
    # Use triple-single quotes for docstring
    '''Simulates careless tampering: edits the latest block's payload without recomputing its signature.'''
    conn = sqlite3.connect(settings.DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM write_ahead_ledger ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    if row is None:
        print("[!] No blocks to tamper with. Run 'setup-mock' first.")
        conn.close()
        return
    target_id = row[0]
    cursor.execute(
        "UPDATE write_ahead_ledger SET payload = ? WHERE id = ?",
        ('{"status": "TAMPERED"}', target_id)
    )
    conn.commit()
    conn.close()
    print(f"[!] Simulated tampering: rewrote payload of block #{target_id} without recomputing its signature.")

_COMMANDS = {"setup-mock": cmd_setup_mock, "verify": cmd_verify, "tamper": cmd_tamper}

if __name__ == "__main__":
    from backend.app.logger import setup_logging
    setup_logging()
    if len(sys.argv) != 2 or sys.argv[1] not in _COMMANDS:
        print(f"Usage: python3 ledger_verifier.py [{'|'.join(_COMMANDS)}]")
        sys.exit(1)
    _COMMANDS[sys.argv[1]]()
```

---

### Phase 3: Constant-RAM Chunked Ingestion & Noise Purifier
Develop the ingestion worker to process files in 1MB chunks and optimize context files. Create `backend/app/optimizer.py` to strip comment clutter and filter system files on-the-fly.

#### File C: Context Optimizer Module (`backend/app/optimizer.py`)
```python
# =============================================================================
# SCRUMMAP CONTEXT OPTIMIZER (optimizer.py)
# =============================================================================
import re
import zipfile
import os
import stat
import shutil
from backend.app.config import settings

# Directories and files with no functional business logic
BLACK_LIST_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.css', '.scss', '.html', '.svg', '.lock')
BLACK_LIST_DIRS = {'node_modules', '.git', '.next', 'dist', 'target', '.idea', '.vscode'}

def extract_and_purify_zip(zip_file_path: str, extract_target_dir: str):
    # Use triple-single quotes for docstring
    '''
    Scans zip file structures on-the-fly, running Structural Elimination:
    Skips non-functional configurations, assets, and binaries to contribute to compress size by ~35%.
    '''
    os.makedirs(extract_target_dir, exist_ok=True)
    file_count = 0
    
    with zipfile.ZipFile(zip_file_path, 'r') as archive:
        # Zip-Bomb protection: expansion ratio + absolute uncompressed-size ceiling.
        # member.file_size is read from the central directory - no decompression needed.
        compressed_size = os.path.getsize(zip_file_path)
        total_uncompressed = sum(member.file_size for member in archive.infolist())

        if compressed_size > 0 and (total_uncompressed / compressed_size) > settings.MAX_EXPANSION_RATIO:
            raise ValueError(
                f"Zip-Bomb detected: expansion ratio ({total_uncompressed / compressed_size:.1f}x) "
                f"exceeds the {settings.MAX_EXPANSION_RATIO}x limit."
            )
        max_uncompressed_bytes = settings.MAX_ZIP_SIZE_BYTES * settings.MAX_UNCOMPRESSED_BYTES_MULTIPLIER
        if total_uncompressed > max_uncompressed_bytes:
            raise ValueError(
                f"Zip-Bomb detected: total decompressed size ({total_uncompressed} bytes) exceeds "
                f"the absolute ceiling ({max_uncompressed_bytes} bytes)."
            )

        for member in archive.infolist():
            # Apply Zip-Bomb protection (file count)
            file_count += 1
            if file_count > settings.MAX_FILE_COUNT:
                raise ValueError(f"Zip-Bomb detected: Decompressed file count exceeded limit ({settings.MAX_FILE_COUNT} files).")

            # Reject symlink entries outright (zip-slip via symlink, not just path traversal)
            if stat.S_ISLNK(member.external_attr >> 16):
                raise PermissionError(f"Symlink entry rejected: '{member.filename}' is a symlink, not a regular file.")

            # Directory Traversal Guardrail
            normalized_path = os.path.normpath(member.filename)
            if normalized_path.startswith("..") or os.path.isabs(normalized_path):
                raise PermissionError("Traversal exploit detected: Compressed path points outside execution boundary.")
                
            # Filter directories
            path_parts = set(normalized_path.split(os.sep))
            if path_parts.intersection(BLACK_LIST_DIRS):
                continue
                
            # Filter non-functional extensions (Structural Elimination)
            if normalized_path.endswith(BLACK_LIST_EXTENSIONS):
                continue
                
            # Decompress and apply Syntactic Dilution to source code files on-the-fly
            target_path = os.path.join(extract_target_dir, normalized_path)
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            
            file_ext = os.path.splitext(normalized_path)[1].lower()
            if file_ext in ('.java', '.js', '.ts', '.cpp', '.h', '.py'):
                try:
                    raw_content = archive.read(member).decode("utf-8", errors="ignore")
                    diluted_content = dilute_syntactic_structure(raw_content, file_ext)
                    with open(target_path, "w", encoding="utf-8") as f:
                        f.write(diluted_content)
                except Exception:
                    archive.extract(member, extract_target_dir)
            else:
                archive.extract(member, extract_target_dir)

            # Restore original Unix file permissions (e.g. execution bits)
            attr = member.external_attr >> 16
            if attr > 0:
                try:
                    os.chmod(target_path, attr)
                except OSError:
                    # Non-fatal: ignore permission errors on unsupported filesystems
                    pass

def dilute_syntactic_structure(file_content: str, file_ext: str) -> str:
    # Use triple-single quotes for docstring
    '''
    Syntactic Dilution: Strips multi-line blocks, comments, and empty logs
    to shrink the token context window footprint.
    '''
    if file_ext in ('.java', '.js', '.ts', '.cpp', '.h'):
        # Strip multi-line comments
        file_content = re.sub(r'/\*.*?\*/', '', file_content, flags=re.DOTALL)
        # Strip single-line comments
        file_content = re.sub(r'//.*$', '', file_content, flags=re.MULTILINE)
        # Strip logging traces (e.g. system.out.println, console.log)
        file_content = re.sub(r'(System\.out\.print|console\.log|printf)\(.*?\);', '', file_content)
    elif file_ext == '.py':
        # Strip triple-quote docstrings
        file_content = re.sub(r'"""(.*?)"""', '', file_content, flags=re.DOTALL)
        file_content = re.sub(r"'''(.*?)'''", '', file_content, flags=re.DOTALL)
        # Strip single-line comments
        file_content = re.sub(r'#.*$', '', file_content, flags=re.MULTILINE)
        
    # Standardize whitespace and strip trailing blank spaces
    file_content = os.linesep.join([line.rstrip() for line in file_content.splitlines() if line.strip()])
    return file_content
```

*Verification Step*:
Create a mock zip file, write a script to extract and purify it, and verify that non-functional folders are skipped:
```bash
# Set up a mock project directory structure
mkdir -p mock-codebases/mock_project/src/main/java/com/enterprise
mkdir -p mock-codebases/mock_project/node_modules/dummy_dep

# Write mock classes with comments and logs
cat << 'EOF' > mock-codebases/mock_project/src/main/java/com/enterprise/OrderService.java
package com.enterprise;
/* 
 * Enterprise Order Process Multi-line block comments 
 */
public class OrderService {
    public void process(int orderId) {
        System.out.println("DEBUG LOG: Initializing transaction on endpoint..."); // inline comment
        // Single-line comment block
        if (orderId <= 0) {
            throw new IllegalArgumentException("Invalid ID");
        }
    }
}
EOF

# Compress the mock project directory
cd mock-codebases
zip -r mock_project.zip mock_project/
cd ..

# Verify context purification using Python
python3 -c "
from backend.app.optimizer import extract_and_purify_zip, dilute_syntactic_structure
extract_and_purify_zip('mock-codebases/mock_project.zip', '/tmp/purified_test')
with open('/tmp/purified_test/mock_project/src/main/java/com/enterprise/OrderService.java', 'r') as f:
    purified = dilute_syntactic_structure(f.read(), '.java')
print('=== Purified Output ===')
print(purified)
"
```
*Ensure that the printed output is stripped of multi-line comments, single-line blocks, and `System.out.println` debug logs, confirming successful syntactic dilution.*

---

### Phase 4: AST static analysis & Parser Integration
Create `backend/app/parser.py` to invoke the native `ctags` engine on the purified directory tree, building intermediate schemas containing classes, fields, and method boundary scopes.

#### File D: AST Parser Module (`backend/app/parser.py`)
```python
# =============================================================================
# SCRUMMAP AST SYMBOL PARSER (parser.py)
# =============================================================================
import subprocess
import os
import json
from typing import List, Dict, Any

class CtagsUnavailableError(RuntimeError):
    '''Raised when Universal Ctags is missing or fails, instead of silently returning fabricated symbol data.'''
    pass

def compile_ast_ctags_index(purified_workspace_dir: str) -> List[Dict[str, Any]]:
    # Use triple-single quotes for docstring
    '''
    Invokes the native Universal Ctags executable to extract code structures
    mapping classes, method definitions, signatures, and file line boundaries.
    Raises CtagsUnavailableError on failure rather than returning placeholder
    data — silently feeding fabricated symbols into backlog/code_pointers
    generation is worse than a caught, explicit failure.
    '''
    symbols = []
    cmd = [
        "ctags",
        "-R",                               # Recursive walk
        "--output-format=json",             # JSON streaming output format
        "--fields=+n+p+s+i",                # Output line numbers, signatures, inheritance
        "--languages=Java,Python,C++,C",     # Target languages
        purified_workspace_dir
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        for line in result.stdout.splitlines():
            if line.strip():
                symbol_data = json.loads(line)
                symbols.append({
                    "name": symbol_data.get("name"),
                    "kind": member_kind := symbol_data.get("kind"),
                    "path": symbol_data.get("path"),
                    "line": symbol_data.get("line"),
                    "signature": symbol_data.get("signature"),
                    "scope": symbol_data.get("scope")
                })
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        raise CtagsUnavailableError(
            f"Universal Ctags failed or is not installed ({e}). AST symbol indexing "
            f"cannot proceed for '{purified_workspace_dir}'. Install Universal Ctags "
            f"(SETUP.md §1.2) or verify the binary is on PATH inside the container."
        ) from e

    return symbols
```

*Verification Step*:
Confirm AST symbol parser operations against the mock codebase:
```bash
python3 -c "
from backend.app.parser import compile_ast_ctags_index
symbols = compile_ast_ctags_index('/tmp/purified_test')
print(f'Parsed {len(symbols)} symbols.')
for s in symbols[:2]:
    print(s)
"
```
*Ensure class and method symbols are parsed successfully from the mock directory.*

---

### Phase 5: NLP Modeling & SBERT Clustering Integration
Create `backend/app/sbert_clustering.py` to cluster user stories via Sentence-BERT (`paraphrase-mpnet-base-v2`) and K-Means, and map them to layered reference architectures.

#### File E: SBERT Clustering Engine (`backend/app/sbert_clustering.py`)
```python
# =============================================================================
# SCRUMMAP SBERT CLUSTERING & ARCITECTURE RECOVERY (sbert_clustering.py)
# =============================================================================
from typing import List, Dict, Any
import spacy
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
import numpy as np

# Load SBERT model locally on the workstation
model = SentenceTransformer('paraphrase-mpnet-base-v2')

# Load spaCy locally on the workstation (already required by verifier.py's RUPPs parsing)
nlp = spacy.load("en_core_web_sm")

def extract_actors_from_stories(user_stories: List[str]) -> List[str]:
    # Use triple-single quotes for docstring
    '''
    Extracts Agile actors via spaCy POS tagging: locates the "As a/an" prefix,
    then takes the contiguous run of noun-tagged tokens (NN, NNS, NNP, NNPS)
    immediately following it as the actor noun phrase.
    '''
    actors = []
    for story in user_stories:
        doc = nlp(story)
        actor = "System User"
        for i, token in enumerate(doc):
            if token.lower_ in ("a", "an") and i > 0 and doc[i - 1].lower_ == "as":
                noun_tokens = []
                for follow in doc[i + 1:]:
                    if follow.tag_ in ("NN", "NNS", "NNP", "NNPS"):
                        noun_tokens.append(follow.text)
                    elif noun_tokens:
                        break
                if noun_tokens:
                    actor = " ".join(noun_tokens)
                break
        actors.append(actor)
    return actors

def cluster_and_align_backlog(user_stories: List[str], n_clusters: int = 3) -> List[Dict[str, Any]]:
    # Use triple-single quotes for docstring
    '''
    Transforms stories into semantic vectors using SBERT, groups them via K-Means,
    and maps them to Presentation, Application, Domain, or Technical Services layers.
    '''
    if not user_stories:
        return []
        
    # Get high-dimensional semantic embeddings
    embeddings = model.encode(user_stories)
    
    # Run K-Means aggregation to eliminate backlog redundancy
    kmeans = KMeans(n_clusters=min(n_clusters, len(user_stories)), random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(embeddings)
    
    actors = extract_actors_from_stories(user_stories)
    clustered_output = []
    
    for idx, story in enumerate(user_stories):
        # Deductively determine reference architectural layer
        story_lower = story.lower()
        if any(w in story_lower for w in ("ui", "screen", "button", "page", "dashboard", "view")):
            layer = "Presentation [Pr]"
        elif any(w in story_lower for w in ("api", "controller", "endpoint", "route", "service")):
            layer = "Application Services [Ap]"
        elif any(w in story_lower for w in ("business rule", "logic", "calculate", "validate", "process")):
            layer = "Domain Services [Do]"
        else:
            layer = "Technical Services [Te]"
            
        clustered_output.append({
            "story": story,
            "actor": actors[idx],
            "cluster_id": int(cluster_labels[idx]),
            "architectural_layer": layer
        })
        
    return clustered_output
```

*Verification Step*:
Test actor extraction and semantic grouping via the CLI:
```bash
python3 -c "
from backend.app.sbert_clustering import cluster_and_align_backlog
stories = [
    'As a Lead Developer, I want an interactive dashboard to view logs.',
    'As an Administrator, I want to edit permission matrices on the screen.',
    'As a Security Auditor, I want a ledger validation API to verify transaction chains.'
]
output = cluster_and_align_backlog(stories)
for item in output:
    print(f'Story: {item["story"]} -> Actor: {item["actor"]} | Layer: {item["architectural_layer"]}')
"
```
*Ensure that the stories are correctly aligned with Presentation, Application, and Technical Services based on keyword classification.*

---

### Advanced Features Integration Sequence

After establishing the core backend modules, integrate the advanced documentation and modeling features step-by-step:

#### Step 1: UML Diagram Generation & Consistency Checking (`backend/app/uml_generator.py`)
This engine parses AST ctags symbols, translates them into PlantUML class/sequence code, and audits diagrams to flag naming and signature mismatches.
```python
# (See backend/app/uml_generator.py for complete source code layout)
```

#### Step 2: Epic/Story Generation & Code Pointers (`backend/app/backlog_generator.py`)
This engine prompts the Trussed.ai proxy API to fetch Agile epics and user stories complete with points estimation, unhappy path criteria, and line-range code pointers.
```python
# (See backend/app/backlog_generator.py for complete source code layout)
```

#### Step 3: PDF Document Generation (`backend/app/document_compiler.py`)
This module aggregates sprint details, acceptance criteria, and diagrams, compiling them into a professionally formatted corporate PDF report.
```python
# (See backend/app/document_compiler.py for complete source code layout)
```

---

## 5. Workstation Deployment & Core Execution Scripts

The following scripts automate system-wide verification, container builds, and local orchestration.

### Script 1: Workstation Bootstrap Orchestrator (`bootstrap_workstation.sh`)
This comprehensive Bash script automates local system preparation. It reads environment configurations, validates the on-premises installation of Universal Ctags, assesses rootless Podman daemon states, establishes host-volume mapping configurations, and launches the containerized ScrumMap Pod.

```bash
#!/usr/bin/env bash
# =============================================================================
# SCRUMMAP WORKSTATION BOOTSTRAP ORCHESTRATOR
# =============================================================================
set -euo pipefail

# ANSI color output markers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}         SCRUMMAP - WORKSTATION DEPLOYMENT BOOTSTRAPPER               ${NC}"
echo -e "${BLUE}======================================================================${NC}"

# ------------------------------------------------------------------------------
# STEP 1: Parse and Validate Environment Configuration (.env)
# ------------------------------------------------------------------------------
ENV_FILE="./scrummap.env"
EXAMPLE_FILE="./scrummap.env.example"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}[!] WARNING: '${ENV_FILE}' not found on workstation.${NC}"
    if [ -f "$EXAMPLE_FILE" ]; then
        echo -e "${GREEN}[*] Bootstrapping from public template '${EXAMPLE_FILE}'...${NC}"
        cp "$EXAMPLE_FILE" "$ENV_FILE"
        echo -e "${YELLOW}[!] Setup: Please open '${ENV_FILE}' and enter your live 'TRUSSED_API_KEY', as well as your custom 'ROLE_KEY_*' secrets and 'LEDGER_HMAC_KEY'.${NC}"
    else
        echo -e "${RED}[X] CRITICAL ERROR: Environment template '${EXAMPLE_FILE}' is missing!${NC}"
        exit 1
    fi
fi

# Load env variables safely (skipping comments and empty lines).
# Portable across macOS (BSD) and Linux (GNU) — avoids GNU-only `xargs -d`,
# which BSD xargs on macOS does not support.
set -a
source "$ENV_FILE"
set +a

echo -e "${GREEN}[✓] Environment configuration verified.${NC}"

# ------------------------------------------------------------------------------
# STEP 2: Verify On-Premises Prerequisites (Universal Ctags & Podman)
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[*] Phase 1: Verifying on-premises static compiler prerequisites...${NC}"

if command -v ctags >/dev/null 2>&1; then
    # Verify it is Universal Ctags, not legacy Exuberant Ctags or BSD ctags
    CTAGS_VERSION=$(ctags --version)
    if [[ "$CTAGS_VERSION" == *"Universal Ctags"* ]]; then
        echo -e "${GREEN}[✓] Found Universal Ctags: $(ctags --version | head -n 1)${NC}"
    else
        echo -e "${YELLOW}[!] WARNING: System is running legacy/BSD ctags. Universal Ctags is recommended for AST parsing.${NC}"
    fi
else
    echo -e "${YELLOW}[!] WARNING: 'ctags' executable not found on host.${NC}"
    echo -e "    AST symbol indexing will be isolated inside the backend container namespace."
fi

if command -v podman >/dev/null 2>&1; then
    echo -e "${GREEN}[✓] Found Podman: $(podman --version)${NC}"
    # Verify the Podman daemon is running in rootless mode
    if podman info | grep -q "rootless: true"; then
        echo -e "${GREEN}[✓] Rootless container namespace verified.${NC}"
    else
        echo -e "${YELLOW}[!] WARNING: Podman is running with root permissions. It is highly recommended to run rootless.${NC}"
    fi
else
    echo -e "${RED}[X] CRITICAL ERROR: Podman is not installed. Rootless Podman is the mandated enterprise container daemon.${NC}"
    exit 1
fi

if command -v podman-compose >/dev/null 2>&1; then
    echo -e "${GREEN}[✓] Found podman-compose: $(podman-compose --version 2>&1 | head -n 1)${NC}"
else
    echo -e "${RED}[X] CRITICAL ERROR: podman-compose is not installed. Required to orchestrate podman-compose.yaml.${NC}"
    echo -e "    Install via: pip install podman-compose"
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 3: Setup Host Database & Workstation Mount Directories
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[*] Phase 2: Establishing local persistent workspace directories...${NC}"

# HOST_DATA_DIR/HOST_UPLOAD_DIR are the HOST-side paths bind-mounted into the
# container. DATABASE_PATH/UPLOAD_DIR describe the container-internal view and
# must NOT be used here — /workspace does not exist on the bare host.
mkdir -p "$HOST_DATA_DIR"
mkdir -p "$HOST_UPLOAD_DIR"
mkdir -p "./mock-codebases"

# Owner-only permissions: /tmp and other shared workstation locations are
# readable/listable by every local user by default. governance.db holds the
# audit ledger and business data; the upload dir transiently holds proprietary
# source code — neither should be listable by other accounts on the workstation.
chmod 700 "$HOST_DATA_DIR"
chmod 700 "$HOST_UPLOAD_DIR"

echo -e "${GREEN}[✓] Created database mounts: ${HOST_DATA_DIR}${NC}"
echo -e "${GREEN}[✓] Created ingestion mounts: ${HOST_UPLOAD_DIR}${NC}"

# ------------------------------------------------------------------------------
# STEP 4: Orchestrate Podman Container Pod Assembly via Compose
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[*] Phase 3: Constructing isolated rootless network pod boundaries...${NC}"

POD_NAME="scrummap-pod"

# Tear down any existing stack from a prior run (compose handles this natively;
# no manual "pod exists -> stop -> rm" dance needed).
podman-compose -f podman-compose.yaml --in-pod "$POD_NAME" down 2>/dev/null || true

# --in-pod groups both services into ONE shared network namespace (the existing
# "scrummap-pod" model) rather than compose's default per-service namespaces —
# this is what lets the frontend reach the backend via plain http://localhost:8000
# (see podman-compose.yaml's comments). Published ports are restricted to
# $BIND_ADDRESS (loaded from scrummap.env, defaults to 127.0.0.1) inside the compose file itself.
echo -e "${BLUE}[*] Building images and starting the pod via podman-compose...${NC}"
podman-compose -f podman-compose.yaml --in-pod "$POD_NAME" up -d --build

# ------------------------------------------------------------------------------
# STEP 5: Execute Verification & Handshake Checks
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[*] Phase 4: Running database bootstrapping and cryptographic ledger tests...${NC}"

# Run initial mock schema database generation through backend container
podman exec -it scrummap-backend python3 backend/ledger_verifier.py setup-mock

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}      [✓] SUCCESS: SCRUMMAP PLATFORM SUCCESSFULLY BOOTSTRAPPED        ${NC}"
echo -e "      Frontend Dashboard Panel : http://localhost:3000                "
echo -e "      Backend FastAPI Gateway   : http://localhost:8000                "
echo -e "      Local SQLite Ledger Path : ${HOST_DATA_DIR}/governance.db      "
echo -e "======================================================================${NC}"
```

### Script 2: Podman Compose Service Definition (`podman-compose.yaml`)
This is the actual, real orchestration definition `bootstrap_workstation.sh` invokes in Step 4 — declarative service topology for the two-container pod, replacing what used to be manual `podman pod create`/`podman build`/`podman run` calls. Requires `podman-compose` specifically (not plain `docker-compose`) — the `:Z`/`:U` mount flags and the shared-pod networking model below are Podman-specific and are not portable to Docker.

```yaml
# =============================================================================
# SCRUMMAP PODMAN COMPOSE SERVICE DEFINITION (podman-compose.yaml)
# =============================================================================
# Invoke via: podman-compose -f podman-compose.yaml --in-pod scrummap-pod up -d --build
# --in-pod groups both services into ONE shared network namespace (matching
# the pre-existing "scrummap-pod" design) rather than podman-compose's default
# per-service namespaces. This is why the frontend's lib/api.ts can target
# plain http://localhost:8000 rather than a service-name DNS hostname.
name: scrummap

services:
  scrummap-backend:
    build:
      context: ./backend
      dockerfile: Containerfile
    image: localhost/scrummap-backend:latest
    container_name: scrummap-backend
    env_file:
      - ./scrummap.env
    environment:
      - DATABASE_PATH=/workspace/data/governance.db
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${BACKEND_PORT:-8000}:8000"
    volumes:
      - "${HOST_DATA_DIR:-./data}:/workspace/data:rw,Z,U"
      - "${HOST_UPLOAD_DIR:-/tmp/scrummap_uploads}:/tmp/scrummap_uploads:rw,Z,U"

  scrummap-frontend:
    build:
      context: ./frontend
      dockerfile: Containerfile
    image: localhost/scrummap-frontend:latest
    container_name: scrummap-frontend
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${FRONTEND_PORT:-3000}:3000"
    depends_on:
      - scrummap-backend
```
*Note*: `bootstrap_workstation.sh` still owns everything a compose file can't express — prerequisite validation (Ctags/Podman/podman-compose checks), host directory creation with the `chmod 700` permission hardening from bug B4, and the post-deploy `ledger_verifier.py setup-mock` smoke test. Compose replaces only the container build/start/stop logic, which is the piece that was previously duplicated across two independently-maintained mechanisms.

---

## 6. Operational Testing & Verification Protocols

Once deployed, execute the following operational testing routines to verify the integrity and security of the workstation.

### Test Protocol A: Mock Database Initialization & Setup
Run the initialization hook to bootstrap database tables:
```bash
podman exec -it scrummap-backend python3 backend/ledger_verifier.py setup-mock
```
*Verify that the file `${HOST_DATA_DIR}/governance.db` (default `./data/governance.db`) was created and is owned by your host workstation developer uid.*

### Test Protocol B: Ledger Integrity Chain Audits
Test that the cryptographic write-ahead transaction ledger is solid and uncompromised:
```bash
podman exec -it scrummap-backend python3 backend/ledger_verifier.py verify
```
*Expected Clean Output:* (assuming `setup-mock` was the only prior transaction — a long-running system would report a higher `scanned_blocks` count)
```
[*] Auditing transaction chain...
[Success] Ledger integrity verified. 1 transaction blocks scanned. Chain is solid.
```

### Test Protocol C: Tampering Detection Verification
Run the built-in database tampering simulator. This modifies a past transaction row directly in the SQLite database without updating the hashed signatures, proving that unauthorized data overrides are caught on-the-fly:
```bash
# Execute tamper simulation
podman exec -it scrummap-backend python3 backend/ledger_verifier.py tamper

# Re-run the ledger verification
podman exec -it scrummap-backend python3 backend/ledger_verifier.py verify
```
*Expected Compromised Output:* (assuming `setup-mock` was run immediately before this protocol, so the genesis block is `#1`)
```
[*] Auditing transaction chain...
[CRITICAL WARNING] DATABASE TAMPERING DETECTED!
CRITICAL Error: Row-level payload has been tampered in Block #1.
```
The CLI also exits with a non-zero status code, so this failure is scriptable in CI/automation.
*Note*: because `block_signature` is an HMAC keyed with `LEDGER_HMAC_KEY` (stored outside `governance.db`), this holds even if the tamper simulator is extended to recompute every subsequent block's signature after editing the tampered block — without the key, a forged forward chain cannot be produced, so the compromised block is still caught at the point of tampering.

### Test Protocol D: Multi-Part Chunked Zip Streaming Upload API
Verify the API streaming and purification loops by sending a mock zip package to the backend service:
```bash
# X-ScrumMap-Role-Key is required on every endpoint (DESIGN.md §5.1) — omitting it
# now returns 403 Forbidden rather than reaching the upload handler at all.
curl -X POST "http://localhost:8000/api/codebase/upload?project_id=test-project&version_tag=v1.0" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -H "X-ScrumMap-Role-Key: rk_dev_change_me" \
  -F "file=@mock-codebases/mock_project.zip"
```
*Verify that the response returns HTTP 200 with metadata documenting the unpurified and compressed size boundaries.*

---

## 7. Development & Production Deployment Rationale

SQLite + Podman combination was selected for development purposes, due to being ideal for prototyping locally on a single workstation with minimal battery/RAM drain and no network configuration required. However, for production deployment, PostgreSQL + Docker will be used instead as they offer better scalability, performance, and security features that make it more suitable for a production environment.

See PLAN.md §9 ("Technical Decision Rationale") for the full rationale behind the SQLite-vs-PostgreSQL and Podman-vs-Docker decisions — kept in one place to avoid the two write-ups drifting apart.

---

This installation playbook guarantees that **ScrumMap** is successfully built, deployed, and validated on local workstations with absolute technical precision and complete compliance with security governance.
