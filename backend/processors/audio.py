"""
Audio/Voice Input Processor
Converts audio files to text using OpenAI Whisper API
"""

import os
import sys
from pathlib import Path
from typing import Set, Optional
from openai import OpenAI

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from input_processor import BaseInputProcessor, ProcessingResult, InputType
from logging_utils import log_processor_execution


class AudioProcessor(BaseInputProcessor):
    """
    Processes audio files (voice notes, recordings, etc.) into text
    using OpenAI Whisper API.
    """

    # Supported audio formats by Whisper API
    SUPPORTED_FORMATS: Set[str] = {
        '.mp3', '.mp4', '.mpeg', '.mpga',
        '.m4a', '.wav', '.webm'
    }

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the audio processor.

        Args:
            api_key: OpenAI API key. If None, uses OPENAI_API_KEY env variable
        """
        self.client = OpenAI(api_key=api_key)

    def supports_file(self, file_path: str) -> bool:
        """Check if file is a supported audio format"""
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.SUPPORTED_FORMATS

    @log_processor_execution("AudioProcessor")
    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Transcribe audio file to text using Whisper API.

        Args:
            file_path: Path to audio file
            **kwargs: Optional parameters:
                - language: Language code (e.g., 'en', 'es'). Auto-detected if not provided.
                - prompt: Optional text to guide the model's style
                - temperature: Sampling temperature (0-1)
                - response_format: 'text', 'json', 'verbose_json' (default: 'verbose_json')

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

        # Check file size (Whisper API has 25MB limit)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > 25:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"File too large: {file_size_mb:.2f}MB (max 25MB)"
            )

        try:
            # Get optional parameters
            language = kwargs.get('language')
            prompt = kwargs.get('prompt')
            temperature = kwargs.get('temperature', 0)
            response_format = kwargs.get('response_format', 'verbose_json')

            # Open and transcribe the audio file
            with open(file_path, 'rb') as audio_file:
                transcription_params = {
                    'model': 'whisper-1',
                    'file': audio_file,
                    'response_format': response_format,
                    'temperature': temperature
                }

                # Add optional parameters if provided
                if language:
                    transcription_params['language'] = language
                if prompt:
                    transcription_params['prompt'] = prompt

                response = self.client.audio.transcriptions.create(**transcription_params)

            # Extract text and metadata based on response format
            if response_format == 'verbose_json':
                text = response.text
                metadata = {
                    'language': response.language if hasattr(response, 'language') else None,
                    'duration': response.duration if hasattr(response, 'duration') else None,
                    'segments': len(response.segments) if hasattr(response, 'segments') else None,
                    'file_name': Path(file_path).name,
                    'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
                }
            else:
                # Simple text response
                text = str(response) if response_format == 'text' else response.text
                metadata = {
                    'file_name': Path(file_path).name,
                    'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
                }

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
                error=f"Transcription failed: {str(e)}"
            )

    def process_with_timestamps(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Transcribe audio with timestamp information for each segment.

        Args:
            file_path: Path to audio file
            **kwargs: Optional parameters (same as process())

        Returns:
            ProcessingResult with text and detailed timestamp metadata
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

        # Check file size (Whisper API has 25MB limit)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > 25:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"File too large: {file_size_mb:.2f}MB (max 25MB)"
            )

        try:
            # Get optional parameters
            language = kwargs.get('language')
            prompt = kwargs.get('prompt')
            temperature = kwargs.get('temperature', 0)

            # Single API call with timestamp granularity
            with open(file_path, 'rb') as audio_file:
                transcription_params = {
                    'model': 'whisper-1',
                    'file': audio_file,
                    'response_format': 'verbose_json',
                    'temperature': temperature,
                    'timestamp_granularities': ['segment']
                }

                # Add optional parameters if provided
                if language:
                    transcription_params['language'] = language
                if prompt:
                    transcription_params['prompt'] = prompt

                response = self.client.audio.transcriptions.create(**transcription_params)

            # Extract text and full metadata including timestamps
            text = response.text
            metadata = {
                'language': response.language if hasattr(response, 'language') else None,
                'duration': response.duration if hasattr(response, 'duration') else None,
                'file_name': Path(file_path).name,
                'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
            }

            # Add detailed segment information with timestamps
            if hasattr(response, 'segments'):
                metadata['segments_detail'] = [
                    {
                        'start': seg.start,
                        'end': seg.end,
                        'text': seg.text
                    }
                    for seg in response.segments
                ]
                metadata['segments'] = len(response.segments)

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
                error=f"Transcription with timestamps failed: {str(e)}"
            )
