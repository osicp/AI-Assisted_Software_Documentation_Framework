# =============================================================================
# SCRUMMAP ROLE-KEY AUTHENTICATION GATEWAY (auth.py)
# =============================================================================
from fastapi import Header, HTTPException, status
from backend.app.config import settings

_ROLE_KEY_MAP = {
    settings.ROLE_KEY_PRODUCT_MANAGER: "PRODUCT_MANAGER",
    settings.ROLE_KEY_SCRUM_MASTER: "SCRUM_MASTER",
    settings.ROLE_KEY_LEAD_DEVELOPER: "LEAD_DEVELOPER",
    settings.ROLE_KEY_SECURITY_AUDITOR: "SECURITY_AUDITOR",
    settings.ROLE_KEY_SYSTEM_ADMIN: "SYSTEM_ADMIN",
}

def resolve_operator_role(x_scrummap_role_key: str = Header(default=None)) -> str:
    # Use triple-single quotes for docstring
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
