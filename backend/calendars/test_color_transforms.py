"""
Test color and category transformations across providers.
"""

import sys
import os

# Add the backend directory to path
backend_dir = '/home/lucas/files/university/startups/hack@brown/backend'
sys.path.insert(0, backend_dir)

# Import transform modules directly (avoid package init issues)
import importlib.util

# Load Microsoft transform
ms_transform_path = os.path.join(backend_dir, 'calendars/microsoft/transform.py')
spec = importlib.util.spec_from_file_location("ms_transform", ms_transform_path)
ms_transform = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ms_transform)
ms_to_universal = ms_transform.to_universal
ms_from_universal = ms_transform.from_universal

# Load Apple transform
apple_transform_path = os.path.join(backend_dir, 'calendars/apple/transform.py')
spec = importlib.util.spec_from_file_location("apple_transform", apple_transform_path)
apple_transform = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apple_transform)
apple_to_universal = apple_transform.to_universal
apple_from_universal = apple_transform.from_universal

from icalendar import Event as ICalEvent
from datetime import datetime


def test_microsoft_categories():
    """Test Microsoft Outlook category to color conversion"""
    print("\n=== Testing Microsoft Categories → Google Colors ===\n")

    # Test event with categories
    ms_event = {
        'id': 'test-1',
        'subject': 'CS Course Lecture',
        'body': {'content': 'Algorithms and Data Structures'},
        'start': {'dateTime': '2026-02-05T10:00:00', 'timeZone': 'UTC'},
        'end': {'dateTime': '2026-02-05T11:30:00', 'timeZone': 'UTC'},
        'categories': ['School', 'Important'],
        'isCancelled': False
    }

    # Convert to universal
    universal = ms_to_universal(ms_event)

    print(f"Original Microsoft Event:")
    print(f"  Subject: {ms_event['subject']}")
    print(f"  Categories: {ms_event['categories']}")
    print(f"\nConverted to Universal:")
    print(f"  Summary: {universal['summary']}")
    print(f"  ColorId: {universal.get('colorId', 'None')}")
    print(f"  Preserved Categories: {universal.get('_microsoft_categories', 'None')}")

    # Convert back to Microsoft
    ms_back = ms_from_universal(universal)
    print(f"\nConverted back to Microsoft:")
    print(f"  Subject: {ms_back['subject']}")
    print(f"  Categories: {ms_back.get('categories', 'None')}")

    # Test: Should preserve original categories
    assert ms_back.get('categories') == ['School', 'Important'], "Categories should be preserved"
    print("\n✓ Round-trip conversion successful!")


def test_microsoft_color_to_category():
    """Test Google color to Microsoft category conversion"""
    print("\n\n=== Testing Google Colors → Microsoft Categories ===\n")

    # Universal event with colorId (no original Microsoft categories)
    universal_event = {
        'summary': 'Team Meeting',
        'description': 'Weekly sync',
        'start': {'dateTime': '2026-02-05T14:00:00', 'timeZone': 'UTC'},
        'end': {'dateTime': '2026-02-05T15:00:00', 'timeZone': 'UTC'},
        'colorId': '10'  # Green = Work
    }

    # Convert to Microsoft
    ms_event = ms_from_universal(universal_event)

    print(f"Universal Event:")
    print(f"  Summary: {universal_event['summary']}")
    print(f"  ColorId: {universal_event['colorId']}")
    print(f"\nConverted to Microsoft:")
    print(f"  Subject: {ms_event['subject']}")
    print(f"  Categories: {ms_event.get('categories', 'None')}")

    assert ms_event.get('categories') == ['Work'], "ColorId '10' should map to 'Work' category"
    print("\n✓ Color to category conversion successful!")


def test_apple_color():
    """Test Apple iCalendar COLOR property conversion"""
    print("\n\n=== Testing Apple COLOR → Google Colors ===\n")

    # Create iCalendar event with COLOR property
    ical_event = ICalEvent()
    ical_event.add('summary', 'Study Session')
    ical_event.add('description', 'Prepare for midterm')
    ical_event.add('dtstart', datetime(2026, 2, 5, 18, 0, 0))
    ical_event.add('dtend', datetime(2026, 2, 5, 20, 0, 0))
    ical_event.add('color', 'blue')  # RFC 7986 COLOR property
    ical_event.add('uid', 'test-apple-1')

    # Convert to universal
    universal = apple_to_universal(ical_event)

    print(f"Original Apple Event:")
    print(f"  Summary: {str(ical_event.get('SUMMARY'))}")
    print(f"  COLOR: {str(ical_event.get('COLOR'))}")
    print(f"\nConverted to Universal:")
    print(f"  Summary: {universal['summary']}")
    print(f"  ColorId: {universal.get('colorId', 'None')}")
    print(f"  Preserved Color: {universal.get('_apple_color', 'None')}")

    # Convert back to Apple
    cal_back = apple_from_universal(universal)
    event_back = None
    for component in cal_back.walk():
        if component.name == 'VEVENT':
            event_back = component
            break

    print(f"\nConverted back to Apple:")
    print(f"  Summary: {str(event_back.get('SUMMARY'))}")
    print(f"  COLOR: {str(event_back.get('COLOR'))}")

    assert str(event_back.get('COLOR')) == 'blue', "COLOR should be preserved"
    print("\n✓ Round-trip conversion successful!")


def test_apple_hex_color():
    """Test Apple hex color conversion"""
    print("\n\n=== Testing Apple Hex Colors → Google Colors ===\n")

    # Create event with hex color (Apple CalDAV extension)
    ical_event = ICalEvent()
    ical_event.add('summary', 'Important Deadline')
    ical_event.add('dtstart', datetime(2026, 2, 10, 23, 59, 0))
    ical_event.add('dtend', datetime(2026, 2, 10, 23, 59, 0))
    ical_event.add('color', '#FF0000')  # Red hex color
    ical_event.add('uid', 'test-apple-2')

    # Convert to universal
    universal = apple_to_universal(ical_event)

    print(f"Original Apple Event:")
    print(f"  Summary: {str(ical_event.get('SUMMARY'))}")
    print(f"  COLOR: {str(ical_event.get('COLOR'))}")
    print(f"\nConverted to Universal:")
    print(f"  Summary: {universal['summary']}")
    print(f"  ColorId: {universal.get('colorId', 'None')} (should be '11' for red)")

    assert universal.get('colorId') == '11', "Red hex should map to colorId '11'"
    print("\n✓ Hex color conversion successful!")


def test_color_to_apple():
    """Test Google color to Apple COLOR conversion"""
    print("\n\n=== Testing Google Colors → Apple COLOR ===\n")

    # Universal event with colorId
    universal_event = {
        'summary': 'Lunch with Friends',
        'start': {'dateTime': '2026-02-06T12:00:00', 'timeZone': 'UTC'},
        'end': {'dateTime': '2026-02-06T13:00:00', 'timeZone': 'UTC'},
        'colorId': '3'  # Purple = Social
    }

    # Convert to Apple
    cal = apple_from_universal(universal_event)
    event = None
    for component in cal.walk():
        if component.name == 'VEVENT':
            event = component
            break

    print(f"Universal Event:")
    print(f"  Summary: {universal_event['summary']}")
    print(f"  ColorId: {universal_event['colorId']}")
    print(f"\nConverted to Apple:")
    print(f"  Summary: {str(event.get('SUMMARY'))}")
    print(f"  COLOR: {str(event.get('COLOR'))}")

    assert str(event.get('COLOR')) == 'purple', "ColorId '3' should map to 'purple'"
    print("\n✓ Color to COLOR conversion successful!")


if __name__ == '__main__':
    print("=" * 60)
    print("TESTING COLOR AND CATEGORY TRANSFORMATIONS")
    print("=" * 60)

    try:
        test_microsoft_categories()
        test_microsoft_color_to_category()
        test_apple_color()
        test_apple_hex_color()
        test_color_to_apple()

        print("\n" + "=" * 60)
        print("ALL TESTS PASSED! ✓")
        print("=" * 60)
        print("\nSummary:")
        print("  ✓ Microsoft categories → Google colors")
        print("  ✓ Google colors → Microsoft categories")
        print("  ✓ Apple COLOR property → Google colors")
        print("  ✓ Apple hex colors → Google colors")
        print("  ✓ Google colors → Apple COLOR")
        print("  ✓ Round-trip conversions preserve original values")

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
