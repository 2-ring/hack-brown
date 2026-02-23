"""
Audio Transcription Model Configuration
Centralized config for audio-to-text processing
"""

import os
from typing import Literal, Dict, Any
from dataclasses import dataclass

# ============================================================================
# AUDIO PROVIDER OPTIONS
# ============================================================================

AudioProvider = Literal['deepgram', 'openai', 'grok', 'vapi']

# ============================================================================
# AUDIO CONFIGURATION
# ============================================================================

@dataclass
class AudioConfig:
    """Configuration for audio transcription"""

    provider: AudioProvider = 'deepgram'

    @classmethod
    def use_deepgram(cls):
        """Use Deepgram - best timestamps, fastest"""
        return cls(provider='deepgram')

    @classmethod
    def use_openai(cls):
        """Use OpenAI Whisper"""
        return cls(provider='openai')

    @classmethod
    def use_grok(cls):
        """Use Grok's Whisper - uses Grok credits"""
        return cls(provider='grok')

    @classmethod
    def use_vapi(cls):
        """Use Vapi - voice AI platform"""
        return cls(provider='vapi')


# ============================================================================
# ACTIVE CONFIGURATION - CHANGE THIS LINE TO SWITCH
# ============================================================================

# AUDIO_CONFIG = AudioConfig.use_deepgram()
# AUDIO_CONFIG = AudioConfig.use_openai()
AUDIO_CONFIG = AudioConfig.use_grok()
# AUDIO_CONFIG = AudioConfig.use_vapi()


# ============================================================================
# AUDIO MODEL SPECIFICATIONS
# ============================================================================

AUDIO_MODEL_SPECS: Dict[AudioProvider, Dict[str, Any]] = {
    'deepgram': {
        'model_name': 'nova-2',
        'api_key_env': 'DEEPGRAM_API_KEY',
        'supports_timestamps': True,
        'max_file_size_mb': None,  # No limit
        'cost': 'low'
    },
    'openai': {
        'model_name': 'whisper-1',
        'api_key_env': 'OPENAI_API_KEY',
        'supports_timestamps': True,
        'max_file_size_mb': 25,
        'cost': 'medium'
    },
    'grok': {
        'model_name': 'whisper-large-v3',
        'api_key_env': 'XAI_API_KEY',
        'supports_timestamps': True,
        'max_file_size_mb': 25,
        'cost': 'low'  # Using credits
    },
    'vapi': {
        'model_name': 'vapi-transcription',
        'api_key_env': 'VAPI_PRIVATE_KEY',
        'public_key_env': 'VAPI_PUBLIC_KEY',
        'supports_timestamps': True,
        'max_file_size_mb': None,  # No limit
        'cost': 'low'
    }
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_audio_provider() -> AudioProvider:
    """Get configured audio provider"""
    # Check env variable override
    env_provider = os.getenv('AUDIO_PROVIDER')
    if env_provider:
        return env_provider
    return AUDIO_CONFIG.provider


def get_audio_specs(provider: AudioProvider = None) -> Dict[str, Any]:
    """Get audio model specifications"""
    provider = provider or get_audio_provider()
    return AUDIO_MODEL_SPECS[provider]


def get_api_key(provider: AudioProvider = None) -> str:
    """Get API key for audio provider"""
    provider = provider or get_audio_provider()
    specs = get_audio_specs(provider)
    api_key = os.getenv(specs['api_key_env'])
    if not api_key:
        raise ValueError(f"API key not found: {specs['api_key_env']}")
    return api_key


def get_model(provider: AudioProvider = None) -> str:
    """Get model name for audio provider"""
    provider = provider or get_audio_provider()
    specs = get_audio_specs(provider)
    return specs['model_name']


def print_audio_config():
    """Print current audio configuration"""
    provider = get_audio_provider()
    specs = get_audio_specs(provider)

    print("\nAUDIO TRANSCRIPTION:")
    print(f"  Provider:                      {provider.upper()}")
    print(f"  Model:                         {specs['model_name']}")
    print(f"  Timestamps:                    {'Yes' if specs['supports_timestamps'] else 'No'}")
    if specs['max_file_size_mb']:
        print(f"  Max file size:                 {specs['max_file_size_mb']}MB")
