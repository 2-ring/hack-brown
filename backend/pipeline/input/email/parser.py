import re
from config.processing import ProcessingConfig


def strip_html(html: str) -> str:
    """Strip HTML tags to extract plain text."""
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    text = re.sub(r'</(p|div|tr|li|h[1-6])>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def build_email_text(subject: str, text_body: str, html_body: str) -> str:
    """
    Combine email parts into a single string for the processing pipeline.

    Prefers text_body over html_body. Prepends subject line.
    Truncates to MAX_TEXT_INPUT_LENGTH.
    """
    body = text_body.strip() if text_body and text_body.strip() else ''

    if not body and html_body and html_body.strip():
        body = strip_html(html_body)

    parts = []
    if subject and subject.strip():
        parts.append(f"Subject: {subject.strip()}")
    if body:
        parts.append(body)

    text = '\n\n'.join(parts)
    return text[:ProcessingConfig.MAX_TEXT_INPUT_LENGTH]
