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
