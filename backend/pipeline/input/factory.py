"""
Input Processing Layer - Handles non-text inputs (audio, images, PDFs, etc.)
Converts them to text for downstream processing.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from enum import Enum


class InputType(Enum):
    """Supported input types"""
    AUDIO = "audio"
    IMAGE = "image"
    PDF = "pdf"
    TEXT = "text"
    DOCUMENT = "document"


class ProcessingResult:
    """Standardized result from input processing"""

    def __init__(
        self,
        text: str,
        input_type: InputType,
        metadata: Optional[Dict[str, Any]] = None,
        success: bool = True,
        error: Optional[str] = None
    ):
        self.text = text
        self.input_type = input_type
        self.metadata = metadata or {}
        self.success = success
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "text": self.text,
            "input_type": self.input_type.value,
            "metadata": self.metadata,
            "success": self.success,
            "error": self.error
        }


class BaseInputProcessor(ABC):
    """
    Abstract base class for input processors.
    Each processor handles one type of input (audio, image, PDF, etc.)
    """

    @abstractmethod
    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Process an input file and extract text.

        Args:
            file_path: Path to the input file
            **kwargs: Additional processor-specific options

        Returns:
            ProcessingResult with extracted text and metadata
        """
        pass

    @abstractmethod
    def supports_file(self, file_path: str) -> bool:
        """
        Check if this processor can handle the given file.

        Args:
            file_path: Path to the input file

        Returns:
            True if this processor can handle the file
        """
        pass


class InputProcessorFactory:
    """
    Factory class to route inputs to the appropriate processor.
    Handles processor registration and selection.
    """

    def __init__(self):
        self._processors: Dict[InputType, BaseInputProcessor] = {}

    def register_processor(self, input_type: InputType, processor: BaseInputProcessor):
        """Register a processor for a specific input type"""
        self._processors[input_type] = processor

    def get_processor(self, input_type: InputType) -> Optional[BaseInputProcessor]:
        """Get processor for a specific input type"""
        return self._processors.get(input_type)

    def process_file(self, file_path: str, input_type: InputType, **kwargs) -> ProcessingResult:
        """
        Process a file using the appropriate processor.

        Args:
            file_path: Path to the input file
            input_type: Type of input to process
            **kwargs: Additional processor-specific options

        Returns:
            ProcessingResult with extracted text
        """

        processor = self.get_processor(input_type)

        if not processor:
            return ProcessingResult(
                text="",
                input_type=input_type,
                success=False,
                error=f"No processor registered for input type: {input_type.value}"
            )

        if not processor.supports_file(file_path):
            return ProcessingResult(
                text="",
                input_type=input_type,
                success=False,
                error=f"Processor does not support file: {file_path}"
            )

        try:
            result = processor.process(file_path, **kwargs)
            return result
        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=input_type,
                success=False,
                error=f"Processing failed: {str(e)}"
            )

    def auto_process_file(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Automatically detect file type and process.

        Args:
            file_path: Path to the input file
            **kwargs: Additional processor-specific options

        Returns:
            ProcessingResult with extracted text
        """

        # Try each processor to see which one supports the file
        for input_type, processor in self._processors.items():
            if processor.supports_file(file_path):
                return self.process_file(file_path, input_type, **kwargs)

        return ProcessingResult(
            text="",
            input_type=InputType.TEXT,
            success=False,
            error=f"No processor found that supports file: {file_path}"
        )
