"""
Logging utilities for DropCal agent pipeline.
Provides simple logging for debugging. Session structure handles all execution tracking.
"""
import logging
import json
import time
import functools
from pathlib import Path
from typing import Any, Callable, Optional


# Create logs directory if it doesn't exist
LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

# Configure logging format
LOG_FORMAT = '%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'


def setup_logger(name: str, log_file: Optional[str] = None, level=logging.INFO) -> logging.Logger:
    """
    Set up a logger with both file and console handlers.

    Args:
        name: Logger name (typically agent or module name)
        log_file: Optional specific log file name. If None, uses 'dropcal.log'
        level: Logging level (default INFO)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Avoid duplicate handlers if logger already exists
    if logger.handlers:
        return logger

    # File handler - logs everything to file
    if log_file is None:
        log_file = "dropcal.log"
    file_handler = logging.FileHandler(LOGS_DIR / log_file)
    file_handler.setLevel(logging.DEBUG)  # Log everything to file
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))

    # Console handler - logs INFO and above to console
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


# Main application logger
app_logger = setup_logger("DropCal")

# Agent-specific loggers
agent_logger = setup_logger("Agent", "agents.log")
processor_logger = setup_logger("InputProcessor", "processors.log")


def log_agent_execution(agent_name: str, logger: Optional[logging.Logger] = None):
    """
    Simplified decorator - just logs start/finish for debugging.
    Session tracking handles all structured data (inputs, outputs, timing).

    Usage:
        @log_agent_execution("EventIdentification")
        def identify_events(input_data):
            # agent logic
            return result

    Args:
        agent_name: Name of the agent being executed
        logger: Optional logger instance. If None, uses default agent_logger
    """
    if logger is None:
        logger = agent_logger

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Simple logging for debugging
            logger.info(f"Starting agent: {agent_name}")
            start_time = time.time()

            try:
                # Execute the agent function
                result = func(*args, **kwargs)

                # Log completion
                execution_time = time.time() - start_time
                logger.info(f"Agent {agent_name} completed in {execution_time:.3f}s")

                return result

            except Exception as e:
                # Log error
                execution_time = time.time() - start_time
                logger.error(f"Agent {agent_name} failed after {execution_time:.3f}s: {str(e)}")
                raise

        return wrapper
    return decorator


def log_processor_execution(processor_name: str):
    """
    Decorator specifically for input processors.
    Similar to log_agent_execution but uses processor_logger.
    """
    return log_agent_execution(processor_name, logger=processor_logger)


def _safe_serialize(obj: Any, max_length: int = 1000) -> str:
    """
    Safely serialize an object to string for logging.
    Handles Pydantic models, dicts, lists, and truncates long outputs.

    Args:
        obj: Object to serialize
        max_length: Maximum length of serialized string

    Returns:
        Serialized string representation
    """
    try:
        # Handle Pydantic models
        if hasattr(obj, 'model_dump'):
            serialized = json.dumps(obj.model_dump(), indent=2)
        # Handle dicts and lists
        elif isinstance(obj, (dict, list)):
            serialized = json.dumps(obj, indent=2, default=str)
        # Handle tuples (like args)
        elif isinstance(obj, tuple):
            serialized = json.dumps([_safe_serialize(item, max_length) for item in obj], default=str)
        else:
            serialized = str(obj)

        # Truncate if too long
        if len(serialized) > max_length:
            return serialized[:max_length] + f"... (truncated, total length: {len(serialized)})"

        return serialized
    except Exception as e:
        return f"<Unable to serialize: {str(e)}>"


# Removed _serialize_for_session and _write_detailed_log
# Session tracking in frontend handles all structured data
# These were redundant with the session.AgentOutput structure


def log_info(message: str, logger_name: str = "DropCal"):
    """Helper function to log info messages."""
    logger = logging.getLogger(logger_name)
    logger.info(message)


def log_error(message: str, logger_name: str = "DropCal"):
    """Helper function to log error messages."""
    logger = logging.getLogger(logger_name)
    logger.error(message)


def log_debug(message: str, logger_name: str = "DropCal"):
    """Helper function to log debug messages."""
    logger = logging.getLogger(logger_name)
    logger.debug(message)


# Initialize logging on module import
app_logger.info("=" * 80)
app_logger.info("DropCal Logging System Initialized")
app_logger.info(f"Log directory: {LOGS_DIR}")
app_logger.info("=" * 80)
