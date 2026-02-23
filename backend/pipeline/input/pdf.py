"""
PDF Input Processor
Hybrid approach: Extract text first, fallback to vision if needed
"""

import os
import base64
from pathlib import Path
from typing import List, Dict, Any

from .factory import BaseInputProcessor, ProcessingResult, InputType
from config.limits import FileLimits, TextLimits, PDFLimits


class PDFProcessor(BaseInputProcessor):
    """
    Processes PDF files using a hybrid approach:
    1. Try structured text extraction with Docling (preserves tables and headings)
    2. If text is insufficient, render to images for vision processing
    """

    SUPPORTED_FORMATS = {'.pdf'}
    MIN_TEXT_LENGTH = TextLimits.PDF_MIN_TEXT_LENGTH

    def __init__(self):
        """Initialize PDF processor with required libraries"""
        self.has_docling = False
        self.has_pdf2image = False

        # Try to import Docling for structured text extraction
        try:
            from docling.document_converter import DocumentConverter
            self.has_docling = True
        except ImportError:
            pass

        # Try to import pdf2image for rendering
        try:
            from pdf2image import convert_from_path
            self.has_pdf2image = True
        except ImportError:
            pass

    def supports_file(self, file_path: str) -> bool:
        """Check if file is a PDF"""
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.SUPPORTED_FORMATS

    def _extract_text(self, file_path: str) -> str:
        """
        Extract text from PDF using Docling.
        Preserves tables as Markdown and maintains document structure.
        Returns empty string if extraction fails.
        """
        if not self.has_docling:
            return ""

        try:
            from docling.document_converter import DocumentConverter

            converter = DocumentConverter()
            result = converter.convert(file_path)
            text = result.document.export_to_markdown()

            return text or ""

        except Exception as e:
            print(f"Text extraction failed: {e}")
            return ""

    def _has_sufficient_text(self, text: str) -> bool:
        """
        Check if extracted text is sufficient for processing.
        Returns False if text is too short or mostly gibberish.
        """
        if not text:
            return False

        # Remove whitespace and check length
        cleaned = text.strip()
        if len(cleaned) < self.MIN_TEXT_LENGTH:
            return False

        # Check if text has reasonable word-like content
        # (not just random characters or formatting artifacts)
        words = cleaned.split()
        if len(words) < 10:
            return False

        return True

    def _render_to_images(self, file_path: str, max_pages: int = 5) -> List[Dict[str, str]]:
        """
        Render PDF pages to images for vision processing.
        Returns list of dicts with base64 encoded images.
        """
        if not self.has_pdf2image:
            return []

        try:
            from pdf2image import convert_from_path

            # Convert PDF to images (limit to first N pages for demo)
            images = convert_from_path(
                file_path,
                dpi=PDFLimits.RENDER_DPI,
                fmt='jpeg',
                first_page=1,
                last_page=max_pages
            )

            # Convert images to base64
            image_data_list = []
            for i, image in enumerate(images):
                # Convert PIL image to bytes
                from io import BytesIO
                buffer = BytesIO()
                image.save(buffer, format='JPEG', quality=85)
                image_bytes = buffer.getvalue()

                # Encode as base64
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')

                image_data_list.append({
                    'page': i + 1,
                    'image_data': image_b64,
                    'media_type': 'image/jpeg'
                })

            return image_data_list

        except Exception as e:
            print(f"PDF rendering failed: {e}")
            return []

    def process(self, file_path: str, **kwargs) -> ProcessingResult:
        """
        Process PDF using hybrid approach.

        Args:
            file_path: Path to PDF file
            **kwargs: Optional parameters:
                - force_vision: Skip text extraction, go straight to vision
                - max_pages: Maximum pages to process (default: 5)

        Returns:
            ProcessingResult with either extracted text or image data
        """
        if not self.supports_file(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.PDF,
                success=False,
                error=f"Not a PDF file: {Path(file_path).suffix}"
            )

        if not os.path.exists(file_path):
            return ProcessingResult(
                text="",
                input_type=InputType.PDF,
                success=False,
                error=f"File not found: {file_path}"
            )

        # Check file size
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > FileLimits.MAX_PDF_SIZE_MB:
            return ProcessingResult(
                text="",
                input_type=InputType.PDF,
                success=False,
                error=f"PDF too large: {file_size_mb:.2f}MB (max {FileLimits.MAX_PDF_SIZE_MB}MB)"
            )

        force_vision = kwargs.get('force_vision', False)
        max_pages = kwargs.get('max_pages', PDFLimits.MAX_PAGES_TO_RENDER)

        # Strategy 1: Try text extraction first (unless forced to use vision)
        if not force_vision:
            text = self._extract_text(file_path)

            if self._has_sufficient_text(text):
                # Success! We got good text content
                return ProcessingResult(
                    text=text,
                    input_type=InputType.PDF,
                    metadata={
                        'file_name': Path(file_path).name,
                        'file_size_mb': round(file_size_mb, 2),
                        'extraction_method': 'docling',
                        'char_count': len(text)
                    },
                    success=True
                )

        # Strategy 2: Text extraction failed or insufficient, use vision
        images = self._render_to_images(file_path, max_pages=max_pages)

        if not images:
            # Both methods failed
            error_msg = "PDF processing failed. "
            if not self.has_docling:
                error_msg += "Docling not installed for text extraction. "
            if not self.has_pdf2image:
                error_msg += "pdf2image not installed for image rendering."

            return ProcessingResult(
                text="",
                input_type=InputType.PDF,
                success=False,
                error=error_msg
            )

        # Return images for vision processing
        return ProcessingResult(
            text="",  # No text yet - will be processed by vision API
            input_type=InputType.PDF,
            metadata={
                'file_name': Path(file_path).name,
                'file_size_mb': round(file_size_mb, 2),
                'extraction_method': 'vision',
                'pages': images,  # List of base64 encoded page images
                'page_count': len(images),
                'requires_vision': True
            },
            success=True
        )
