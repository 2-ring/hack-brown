"""
Audio/Voice Input Processor
Converts audio files to text using Deepgram API
"""

import os
from pathlib import Path
from typing import Set, Optional
from deepgram import DeepgramClient, PrerecordedOptions, FileSource

from .factory import BaseInputProcessor, ProcessingResult, InputType


class AudioProcessor(BaseInputProcessor):
    """
    Processes audio files (voice notes, recordings, etc.) into text
    using Deepgram API.
    """

    # Supported audio formats by Deepgram
    SUPPORTED_FORMATS: Set[str] = {
        '.mp3', '.mp4', '.mpeg', '.mpga',
        '.m4a', '.wav', '.webm', '.ogg', '.flac'
    }

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the audio processor.

        Args:
            api_key: Deepgram API key. If None, uses DEEPGRAM_API_KEY env variable
        """
        self.client = DeepgramClient(api_key=api_key or os.getenv('DEEPGRAM_API_KEY'))

    def supports_file(self, file_path: str) -> bool:
        """Check if file is a supported audio format"""
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.SUPPORTED_FORMATS

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Transcribe audio file to text using Deepgram API.

        Args:
            file_path: Path to audio file
            **kwargs: Optional parameters:
                - language: Language code (e.g., 'en', 'es'). Auto-detected if not provided.
                - model: Deepgram model (default: 'nova-2')
                - smart_format: Enable smart formatting (default: True)

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

        try:
            # Get optional parameters
            language = kwargs.get('language', 'en')
            model = kwargs.get('model', 'nova-2')
            smart_format = kwargs.get('smart_format', True)

            # Read audio file
            with open(file_path, 'rb') as audio_file:
                buffer_data = audio_file.read()

            payload: FileSource = {
                "buffer": buffer_data,
            }

            # Configure transcription options
            options = PrerecordedOptions(
                model=model,
                language=language,
                smart_format=smart_format,
                punctuate=True,
                paragraphs=True,
                utterances=True
            )

            # Transcribe
            response = self.client.listen.prerecorded.v("1").transcribe_file(payload, options)

            # Extract transcript from response
            if response.results and response.results.channels:
                channel = response.results.channels[0]
                if channel.alternatives:
                    text = channel.alternatives[0].transcript

                    # Extract metadata
                    metadata = {
                        'language': language,
                        'model': model,
                        'confidence': channel.alternatives[0].confidence if hasattr(channel.alternatives[0], 'confidence') else None,
                        'file_name': Path(file_path).name,
                        'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
                    }

                    # Add duration if available
                    if hasattr(response.metadata, 'duration'):
                        metadata['duration'] = response.metadata.duration

                    return ProcessingResult(
                        text=text,
                        input_type=InputType.AUDIO,
                        metadata=metadata,
                        success=True
                    )

            # No transcription results
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error="No transcription results returned"
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
        Transcribe audio with timestamp information for each word/utterance.

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

        try:
            # Get optional parameters
            language = kwargs.get('language', 'en')
            model = kwargs.get('model', 'nova-2')
            smart_format = kwargs.get('smart_format', True)

            # Read audio file
            with open(file_path, 'rb') as audio_file:
                buffer_data = audio_file.read()

            payload: FileSource = {
                "buffer": buffer_data,
            }

            # Configure transcription options with word-level timestamps
            options = PrerecordedOptions(
                model=model,
                language=language,
                smart_format=smart_format,
                punctuate=True,
                paragraphs=True,
                utterances=True,
                words=True  # Enable word-level timestamps
            )

            # Transcribe
            response = self.client.listen.prerecorded.v("1").transcribe_file(payload, options)

            # Extract transcript and timestamps
            if response.results and response.results.channels:
                channel = response.results.channels[0]
                if channel.alternatives:
                    text = channel.alternatives[0].transcript

                    # Extract metadata
                    metadata = {
                        'language': language,
                        'model': model,
                        'confidence': channel.alternatives[0].confidence if hasattr(channel.alternatives[0], 'confidence') else None,
                        'file_name': Path(file_path).name,
                        'file_size_mb': round(os.path.getsize(file_path) / (1024 * 1024), 2)
                    }

                    # Add duration if available
                    if hasattr(response.metadata, 'duration'):
                        metadata['duration'] = response.metadata.duration

                    # Add word-level timestamps if available
                    if hasattr(channel.alternatives[0], 'words') and channel.alternatives[0].words:
                        metadata['words_detail'] = [
                            {
                                'word': word.word,
                                'start': word.start,
                                'end': word.end,
                                'confidence': word.confidence if hasattr(word, 'confidence') else None
                            }
                            for word in channel.alternatives[0].words
                        ]
                        metadata['word_count'] = len(channel.alternatives[0].words)

                    # Add utterance-level timestamps if available
                    if hasattr(response.results, 'utterances') and response.results.utterances:
                        metadata['utterances_detail'] = [
                            {
                                'start': utt.start,
                                'end': utt.end,
                                'text': utt.transcript,
                                'confidence': utt.confidence if hasattr(utt, 'confidence') else None
                            }
                            for utt in response.results.utterances
                        ]
                        metadata['utterances'] = len(response.results.utterances)

                    return ProcessingResult(
                        text=text,
                        input_type=InputType.AUDIO,
                        metadata=metadata,
                        success=True
                    )

            # No transcription results
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error="No transcription results with timestamps returned"
            )

        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=InputType.AUDIO,
                success=False,
                error=f"Transcription with timestamps failed: {str(e)}"
            )
