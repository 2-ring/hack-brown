"""
Duckling HTTP client for deterministic temporal parsing.

Duckling is a Haskell microservice by Meta that parses natural language
temporal expressions into structured data. It runs as a Docker sidecar
and is called via HTTP POST to /parse.

Usage:
    client = DucklingClient()
    results = client.parse("next Tuesday at 3pm", reference_time=datetime.now(), timezone="America/New_York")
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

import requests

logger = logging.getLogger(__name__)

DUCKLING_URL = os.getenv("DUCKLING_URL", "http://localhost:8000")

# Timeout for Duckling HTTP calls (seconds)
_REQUEST_TIMEOUT = 5

# Dimensions we care about for calendar events
_CALENDAR_DIMS = ["time", "duration"]


class DucklingClient:
    """HTTP client for the Duckling temporal parsing service."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or DUCKLING_URL).rstrip("/")
        self._parse_url = f"{self.base_url}/parse"

    def parse(
        self,
        text: str,
        reference_time: Optional[datetime] = None,
        timezone: str = "America/New_York",
        locale: str = "en_US",
        dims: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Parse temporal expressions from text using Duckling.

        Args:
            text: Natural language text to parse (e.g., "next Tuesday at 3pm")
            reference_time: Reference time for resolving relative expressions.
                            Defaults to now. Passed as Unix epoch milliseconds.
            timezone: IANA timezone string for the reference time.
            locale: Locale string (e.g., "en_US", "en_GB").
            dims: Dimensions to extract. Defaults to ["time", "duration"].

        Returns:
            List of Duckling result dicts, each containing:
                - body: matched text substring
                - start/end: character offsets
                - dim: "time" or "duration"
                - value: resolved value with grain, type, etc.
                - latent: whether the match is implicit

        Raises:
            DucklingError: If the service is unavailable or returns an error.
        """
        if not text or not text.strip():
            return []

        ref_time = reference_time or datetime.now()
        # Duckling expects reference time as Unix epoch in milliseconds
        reftime_ms = int(ref_time.timestamp() * 1000)

        payload = {
            "text": text,
            "locale": locale,
            "tz": timezone,
            "reftime": str(reftime_ms),
            "dims": json.dumps(dims or _CALENDAR_DIMS),
        }

        try:
            response = requests.post(
                self._parse_url,
                data=payload,
                timeout=_REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.ConnectionError as e:
            raise DucklingError(
                f"Cannot connect to Duckling at {self.base_url}. "
                f"Is the Duckling service running? (docker-compose up duckling)"
            ) from e
        except requests.exceptions.Timeout as e:
            raise DucklingError(
                f"Duckling request timed out after {_REQUEST_TIMEOUT}s"
            ) from e
        except requests.exceptions.HTTPError as e:
            raise DucklingError(
                f"Duckling returned HTTP {response.status_code}: {response.text}"
            ) from e
        except (json.JSONDecodeError, ValueError) as e:
            raise DucklingError(
                f"Invalid response from Duckling: {response.text[:200]}"
            ) from e

    def parse_time(
        self,
        text: str,
        reference_time: Optional[datetime] = None,
        timezone: str = "America/New_York",
    ) -> List[Dict[str, Any]]:
        """Parse only time/date expressions (not duration)."""
        return self.parse(
            text=text,
            reference_time=reference_time,
            timezone=timezone,
            dims=["time"],
        )

    def parse_duration(
        self,
        text: str,
        reference_time: Optional[datetime] = None,
        timezone: str = "America/New_York",
    ) -> List[Dict[str, Any]]:
        """Parse only duration expressions."""
        return self.parse(
            text=text,
            reference_time=reference_time,
            timezone=timezone,
            dims=["duration"],
        )

    def is_available(self) -> bool:
        """Check if the Duckling service is reachable."""
        try:
            response = requests.post(
                self._parse_url,
                data={"text": "today", "locale": "en_US", "tz": "UTC", "dims": '["time"]'},
                timeout=2,
            )
            return response.status_code == 200
        except requests.exceptions.RequestException:
            return False


class DucklingError(Exception):
    """Raised when Duckling service is unavailable or returns an error."""
    pass
