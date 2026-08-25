# =============================================================================
# SCRUMMAP FASTAPI SERVER ENTRYPOINT (main.py)
# =============================================================================
import os
import json
import time
import uuid
import hashlib
import shutil
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Depends, UploadFile, File, Form, Query, HTTPException, status, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from backend.app.config import settings
from backend.app.auth import resolve_operator_role, check_role
from backend.app.logger import setup_logging
from backend.app.ledger import get_db_connection, commit_transaction_to_ledger, audit_ledger_integrity, init_governance_db
from backend.app.optimizer import extract_and_purify_zip
from backend.app.parser import compile_ast_ctags_index
from backend.app.sbert_clustering import cluster_and_align_backlog
from backend.app.uml_generator import plantuml_encode, verify_diagram_consistency
from backend.app.backlog_generator import generate_backlog_items, LLMGatewayError, check_requirements_ambiguity
from backend.app.document_compiler import compile_pdf_report

# Initialize logging framework
setup_logging()

app = FastAPI(
    title="ScrumMap Headless Governance API Gateway",
    description="Immutably logs developer interactions and clusters requirements.",
    version="1.0.0"
)

# Apply CORS middleware to bind to the local React dashboard Port
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://localhost:{settings.FRONTEND_PORT}", f"http://127.0.0.1:{settings.FRONTEND_PORT}"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure database tables are created on startup
@app.on_event("startup")
def startup_db_init():
    init_governance_db()

# Schema definitions
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ClusterRequest(BaseModel):
    user_stories: List[str]
    n_clusters: int = 3

class UMLRenderRequest(BaseModel):
    plantuml_code: str

class UMLVerifyRequest(BaseModel):
    class_diagram: str
    sequence_diagram: str

class BacklogGenerateRequest(BaseModel):
    project_id: str
    sprint_goal: str
    ast_symbols: List[Dict[str, Any]]
    refined_requirements: Optional[str] = None
    answers: Optional[Dict[str, str]] = None

class PDFCompileRequest(BaseModel):
    project_name: str
    project_description: Optional[str] = None
    user_stories: List[Dict[str, Any]]
    class_diagram_url: Optional[str] = None
    sequence_diagram_url: Optional[str] = None
    project_id: Optional[str] = None
    include_timeline: Optional[bool] = False

class StubsDownloadRequest(BaseModel):
    ast_symbols: List[Dict[str, Any]]
    user_stories: List[Dict[str, Any]]

@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Registers a new project namespace inside the relational catalog,
    logging the PROJECT_INITIALIZATION interaction to the immutable ledger.
    '''
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO projects (id, name, description) VALUES (?, ?, ?)",
            (project_id, payload.name, payload.description)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Project registration failed (e.g. name conflict): {str(e)}"
        )
    finally:
        conn.close()

    # Commit action to write-ahead ledger
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="PROJECT_INITIALIZATION",
        payload_data={"project_id": project_id, "name": payload.name, "description": payload.description},
        project_id=project_id
    )

    return {
        "project_id": project_id,
        "status": "CREATED",
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    }

@app.get("/api/projects")
async def list_projects(
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SCRUM_MASTER", "LEAD_DEVELOPER", "SECURITY_AUDITOR", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Lists all registered projects in the relational catalog.
    '''
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, description FROM projects ORDER BY name ASC")
        rows = cursor.fetchall()
        projects = []
        for r in rows:
            projects.append({
                "id": r["id"],
                "name": r["name"],
                "description": r["description"] or ""
            })
        return projects
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query projects database: {str(e)}"
        )
    finally:
        conn.close()

@app.delete("/api/projects/{project_id}", status_code=status.HTTP_200_OK)
async def delete_project(
    project_id: str,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "LEAD_DEVELOPER", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Deletes a project and all associated child database records (versions, backlog items, ledger entries).
    '''
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Verify target project exists
        cursor.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project with ID '{project_id}' does not exist."
            )
        
        # 1. Fetch related codebase version IDs
        cursor.execute("SELECT id FROM codebase_versions WHERE project_id = ?", (project_id,))
        version_ids = [row["id"] for row in cursor.fetchall()]
        
        # 2. Recursively delete physical extraction folders on disk
        import shutil
        for v_id in version_ids:
            v_path = os.path.join(settings.UPLOAD_DIR, "extracted", v_id)
            if os.path.exists(v_path):
                shutil.rmtree(v_path, ignore_errors=True)
        
        # 3. Delete the parent project. All child rows in codebase_versions,
        # backlog_items, write_ahead_ledger, project_developers, and
        # backlog_item_assignments will delete automatically via database cascade deletes.
        cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Project deletion failed: {str(e)}"
        )
    finally:
        conn.close()

    return {"status": "DELETED", "project_id": project_id}

@app.post("/api/codebase/upload", status_code=status.HTTP_201_CREATED)
async def upload_codebase(
    project_id: str = Query(..., description="Target project identifier"),
    version_tag: str = Query(..., description="Target version identifier"),
    codebase_zip: UploadFile = File(..., description="Multipart zip package"),
    operator_id: str = Depends(check_role(["LEAD_DEVELOPER", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Streams and purifies raw codebase zip packages, enforcing zip-bomb protections,
    compiling AST symbols via Ctags, and committing the transaction to the write-ahead ledger.
    '''
    if not codebase_zip.filename.endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid archive format: Codebase uploads must be packaged in a '.zip' format."
        )

    # 1. Verify target project exists
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
    if cursor.fetchone() is None:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID '{project_id}' does not exist."
        )

    # 2. Stream uploaded file to local temp directory
    temp_zip_dir = os.path.join(settings.UPLOAD_DIR, "archives")
    os.makedirs(temp_zip_dir, exist_ok=True)
    temp_zip_path = os.path.join(temp_zip_dir, f"{uuid.uuid4().hex}.zip")
    
    sha256_hash = hashlib.sha256()
    raw_size = 0
    try:
        with open(temp_zip_path, "wb") as f:
            while chunk := await codebase_zip.read(1024 * 1024):  # 1MB chunks
                raw_size += len(chunk)
                if raw_size > settings.MAX_ZIP_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Compressed file size exceeds the maximum limit of {settings.MAX_ZIP_SIZE_BYTES} bytes."
                    )
                sha256_hash.update(chunk)
                f.write(chunk)
    except Exception as e:
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise e

    zip_checksum = sha256_hash.hexdigest()

    # 3. Decompress and run structural purification checks
    processing_start = time.perf_counter()
    extract_target_dir = os.path.join(settings.UPLOAD_DIR, "extracted", uuid.uuid4().hex)
    try:
        extract_and_purify_zip(temp_zip_path, extract_target_dir)
    except ValueError as bomb_err:
        shutil.rmtree(extract_target_dir, ignore_errors=True)
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security Violations (Zip-Bomb Protection): {str(bomb_err)}"
        )
    except PermissionError as path_err:
        shutil.rmtree(extract_target_dir, ignore_errors=True)
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security Violations (Traversal/Symlink Protection): {str(path_err)}"
        )

    # 4. Calculate purified codebase size and compile AST symbol maps
    purified_size = 0
    for root, _, files in os.walk(extract_target_dir):
        for f in files:
            purified_size += os.path.getsize(os.path.join(root, f))

    try:
        ast_symbols = compile_ast_ctags_index(extract_target_dir)
    except Exception as parser_err:
        shutil.rmtree(extract_target_dir, ignore_errors=True)
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AST Compilation Error: {str(parser_err)}"
        )
    processing_seconds = time.perf_counter() - processing_start

    # 5. Insert codebase version into SQL catalog and write-ahead ledger
    version_id = f"ver_{uuid.uuid4().hex[:12]}"
    try:
        cursor.execute(
            "INSERT INTO codebase_versions (id, project_id, version_tag, zip_checksum, purified_size_bytes) VALUES (?, ?, ?, ?, ?)",
            (version_id, project_id, version_tag, zip_checksum, purified_size)
        )
        conn.commit()
    except Exception as db_err:
        conn.rollback()
        shutil.rmtree(extract_target_dir, ignore_errors=True)
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction failure: {str(db_err)}"
        )
    finally:
        conn.close()

    # Commit action to write-ahead ledger
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="ZIP_CODEBASE_UPLOAD",
        payload_data={
            "version_id": version_id,
            "project_id": project_id,
            "version_tag": version_tag,
            "zip_checksum": zip_checksum,
            "raw_size_bytes": raw_size,
            "purified_size_bytes": purified_size,
            "symbols_count": len(ast_symbols),
            "processing_seconds": round(processing_seconds, 3),
            # Bounded snapshot of real parsed symbol names and file paths, used to measure
            # hallucination drift against symbols later claimed by LLM-generated backlog
            # code_pointers. file_paths lets the telemetry endpoint tell "claims to touch an
            # existing file's real symbol" apart from "proposes a brand-new file" — the latter
            # is expected sprint-planning output, not drift.
            "symbol_names": [s["name"] for s in ast_symbols if s.get("kind") != "relationship"][:2000],
            "file_paths": sorted({s["path"] for s in ast_symbols if s.get("path")})[:2000],
        },
        project_id=project_id
    )

    # 6. Apply Zero-Data Retention (ZDR) policy: delete physical files if configured
    if settings.ZDR_COMPLIANCE:
        shutil.rmtree(extract_target_dir, ignore_errors=True)
    
    # Always delete the transient raw uploaded ZIP file to avoid disk space leaks
    if os.path.exists(temp_zip_path):
        os.remove(temp_zip_path)

    # Compute compression reduction
    reduction = "0%"
    if raw_size > 0:
        reduction_val = ((raw_size - purified_size) / raw_size) * 100
        reduction = f"{max(0.0, reduction_val):.1f}%"

    return {
        "version_id": version_id,
        "zip_checksum": zip_checksum,
        "raw_size_bytes": raw_size,
        "purified_size_bytes": purified_size,
        "reduction_percentage": reduction,
        "status": "purified_and_cached",
        "ast_symbols": ast_symbols
    }

@app.post("/api/backlog/cluster")
async def cluster_backlog(
    payload: ClusterRequest,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SCRUM_MASTER", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Groups user stories using semantic SentenceTransformers and K-Means.
    '''
    try:
        clustered_data = cluster_and_align_backlog(payload.user_stories, payload.n_clusters)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clustering algorithm failure: {str(e)}"
        )

    # Commit action to write-ahead ledger
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="BACKLOG_CLUSTERING",
        payload_data={"stories_count": len(payload.user_stories), "clusters_requested": payload.n_clusters}
    )

    return {
        "clustered_stories": clustered_data
    }

@app.get("/api/ledger/verify")
async def verify_ledger(
    start_id: int = Query(1, description="Start auditing from this transaction ID"),
    chunk_size: Optional[int] = Query(None, description="Max number of transactions to scan in this batch"),
    expected_prev_sig: Optional[str] = Query(None, description="Trusted previous signature check value"),
    operator_id: str = Depends(check_role(["SECURITY_AUDITOR", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Scans the write-ahead ledger database table to verify signature chain integrity. Supports pagination.
    '''
    audit_res = audit_ledger_integrity(
        start_id=start_id,
        chunk_size=chunk_size,
        expected_prev_sig=expected_prev_sig
    )

    # Commit audit action to ledger
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="LEDGER_AUDIT",
        payload_data={
            "status": audit_res["status"],
            "scanned_blocks": audit_res.get("scanned_blocks", 0),
            "start_id": start_id,
            "chunk_size": chunk_size
        }
    )

    if audit_res["status"] == "ERROR":
        # A checkpoint/start_id the caller can't fulfill is a bad request, not a
        # tampering finding — reporting it as "TAMPERED" would be a false alarm.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=audit_res.get("message", "Ledger audit could not be completed for the given parameters.")
        )

    return {
        "ledger_integrity": "TAMPERED" if audit_res["status"] == "COMPROMISED" else "OK",
        "scanned_blocks": audit_res.get("scanned_blocks", 0),
        "compromised_blocks": [audit_res["tampered_block_id"]] if audit_res["status"] == "COMPROMISED" else [],
        "verification_timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "last_verified_id": audit_res.get("last_verified_id"),
        "last_block_signature": audit_res.get("last_block_signature")
    }


@app.get("/api/ledger/blocks")
async def get_ledger_blocks(
    operator_id: str = Depends(check_role(["SECURITY_AUDITOR", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Retrieves all transaction blocks from the write-ahead ledger database table.
    '''
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, project_id, timestamp, operator_id, transaction_type, payload, payload_hash, block_signature, prev_block_signature FROM write_ahead_ledger ORDER BY id DESC")
        rows = cursor.fetchall()
        blocks = []
        for r in rows:
            blocks.append({
                "id": r["id"],
                "project_id": r["project_id"],
                "timestamp": r["timestamp"],
                "operator_id": r["operator_id"],
                "transaction_type": r["transaction_type"],
                "payload": r["payload"],
                "payload_hash": r["payload_hash"],
                "block_signature": r["block_signature"],
                "prev_block_signature": r["prev_block_signature"]
            })
        return blocks
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query ledger database: {str(e)}"
        )
    finally:
        conn.close()

@app.post("/api/uml/render")
async def render_uml(
    payload: UMLRenderRequest,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "LEAD_DEVELOPER", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Encodes PlantUML text and returns the rendering server redirection URL.
    '''
    encoded_str = plantuml_encode(payload.plantuml_code)
    render_url = f"http://www.plantuml.com/plantuml/png/{encoded_str}"
    
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="UML_RENDERING",
        payload_data={"render_url": render_url}
    )
    
    return {
        "status": "SUCCESS",
        "render_url": render_url
    }

@app.post("/api/uml/verify")
async def verify_uml_diagrams(
    payload: UMLVerifyRequest,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "LEAD_DEVELOPER", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Audits sequence and class diagrams for method and class name consistency.
    '''
    verify_res = verify_diagram_consistency(payload.class_diagram, payload.sequence_diagram)
    
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="DIAGRAM_CONSISTENCY_AUDIT",
        payload_data={"status": verify_res["status"], "compromised_blocks_count": len(verify_res["compromised_blocks"])}
    )
    
    return verify_res

@app.post("/api/backlog/generate")
async def generate_backlog(
    payload: BacklogGenerateRequest,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Generates Epics and User Stories complete with acceptance criteria, unhappy paths,
    and codebase symbol line mappings using an LLM connector.
    '''
    try:
        # 1. Check for ambiguities if requirements are provided and no answers are resolved yet
        if payload.refined_requirements and not payload.answers:
            is_ambiguous, questions = check_requirements_ambiguity(
                sprint_goal=payload.sprint_goal,
                ast_symbols=payload.ast_symbols,
                refined_requirements=payload.refined_requirements
            )
            if is_ambiguous and questions:
                commit_transaction_to_ledger(
                    operator_id=operator_id,
                    transaction_type="BACKLOG_GENERATION",
                    payload_data={
                        "sprint_goal": payload.sprint_goal,
                        "status": "CLARIFICATION_NEEDED",
                        "questions_count": len(questions)
                    },
                    project_id=payload.project_id
                )
                return {
                    "status": "CLARIFICATION_NEEDED",
                    "questions": questions
                }

        # 2. If we have answers, format them and append to the requirements
        final_requirements = payload.refined_requirements or ""
        if payload.answers:
            final_requirements += "\n\nResolved Clarifications:\n"
            for q, a in payload.answers.items():
                final_requirements += f"Question: {q}\nAnswer: {a}\n"

        backlog_res = generate_backlog_items(
            sprint_goal=payload.sprint_goal,
            ast_symbols=payload.ast_symbols,
            refined_requirements=final_requirements
        )
        # Pop internal telemetry signals before the response goes back to the client
        run_telemetry = backlog_res.pop("_telemetry", {})

        # Save generated backlog user stories to the SQLite database
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            # 1. Fetch latest codebase version ID for the project
            cursor.execute(
                "SELECT id FROM codebase_versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
                (payload.project_id,)
            )
            version_row = cursor.fetchone()
            if version_row is None:
                raise ValueError(
                    f"No codebase version found for project '{payload.project_id}'. "
                    f"Upload a codebase via /api/codebase/upload before generating a backlog."
                )
            version_id = version_row[0]
            
            # 2. Clear old backlog items to prevent primary key conflicts or duplicate listings
            cursor.execute("DELETE FROM backlog_items WHERE project_id = ?", (payload.project_id,))
            
            # 3. Insert each story
            for epic in backlog_res.get("epics", []):
                epic_title = epic.get("title", "Core Epics")
                for story in epic.get("user_stories", []):
                    story["epic_title"] = epic_title
                    
                    # Map properties from LLM response schema
                    role = story.get("role") or story.get("actor_role") or "User"
                    action = story.get("action") or ""
                    benefit = story.get("benefit") or ""
                    
                    # Store action/benefit as JSON structure in snl_requirements to preserve them
                    snl_requirements = json.dumps({
                        "action": action,
                        "benefit": benefit
                    })
                    
                    desc_text = story.get("description") or f"As a {role}, I want to {action} so that {benefit}"
                    story_points = float(story.get("story_points") or story.get("hie_story_points") or 0.0)
                    ripple_effects = story.get("ripple_risks") or story.get("ripple_effects") or []
                    
                    cursor.execute(
                        """
                        INSERT INTO backlog_items (
                            id, project_id, codebase_version_id, title, description,
                            actor_role, snl_requirements, hie_story_points,
                            code_pointers, ripple_effects, unhappy_paths
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            f"{payload.project_id}_{story.get('id')}",
                            payload.project_id,
                            version_id,
                            story.get("title", ""),
                            f"[{epic_title}] {desc_text}",
                            role,
                            snl_requirements,
                            story_points,
                            json.dumps(story.get("code_pointers", [])),
                            json.dumps(ripple_effects),
                            json.dumps(story.get("unhappy_paths", []))
                        )
                    )
            conn.commit()
        except Exception as db_err:
            conn.rollback()
            raise db_err
        finally:
            conn.close()

        commit_transaction_to_ledger(
            operator_id=operator_id,
            transaction_type="BACKLOG_GENERATION",
            payload_data={
                "sprint_goal": payload.sprint_goal,
                "epics_count": len(backlog_res.get("epics", [])),
                "status": "SUCCESS",
                "usage": run_telemetry.get("usage", {}),
                "latency_seconds": run_telemetry.get("latency_seconds", 0),
                "story_signatures": run_telemetry.get("story_signatures", []),
                "code_pointer_claims": run_telemetry.get("code_pointer_claims", []),
            },
            project_id=payload.project_id
        )
        return backlog_res
    except LLMGatewayError as gateway_err:
        commit_transaction_to_ledger(
            operator_id=operator_id,
            transaction_type="BACKLOG_GENERATION",
            payload_data={"sprint_goal": payload.sprint_goal, "status": "FAILED", "error": str(gateway_err)},
            project_id=payload.project_id
        )
        raise HTTPException(
            status_code=503,
            detail=f"Backlog generation failure: {str(gateway_err)}. Please check your internet connectivity or credentials and click Generate again."
        )
    except ValueError as validation_err:
        commit_transaction_to_ledger(
            operator_id=operator_id,
            transaction_type="BACKLOG_GENERATION",
            payload_data={"sprint_goal": payload.sprint_goal, "status": "FAILED", "error": str(validation_err)},
            project_id=payload.project_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(validation_err)
        )
    except Exception as e:
        commit_transaction_to_ledger(
            operator_id=operator_id,
            transaction_type="BACKLOG_GENERATION",
            payload_data={"sprint_goal": payload.sprint_goal, "status": "FAILED", "error": str(e)},
            project_id=payload.project_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backlog generation failure: {str(e)}"
        )

    return backlog_res

@app.post("/api/project/report/pdf")
async def generate_project_pdf(
    payload: PDFCompileRequest,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SCRUM_MASTER", "SECURITY_AUDITOR", "SYSTEM_ADMIN"]))
):
    # Use triple-single quotes for docstring
    '''
    Compiles backlog requirements and diagrams into a PDF byte stream.
    '''
    try:
        pdf_data = compile_pdf_report(
            project_name=payload.project_name,
            project_description=payload.project_description,
            user_stories=payload.user_stories,
            class_diagram_url=payload.class_diagram_url,
            sequence_diagram_url=payload.sequence_diagram_url,
            project_id=payload.project_id,
            include_timeline=payload.include_timeline
        )
        commit_transaction_to_ledger(
            operator_id=operator_id,
            transaction_type="PDF_REPORT_COMPILATION",
            payload_data={"project_name": payload.project_name, "stories_count": len(payload.user_stories), "status": "SUCCESS"},
            project_id=payload.project_id
        )
    except Exception as e:
        # Note: If this fails due to database foreign keys, it will propagate naturally
        try:
            commit_transaction_to_ledger(
                operator_id=operator_id,
                transaction_type="PDF_REPORT_COMPILATION",
                payload_data={"project_name": payload.project_name, "status": "FAILED", "error": str(e)},
                project_id=payload.project_id
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF compiler compilation failure: {str(e)}"
        )
        
    return Response(
        content=pdf_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=scrummap_{payload.project_name.lower().replace(' ', '_')}_report.pdf"}
    )

@app.post("/api/project/stubs/download")
async def download_project_stubs(
    payload: StubsDownloadRequest,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "LEAD_DEVELOPER", "SYSTEM_ADMIN"]))
):
    import io
    import zipfile
    
    # Group AST symbols by file path
    grouped_files = {}
    for sym in payload.ast_symbols:
        path = sym.get("path", "src/main/java/com/enterprise/Unnamed.java")
        if path not in grouped_files:
            grouped_files[path] = []
        grouped_files[path].append(sym)
        
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        for file_path, symbols in grouped_files.items():
            filename = file_path.split("/")[-1] if "/" in file_path else file_path
            parts = filename.split(".")
            ext = parts[-1].lower() if len(parts) > 1 else ""
            base_name = ".".join(parts[:-1]) if len(parts) > 1 else filename
            
            # Capitalize class name
            class_name = base_name[0].upper() + base_name[1:] if base_name else "Service"
            
            is_ts_or_js = ext in ["ts", "tsx", "js", "jsx"]
            is_python = ext == "py"
            is_go = ext == "go"

            # Find matching story
            matching_story = None
            for story in payload.user_stories:
                pointers = story.get("code_pointers", []) or []
                if any(class_name.lower() in cp.get("file", "").lower() for cp in pointers):
                    matching_story = story
                    break
                    
            lines = []
            
            # Inject requirement header comment
            if matching_story:
                story_id = matching_story.get('id', 'STORY-XX')
                role = matching_story.get('role', 'User')
                action = matching_story.get('action', 'action')
                benefit = matching_story.get('benefit', 'benefit')
                if is_python:
                    lines.extend([
                        '"""',
                        f"Requirement: {story_id}",
                        f"As a {role}, I want to {action} so that {benefit}",
                        '"""'
                    ])
                else:
                    lines.extend([
                        "/**",
                        f" * @Requirement {story_id}",
                        f" * As a {role}, I want to {action} so that {benefit}",
                        " */"
                    ])

            if is_ts_or_js:
                lines.append(f"export class {class_name} {{")
            elif is_python:
                lines.append(f"class {class_name}:")
            elif is_go:
                lines.extend([
                    "package main",
                    "",
                    f"type {class_name} struct {{}}",
                    ""
                ])
            else:
                # Java
                lines.extend([
                    "package com.enterprise;",
                    "",
                    f"public class {class_name} {{"
                ])
            
            lines.append("")
            
            for sym in symbols:
                kind = sym.get("kind", "")
                name = sym.get("name", "")
                sig = sym.get("signature", "()")
                if kind != "class" and name:
                    # Find symbol-specific story
                    method_story = None
                    for story in payload.user_stories:
                        pointers = story.get("code_pointers", []) or []
                        if any(class_name.lower() in cp.get("file", "").lower() and name in cp.get("symbols", []) for cp in pointers):
                            method_story = story
                            break
                    if not method_story:
                        method_story = matching_story
                    
                    if is_ts_or_js:
                        if method_story:
                            lines.extend([
                                "    /**",
                                f"     * Mapped to requirements check: {method_story.get('id', 'STORY-XX')}",
                                "     * Acceptance criteria verified: true",
                                "     */"
                            ])
                        lines.extend([
                            f"    public {name}{sig} {{",
                            "        // TODO: Auto-generated skeletal stub implementation",
                            f'        console.log("Executing static stub: {name}");',
                            "    }",
                            ""
                        ])
                    elif is_python:
                        # Append self to arguments
                        if sig.startswith("("):
                            sig_formatted = "(self)" if sig == "()" else f"(self, {sig[1:]}"
                        else:
                            sig_formatted = "(self)"
                        lines.extend([
                            f"    def {name}{sig_formatted}:"
                        ])
                        if method_story:
                            lines.extend([
                                '        """',
                                f"        Mapped to requirements check: {method_story.get('id', 'STORY-XX')}",
                                "        Acceptance criteria verified: true",
                                '        """'
                            ])
                        lines.extend([
                            "        # TODO: Auto-generated skeletal stub implementation",
                            f'        print("Executing static stub: {name}")',
                            ""
                        ])
                    elif is_go:
                        capitalized_method_name = name[0].upper() + name[1:] if name else "Method"
                        if method_story:
                            lines.extend([
                                f"// Mapped to requirements check: {method_story.get('id', 'STORY-XX')}",
                                "// Acceptance criteria verified: true"
                            ])
                        lines.extend([
                            f"func (c *{class_name}) {capitalized_method_name}{sig} {{",
                            "    // TODO: Auto-generated skeletal stub implementation",
                            f'    println("Executing static stub: {name}")',
                            "}",
                            ""
                        ])
                    else:
                        # Java
                        if method_story:
                            lines.extend([
                                "    /**",
                                f"     * Mapped to requirements check: {method_story.get('id', 'STORY-XX')}",
                                "     * Acceptance criteria verified: true",
                                "     */"
                            ])
                        lines.extend([
                            f"    public void {name}{sig} {{",
                            "        // TODO: Auto-generated skeletal stub implementation",
                            f'        System.out.println("Executing static stub: {name}");',
                            "    }",
                            ""
                        ])
                        
            if not is_python and not is_go:
                lines.append("}")
            content = "\n".join(lines)
            zip_file.writestr(file_path, content)
            
    zip_buffer.seek(0)

    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="CODE_STUB_DOWNLOAD",
        payload_data={"files_generated": len(grouped_files), "symbols_count": len(payload.ast_symbols)}
    )

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=scrummap_purified_skeleton.zip"}
    )

ZEROED_TELEMETRY = {
    "db_latency": "0.0 ms",
    "purification_compression": "0.0%",
    "avg_tokens_per_generation": "0 tokens",
    "verification_tax": "0.0",
    "prompt_iterations": "0",
    "corrective_prompts": "0",
    "git_diff_lines": "0 lines",
    "validation_failures": "0",
    "percent_iterations": 0,
    "percent_corrective": 0,
    "percent_git": 0,
    "percent_validation": 0,
    "tokens_per_item": "0 tokens",
    "inference_latency": "0.0 s",
    "hallucination_drift": "0.0%",
    "cycle_time": "0.0 s",
    "machine_latency": "0.0 s",
    "scoping_duration": "0.0 min",
    "raw_size_bytes": 0,
    "purified_size_bytes": 0,
    "prompt_tokens": 0,
    "completion_tokens": 0
}

def _normalize_symbol(sym: str) -> str:
    # Drop the full argument list, e.g. "authorizePayment(String cardToken, double amount)" -> "authorizePayment",
    # not just a trailing "()" — real LLM output includes real parameter signatures, not just empty parens.
    return sym.split("(", 1)[0].strip()

def _symbol_exists(sym: str, symbol_names: set) -> bool:
    bare = _normalize_symbol(sym)
    if not bare:
        return False
    if bare in symbol_names:
        return True
    # Also accept a dotted qualifier like "OrderService.processOrder" matching a bare "processOrder"
    if "." in bare and bare.rsplit(".", 1)[-1].strip() in symbol_names:
        return True
    return False

@app.get("/api/metrics/telemetry")
async def get_telemetry_metrics(project_id: Optional[str] = None):
    # If no project_id is provided, return clean default zeroed telemetry to avoid global leakages
    if not project_id or project_id == "undefined" or project_id.strip() == "":
        return dict(ZEROED_TELEMETRY)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Measure DB read speed (WAL Write Latency) — real, timed against a live query
        db_start = time.perf_counter()
        cursor.execute("SELECT COUNT(*) FROM write_ahead_ledger")
        total_blocks = cursor.fetchone()[0]
        db_latency = (time.perf_counter() - db_start) * 1000.0  # in ms

        # Check if project has an ingested codebase version
        cursor.execute(
            "SELECT COUNT(*) FROM codebase_versions WHERE project_id = ?",
            (project_id,)
        )
        has_codebase = cursor.fetchone()[0] > 0

        # Get latest ZIP codebase upload for Purification Compression, real processing time,
        # and the real parsed-symbol snapshot (used below for hallucination drift).
        upload_payload = {}
        if has_codebase:
            cursor.execute(
                "SELECT payload FROM write_ahead_ledger WHERE transaction_type = 'ZIP_CODEBASE_UPLOAD' AND project_id = ? ORDER BY id DESC LIMIT 1",
                (project_id,)
            )
            zip_row = cursor.fetchone()
            if zip_row:
                try:
                    upload_payload = json.loads(zip_row[0])
                except Exception:
                    upload_payload = {}

        raw_size = upload_payload.get("raw_size_bytes", 0)
        purified_size = upload_payload.get("purified_size_bytes", 0)
        # raw_size_bytes was added to this payload after purified_size_bytes already existed, so older
        # ledger entries can have a real purified_size with no matching raw_size. Showing that
        # inconsistent pair produces a negative/nonsensical compression figure, so treat the whole
        # measurement as unavailable rather than mixing a real number with a missing one.
        if raw_size <= 0:
            purified_size = 0
        compression_percent = ((raw_size - purified_size) / raw_size) * 100.0 if raw_size > 0 else 0.0
        processing_seconds = upload_payload.get("processing_seconds", 0.0)
        symbol_names = set(upload_payload.get("symbol_names", []))
        file_paths = set(upload_payload.get("file_paths", []))

        # Count Backlog Generations for Prompt Iterations (I_p) — real count
        cursor.execute(
            "SELECT COUNT(*) FROM write_ahead_ledger WHERE transaction_type = 'BACKLOG_GENERATION' AND project_id = ?",
            (project_id,)
        )
        prompt_iterations = cursor.fetchone()[0]

        # Calculate Corrective Prompts (C_prompts) — derived proxy: every generation after the first counts as a correction
        corrective_prompts = max(0, prompt_iterations - 1)

        # Count Validation Failures (F_val) — real count
        cursor.execute(
            "SELECT COUNT(*) FROM write_ahead_ledger WHERE payload LIKE '%\"status\": \"FAILED\"%' AND project_id = ?",
            (project_id,)
        )
        validation_failures = cursor.fetchone()[0]

        # Calculate Verification Tax (V_tax) — derived from real prompt/correction counts
        v_tax = round(corrective_prompts / max(1, prompt_iterations), 1) if prompt_iterations > 0 else 0.0

        # Fetch the most recent SUCCESSful backlog generations for this project (newest first),
        # which now carry real per-run telemetry: LLM latency, token usage, story signatures,
        # and the symbols the LLM claimed to touch.
        cursor.execute(
            "SELECT payload FROM write_ahead_ledger WHERE transaction_type = 'BACKLOG_GENERATION' "
            "AND project_id = ? AND payload LIKE '%\"status\": \"SUCCESS\"%' ORDER BY id DESC LIMIT 50",
            (project_id,)
        )
        gen_rows = cursor.fetchall()
        gen_payloads = []
        for row in gen_rows:
            try:
                gen_payloads.append(json.loads(row[0]))
            except Exception:
                continue

        latest_gen = gen_payloads[0] if gen_payloads else {}
        latest_usage = latest_gen.get("usage", {}) or {}
        latest_story_sigs = latest_gen.get("story_signatures", [])
        latest_code_pointer_claims = latest_gen.get("code_pointer_claims", [])

        # Tokens per Backlog Item (T_token) — real total_tokens from the latest run, spread over its real story count
        latest_total_tokens = latest_usage.get("total_tokens", 0)
        if latest_total_tokens and latest_story_sigs:
            tokens_per_item = f"{int(latest_total_tokens / max(1, len(latest_story_sigs))):,} tokens"
        else:
            tokens_per_item = "0 tokens"

        # Average tokens per generation across all successful runs — real, replaces the old fictional
        # "Context Caching Savings" metric (this app has no context-caching feature to measure).
        run_totals = [g.get("usage", {}).get("total_tokens", 0) for g in gen_payloads if g.get("usage", {}).get("total_tokens")]
        avg_tokens_per_generation = f"{int(sum(run_totals) / len(run_totals)):,} tokens" if run_totals else "0 tokens"

        # Prompt/completion token split for the latest run — real, replaces the old fictional
        # "Normal vs Cached" token chart (there is no caching mechanism in this app).
        prompt_tokens = int(latest_usage.get("prompt_tokens", 0))
        completion_tokens = int(latest_usage.get("completion_tokens", 0))

        # LLM Inference Latency (L_llm) — real wall-clock time of the latest gateway call
        latest_latency_seconds = latest_gen.get("latency_seconds", 0.0)
        inference_latency = f"{latest_latency_seconds:.1f} s" if latest_latency_seconds else "0.0 s"

        # Backlog Revision Delta (D_edit), formerly "Git Diff Distances" — this app has no git integration,
        # so instead of a fabricated line count, this counts how many generated user stories actually
        # changed (added/removed) between the current and immediately-previous run for this project.
        if len(gen_payloads) >= 2:
            prev_story_sigs = gen_payloads[1].get("story_signatures", [])
            git_diff_lines = len(set(latest_story_sigs) ^ set(prev_story_sigs))
        else:
            git_diff_lines = 0

        # Hallucination Drift Index (H_drift) — real comparison, restricted to claims about files that
        # already exist in the codebase: what share of the symbols the LLM claimed to touch in those
        # existing files don't actually exist there. Claims about brand-new files (proposed as part of
        # the sprint's planned work, e.g. a new class to implement a requested feature) are excluded
        # entirely — the LLM is *supposed* to propose new code for new work, so that isn't drift.
        existing_file_claims = [
            c for c in latest_code_pointer_claims
            if c.get("file") in file_paths and c.get("symbol")
        ]
        if existing_file_claims and symbol_names:
            missing = sum(1 for c in existing_file_claims if not _symbol_exists(c["symbol"], symbol_names))
            hallucination_drift = f"{(missing / len(existing_file_claims)) * 100.0:.1f}%"
        else:
            hallucination_drift = "0.0%"

        # E2E Backlog Refinement Cycle Time (T_cycle) — real elapsed time between first upload and
        # latest PDF compile, only reported once both have actually happened. A project with an
        # upload but no PDF yet reports "0.0 s" rather than guessing at an in-progress elapsed time —
        # an old orphaned upload from a past session would otherwise show a permanently-capped,
        # misleading "still scoping" duration forever.
        cycle_time = "0.0 s"
        cursor.execute(
            "SELECT timestamp FROM write_ahead_ledger WHERE transaction_type = 'ZIP_CODEBASE_UPLOAD' AND project_id = ? ORDER BY id ASC LIMIT 1",
            (project_id,)
        )
        upload_row = cursor.fetchone()

        cursor.execute(
            "SELECT timestamp FROM write_ahead_ledger WHERE transaction_type = 'PDF_REPORT_COMPILATION' AND project_id = ? ORDER BY id DESC LIMIT 1",
            (project_id,)
        )
        pdf_row = cursor.fetchone()

        if upload_row and pdf_row:
            try:
                t1 = datetime.fromisoformat(upload_row[0].replace('Z', '+00:00'))
                t2 = datetime.fromisoformat(pdf_row[0].replace('Z', '+00:00'))
                cycle_time = f"{(t2 - t1).total_seconds():.1f} s"
            except Exception:
                cycle_time = "0.0 s"

        # Active Machine Latency — real sum of measured stages: codebase parsing/purification time,
        # LLM inference time, and the live DB read above (no more arbitrary constants).
        if has_codebase and prompt_iterations > 0:
            machine_latency_sec = latest_latency_seconds + (db_latency / 1000.0) + processing_seconds
            machine_latency = f"{machine_latency_sec:.1f} s"
        else:
            machine_latency = "0.0 s"

        # Total Scoping Duration (in minutes) — derived from the real cycle_time above
        try:
            scoping_duration = f"{(float(cycle_time.replace(' s', '')) / 60.0):.1f} min"
        except Exception:
            scoping_duration = "0.0 min"

    except Exception:
        # A genuine backend error occurred — report a clean zeroed state rather than
        # plausible-looking fabricated numbers that could be mistaken for real data.
        return dict(ZEROED_TELEMETRY)
    finally:
        conn.close()

    # Return formatted JSON response
    return {
        "db_latency": f"{db_latency:.1f} ms",
        "purification_compression": f"{compression_percent:.1f}%",
        "avg_tokens_per_generation": avg_tokens_per_generation,
        "verification_tax": f"{v_tax:.1f}",
        "prompt_iterations": str(prompt_iterations),
        "corrective_prompts": str(corrective_prompts),
        "git_diff_lines": f"{git_diff_lines} lines",
        "validation_failures": str(validation_failures),
        "percent_iterations": min(100, int((prompt_iterations / 5.0) * 100)),
        "percent_corrective": min(100, int((corrective_prompts / 3.0) * 100)),
        "percent_git": min(100, int((git_diff_lines / 50.0) * 100)),
        "percent_validation": min(100, int((validation_failures / 1.0) * 100)),
        "tokens_per_item": tokens_per_item,
        "inference_latency": inference_latency,
        "hallucination_drift": hallucination_drift,
        "cycle_time": cycle_time,
        "machine_latency": machine_latency,
        "scoping_duration": scoping_duration,
        "raw_size_bytes": raw_size,
        "purified_size_bytes": purified_size,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens
    }

class DeveloperCreatePayload(BaseModel):
    name: str
    is_lead: bool = False

class AssignStoryPayload(BaseModel):
    developer_ids: List[str] = []
    project_id: str

@app.get("/api/projects/{project_id}/backlog")
async def get_project_backlog(
    project_id: str,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SCRUM_MASTER", "LEAD_DEVELOPER", "SECURITY_AUDITOR", "SYSTEM_ADMIN"]))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Fetch stories
        cursor.execute(
            """
            SELECT id, codebase_version_id, title, description, actor_role, 
                   snl_requirements, hie_story_points, code_pointers, ripple_effects, 
                   unhappy_paths, created_at
            FROM backlog_items 
            WHERE project_id = ?
            """,
            (project_id,)
        )
        rows = cursor.fetchall()
        
        # Fetch story assignments
        cursor.execute(
            """
            SELECT bia.backlog_item_id, bia.developer_id
            FROM backlog_item_assignments bia
            JOIN backlog_items bi ON bia.backlog_item_id = bi.id
            WHERE bi.project_id = ?
            """,
            (project_id,)
        )
        assignment_rows = cursor.fetchall()
        assignments_map = {}
        for r in assignment_rows:
            item_id = r["backlog_item_id"]
            dev_id = r["developer_id"]
            if item_id not in assignments_map:
                assignments_map[item_id] = []
            assignments_map[item_id].append(dev_id)

        stories = []
        for row in rows:
            desc = row["description"] or ""
            epic_title = "Core Epics"
            if desc.startswith("[") and "]" in desc:
                parts = desc.split("]", 1)
                epic_title = parts[0][1:]
                desc = parts[1].strip()
            
            story_id = row["id"]
            if story_id.startswith(f"{project_id}_"):
                story_id = story_id.replace(f"{project_id}_", "", 1)
                
            # Parse action and benefit safely
            snl_str = row["snl_requirements"] or ""
            action = ""
            benefit = ""
            if snl_str.strip().startswith("{"):
                try:
                    snl_data = json.loads(snl_str)
                    action = snl_data.get("action", "")
                    benefit = snl_data.get("benefit", "")
                except Exception:
                    action = snl_str
            else:
                action = snl_str
                
            if not action or not benefit:
                import re
                m = re.search(r"I want to (.*?) so that (.*)", desc, re.IGNORECASE)
                if m:
                    if not action:
                        action = m.group(1).strip()
                    if not benefit:
                        benefit = m.group(2).strip()

            stories.append({
                "id": story_id,
                "title": row["title"],
                "description": desc,
                "epic_title": epic_title,
                "role": row["actor_role"] or "User",
                "actor_role": row["actor_role"],
                "action": action or "perform action",
                "benefit": benefit or "gain value",
                "snl_requirements": row["snl_requirements"],
                "story_points": row["hie_story_points"],
                "code_pointers": json.loads(row["code_pointers"] or "[]"),
                "ripple_effects": json.loads(row["ripple_effects"] or "[]"),
                "unhappy_paths": json.loads(row["unhappy_paths"] or "[]"),
                "assigned_developer_ids": assignments_map.get(row["id"], [])
            })
        return stories
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/projects/{project_id}/developers")
async def get_project_developers(
    project_id: str,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SCRUM_MASTER", "LEAD_DEVELOPER", "SECURITY_AUDITOR", "SYSTEM_ADMIN"]))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, is_lead FROM project_developers WHERE project_id = ?", (project_id,))
        rows = cursor.fetchall()
        return [{"id": r["id"], "name": r["name"], "is_lead": bool(r["is_lead"])} for r in rows]
    finally:
        conn.close()

@app.post("/api/projects/{project_id}/developers", status_code=201)
async def add_project_developer(
    project_id: str,
    payload: DeveloperCreatePayload,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SYSTEM_ADMIN"]))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        dev_id = f"dev_{uuid.uuid4().hex[:8]}"
        if payload.is_lead:
            cursor.execute("UPDATE project_developers SET is_lead = 0 WHERE project_id = ?", (project_id,))
            
        cursor.execute(
            "INSERT INTO project_developers (id, project_id, name, is_lead) VALUES (?, ?, ?, ?)",
            (dev_id, project_id, payload.name, 1 if payload.is_lead else 0)
        )
        conn.commit()
        return {"id": dev_id, "name": payload.name, "is_lead": payload.is_lead}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/projects/{project_id}/developers/{dev_id}")
async def delete_project_developer(
    project_id: str,
    dev_id: str,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "SYSTEM_ADMIN"]))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM project_developers WHERE id = ? AND project_id = ?", (dev_id, project_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Developer not found")
            
        cursor.execute("DELETE FROM backlog_item_assignments WHERE developer_id = ?", (dev_id,))
        cursor.execute("DELETE FROM project_developers WHERE id = ?", (dev_id,))
        conn.commit()
        return {"status": "SUCCESS"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/backlog/{story_id}/assign")
async def assign_backlog_story(
    story_id: str,
    payload: AssignStoryPayload,
    operator_id: str = Depends(check_role(["PRODUCT_MANAGER", "LEAD_DEVELOPER", "SYSTEM_ADMIN"]))
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        db_story_id = f"{payload.project_id}_{story_id}"
        cursor.execute("SELECT id FROM backlog_items WHERE id = ? AND project_id = ?", (db_story_id, payload.project_id))
        row = cursor.fetchone()
        if not row:
            # Fallback to direct check with project filter
            cursor.execute(
                "SELECT id FROM backlog_items WHERE project_id = ? AND (id = ? OR id LIKE ?)", 
                (payload.project_id, story_id, f"%_{story_id}")
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Story with ID '{story_id}' not found in project '{payload.project_id}'")
        db_story_id = row["id"]
        
        cursor.execute("DELETE FROM backlog_item_assignments WHERE backlog_item_id = ?", (db_story_id,))
        
        for dev_id in payload.developer_ids:
            cursor.execute("SELECT id FROM project_developers WHERE id = ?", (dev_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail=f"Developer with ID '{dev_id}' not found")
            cursor.execute(
                "INSERT INTO backlog_item_assignments (backlog_item_id, developer_id) VALUES (?, ?)",
                (db_story_id, dev_id)
            )
        conn.commit()
        return {"status": "SUCCESS", "assigned_developer_ids": payload.developer_ids}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}




