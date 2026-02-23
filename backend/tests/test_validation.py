"""
Unit tests for Pydantic model validators.
Tests field validators and model validators for all extraction models.
"""

import pytest
from pydantic import ValidationError
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from pipeline.models import (
    ExtractedFacts, RecurrenceInfo,
    CalendarEvent, CalendarDateTime
)
from pipeline.extraction.validation_utils import (
    is_valid_iso_date, is_valid_time, is_valid_iana_timezone,
    is_valid_iso8601_datetime, validate_rrule_basic, truncate_title, count_words
)


class TestExtractedFactsValidation:
    """Test ExtractedFacts validators"""

    def test_valid_date(self):
        """Valid YYYY-MM-DD date should pass"""
        facts = ExtractedFacts(
            title="Test Event",
            date="2026-02-05",
            recurrence=RecurrenceInfo(is_recurring=False)
        )
        assert facts.date == "2026-02-05"

    def test_invalid_date_format(self):
        """Invalid date format should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            ExtractedFacts(
                title="Test Event",
                date="02/05/2026",  # Wrong format
                recurrence=RecurrenceInfo(is_recurring=False)
            )

        errors = exc_info.value.errors()
        assert any('YYYY-MM-DD' in str(e['msg']) for e in errors)

    def test_invalid_date_value(self):
        """Invalid date value should raise ValidationError"""
        with pytest.raises(ValidationError):
            ExtractedFacts(
                title="Test Event",
                date="2026-02-31",  # Invalid day
                recurrence=RecurrenceInfo(is_recurring=False)
            )

    def test_none_date(self):
        """None date should be allowed (optional field)"""
        facts = ExtractedFacts(
            title="Test Event",
            date=None,
            recurrence=RecurrenceInfo(is_recurring=False)
        )
        assert facts.date is None

    def test_valid_time(self):
        """Valid HH:MM:SS time should pass"""
        facts = ExtractedFacts(
            title="Test Event",
            time="14:30:00",
            recurrence=RecurrenceInfo(is_recurring=False)
        )
        assert facts.time == "14:30:00"

    def test_invalid_time_format(self):
        """Invalid time format should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            ExtractedFacts(
                title="Test Event",
                time="2:30 PM",  # Wrong format
                recurrence=RecurrenceInfo(is_recurring=False)
            )

        errors = exc_info.value.errors()
        assert any('HH:MM:SS' in str(e['msg']) for e in errors)

    def test_invalid_time_hour(self):
        """Invalid hour should raise ValidationError"""
        with pytest.raises(ValidationError):
            ExtractedFacts(
                title="Test Event",
                time="25:00:00",  # Invalid hour
                recurrence=RecurrenceInfo(is_recurring=False)
            )

    def test_none_time(self):
        """None time should be allowed (optional field)"""
        facts = ExtractedFacts(
            title="Test Event",
            time=None,
            recurrence=RecurrenceInfo(is_recurring=False)
        )
        assert facts.time is None

    def test_title_truncation(self):
        """Title over 100 chars should be truncated"""
        long_title = "A" * 150
        facts = ExtractedFacts(
            title=long_title,
            recurrence=RecurrenceInfo(is_recurring=False)
        )
        assert len(facts.title) == 100
        assert facts.title.endswith("...")

    def test_empty_title(self):
        """Empty title should raise ValidationError"""
        with pytest.raises(ValidationError):
            ExtractedFacts(
                title="",
                recurrence=RecurrenceInfo(is_recurring=False)
            )

    def test_whitespace_only_title(self):
        """Whitespace-only title should raise ValidationError"""
        with pytest.raises(ValidationError):
            ExtractedFacts(
                title="   ",
                recurrence=RecurrenceInfo(is_recurring=False)
            )

    def test_end_time_validation(self):
        """End time should follow same validation as time"""
        facts = ExtractedFacts(
            title="Test Event",
            end_time="15:30:00",
            recurrence=RecurrenceInfo(is_recurring=False)
        )
        assert facts.end_time == "15:30:00"

        with pytest.raises(ValidationError):
            ExtractedFacts(
                title="Test Event",
                end_time="3:30 PM",
                recurrence=RecurrenceInfo(is_recurring=False)
            )


class TestCalendarDateTimeValidation:
    """Test CalendarDateTime validators"""

    def test_valid_datetime_with_offset(self):
        """Valid ISO 8601 datetime with timezone offset should pass"""
        dt = CalendarDateTime(
            dateTime="2026-02-05T14:00:00-05:00",
            timeZone="America/New_York"
        )
        assert dt.dateTime == "2026-02-05T14:00:00-05:00"

    def test_valid_datetime_with_z(self):
        """Valid ISO 8601 datetime with Z should pass"""
        dt = CalendarDateTime(
            dateTime="2026-02-05T14:00:00Z",
            timeZone="UTC"
        )
        assert dt.dateTime == "2026-02-05T14:00:00Z"

    def test_invalid_datetime_missing_t(self):
        """Datetime without T separator should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            CalendarDateTime(
                dateTime="2026-02-05 14:00:00",  # Missing T
                timeZone="America/New_York"
            )

        errors = exc_info.value.errors()
        assert any('ISO 8601' in str(e['msg']) for e in errors)

    def test_invalid_datetime_missing_timezone(self):
        """Datetime without timezone should raise ValidationError"""
        with pytest.raises(ValidationError):
            CalendarDateTime(
                dateTime="2026-02-05T14:00:00",  # No timezone
                timeZone="America/New_York"
            )

    def test_valid_timezone(self):
        """Valid IANA timezone should pass"""
        dt = CalendarDateTime(
            dateTime="2026-02-05T14:00:00-05:00",
            timeZone="America/New_York"
        )
        assert dt.timeZone == "America/New_York"

    def test_invalid_timezone(self):
        """Invalid timezone should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            CalendarDateTime(
                dateTime="2026-02-05T14:00:00-05:00",
                timeZone="Invalid/Timezone"
            )

        errors = exc_info.value.errors()
        assert any('IANA timezone' in str(e['msg']) for e in errors)

    def test_common_timezone_formats(self):
        """Test various common IANA timezones"""
        valid_timezones = [
            "America/New_York",
            "America/Chicago",
            "America/Los_Angeles",
            "UTC",
            "Europe/London",
            "Asia/Tokyo"
        ]

        for tz in valid_timezones:
            dt = CalendarDateTime(
                dateTime="2026-02-05T14:00:00Z",
                timeZone=tz
            )
            assert dt.timeZone == tz


class TestCalendarEventValidation:
    """Test CalendarEvent validators"""

    def test_valid_summary(self):
        """Valid summary should pass"""
        event = CalendarEvent(
            summary="Test Event",
            start=CalendarDateTime(
                dateTime="2026-02-05T14:00:00-05:00",
                timeZone="America/New_York"
            ),
            end=CalendarDateTime(
                dateTime="2026-02-05T15:00:00-05:00",
                timeZone="America/New_York"
            )
        )
        assert event.summary == "Test Event"

    def test_summary_truncation(self):
        """Summary over 100 chars should be truncated"""
        long_summary = "B" * 150
        event = CalendarEvent(
            summary=long_summary,
            start=CalendarDateTime(
                dateTime="2026-02-05T14:00:00-05:00",
                timeZone="America/New_York"
            ),
            end=CalendarDateTime(
                dateTime="2026-02-05T15:00:00-05:00",
                timeZone="America/New_York"
            )
        )
        assert len(event.summary) == 100
        assert event.summary.endswith("...")

    def test_empty_summary(self):
        """Empty summary should raise ValidationError"""
        with pytest.raises(ValidationError):
            CalendarEvent(
                summary="",
                start=CalendarDateTime(
                    dateTime="2026-02-05T14:00:00-05:00",
                    timeZone="America/New_York"
                ),
                end=CalendarDateTime(
                    dateTime="2026-02-05T15:00:00-05:00",
                    timeZone="America/New_York"
                )
            )

    def test_valid_rrule(self):
        """Valid RRULE should pass"""
        event = CalendarEvent(
            summary="Recurring Event",
            start=CalendarDateTime(
                dateTime="2026-02-05T14:00:00-05:00",
                timeZone="America/New_York"
            ),
            end=CalendarDateTime(
                dateTime="2026-02-05T15:00:00-05:00",
                timeZone="America/New_York"
            ),
            recurrence=["RRULE:FREQ=WEEKLY;BYDAY=TU,TH"]
        )
        assert event.recurrence == ["RRULE:FREQ=WEEKLY;BYDAY=TU,TH"]

    def test_invalid_rrule_no_prefix(self):
        """RRULE without prefix should raise ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            CalendarEvent(
                summary="Test",
                start=CalendarDateTime(
                    dateTime="2026-02-05T14:00:00-05:00",
                    timeZone="America/New_York"
                ),
                end=CalendarDateTime(
                    dateTime="2026-02-05T15:00:00-05:00",
                    timeZone="America/New_York"
                ),
                recurrence=["FREQ=WEEKLY;BYDAY=TU"]  # Missing RRULE: prefix
            )

        errors = exc_info.value.errors()
        assert any('RRULE:' in str(e['msg']) for e in errors)

    def test_invalid_rrule_no_freq(self):
        """RRULE without FREQ should raise ValidationError"""
        with pytest.raises(ValidationError):
            CalendarEvent(
                summary="Test",
                start=CalendarDateTime(
                    dateTime="2026-02-05T14:00:00-05:00",
                    timeZone="America/New_York"
                ),
                end=CalendarDateTime(
                    dateTime="2026-02-05T15:00:00-05:00",
                    timeZone="America/New_York"
                ),
                recurrence=["RRULE:BYDAY=TU"]  # Missing FREQ
            )

    def test_invalid_rrule_bad_freq(self):
        """RRULE with invalid FREQ should raise ValidationError"""
        with pytest.raises(ValidationError):
            CalendarEvent(
                summary="Test",
                start=CalendarDateTime(
                    dateTime="2026-02-05T14:00:00-05:00",
                    timeZone="America/New_York"
                ),
                end=CalendarDateTime(
                    dateTime="2026-02-05T15:00:00-05:00",
                    timeZone="America/New_York"
                ),
                recurrence=["RRULE:FREQ=INVALID"]
            )

    def test_invalid_rrule_bad_byday(self):
        """RRULE with invalid BYDAY should raise ValidationError"""
        with pytest.raises(ValidationError):
            CalendarEvent(
                summary="Test",
                start=CalendarDateTime(
                    dateTime="2026-02-05T14:00:00-05:00",
                    timeZone="America/New_York"
                ),
                end=CalendarDateTime(
                    dateTime="2026-02-05T15:00:00-05:00",
                    timeZone="America/New_York"
                ),
                recurrence=["RRULE:FREQ=WEEKLY;BYDAY=XX"]  # Invalid day code
            )

    def test_none_recurrence(self):
        """None recurrence should be allowed"""
        event = CalendarEvent(
            summary="Test",
            start=CalendarDateTime(
                dateTime="2026-02-05T14:00:00-05:00",
                timeZone="America/New_York"
            ),
            end=CalendarDateTime(
                dateTime="2026-02-05T15:00:00-05:00",
                timeZone="America/New_York"
            ),
            recurrence=None
        )
        assert event.recurrence is None


class TestValidationUtils:
    """Test validation utility functions"""

    def test_is_valid_iso_date(self):
        """Test date validation utility"""
        assert is_valid_iso_date("2026-02-05") is True
        assert is_valid_iso_date("2026-12-31") is True
        assert is_valid_iso_date("2026-02-31") is False  # Invalid day
        assert is_valid_iso_date("02/05/2026") is False  # Wrong format
        assert is_valid_iso_date("not-a-date") is False

    def test_is_valid_time(self):
        """Test time validation utility"""
        assert is_valid_time("14:30:00") is True
        assert is_valid_time("00:00:00") is True
        assert is_valid_time("23:59:59") is True
        assert is_valid_time("25:00:00") is False  # Invalid hour
        assert is_valid_time("14:70:00") is False  # Invalid minute
        assert is_valid_time("14:30:70") is False  # Invalid second
        assert is_valid_time("2:30 PM") is False  # Wrong format

    def test_is_valid_iana_timezone(self):
        """Test timezone validation utility"""
        assert is_valid_iana_timezone("America/New_York") is True
        assert is_valid_iana_timezone("UTC") is True
        assert is_valid_iana_timezone("Europe/London") is True
        # Note: EST is actually valid in pytz (legacy timezone)
        assert is_valid_iana_timezone("EST") is True
        assert is_valid_iana_timezone("Invalid/Zone") is False

    def test_is_valid_iso8601_datetime(self):
        """Test ISO 8601 datetime validation utility"""
        assert is_valid_iso8601_datetime("2026-02-05T14:00:00-05:00") is True
        assert is_valid_iso8601_datetime("2026-02-05T14:00:00Z") is True
        assert is_valid_iso8601_datetime("2026-02-05T14:00:00+00:00") is True
        assert is_valid_iso8601_datetime("2026-02-05 14:00:00") is False  # Missing T
        assert is_valid_iso8601_datetime("2026-02-05T14:00:00") is False  # No timezone

    def test_validate_rrule_basic(self):
        """Test RRULE validation utility"""
        is_valid, error = validate_rrule_basic("RRULE:FREQ=WEEKLY;BYDAY=TU,TH")
        assert is_valid is True
        assert error is None

        is_valid, error = validate_rrule_basic("FREQ=WEEKLY")
        assert is_valid is False
        assert "RRULE:" in error

        is_valid, error = validate_rrule_basic("RRULE:BYDAY=TU")
        assert is_valid is False
        assert "FREQ" in error

    def test_truncate_title(self):
        """Test title truncation utility"""
        assert truncate_title("Short") == "Short"
        assert truncate_title("A" * 100) == "A" * 100
        long_title = "A" * 150
        truncated = truncate_title(long_title)
        assert len(truncated) == 100
        assert truncated.endswith("...")

    def test_count_words(self):
        """Test word counting utility"""
        assert count_words("Hello world") == 2
        assert count_words("Hello   world  test") == 3
        assert count_words("One") == 1
        assert count_words("") == 0  # Empty string splits to []


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
