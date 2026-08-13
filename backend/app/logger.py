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
    # Use triple-single quotes for docstring
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
