"""
Test/Demo script for Data Collection Service.
Shows how to use the service to fetch events for analysis.
"""

from calendar_service import CalendarService
from data_collection_service import DataCollectionService
import json


def main():
    """Demo the data collection service"""

    print("=" * 60)
    print("Data Collection Service Demo")
    print("=" * 60)

    # Initialize services
    calendar_service = CalendarService()

    # Check authentication
    if not calendar_service.is_authenticated():
        print("\n❌ Not authenticated with Google Calendar")
        print("Please run the app and authenticate first.")
        print("Visit: http://localhost:5000/api/oauth/authorize")
        return

    print("\n✓ Authenticated with Google Calendar")

    # Initialize data collection service
    collection_service = DataCollectionService(calendar_service)

    # Demo 1: Quick Collection
    print("\n" + "=" * 60)
    print("Demo 1: Quick Collection (Fast)")
    print("=" * 60)

    print("\nFetching events from last 3 months...")
    quick_events = collection_service.collect_for_analysis(mode='quick')

    print(f"\n✓ Collected {len(quick_events)} events")

    # Show stats
    stats = collection_service.get_collection_stats(quick_events)
    print("\nCollection Statistics:")
    print(json.dumps(stats, indent=2))

    # Show sample events
    if quick_events:
        print("\n📅 Sample Events:")
        for i, event in enumerate(quick_events[:5], 1):
            summary = event.get('summary', 'No title')
            start = event.get('start', {}).get('dateTime') or event.get('start', {}).get('date')
            print(f"  {i}. {summary}")
            print(f"     Start: {start}")
            if event.get('description'):
                desc = event.get('description')[:50] + "..." if len(event.get('description', '')) > 50 else event.get('description')
                print(f"     Description: {desc}")
            if event.get('location'):
                print(f"     Location: {event.get('location')}")
            if event.get('colorId'):
                print(f"     Color: {event.get('colorId')}")
            print()

    # Demo 2: Deep Collection (optional - commented out by default)
    # Uncomment to test deep collection
    """
    print("\n" + "=" * 60)
    print("Demo 2: Deep Collection (Sampled)")
    print("=" * 60)

    print("\nFetching events from last 12 months with sampling...")
    deep_events = collection_service.collect_for_analysis(mode='deep')

    print(f"\n✓ Collected {len(deep_events)} events")

    # Show stats
    deep_stats = collection_service.get_collection_stats(deep_events)
    print("\nCollection Statistics:")
    print(json.dumps(deep_stats, indent=2))
    """

    # Demo 3: Comprehensive Data Collection (Events + Metadata)
    print("\n" + "=" * 60)
    print("Demo 3: Comprehensive Data Collection")
    print("=" * 60)

    print("\nFetching ALL data for personalization analysis...")
    print("- Events from last 365 days")
    print("- User settings")
    print("- Color definitions")
    print("- Calendar list")
    print("\nThis may take 30-90 seconds...\n")

    comprehensive_data = collection_service.collect_comprehensive_data()

    print("\n" + "=" * 60)
    print("COLLECTION RESULTS")
    print("=" * 60)

    # 1. Events Summary
    events = comprehensive_data.get('events', [])
    print(f"\n✅ Events: {len(events)} events collected")

    if events:
        stats = comprehensive_data.get('stats', {})
        print(f"   Date Range: {stats.get('date_range', {}).get('earliest', 'N/A')[:10]} to {stats.get('date_range', {}).get('latest', 'N/A')[:10]}")
        print(f"   Description Coverage: {stats.get('description_coverage', 'N/A')}")
        print(f"   Location Coverage: {stats.get('location_coverage', 'N/A')}")
        print(f"   Color Coverage: {stats.get('color_coverage', 'N/A')}")

    # 2. Settings Summary
    settings = comprehensive_data.get('settings', {})
    print(f"\n✅ User Settings: {len(settings)} settings")
    if settings:
        print(f"   Timezone: {settings.get('timezone', 'N/A')}")
        print(f"   Default Event Length: {settings.get('defaultEventLength', 'N/A')} minutes")
        print(f"   Time Format: {settings.get('timeFormat', 'N/A')}")
        print(f"   Week Start: {settings.get('weekStart', 'N/A')}")

    # 3. Colors Summary
    colors = comprehensive_data.get('colors', {})
    event_colors = colors.get('event', {})
    print(f"\n✅ Color Palette: {len(event_colors)} event colors available")
    if event_colors:
        print("   Available Color IDs:")
        for color_id, color_info in list(event_colors.items())[:5]:
            bg = color_info.get('background', 'N/A')
            print(f"   - Color {color_id}: {bg}")

    # 4. Calendars Summary
    calendars = comprehensive_data.get('calendars', [])
    print(f"\n✅ Calendars: {len(calendars)} calendars")
    for cal in calendars:
        is_primary = "PRIMARY" if cal.get('primary') else ""
        print(f"   - {cal.get('summary', 'Unnamed')} {is_primary}")
        if cal.get('description'):
            print(f"     Description: {cal.get('description')}")

    # 5. Sample Events with Full Metadata
    if events:
        print("\n" + "=" * 60)
        print("SAMPLE EVENTS (with metadata)")
        print("=" * 60)
        for i, event in enumerate(events[:3], 1):
            summary = event.get('summary', 'No title')
            start = event.get('start', {}).get('dateTime') or event.get('start', {}).get('date')
            print(f"\n{i}. {summary}")
            print(f"   Start: {start}")
            if event.get('description'):
                desc = event.get('description')[:50] + "..." if len(event.get('description', '')) > 50 else event.get('description')
                print(f"   Description: {desc}")
            if event.get('location'):
                print(f"   Location: {event.get('location')}")
            if event.get('colorId'):
                color_id = event.get('colorId')
                color_info = event_colors.get(color_id, {})
                bg_color = color_info.get('background', 'N/A')
                print(f"   Color ID: {color_id} ({bg_color})")
            if event.get('recurrence'):
                print(f"   Recurring: Yes")
            if event.get('eventType'):
                print(f"   Event Type: {event.get('eventType')}")

    print("\n" + "=" * 60)
    print("Demo Complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Use these events for pattern analysis")
    print("2. Extract preferences from the collected data")
    print("3. Apply learned patterns to new events")


if __name__ == '__main__':
    main()
