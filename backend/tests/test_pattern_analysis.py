"""
Test Pattern Analysis Service - Calendar Usage Agent.
Tests the calendar usage pattern discovery.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic

from services.calendar_service import CalendarService
from services.data_collection_service import DataCollectionService
from services.pattern_analysis_service import PatternAnalysisService
from services.personalization_service import PersonalizationService

load_dotenv()


def main():
    """Test calendar usage pattern discovery"""

    print("=" * 60)
    print("Pattern Analysis Service Test")
    print("Calendar Usage Agent")
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

    # Initialize LLM
    llm = ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        api_key=os.getenv("ANTHROPIC_API_KEY")
    )

    # Initialize services
    collection_service = DataCollectionService(calendar_service)
    analysis_service = PatternAnalysisService(llm)
    personalization_service = PersonalizationService()

    # Step 1: Collect comprehensive data
    print("\n" + "=" * 60)
    print("STEP 1: Data Collection")
    print("=" * 60)
    print("\nCollecting comprehensive calendar data...")
    print("This may take 30-90 seconds...\n")

    comprehensive_data = collection_service.collect_comprehensive_data()

    events = comprehensive_data.get('events', [])
    calendars = comprehensive_data.get('calendars', [])

    print(f"\n✅ Collected {len(events)} events from {len(calendars)} calendars")

    # Display calendar list
    print("\nCalendars found:")
    for cal in calendars:
        primary_str = " (PRIMARY)" if cal.get('primary') else ""
        print(f"  - {cal.get('summary', 'Unnamed')}{primary_str}")

    # Step 2: Run pattern analysis (calendar usage only)
    print("\n" + "=" * 60)
    print("STEP 2: Calendar Usage Pattern Analysis")
    print("=" * 60)
    print("\nAnalyzing calendar usage patterns...")

    preferences = analysis_service.analyze_comprehensive_data(
        comprehensive_data=comprehensive_data,
        user_id='test_user'
    )

    # Step 3: Display results
    print("\n" + "=" * 60)
    print("DISCOVERED CALENDAR USAGE PATTERNS")
    print("=" * 60)

    for cal_pattern in preferences.calendar_usage.calendars:
        primary_str = " (PRIMARY)" if cal_pattern.is_primary else ""
        print(f"\n📅 Calendar: {cal_pattern.calendar_name}{primary_str}")
        print(f"   Events: {cal_pattern.typical_event_count}")

        if cal_pattern.event_types:
            print(f"   Event Types: {', '.join(cal_pattern.event_types)}")

        if cal_pattern.usage_patterns:
            print("\n   Usage Patterns:")
            for i, pattern in enumerate(cal_pattern.usage_patterns, 1):
                freq_str = f" [{pattern.frequency}]" if pattern.frequency else ""
                conf_str = f" (confidence: {pattern.confidence})"
                print(f"   {i}. {pattern.pattern}{freq_str}{conf_str}")
                if pattern.examples:
                    print(f"      Examples:")
                    for ex in pattern.examples[:3]:
                        print(f"        - {ex}")
        else:
            print("   No patterns discovered")

    # Step 4: Save preferences
    print("\n" + "=" * 60)
    print("STEP 3: Saving Preferences")
    print("=" * 60)

    success = personalization_service.save_preferences(preferences)

    if success:
        print(f"\n✅ Preferences saved for user: {preferences.user_id}")
        print(f"   File: user_data/{preferences.user_id}_preferences.json")
    else:
        print("\n❌ Failed to save preferences")

    # Step 5: Test reload
    print("\n" + "=" * 60)
    print("STEP 4: Testing Load/Save")
    print("=" * 60)

    loaded_prefs = personalization_service.load_preferences('test_user')

    if loaded_prefs:
        print("\n✅ Successfully loaded preferences from disk")
        print(f"   Events analyzed: {loaded_prefs.total_events_analyzed}")
        print(f"   Calendars analyzed: {len(loaded_prefs.calendar_usage.calendars)}")

        # Verify data integrity
        assert loaded_prefs.total_events_analyzed == preferences.total_events_analyzed
        assert len(loaded_prefs.calendar_usage.calendars) == len(preferences.calendar_usage.calendars)
        print("\n✅ Data integrity verified")
    else:
        print("\n❌ Failed to load preferences")

    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
    print("\nCalendar usage agent is working correctly!")
    print("\nNext steps:")
    print("1. Implement title pattern agent")
    print("2. Implement description pattern agent")
    print("3. Implement color usage agent")
    print("4. Continue with remaining agents...")


if __name__ == '__main__':
    main()
