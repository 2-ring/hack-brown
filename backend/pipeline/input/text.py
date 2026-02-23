"""
Text File Input Processor
Handles plain text files (.txt, .eml, etc.)
"""

import os
from pathlib import Path
from typing import Set

from .factory import BaseInputProcessor, ProcessingResult, InputType


class TextFileProcessor(BaseInputProcessor):
    """
    Processes plain text files.
    Simply reads the file content and returns it as text.
    """

    # Supported text file formats
    SUPPORTED_FORMATS: Set[str] = {
        '.txt', '.text', '.eml', '.email', '.md', '.markdown'
    }

    def supports_file(self, file_path: str) -> bool:
        """Check if file is a supported text format"""
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.SUPPORTED_FORMATS

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Read text file and extract content.

        Args:
            file_path: Path to text file
            **kwargs: Optional parameters:
                - encoding: Text encoding (default: 'utf-8')
                - max_size_mb: Max file size in MB (default: 10)

        Returns:
            ProcessingResult with extracted text
        """
        if not self.supports_file(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.TEXT,
                success=False,
                error=f"Unsupported text format: {Path(file_path).suffix}"
            )

        if not os.path.exists(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.TEXT,
                success=False,
                error=f"File not found: {file_path}"
            )

        from config.limits import FileLimits
        # Check file size
        max_size_mb = kwargs.get('max_size_mb', FileLimits.MAX_TEXT_FILE_SIZE_MB)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > max_size_mb:
            return ProcessingResult(
                text="",
                input_type=InputType.TEXT,
                success=False,
                error=f"File too large: {file_size_mb:.2f}MB (max {max_size_mb}MB)"
            )

        try:
            # Get encoding
            encoding = kwargs.get('encoding', 'utf-8')

            # Read file content
            with open(file_path, 'r', encoding=encoding, errors='replace') as f:
                text = f.read()

            # Check if file is empty
            if not text.strip():
                return ProcessingResult(
                    text="",
                    input_type=InputType.TEXT,
                    success=False,
                    error="File is empty"
                )

            return ProcessingResult(
                text=text,
                input_type=InputType.TEXT,
                metadata={
                    'file_name': Path(file_path).name,
                    'file_size_mb': round(file_size_mb, 2),
                    'encoding': encoding,
                    'char_count': len(text),
                    'line_count': text.count('\n') + 1
                },
                success=True
            )

        except UnicodeDecodeError as e:
            return ProcessingResult(
                text="",
                input_type=InputType.TEXT,
                success=False,
                error=f"Encoding error: {str(e)}. Try specifying a different encoding."
            )
        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=InputType.TEXT,
                success=False,
                error=f"Text file processing failed: {str(e)}"
            )
