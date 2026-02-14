"""
Centralized prompt loading with Jinja2 templating.

All prompt files live in backend/prompts/. Load by name with variable substitution:

    from core.prompt_loader import load_prompt

    # No variables
    prompt = load_prompt("identification.txt")

    # With variables
    prompt = load_prompt("extraction.txt", timezone="America/New_York")
"""

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

_env = Environment(
    loader=FileSystemLoader(str(_PROMPTS_DIR)),
    keep_trailing_newline=True,
    undefined=StrictUndefined,
)


def load_prompt(name: str, **kwargs) -> str:
    """
    Load and render a prompt template from the prompts/ directory.

    Args:
        name: Filename in backend/prompts/ (e.g., "extraction.txt")
        **kwargs: Template variables to inject (uses Jinja2 {{ var }} syntax)

    Returns:
        Rendered prompt string

    Raises:
        jinja2.TemplateNotFound: If prompt file doesn't exist
        jinja2.UndefinedError: If a required variable is missing
    """
    template = _env.get_template(name)
    return template.render(**kwargs)
