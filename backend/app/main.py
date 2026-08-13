# =============================================================================
# SCRUMMAP FASTAPI SERVER ENTRYPOINT (main.py)
# =============================================================================
import os
import uuid
import hashlib
import shutil
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Depends, UploadFile, File, Form, Query, HTTPException, status, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.auth import resolve_operator_role
from backend.app.logger import setup_logging
from backend.app.ledger import get_db_connection, commit_transaction_to_ledger, audit_ledger_integrity
from backend.app.optimizer import extract_and_purify_zip
from backend.app.parser import compile_ast_ctags_index
from backend.app.sbert_clustering import cluster_and_align_backlog
from backend.app.uml_generator import plantuml_encode, verify_diagram_consistency
from backend.app.backlog_generator import generate_backlog_items
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
    sprint_goal: str
    ast_symbols: List[Dict[str, Any]]
    refined_requirements: Optional[str] = None

class PDFCompileRequest(BaseModel):
    project_name: str
    project_description: Optional[str] = None
    user_stories: List[Dict[str, Any]]
    class_diagram_url: Optional[str] = None

@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    operator_id: str = Depends(resolve_operator_role)
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
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

@app.post("/api/codebase/upload", status_code=status.HTTP_201_CREATED)
async def upload_codebase(
    project_id: str = Query(..., description="Target project identifier"),
    version_tag: str = Query(..., description="Target version identifier"),
    codebase_zip: UploadFile = File(..., description="Multipart zip package"),
    operator_id: str = Depends(resolve_operator_role)
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
            "purified_size_bytes": purified_size,
            "symbols_count": len(ast_symbols)
        },
        project_id=project_id
    )

    # 6. Apply Zero-Data Retention (ZDR) policy: delete physical files if configured
    if settings.ZDR_COMPLIANCE:
        shutil.rmtree(extract_target_dir, ignore_errors=True)
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
        "status": "purified_and_cached"
    }

@app.post("/api/backlog/cluster")
async def cluster_backlog(
    payload: ClusterRequest,
    operator_id: str = Depends(resolve_operator_role)
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
        transaction_type="BACKLOG_GENERATION",
        payload_data={"stories_count": len(payload.user_stories), "clusters_requested": payload.n_clusters}
    )

    return {
        "clustered_stories": clustered_data
    }

@app.get("/api/ledger/verify")
async def verify_ledger(
    operator_id: str = Depends(resolve_operator_role)
):
    # Use triple-single quotes for docstring
    '''
    Scans the write-ahead ledger database table to verify signature chain integrity.
    '''
    audit_res = audit_ledger_integrity()
    
    # Commit audit action to ledger
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="LEDGER_AUDIT",
        payload_data={"status": audit_res["status"], "scanned_blocks": audit_res["scanned_blocks"]}
    )

    return {
        "ledger_integrity": "OK" if audit_res["status"] == "SUCCESS" else "TAMPERED",
        "scanned_blocks": audit_res["scanned_blocks"],
        "compromised_blocks": [audit_res["tampered_block_id"]] if audit_res["status"] == "COMPROMISED" else [],
        "verification_timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.post("/api/uml/render")
async def render_uml(
    payload: UMLRenderRequest,
    operator_id: str = Depends(resolve_operator_role)
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
    operator_id: str = Depends(resolve_operator_role)
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
    operator_id: str = Depends(resolve_operator_role)
):
    # Use triple-single quotes for docstring
    '''
    Generates Epics and User Stories complete with acceptance criteria, unhappy paths,
    and codebase symbol line mappings using an LLM connector.
    '''
    try:
        backlog_res = generate_backlog_items(
            sprint_goal=payload.sprint_goal,
            ast_symbols=payload.ast_symbols,
            refined_requirements=payload.refined_requirements
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backlog generation failure: {str(e)}"
        )
        
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="BACKLOG_GENERATION",
        payload_data={"sprint_goal": payload.sprint_goal, "epics_count": len(backlog_res.get("epics", []))}
    )
    
    return backlog_res

@app.post("/api/project/report/pdf")
async def generate_project_pdf(
    payload: PDFCompileRequest,
    operator_id: str = Depends(resolve_operator_role)
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
            class_diagram_url=payload.class_diagram_url
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF compiler compilation failure: {str(e)}"
        )
        
    commit_transaction_to_ledger(
        operator_id=operator_id,
        transaction_type="PDF_REPORT_COMPILATION",
        payload_data={"project_name": payload.project_name, "stories_count": len(payload.user_stories)}
    )
    
    return Response(
        content=pdf_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=scrummap_{payload.project_name.lower().replace(' ', '_')}_report.pdf"}
    )



