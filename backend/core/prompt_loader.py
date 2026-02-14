"""
Standardized prompt loading with Jinja2 templating.

Prompts stay co-located with their agents. This module provides a single
loading function that handles Jinja2 variable substitution.

    from core.prompt_loader import load_prompt

    # No variables
    prompt = load_prompt("extraction/prompts/identification.txt")

    # With variables
    prompt = load_prompt("extraction/prompts/extraction.txt", timezone="America/New_York")
"""

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from pathlib import Path

_BACKEND_DIR = Path(__file__).parent.parent

_env = Environment(
    loader=FileSystemLoader(str(_BACKEND_DIR)),
    keep_trailing_newline=True,
    undefined=StrictUndefined,
)


def load_prompt(path: str, **kwargs) -> str:
    """
    Load and render a prompt template.

    Args:
        path: Path relative to backend/ (e.g., "extraction/prompts/extraction.txt")
        **kwargs: Template variables to inject (uses Jinja2 {{ var }} syntax)

    Returns:
        Rendered prompt string

    Raises:
        jinja2.TemplateNotFound: If prompt file doesn't exist
        jinja2.UndefinedError: If a required variable is missing
    """
    template = _env.get_template(path)
    return template.render(**kwargs)
