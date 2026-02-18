"""
Text/LLM Model Configuration
Centralized config for all text-based pipeline stages and services.
"""

import os
from typing import Literal, Dict, Any
from dataclasses import dataclass

# ============================================================================
# TEXT MODEL PROVIDER OPTIONS
# ============================================================================

TextProvider = Literal['grok', 'claude', 'openai']

# ============================================================================
# CENTRALIZED TEXT MODEL CONFIGURATION
# ============================================================================

@dataclass
class TextModelConfig:
    """
    Configuration for all text-based AI models.

    Core pipeline stages (IDENTIFY, STRUCTURE, PERSONALIZE) can be set
    individually for fine-grained control. Supporting services (MODIFY,
    pattern discovery, session processor) all follow `default` — change
    one value to switch them all.

    NOTE: `identify` controls LangExtract (text-based identification).
    LangExtract only supports OpenAI-compatible providers (grok, openai).
    Setting this to 'claude' will crash the text pipeline — there is no
    fallback. Vision (images) always uses LangChain IDENTIFY stage.
    """

    # ── Core Pipeline Stages (set individually) ──────────────────────────
    identify: TextProvider = 'grok'       # IDENTIFY: LangExtract (text) + LangChain (vision)
    structure: TextProvider = 'grok'      # STRUCTURE: Instructor structured output
    personalize: TextProvider = 'grok'    # PERSONALIZE: LangChain personalization
    vision: TextProvider = 'openai'       # IDENTIFY (vision): image inputs (grok-3 lacks vision)

    # ── Default (MODIFY, pattern discovery, session processor) ────────────
    default: TextProvider = 'grok'

    @property
    def modify(self) -> TextProvider:
        return self.default

    @property
    def pattern_discovery(self) -> TextProvider:
        return self.default

    @property
    def session_processor(self) -> TextProvider:
        return self.default

    # ========================================================================
    # QUICK PRESETS
    # ========================================================================

    @classmethod
    def all_grok(cls):
        """Use Grok for everything — testing with $2.5k credits.
        Vision falls back to OpenAI because grok-3 lacks image support."""
        return cls(
            identify='grok',
            structure='grok',
            personalize='grok',
            vision='openai',
            default='grok',
        )

    @classmethod
    def all_claude(cls):
        """Use Claude for STRUCTURE + PERSONALIZE — production quality.
        WARNING: `identify` stays 'grok' because LangExtract requires an
        OpenAI-compatible provider. Setting it to 'claude' will crash."""
        return cls(
            identify='grok',
            structure='claude',
            personalize='claude',
            vision='claude',
            default='claude',
        )

    @classmethod
    def all_openai(cls):
        """Use OpenAI for everything"""
        return cls(
            identify='openai',
            structure='openai',
            personalize='openai',
            vision='openai',
            default='openai',
        )

    @classmethod
    def hybrid_optimized(cls):
        """Hybrid: Claude for complex tasks, Grok for simple"""
        return cls(
            identify='grok',         # LangExtract (text-only)
            structure='claude',      # Complex parsing — Claude better
            personalize='claude',    # Personalization — Claude better
            vision='openai',         # Image inputs — grok-3 lacks vision
            default='grok',          # MODIFY, patterns, etc. — Grok fine
        )


# ============================================================================
# ACTIVE CONFIGURATION - CHANGE THIS LINE TO SWITCH
# ============================================================================

CONFIG = TextModelConfig.all_grok()
# CONFIG = TextModelConfig.all_claude()
# CONFIG = TextModelConfig.hybrid_optimized()


# ============================================================================
# MODEL SPECIFICATIONS
# ============================================================================

TEXT_MODEL_SPECS: Dict[TextProvider, Dict[str, Any]] = {
    'grok': {
        'model_name': 'grok-3',
        'api_key_env': 'XAI_API_KEY',
        'base_url': 'https://api.x.ai/v1',
        'supports_vision': True,
        'supports_structured_output': True,
        'cost': 'low'  # Using credits
    },
    'claude': {
        'model_name': 'claude-sonnet-4-5-20250929',
        'api_key_env': 'ANTHROPIC_API_KEY',
        'base_url': None,
        'supports_vision': True,
        'supports_structured_output': True,
        'cost': 'high'
    },
    'openai': {
        'model_name': 'gpt-4o',
        'api_key_env': 'OPENAI_API_KEY',
        'base_url': None,
        'supports_vision': True,
        'supports_structured_output': True,
        'cost': 'medium'
    }
}

# Light/cheap models for simple inputs (used by dynamic complexity routing)
TEXT_MODEL_SPECS_LIGHT: Dict[TextProvider, Dict[str, Any]] = {
    'grok': {
        'model_name': 'grok-3-mini-beta',
        'api_key_env': 'XAI_API_KEY',
        'base_url': 'https://api.x.ai/v1',
        'supports_vision': False,
        'supports_structured_output': True,
        'cost': 'very_low'
    },
    'claude': {
        'model_name': 'claude-haiku-4-5-20251001',
        'api_key_env': 'ANTHROPIC_API_KEY',
        'base_url': None,
        'supports_vision': True,
        'supports_structured_output': True,
        'cost': 'low'
    },
    'openai': {
        'model_name': 'gpt-4o-mini',
        'api_key_env': 'OPENAI_API_KEY',
        'base_url': None,
        'supports_vision': True,
        'supports_structured_output': True,
        'cost': 'low'
    }
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_text_provider(component: str) -> TextProvider:
    """Get configured provider for a component"""
    return getattr(CONFIG, component)


def get_model_specs(provider: TextProvider) -> Dict[str, Any]:
    """Get model specifications for a provider"""
    return TEXT_MODEL_SPECS[provider]


def _create_model_from_specs(provider: TextProvider, specs: Dict[str, Any]):
    """Create an LLM instance from provider + specs dict."""
    api_key = os.getenv(specs['api_key_env'])
    if not api_key:
        raise ValueError(f"API key not found: {specs['api_key_env']}")

    if provider == 'claude':
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=specs['model_name'],
            api_key=api_key
        )
    elif provider in ['grok', 'openai']:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=specs['model_name'],
            api_key=api_key,
            base_url=specs['base_url']
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")


def create_text_model(component: str):
    """
    Create a standard LLM instance for a component.

    Args:
        component: Component name (e.g., 'identify', 'structure')

    Returns:
        Configured LLM instance
    """
    provider = get_text_provider(component)
    specs = get_model_specs(provider)
    return _create_model_from_specs(provider, specs)


def create_text_model_light(component: str):
    """
    Create a lightweight LLM instance for a component.
    Uses cheaper/faster models for simple inputs.

    Args:
        component: Component name (e.g., 'identify', 'structure')

    Returns:
        Configured lightweight LLM instance
    """
    provider = get_text_provider(component)
    specs = TEXT_MODEL_SPECS_LIGHT[provider]
    return _create_model_from_specs(provider, specs)


def create_instructor_client(component: str, light: bool = False):
    """
    Create an Instructor-patched client for a component.
    Returns (client, model_name, provider) tuple.

    Instructor wraps the raw provider SDK (OpenAI/Anthropic) to add
    automatic Pydantic validation retries on structured output calls.

    Args:
        component: Component name (e.g., 'structure')
        light: If True, use the lightweight model variant
    """
    import instructor

    provider = get_text_provider(component)
    specs = TEXT_MODEL_SPECS_LIGHT[provider] if light else TEXT_MODEL_SPECS[provider]
    api_key = os.getenv(specs['api_key_env'])
    if not api_key:
        raise ValueError(f"API key not found: {specs['api_key_env']}")

    if provider in ('grok', 'openai'):
        from openai import OpenAI
        raw_client = OpenAI(api_key=api_key, base_url=specs.get('base_url'))
        patched = instructor.from_openai(raw_client)
        return patched, specs['model_name'], provider
    elif provider == 'claude':
        from anthropic import Anthropic
        raw_client = Anthropic(api_key=api_key)
        patched = instructor.from_anthropic(raw_client)
        return patched, specs['model_name'], provider
    else:
        raise ValueError(f"Unsupported provider: {provider}")


def print_text_config():
    """Print current text model configuration"""
    print("\n" + "="*70)
    print("TEXT/LLM MODEL CONFIGURATION")
    print("="*70)

    def _model_line(component):
        provider = get_text_provider(component)
        standard = get_model_specs(provider)['model_name']
        light = TEXT_MODEL_SPECS_LIGHT[provider]['model_name']
        return f"{provider.upper()} ({standard} / {light})"

    print("\nPIPELINE STAGES:                    (standard / light)")
    print(f"  IDENTIFY:                     {_model_line('identify')}")
    print(f"  IDENTIFY (vision):            {_model_line('vision')}")
    print(f"  STRUCTURE:                    {_model_line('structure')}")
    print(f"  PERSONALIZE:                  {_model_line('personalize')}")
    default_provider = CONFIG.default.upper()
    default_model = get_model_specs(CONFIG.default)['model_name']
    print(f"\nDEFAULT ({default_provider} / {default_model}):")
    print(f"  MODIFY, Pattern Discovery, Session Processor")
    print("="*70 + "\n")
