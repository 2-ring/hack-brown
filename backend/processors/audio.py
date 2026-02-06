"""
Audio/Voice Input Processor
Multi-provider audio transcription (Deepgram, OpenAI Whisper, Grok)
"""

import os
from pathlib import Path
from typing import Set, Optional
from config.audio import get_audio_provider, get_api_key, get_model

from .factory import BaseInputProcessor, ProcessingResult, InputType


class AudioProcessor(BaseInputProcessor):
    """
    Processes audio files (voice notes, recordings, etc.) into text.
    Supports multiple providers: Deepgram, OpenAI Whisper, Grok
    """

    # Supported audio formats (union of all providers)
    SUPPORTED_FORMATS: Set[str] = {
        '.mp3', '.mp4', '.mpeg', '.mpga',
        '.m4a', '.wav', '.webm', '.ogg', '.flac'
    }

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the audio processor with the configured provider.

        Args:
            api_key: Optional API key override. If None, uses config/env
        """
        self.provider = get_audio_provider()
        self.api_key = api_key or get_api_key(self.provider)
        self.model = get_model(self.provider)

        # Initialize provider-specific client
        if self.provider == 'deepgram':
            from deepgram import DeepgramClient
            # Deepgram requires env variable
            os.environ['DEEPGRAM_API_KEY'] = self.api_key
            self.client = DeepgramClient()
        elif self.provider == 'openai':
            from openai import OpenAI
            self.client = OpenAI(api_key=self.api_key)
        elif self.provider == 'grok':
            from openai import OpenAI
            # Grok uses OpenAI-compatible API
            self.client = OpenAI(
                api_key=self.api_key,
                base_url="https://api.x.ai/v1"
            )

    def supports_file(self, file_path: str) -> bool:
        """Check if file is a supported audio format"""
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.SUPPORTED_FORMATS

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Transcribe audio file to text using the configured provider.

        Args:
            file_path: Path to audio file
            **kwargs: Optional parameters (provider-specific)

        Returns:
            ProcessingResult with transcribed text and metadata
        """
        if not self.supports_file(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"Unsupported audio format: {Path(file_path).suffix}"
            )

        if not os.path.exists(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"File not found: {file_path}"
            )

        # Route to provider-specific implementation
        if self.provider == 'deepgram':
            return self._process_deepgram(file_path, **kwargs)
        elif self.provider in ['openai', 'grok']:
            return self._process_openai_compatible(file_path, **kwargs)
        else:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"Unsupported audio provider: {self.provider}"
            )

    def _process_deepgram(self, file_path: str, **kwargs) -> ProcessingResult:
        """Process audio using Deepgram"""
        try:
            language = kwargs.get('language', 'en')
            smart_format = kwargs.get('smart_format', True)

            # Read audio file
            with open(file_path, 'rb') as audio_file:
                buffer_data = audio_file.read()

            # Configure transcription options
            options = {
                "model": self.model,
                "language": language,
                "smart_format": smart_format,
                "punctuate": True
            }

            # Transcribe
            payload = {"buffer": buffer_data}
            response = self.client.listen.rest.v("1").transcribe_file(payload, options)

            # Extract transcript
            if hasattr(response, 'results') and response.results.channels:
                channel = response.results.channels[0]
                if channel.alternatives:
                    text = channel.alternatives[0].transcript

                    metadata = {
                        'provider': 'deepgram',
                        'model': self.model,
                        'language': language,
                        'file_name': Path(file_path).name,
                        'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
                    }

                    return ProcessingResult(
                        text=text,
                        input_type=InputType.AUDIO,
                        metadata=metadata,
                        success=True
                    )

            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error="No transcription results returned from Deepgram"
            )

        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"Deepgram transcription failed: {str(e)}"
            )

    def _process_openai_compatible(self, file_path: str, **kwargs) -> ProcessingResult:
        """Process audio using OpenAI Whisper or Grok (OpenAI-compatible)"""
        try:
            language = kwargs.get('language')
            prompt = kwargs.get('prompt')
            temperature = kwargs.get('temperature', 0)

            # Check file size (25MB limit for OpenAI/Grok)
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            if file_size_mb > 25:
                return ProcessingResult(
                    text="",
                    input_type=InputType.AUDIO,
                    success=False,
                    error=f"File too large: {file_size_mb:.2f}MB (max 25MB)"
                )

            # Transcribe
            with open(file_path, 'rb') as audio_file:
                transcription_params = {
                    'model': self.model,
                    'file': audio_file,
                    'response_format': 'text',
                    'temperature': temperature
                }

                if language:
                    transcription_params['language'] = language
                if prompt:
                    transcription_params['prompt'] = prompt

                response = self.client.audio.transcriptions.create(**transcription_params)

            # Extract text
            text = response if isinstance(response, str) else response.text

            metadata = {
                'provider': self.provider,
                'model': self.model,
                'file_name': Path(file_path).name,
                'file_size_mb': round(file_size_mb, 2)
            }

            if language:
                metadata['language'] = language

            return ProcessingResult(
                text=text,
                input_type=InputType.AUDIO,
                metadata=metadata,
                success=True
            )

        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"{self.provider.capitalize()} transcription failed: {str(e)}"
            )

    def process_with_timestamps(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Transcribe audio with timestamp information.
        Note: Timestamp support varies by provider.
        """
        if not self.supports_file(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"Unsupported audio format: {Path(file_path).suffix}"
            )

        if not os.path.exists(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"File not found: {file_path}"
            )

        # Deepgram has best timestamp support
        if self.provider == 'deepgram':
            return self._process_deepgram_with_timestamps(file_path, **kwargs)
        elif self.provider in ['openai', 'grok']:
            # OpenAI Whisper has limited timestamp support
            return self._process_openai_with_timestamps(file_path, **kwargs)
        else:
            return self.process(file_path, **kwargs)  # Fallback to basic transcription

    def _process_deepgram_with_timestamps(self, file_path: str, **kwargs) -> ProcessingResult:
        """Deepgram with word-level timestamps"""
        try:
            language = kwargs.get('language', 'en')
            smart_format = kwargs.get('smart_format', True)

            with open(file_path, 'rb') as audio_file:
                buffer_data = audio_file.read()

            options = {
                "model": self.model,
                "language": language,
                "smart_format": smart_format,
                "punctuate": True,
                "utterances": True,
                "words": True  # Word-level timestamps
            }

            payload = {"buffer": buffer_data}
            response = self.client.listen.rest.v("1").transcribe_file(payload, options)

            if hasattr(response, 'results') and response.results.channels:
                channel = response.results.channels[0]
                if channel.alternatives:
                    text = channel.alternatives[0].transcript

                    metadata = {
                        'provider': 'deepgram',
                        'model': self.model,
                        'language': language,
                        'file_name': Path(file_path).name,
                        'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
                    }

                    # Add word-level timestamps
                    if hasattr(channel.alternatives[0], 'words') and channel.alternatives[0].words:
                        metadata['words_detail'] = [
                            {
                                'word': word.word,
                                'start': word.start,
                                'end': word.end
                            }
                            for word in channel.alternatives[0].words
                        ]

                    return ProcessingResult(
                        text=text,
                        input_type=InputType.AUDIO,
                        metadata=metadata,
                        success=True
                    )

            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error="No transcription results with timestamps"
            )

        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"Timestamp transcription failed: {str(e)}"
            )

    def _process_openai_with_timestamps(self, file_path: str, **kwargs) -> ProcessingResult:
        """OpenAI/Grok with segment-level timestamps (limited support)"""
        try:
            language = kwargs.get('language')

            with open(file_path, 'rb') as audio_file:
                transcription_params = {
                    'model': self.model,
                    'file': audio_file,
                    'response_format': 'verbose_json',
                    'timestamp_granularities': ['segment']
                }

                if language:
                    transcription_params['language'] = language

                response = self.client.audio.transcriptions.create(**transcription_params)

            text = response.text
            metadata = {
                'provider': self.provider,
                'model': self.model,
                'file_name': Path(file_path).name,
                'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
            }

            # Add segment timestamps if available
            if hasattr(response, 'segments') and response.segments:
                metadata['segments_detail'] = [
                    {
                        'start': seg.start,
                        'end': seg.end,
                        'text': seg.text
                    }
                    for seg in response.segments
                ]

            return ProcessingResult(
                text=text,
                input_type=InputType.AUDIO,
                metadata=metadata,
                success=True
            )

        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"Timestamp transcription failed: {str(e)}"
            )
