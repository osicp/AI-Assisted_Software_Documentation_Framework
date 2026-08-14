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
        echo -e "${YELLOW}[!] After configuring, re-run 'bootstrap_workstation.sh' to continue.${NC}"
        exit 0
    else
        echo -e "${RED}[X] CRITICAL ERROR: Environment template '${EXAMPLE_FILE}' is missing!${NC}"
        exit 1
    fi
fi

# Load env variables safely (skipping comments and empty lines).
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

mkdir -p "$HOST_DATA_DIR"
mkdir -p "$HOST_UPLOAD_DIR"
mkdir -p "./mock-codebases"

# Owner-only permissions: /tmp and other shared workstation locations are
# readable/listable by every local user by default.
chmod 700 "$HOST_DATA_DIR"
chmod 700 "$HOST_UPLOAD_DIR"

echo -e "${GREEN}[✓] Created database mounts: ${HOST_DATA_DIR}${NC}"
echo -e "${GREEN}[✓] Created ingestion mounts: ${HOST_UPLOAD_DIR}${NC}"

# ------------------------------------------------------------------------------
# STEP 4: Orchestrate Podman Container Pod Assembly via Compose
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[*] Phase 3: Constructing isolated rootless network pod boundaries...${NC}"

POD_NAME="scrummap-pod"

# Tear down any existing stack from a prior run
podman-compose -f podman-compose.yaml --in-pod "$POD_NAME" down 2>/dev/null || true

# --in-pod groups both services into ONE shared network namespace
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
