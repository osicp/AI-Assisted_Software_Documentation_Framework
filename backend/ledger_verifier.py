# =============================================================================
# SCRUMMAP LEDGER VERIFIER CLI (ledger_verifier.py)
# =============================================================================
import sys
import os
import sqlite3
import logging

# Inject path adjustment to allow execution from any subdirectory scope
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.ledger import init_governance_db, commit_transaction_to_ledger, audit_ledger_integrity
from backend.app.config import settings

logger = logging.getLogger("ledger_verifier")

def cmd_setup_mock():
    # Use triple-single quotes for docstring
    '''Initializes governance.db and seeds a genesis SYSTEM_BOOTSTRAP transaction.'''
    init_governance_db()
    commit_transaction_to_ledger("test_admin", "SYSTEM_BOOTSTRAP", {"status": "ONLINE"})
    logger.info(f"[OK] Mock ledger initialized at {settings.DATABASE_PATH} and seeded with a genesis transaction.")

def cmd_verify():
    # Use triple-single quotes for docstring
    '''Runs audit_ledger_integrity and prints a pass/fail summary. Exits non-zero on tampering.'''
    logger.info("[*] Auditing transaction chain...")
    result = audit_ledger_integrity()
    if result["status"] in ("SUCCESS", "CLEAN"):
        logger.info(f"[Success] {result['message']}")
    else:
        logger.error(f"[CRITICAL WARNING] DATABASE TAMPERING DETECTED!\n{result['message']}")
        sys.exit(1)

def cmd_tamper():
    # Use triple-single quotes for docstring
    '''Simulates careless tampering: edits the latest block's payload without recomputing its signature.'''
    conn = sqlite3.connect(settings.DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM write_ahead_ledger ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    if row is None:
        logger.warning("[!] No blocks to tamper with. Run 'setup-mock' first.")
        conn.close()
        return
    target_id = row[0]
    cursor.execute(
        "UPDATE write_ahead_ledger SET payload = ? WHERE id = ?",
        ('{"status": "TAMPERED"}', target_id)
    )
    conn.commit()
    conn.close()
    logger.warning(f"[!] Simulated tampering: rewrote payload of block #{target_id} without recomputing its signature.")

_COMMANDS = {"setup-mock": cmd_setup_mock, "verify": cmd_verify, "tamper": cmd_tamper}

if __name__ == "__main__":
    from backend.app.logger import setup_logging
    setup_logging()
    if len(sys.argv) != 2 or sys.argv[1] not in _COMMANDS:
        print(f"Usage: python3 ledger_verifier.py [{'|'.join(_COMMANDS)}]")
        sys.exit(1)
    _COMMANDS[sys.argv[1]]()
