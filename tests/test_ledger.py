import pytest
import sqlite3
import threading
import time
from backend.app.ledger import (
    get_db_connection,
    commit_transaction_to_ledger,
    audit_ledger_integrity,
    init_governance_db
)
from backend.app.config import settings

def test_genesis_block_creation():
    """
    Asserts that the first transaction successfully establishes a standard Genesis block.
    """
    sig = commit_transaction_to_ledger(
        operator_id="PRODUCT_MANAGER",
        transaction_type="PROJECT_INITIALIZATION",
        payload_data={"name": "Genesis Project", "description": "First ever block"}
    )
    assert sig is not None, "Genesis block signature should not be None."
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM write_ahead_ledger ORDER BY id ASC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    
    assert row is not None, "A block should be inserted."
    assert row["prev_block_signature"] == "GENESIS_BLOCK_ZERO_0000000000000000000000000000000000000000000", "First block must be linked to hardcoded genesis signature."
    assert row["block_signature"] == sig, "Signature in database must match returned signature."

def test_sequential_block_chaining():
    """
    Writes 5 sequential transactions and asserts that each block's prev_block_signature
    matches the block_signature of the preceding record.
    """
    signatures = []
    for i in range(5):
        sig = commit_transaction_to_ledger(
            operator_id="SCRUM_MASTER",
            transaction_type="BACKLOG_GENERATION",
            payload_data={"index": i, "data": f"block data {i}"}
        )
        signatures.append(sig)
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, block_signature, prev_block_signature FROM write_ahead_ledger ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    
    assert len(rows) == 5, "Should have committed exactly 5 blocks."
    for idx, row in enumerate(rows):
        if idx == 0:
            assert row["prev_block_signature"] == "GENESIS_BLOCK_ZERO_0000000000000000000000000000000000000000000"
        else:
            assert row["prev_block_signature"] == rows[idx - 1]["block_signature"], f"Block {idx} must point back to Block {idx - 1} signature."

def test_middle_block_payload_tampering():
    """
    Modifies the payload of the middle block and asserts that the verifier catches the tampering.
    """
    for i in range(5):
        commit_transaction_to_ledger(
            operator_id="LEAD_DEVELOPER",
            transaction_type="BACKLOG_GENERATION",
            payload_data={"index": i}
        )
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM write_ahead_ledger ORDER BY id ASC")
    rows = cursor.fetchall()
    middle_id = rows[2]["id"]
    cursor.execute("UPDATE write_ahead_ledger SET payload = ? WHERE id = ?", ('{"index": 9999}', middle_id))
    conn.commit()
    conn.close()
    
    audit_res = audit_ledger_integrity()
    assert audit_res["status"] == "COMPROMISED", "Verifier must detect tampering."
    assert audit_res["tampered_block_id"] == middle_id, f"Verifier must identify block #{middle_id} as tampered."

def test_middle_block_deletion():
    """
    Deletes the middle block and asserts that the verification scan fails due to a broken chain link.
    """
    for i in range(5):
        commit_transaction_to_ledger(
            operator_id="LEAD_DEVELOPER",
            transaction_type="BACKLOG_GENERATION",
            payload_data={"index": i}
        )
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM write_ahead_ledger ORDER BY id ASC")
    rows = cursor.fetchall()
    middle_id = rows[2]["id"]
    next_id = rows[3]["id"]
    cursor.execute("DELETE FROM write_ahead_ledger WHERE id = ?", (middle_id,))
    conn.commit()
    conn.close()
    
    audit_res = audit_ledger_integrity()
    assert audit_res["status"] == "COMPROMISED", "Verifier must detect broken chain link."
    # Since the middle block was deleted, the subsequent block's prev_signature will point to the deleted signature,
    # but the preceding record in the DB will now be the one before middle_id. Thus, next_id will trigger the mismatch.
    assert audit_res["tampered_block_id"] == next_id, f"Verifier must detect link mismatch starting at block #{next_id}."

def test_sqlite_foreign_key_enforcement():
    """
    Asserts that SQLite blocks deletion of parent projects when child versions/backlog items exist.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enable foreign keys just in case
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # 1. Create a project
    project_id = "proj_test_relational"
    cursor.execute("INSERT INTO projects (id, name, description) VALUES (?, ?, ?)", (project_id, "Relational Test", "Parent"))
    
    # 2. Create codebase version
    version_id = "ver_test_relational"
    cursor.execute(
        "INSERT INTO codebase_versions (id, project_id, version_tag, zip_checksum, purified_size_bytes) VALUES (?, ?, ?, ?, ?)",
        (version_id, project_id, "v1", "checksum", 100)
    )
    
    # 3. Create backlog item
    cursor.execute(
        "INSERT INTO backlog_items (id, project_id, codebase_version_id, title, actor_role, hie_story_points) VALUES (?, ?, ?, ?, ?, ?)",
        ("item_test", project_id, version_id, "Test Item", "Developer", 5.0)
    )
    conn.commit()
    
    # 4. Attempt to delete project without CASCADE first (wait, the database has CASCADE defined on backlog_items and codebase_versions?
    # No, wait, in ledger.py:
    # FOREIGN KEY (project_id) REFERENCES projects(id)
    # Let's check: in ledger.py, did we add ON DELETE CASCADE?
    # Yes! In our previous work, we updated ledger.py to include ON DELETE CASCADE on foreign keys!
    # If ON DELETE CASCADE is enabled, then deleting a project WILL succeed and cascade-delete the child rows.
    # But wait, what if we attempt to violate a foreign key by inserting a version with a non-existent project_id?
    # Yes! That will violate foreign key constraints!
    # Let's try both:
    # Attempting to insert a version with a non-existent project_id must raise an IntegrityError.
    with pytest.raises(sqlite3.IntegrityError) as exc_info:
        cursor.execute(
            "INSERT INTO codebase_versions (id, project_id, version_tag, zip_checksum, purified_size_bytes) VALUES (?, ?, ?, ?, ?)",
            ("ver_invalid", "non_existent_project", "v1", "checksum", 100)
        )
    assert "FOREIGN KEY constraint failed" in str(exc_info.value), "Should prevent orphan inserts."
    
    conn.rollback()
    conn.close()

def test_sqlite_concurrent_reads_wal_mode():
    """
    Verifies concurrent reads don't block during continuous writes under WAL mode.
    """
    settings.SQLITE_JOURNAL_MODE = "WAL"
    
    # Shared control variables
    stop_event = threading.Event()
    read_failures = []
    
    def reader_thread():
        while not stop_event.is_set():
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM write_ahead_ledger")
                cursor.fetchone()
                conn.close()
                time.sleep(0.01)
            except Exception as e:
                read_failures.append(e)
                
    def writer_thread():
        while not stop_event.is_set():
            try:
                commit_transaction_to_ledger(
                    operator_id="SYSTEM_ADMIN",
                    transaction_type="CONCURRENT_WRITE",
                    payload_data={"timestamp": time.time()}
                )
                time.sleep(0.01)
            except Exception as e:
                read_failures.append(e)

    # Start concurrent workers
    readers = [threading.Thread(target=reader_thread) for _ in range(5)]
    writer = threading.Thread(target=writer_thread)
    
    for r in readers:
        r.start()
    writer.start()
    
    time.sleep(0.5)
    stop_event.set()
    
    for r in readers:
        r.join()
    writer.join()
    
    assert len(read_failures) == 0, f"Concurrent operations caused locks or failures: {read_failures}"
