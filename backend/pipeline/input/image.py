"""
Image Input Processor
Handles image files and prepares them for Claude Vision API
"""

import os
import base64
from pathlib import Path
from typing import Set

from .factory import BaseInputProcessor, ProcessingResult, InputType


class ImageProcessor(BaseInputProcessor):
    """
    Processes image files (screenshots, photos, flyers) for Claude Vision API.
    Returns the image as base64 for direct vision processing.
    """

    # Supported image formats
    SUPPORTED_FORMATS: Set[str] = {
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'
    }

    # Media type mapping
    MEDIA_TYPES = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    }

    def supports_file(self, file_path: str) -> bool:
        """Check if file is a supported image format"""
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.SUPPORTED_FORMATS

    def _get_media_type(self, file_path: str) -> str:
        """Get the media type for the image"""
        file_ext = Path(file_path).suffix.lower()
        return self.MEDIA_TYPES.get(file_ext, 'image/jpeg')

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Prepare image file for Claude Vision API processing.

        Args:
            file_path: Path to image file
            **kwargs: Optional parameters (currently unused)

        Returns:
            ProcessingResult with base64 encoded image in metadata
        """
        if not self.supports_file(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.IMAGE,
                success=False,
                error=f"Unsupported image format: {Path(file_path).suffix}"
            )

        if not os.path.exists(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.IMAGE,
                success=False,
                error=f"File not found: {file_path}"
            )

        from config.limits import FileLimits
        # Check file size
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > FileLimits.MAX_IMAGE_SIZE_MB:
            return ProcessingResult(
                text="",
                input_type=InputType.IMAGE,
                success=False,
                error=f"Image too large: {file_size_mb:.2f}MB (max {FileLimits.MAX_IMAGE_SIZE_MB}MB)"
            )

        try:
            # Read and encode image as base64
            with open(file_path, 'rb') as image_file:
                image_data = base64.b64encode(image_file.read()).decode('utf-8')

            # Return result with image data in metadata
            # The actual vision processing happens in the Flask endpoint
            return ProcessingResult(
                text="",  # No text yet - will be processed by vision API
                input_type=InputType.IMAGE,
                metadata={
                    'image_data': image_data,
                    'media_type': self._get_media_type(file_path),
                    'file_name': Path(file_path).name,
                    'file_size_mb': round(file_size_mb, 2),
                    'requires_vision': True  # Flag for endpoint to use vision API
                },
                success=True
            )

        except Exception as e:
            return ProcessingResult(
                text="",
                input_type=InputType.IMAGE,
                success=False,
                error=f"Image processing failed: {str(e)}"
            )
