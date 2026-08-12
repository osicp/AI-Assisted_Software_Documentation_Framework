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
