"""
Text/LLM Model Configuration
Centralized config for all text-based AI agents and processors
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
    """Configuration for all text-based AI models"""

    # AI Pipeline Agents
    agent_1_identification: TextProvider = 'grok'
    agent_2_extraction: TextProvider = 'grok'
    agent_3_formatting: TextProvider = 'grok'
    agent_4_modification: TextProvider = 'grok'
    agent_5_preferences: TextProvider = 'grok'

    # Supporting Services
    pattern_discovery: TextProvider = 'grok'
    session_processor: TextProvider = 'grok'

    # ========================================================================
    # QUICK PRESETS
    # ========================================================================

    @classmethod
    def all_grok(cls):
        """Use Grok for everything - testing with $2.5k credits"""
        return cls(
            agent_1_identification='grok',
            agent_2_extraction='grok',
            agent_3_formatting='grok',
            agent_4_modification='grok',
            agent_5_preferences='grok',
            pattern_discovery='grok',
            session_processor='grok'
        )

    @classmethod
    def all_claude(cls):
        """Use Claude for everything - production quality"""
        return cls(
            agent_1_identification='claude',
            agent_2_extraction='claude',
            agent_3_formatting='claude',
            agent_4_modification='claude',
            agent_5_preferences='claude',
            pattern_discovery='claude',
            session_processor='claude'
        )

    @classmethod
    def hybrid_optimized(cls):
        """Hybrid: Claude for complex tasks, Grok for simple"""
        return cls(
            agent_1_identification='grok',      # Vision - Grok works
            agent_2_extraction='claude',        # Complex parsing - Claude better
            agent_3_formatting='grok',          # Simple formatting - Grok fine
            agent_4_modification='grok',        # Simple edits - Grok fine
            agent_5_preferences='claude',       # Personalization - Claude better
            pattern_discovery='claude',         # Pattern analysis - Claude better
            session_processor='grok'            # Conversations - Grok fine
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


def create_text_model(component: str):
    """
    Create an LLM instance for a component.

    Args:
        component: Component name (e.g., 'agent_1_identification')

    Returns:
        Configured LLM instance
    """
    provider = get_text_provider(component)
    specs = get_model_specs(provider)

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


def print_text_config():
    """Print current text model configuration"""
    print("\n" + "="*70)
    print("TEXT/LLM MODEL CONFIGURATION")
    print("="*70)
    print("\nAI PIPELINE AGENTS:")
    print(f"  Agent 1 (Identification):     {CONFIG.agent_1_identification.upper()}")
    print(f"  Agent 2 (Extraction):          {CONFIG.agent_2_extraction.upper()}")
    print(f"  Agent 3 (Formatting):          {CONFIG.agent_3_formatting.upper()}")
    print(f"  Agent 4 (Modification):        {CONFIG.agent_4_modification.upper()}")
    print(f"  Agent 5 (Preferences):         {CONFIG.agent_5_preferences.upper()}")
    print("\nSUPPORTING SERVICES:")
    print(f"  Pattern Discovery:             {CONFIG.pattern_discovery.upper()}")
    print(f"  Session Processor:             {CONFIG.session_processor.upper()}")
    print("="*70 + "\n")
