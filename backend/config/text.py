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

    Core pipeline stages (EXTRACT, PERSONALIZE) can be set individually.
    Supporting services (MODIFY, pattern discovery) follow `default`.
    """

    # ── Core Pipeline Stages ──────────────────────────────────────────────
    extract: TextProvider = 'grok'        # EXTRACT: unified extraction (1 LLM call)
    personalize: TextProvider = 'grok'    # PERSONALIZE: apply user preferences
    vision: TextProvider = 'openai'       # Vision path for image inputs

    # ── Default (MODIFY, pattern discovery) ───────────────────────────────
    default: TextProvider = 'grok'

    @property
    def modify(self) -> TextProvider:
        return self.default

    @property
    def pattern_discovery(self) -> TextProvider:
        return self.default

    # ========================================================================
    # QUICK PRESETS
    # ========================================================================

    @classmethod
    def all_grok(cls):
        """Use Grok for everything — testing with $2.5k credits.
        Vision falls back to OpenAI because grok-3 lacks image support."""
        return cls(
            extract='grok',
            personalize='grok',
            vision='openai',
            default='grok',
        )

    @classmethod
    def all_claude(cls):
        """Use Claude for everything — production quality."""
        return cls(
            extract='claude',
            personalize='claude',
            vision='claude',
            default='claude',
        )

    @classmethod
    def all_openai(cls):
        """Use OpenAI for everything."""
        return cls(
            extract='openai',
            personalize='openai',
            vision='openai',
            default='openai',
        )

    @classmethod
    def hybrid_optimized(cls):
        """Hybrid: Claude for complex tasks, Grok for simple."""
        return cls(
            extract='grok',
            personalize='claude',
            vision='openai',
            default='grok',
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
        component: Component name (e.g., 'extract', 'personalize', 'vision', 'modify')

    Returns:
        Configured LLM instance
    """
    provider = get_text_provider(component)
    specs = get_model_specs(provider)
    return _create_model_from_specs(provider, specs)


def print_text_config():
    """Print current text model configuration."""
    print("\n" + "="*70)
    print("TEXT/LLM MODEL CONFIGURATION")
    print("="*70)

    def _model_line(component):
        provider = get_text_provider(component)
        model = get_model_specs(provider)['model_name']
        return f"{provider.upper()} ({model})"

    print("\nPIPELINE STAGES:")
    print(f"  EXTRACT:                      {_model_line('extract')}")
    print(f"  EXTRACT (vision):             {_model_line('vision')}")
    print(f"  PERSONALIZE:                  {_model_line('personalize')}")
    default_provider = CONFIG.default.upper()
    default_model = get_model_specs(CONFIG.default)['model_name']
    print(f"\nDEFAULT ({default_provider} / {default_model}):")
    print(f"  MODIFY, Pattern Discovery")
    print("="*70 + "\n")
