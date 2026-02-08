"""
Configuration Module
Centralized AI model configuration for DropCal

Clean structure - one file per type:
- config/text.py   → Text/LLM models (agents 1-5, services)
- config/audio.py  → Audio transcription (Deepgram/OpenAI/Grok)
- config/image.py  → Image processing (future)
- config/web.py    → Web fetching (future)

Usage:
    from config.text import create_text_model
    from config.audio import get_audio_provider
"""

from .text import (
    create_text_model,
    get_text_provider,
    print_text_config,
    TextProvider
)

from .audio import (
    get_audio_provider,
    get_api_key,
    get_model,
    print_audio_config,
    AudioProvider
)

from .processing import ProcessingConfig

__all__ = [
    # Text/LLM
    'create_text_model',
    'get_text_provider',
    'print_text_config',
    'TextProvider',

    # Audio
    'get_audio_provider',
    'get_api_key',
    'get_model',
    'print_audio_config',
    'AudioProvider',

    # Processing limits
    'ProcessingConfig',
]
