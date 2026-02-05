
TASK 1: Location Resolution & Geocoding
Problem Statement
Users provide location input in messy, unstructured formats:

Misspellings: "Meehan Auditoruim" instead of "Meehan Auditorium"
Incomplete names: "the close Sainsbury's" instead of specific address
Abbreviations: "rm 301" instead of "Room 301, Smith Hall"
Informal references: "Starbucks" without specifying which one
Goal: Convert user input into specific, standardized location data with full addresses.

NOT in scope: Personal assistant features, travel time calculations, location-based suggestions. This is purely about normalizing location strings into proper addresses.

Current State
Extraction Pipeline
Agent 2 (Facts Extraction): backend/extraction/agents/facts.py

Extracts location: Optional[str] as free-form text
Rules: Physical locations only (no virtual meeting links)
Examples: "Conference Room B", "Starbucks", "Puerto Rico"
Agent 3 (Standard Formatting): backend/extraction/agents/standard_formatting.py

Passes location through as-is
No geocoding or validation
Guest Formatting: backend/extraction/agents/guest_formatting.py

Light cleanup: "rm 301" → "Room 301", "zoom" → "Zoom Call"
No geocoding or address resolution
Database Storage
Table: events (in backend/database/models.py)
Field: location: Optional[str] - plain string, no structured data
Stored in: extracted_facts (JSONB) and system_suggestion (JSONB)
Current Limitations
No spelling correction
No address resolution
No deduplication ("Room 301" vs "rm 301" vs "Smith Hall 301")
No structured location data (lat/lng, place_id, formatted_address)
No disambiguation for ambiguous locations
Intended Approach
Architecture: Add Geocoding Layer After Extraction

User Input
    ↓
Agent 2: Fact Extraction (extracts raw location text)
    ↓
>>> NEW: Location Resolution Service <<<
    ↓
Agent 3: Calendar Formatting (receives resolved location)
    ↓
Database (stores both raw + resolved)
Implementation Components
1. Geocoding Service (backend/services/geocoding.py)
Purpose: Resolve location strings to structured data

API Choice: Google Places API (recommended)

Already using Google Calendar API (consistent auth/billing)
Best accuracy for spelling correction
Includes timezone data
Generous free tier: 150,000 requests/month
Alternative: Mapbox Geocoding API (if cost is concern)

Service Interface:


class GeocodingService:
    def resolve_location(
        self,
        query: str,
        user_location: Optional[Tuple[float, float]] = None
    ) -> LocationResult:
        """
        Args:
            query: Raw location string ("close Sainsbury's", "Meehan Auditoruim")
            user_location: Optional (lat, lng) to bias results

        Returns:
            LocationResult with:
            - formatted_address: "Meehan Auditorium, 235 Hope St, Providence, RI 02906"
            - place_id: "ChIJ..." (for deduplication)
            - lat: 41.8268
            - lng: -71.4025
            - place_type: "auditorium" | "store" | "building"
            - confidence: 0.0-1.0
            - timezone: "America/New_York" (BONUS!)
        """
API Endpoints:

Google Places: https://maps.googleapis.com/maps/api/place/findplacefromtext/json
Geocoding: https://maps.googleapis.com/maps/api/geocode/json
2. Location Resolution Logic
When to geocode:

Always attempt geocoding if extracted_facts.location is not null
Skip if location is generic descriptor ("TBD", "various")
Skip if already looks like full address (heuristic: contains zip code + street number)
Confidence Thresholds:


if confidence >= 0.8:
    # High confidence - use automatically
    location = result.formatted_address

elif 0.5 <= confidence < 0.8:
    # Medium confidence - use but log for review
    location = result.formatted_address

else:
    # Low confidence - keep original user text
    location = original_text
User Location Biasing:

Get user's location from users.preferences (if stored)
Or infer from recent calendar events (check event locations)
Pass as location param to bias geocoding results
Example: "Starbucks" + user in Providence → nearest Providence Starbucks
3. Database Schema Changes
Add to events table:


# In backend/database/models.py - Event class
location: Optional[str] = None,  # Existing field (keep for backwards compat)
location_resolved: Optional[str] = None,  # NEW: Geocoded address
location_data: Optional[dict] = None,  # NEW: Full geocoding result
location_data structure (JSONB):


{
  "formatted_address": "Meehan Auditorium, 235 Hope St, Providence, RI 02906",
  "place_id": "ChIJr9ZQH4FC5IkRs3qY8xQ5Qo4",
  "lat": 41.8268,
  "lng": -71.4025,
  "place_type": "auditorium",
  "confidence": 0.95,
  "timezone": "America/New_York",
  "raw_input": "Meehan Auditoruim"
}
4. Integration Points
Modify: backend/processing/session_processor.py

After Agent 2 extraction, before Agent 3 formatting:


# Current flow
extracted_facts = extract_facts(event_text)

# NEW: Add geocoding step
if extracted_facts.location:
    geocoding_service = GeocodingService()
    location_result = geocoding_service.resolve_location(
        query=extracted_facts.location,
        user_location=get_user_location(user_id)
    )

    if location_result.confidence >= 0.5:
        # Update facts with resolved location
        extracted_facts.location = location_result.formatted_address
        location_data = location_result.to_dict()
    else:
        location_data = None

# Pass to Agent 3
calendar_event = format_for_calendar(extracted_facts)
Modify: backend/events/service.py

When creating event:


Event.create(
    user_id=user_id,
    location=calendar_event.location,
    location_resolved=location_data.get('formatted_address') if location_data else None,
    location_data=location_data,
    # ... other fields
)
5. Configuration
Add to backend/config/settings.py:


GOOGLE_PLACES_API_KEY = os.getenv('GOOGLE_PLACES_API_KEY')
GEOCODING_CONFIDENCE_THRESHOLD = 0.5
GEOCODING_CACHE_TTL = 86400  # 24 hours
GEOCODING_ENABLED = os.getenv('GEOCODING_ENABLED', 'true').lower() == 'true'
Add to .env:


GOOGLE_PLACES_API_KEY=your_key_here
6. Caching Strategy
Why: Avoid redundant API calls for common locations

Implementation: Use Redis (already in requirements.txt)


# Cache key: hash of (query + user_location)
cache_key = f"geocoding:{hash(query + str(user_location))}"

# Check cache first
cached = redis_client.get(cache_key)
if cached:
    return LocationResult.from_json(cached)

# Call API
result = call_geocoding_api(query)

# Cache for 24 hours
redis_client.setex(cache_key, 86400, result.to_json())
7. Error Handling
API Failures:

Timeout: Fall back to original user text
Rate limit: Fall back to original user text, log warning
Invalid API key: Disable geocoding, log error
Ambiguous Results:

Multiple high-confidence matches: Use first result (biased by user location)
Low confidence: Keep original user text
No results: Keep original user text
Files to Create/Modify
New Files:

backend/services/geocoding.py - GeocodingService class
backend/services/location_result.py - LocationResult model
backend/tests/test_geocoding.py - Unit tests
Modified Files:

backend/processing/session_processor.py - Add geocoding step
backend/events/service.py - Store location_data
backend/database/models.py - Add location_resolved, location_data fields
backend/config/settings.py - Add configuration
backend/requirements.txt - Add googlemaps library (if not using raw requests)
Migration:


-- Add to Alembic migration
ALTER TABLE events
ADD COLUMN location_resolved TEXT,
ADD COLUMN location_data JSONB;

CREATE INDEX idx_events_location_place_id ON events ((location_data->>'place_id'));
Testing Strategy
Unit Tests (backend/tests/test_geocoding.py):


def test_resolve_location_spelling_correction():
    # "Meehan Auditoruim" → "Meehan Auditorium..."

def test_resolve_location_disambiguation():
    # "Starbucks" + user in Providence → specific Starbucks

def test_resolve_location_low_confidence():
    # Gibberish → keep original text

def test_resolve_location_caching():
    # Same query → cached result
Integration Tests:


def test_end_to_end_location_resolution():
    # Submit "Meeting at Meehan Auditoruim tmrw 2pm"
    # Verify location_resolved = full address
    # Verify location_data contains place_id, lat, lng
Manual Testing:

Input: "Coffee at close Sainsbury's" → Should get specific Sainsbury's address
Input: "Meeting at Meehan Auditoruim" → Should correct spelling
Input: "Conference in rm 301" → Should format, may geocode if building known
Input: "Team lunch at Starbucks" → Should get nearest Starbucks
Success Criteria
✅ Misspelled locations are corrected
✅ Ambiguous locations are resolved to nearest match (when user location available)
✅ Full addresses are stored in location_resolved
✅ Original user input is preserved in location field
✅ Geocoding failures don't break event creation (graceful fallback)
✅ Common locations are cached to reduce API costs
✅ Timezone is extracted from location data (bonus for future features)
TASK 2: Contact Integration & Attendee Resolution
Problem Statement
Users mention people by name but system can't resolve them to email addresses:

Input: "Meeting with Sarah tomorrow at 2pm"
Current: System extracts people: ["Sarah"] but can't invite her (no email)
Desired: Resolve "Sarah" → "sarah@company.com" and auto-add as attendee
Goal: Integrate contact sources (Google Contacts, calendar history) to resolve names to emails and enable auto-inviting attendees.

Current State
Extraction Pipeline
Agent 2 (Facts): backend/extraction/agents/facts.py + prompts/facts.txt

Extracts people: List[str] - names mentioned ("Sarah", "John")
Extracts attendees: List[str] - email addresses ONLY (explicitly mentioned)
Rule: Only extracts attendees if email addresses are in the input
Example: "Meeting with Sarah" → people=["Sarah"], attendees=null
Agent 3 (Formatting): backend/extraction/agents/standard_formatting.py

Outputs CalendarEvent.attendees: List[str]
Current behavior: Passes through facts.people (names, not emails)
Problem: Names are treated as attendees but calendars need emails
Data Model
ExtractedFacts (backend/extraction/models.py lines 55-72):


people: Optional[List[str]] = ["Sarah", "John"]  # Names
attendees: Optional[List[str]] = ["sarah@example.com"]  # Emails only
instructions: Optional[str] = "invite Sarah"  # Not processed
CalendarEvent (lines 220+):


attendees: Optional[List[str]]  # Should be emails
Database Storage
Events table (backend/database/models.py):

extracted_facts (JSONB): Contains people and attendees arrays
NO attendees column - attendees not stored separately
Attendees only exist in JSONB fields
Calendar API Integration
Works today (if emails are provided):

Google: backend/calendars/google/create.py - creates events with attendees
Microsoft: backend/calendars/microsoft/transform.py - transforms to Graph format
Apple: backend/calendars/apple/transform.py - creates iCal ATTENDEE fields
Format required:


# All calendar APIs need:
attendees = [
    {"email": "sarah@company.com", "displayName": "Sarah Chen"},
    {"email": "john@work.org", "displayName": "John Smith"}
]
Key Gap
No contact database or resolution layer. System can extract names but can't convert to emails.

Intended Approach
Architecture: Two-Phase Contact System

Phase 1: Build Contact Database
    ↓
    - Sync Google Contacts
    - Mine calendar history for attendees
    - Store in local contacts table

Phase 2: Name-to-Email Resolution
    ↓
    - After Agent 2 extraction
    - Resolve people names → emails
    - Enrich attendees list
    - Pass to Agent 3
Implementation Components
1. Contact Database Schema
New table: contacts (in backend/database/models.py)


class Contact(Base):
    __tablename__ = 'contacts'

    id: int  # Primary key
    user_id: int  # FK to users table
    email: str  # Primary email address
    display_name: Optional[str]  # "Sarah Chen"
    first_name: Optional[str]  # "Sarah"
    last_name: Optional[str]  # "Chen"
    nicknames: Optional[List[str]]  # ["Sarah", "S", "Chen"]
    organization: Optional[str]  # "Acme Corp"
    source: str  # "google_contacts" | "calendar_history" | "manual"
    source_id: Optional[str]  # External ID from source
    frequency_score: int  # How often user interacts (for ranking)
    last_interaction: Optional[datetime]  # Most recent calendar event
    metadata: Optional[dict]  # Additional data (phone, photo URL, etc.)
    created_at: datetime
    updated_at: datetime

    # Indexes
    __table_args__ = (
        Index('idx_contacts_user_email', 'user_id', 'email', unique=True),
        Index('idx_contacts_user_name', 'user_id', 'display_name'),
        Index('idx_contacts_frequency', 'user_id', 'frequency_score'),
    )
Rationale:

user_id: Isolate contacts per user (privacy)
email: Primary identifier for calendar invitations
display_name + names: Enable fuzzy name matching
nicknames: Handle "Sarah" vs "Sarah Chen" vs "S. Chen"
source: Track where contact came from (for debugging/updates)
frequency_score: Rank by relevance (who user meets with most)
metadata: Store phone, photo, etc. for future features
2. Google Contacts Sync
New file: backend/contacts/google_sync.py

OAuth Scope: Add https://www.googleapis.com/auth/contacts.readonly

Service Class:


class GoogleContactsService:
    def sync_contacts(self, user_id: int, access_token: str):
        """
        Fetch all contacts from Google People API
        Store/update in local contacts table
        """
        # API endpoint
        url = "https://people.googleapis.com/v1/people/me/connections"
        params = {
            "personFields": "names,emailAddresses,organizations,photos",
            "pageSize": 1000
        }

        # Fetch paginated results
        contacts = []
        while url:
            response = requests.get(url, headers={...}, params=params)
            data = response.json()
            contacts.extend(data.get('connections', []))
            url = data.get('nextPageToken')  # Handle pagination

        # Transform to Contact objects
        for person in contacts:
            # Extract primary email
            emails = person.get('emailAddresses', [])
            primary_email = next((e['value'] for e in emails if e.get('primary')), None)

            if not primary_email:
                continue  # Skip contacts without email

            # Extract name
            names = person.get('names', [])
            name = names[0] if names else {}

            # Upsert to database
            Contact.upsert(
                user_id=user_id,
                email=primary_email,
                display_name=name.get('displayName'),
                first_name=name.get('givenName'),
                last_name=name.get('familyName'),
                organization=person.get('organizations', [{}])[0].get('name'),
                source='google_contacts',
                source_id=person['resourceName'],
                metadata={
                    'photo_url': person.get('photos', [{}])[0].get('url'),
                    'alternate_emails': [e['value'] for e in emails[1:]]
                }
            )
Trigger sync:

On user login: If last sync > 24 hours ago
Manual trigger: API endpoint /api/contacts/sync
Background job: Daily cron job for all users
3. Calendar History Mining
New file: backend/contacts/calendar_mining.py

Purpose: Extract attendees from user's existing calendar events

Service Class:


class CalendarContactMiner:
    def mine_contacts_from_calendar(self, user_id: int):
        """
        Extract attendees from user's calendar history
        Build contact database from their own events
        """
        # Fetch historical events (already exists)
        events = Event.get_historical_events(
            user_id=user_id,
            days_back=365  # Last year
        )

        attendee_stats = {}  # {email: {count, last_seen, names}}

        for event in events:
            # Parse attendees from event data
            attendees = self._extract_attendees(event)

            for attendee in attendees:
                email = attendee.get('email')
                name = attendee.get('displayName') or attendee.get('name')

                if email not in attendee_stats:
                    attendee_stats[email] = {
                        'count': 0,
                        'names': set(),
                        'last_seen': None
                    }

                attendee_stats[email]['count'] += 1
                attendee_stats[email]['names'].add(name)
                attendee_stats[email]['last_seen'] = max(
                    attendee_stats[email]['last_seen'] or event.start_time,
                    event.start_time
                )

        # Upsert to contacts table
        for email, stats in attendee_stats.items():
            # Pick most common name variant
            display_name = max(stats['names'], key=len)

            Contact.upsert(
                user_id=user_id,
                email=email,
                display_name=display_name,
                source='calendar_history',
                frequency_score=stats['count'],
                last_interaction=stats['last_seen']
            )
When to run:

On first calendar sync: Bootstrap contact database
Daily background job: Update with new calendar events
After event creation: Increment frequency for attendees
4. Name Resolution Service
New file: backend/contacts/resolver.py

Purpose: Convert names to email addresses

Service Class:


class ContactResolver:
    def resolve_names_to_emails(
        self,
        user_id: int,
        names: List[str]
    ) -> List[Dict[str, str]]:
        """
        Resolve list of names to email addresses

        Args:
            user_id: User ID
            names: ["Sarah", "John Smith", "Chen"]

        Returns:
            [
                {"name": "Sarah", "email": "sarah@company.com", "confidence": 0.9},
                {"name": "John Smith", "email": "john@work.org", "confidence": 1.0},
                {"name": "Chen", "email": None, "confidence": 0.0}  # Not found
            ]
        """
        results = []

        for name in names:
            # Query contacts table with fuzzy matching
            matches = Contact.search(
                user_id=user_id,
                query=name,
                limit=5
            )

            if not matches:
                results.append({"name": name, "email": None, "confidence": 0.0})
                continue

            # Rank matches
            best_match = self._rank_matches(name, matches)

            results.append({
                "name": name,
                "email": best_match.email,
                "display_name": best_match.display_name,
                "confidence": best_match.score
            })

        return results

    def _rank_matches(self, query: str, contacts: List[Contact]) -> Contact:
        """
        Rank contacts by relevance to query

        Scoring:
        - Exact match (display_name): 1.0
        - First name match: 0.9
        - Last name match: 0.8
        - Nickname match: 0.85
        - Fuzzy match: 0.6-0.8 (based on Levenshtein distance)

        Tiebreaker: frequency_score (how often user meets with them)
        """
        scored = []
        query_lower = query.lower()

        for contact in contacts:
            score = 0.0

            # Exact match
            if contact.display_name.lower() == query_lower:
                score = 1.0
            # First name match
            elif contact.first_name and contact.first_name.lower() == query_lower:
                score = 0.9
            # Last name match
            elif contact.last_name and contact.last_name.lower() == query_lower:
                score = 0.8
            # Nickname match
            elif query_lower in [n.lower() for n in contact.nicknames or []]:
                score = 0.85
            # Fuzzy match
            else:
                score = self._fuzzy_score(query, contact.display_name)

            # Boost by frequency (recent/frequent contacts rank higher)
            frequency_boost = min(contact.frequency_score / 100, 0.2)
            score = min(score + frequency_boost, 1.0)

            scored.append((score, contact))

        # Sort by score (desc), then frequency (desc)
        scored.sort(key=lambda x: (x[0], x[1].frequency_score), reverse=True)

        return scored[0][1]  # Return best match
Fuzzy Matching: Use fuzzywuzzy library or Levenshtein distance


from fuzzywuzzy import fuzz

def _fuzzy_score(self, query: str, target: str) -> float:
    ratio = fuzz.ratio(query.lower(), target.lower())
    return ratio / 100.0  # Convert 0-100 to 0.0-1.0
5. Integration into Session Processor
Modify: backend/processing/session_processor.py

After Agent 2 extraction, before Agent 3 formatting:


# Current: Agent 2 extracts facts
extracted_facts = extract_facts(event_text)

# NEW: Resolve people names to emails
if extracted_facts.people:
    resolver = ContactResolver()
    resolved = resolver.resolve_names_to_emails(
        user_id=user_id,
        names=extracted_facts.people
    )

    # Filter high-confidence matches
    auto_invite = [
        {"email": r["email"], "displayName": r["display_name"]}
        for r in resolved
        if r["confidence"] >= 0.8 and r["email"]
    ]

    # Merge with explicitly mentioned attendees
    existing_attendees = extracted_facts.attendees or []
    all_attendees = existing_attendees + [a["email"] for a in auto_invite]

    # Update extracted facts
    extracted_facts.attendees = all_attendees
    extracted_facts.attendee_metadata = {
        "resolved": resolved,  # Include for debugging/UI
        "auto_invited": [a["email"] for a in auto_invite]
    }

# Continue to Agent 3
calendar_event = format_for_calendar(extracted_facts)
6. API Endpoints
New file: backend/contacts/routes.py


@router.post("/api/contacts/sync")
async def sync_contacts(user: User = Depends(get_current_user)):
    """Trigger manual contact sync from Google"""
    service = GoogleContactsService()
    service.sync_contacts(user.id, user.google_access_token)
    return {"status": "synced"}

@router.get("/api/contacts")
async def list_contacts(user: User = Depends(get_current_user)):
    """List user's contacts"""
    contacts = Contact.get_by_user(user.id, limit=100)
    return [c.to_dict() for c in contacts]

@router.get("/api/contacts/search")
async def search_contacts(
    q: str,
    user: User = Depends(get_current_user)
):
    """Search contacts by name"""
    matches = Contact.search(user.id, query=q, limit=10)
    return [c.to_dict() for c in matches]
7. Frontend Integration (Future)
Contact autocomplete (not in scope for now, but enabled by this work):


// In event creation form
<input
  type="text"
  placeholder="Add attendees..."
  onChange={async (e) => {
    const matches = await fetch(`/api/contacts/search?q=${e.target.value}`)
    showSuggestions(matches)
  }}
/>
Files to Create/Modify
New Files:

backend/contacts/google_sync.py - Google Contacts sync service
backend/contacts/calendar_mining.py - Calendar attendee mining
backend/contacts/resolver.py - Name-to-email resolution
backend/contacts/routes.py - API endpoints
backend/database/migrations/add_contacts_table.py - Alembic migration
backend/tests/test_contact_resolver.py - Unit tests
Modified Files:

backend/processing/session_processor.py - Add name resolution step
backend/database/models.py - Add Contact model
backend/requirements.txt - Add fuzzywuzzy, python-Levenshtein
backend/auth/google.py - Add contacts scope to OAuth
Migration:


-- Create contacts table
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    nicknames TEXT[],
    organization VARCHAR(255),
    source VARCHAR(50) NOT NULL,
    source_id VARCHAR(255),
    frequency_score INTEGER DEFAULT 0,
    last_interaction TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_contacts_user_email ON contacts(user_id, email);
CREATE INDEX idx_contacts_user_name ON contacts(user_id, display_name);
CREATE INDEX idx_contacts_frequency ON contacts(user_id, frequency_score DESC);
Testing Strategy
Unit Tests:


def test_resolve_exact_name_match():
    # "Sarah Chen" → sarah@company.com (exact match)

def test_resolve_first_name_only():
    # "Sarah" → sarah@company.com (if only one Sarah)

def test_resolve_ambiguous_name():
    # "Sarah" → best match by frequency_score

def test_resolve_fuzzy_match():
    # "Jon" → john@work.org (fuzzy match)

def test_resolve_no_match():
    # "Unknown Person" → None

def test_google_contacts_sync():
    # Mock Google API → contacts stored in DB

def test_calendar_mining():
    # Existing events → extract attendees → store contacts
Integration Tests:


def test_end_to_end_name_resolution():
    # 1. Sync Google Contacts (mock)
    # 2. Submit "Meeting with Sarah tomorrow"
    # 3. Verify attendees includes sarah@company.com
    # 4. Verify event created with attendee
Manual Testing:

Sync Google Contacts → verify contacts stored
Input: "Lunch with Sarah" → verify Sarah's email added as attendee
Input: "Team meeting with John and Sarah" → verify both resolved
Input: "Call with Unknown Person" → verify no attendee added (not found)
Success Criteria
✅ Google Contacts synced to local database
✅ Calendar history mined for attendees
✅ Names resolved to emails with >80% accuracy
✅ High-confidence matches auto-added as attendees
✅ Events created with proper attendee email format
✅ Calendar invitations sent successfully (Google/Microsoft/Apple)
✅ No false positives (wrong person invited)
✅ Graceful handling of ambiguous/unknown names
TASK 3: Conflict Detection & Warnings
Problem Statement
Users schedule events without realizing they already have something at that time. System has all the data needed to detect conflicts but doesn't warn users.

Goal: Add conflict detection warnings when a new event overlaps with existing events. No new integrations needed - we already sync all their calendars.

Current State
Calendar Syncing
Already implemented: System fetches events from all connected calendars

Google: backend/calendars/google/fetch.py
Microsoft: backend/calendars/microsoft/fetch.py
Apple: backend/calendars/apple/fetch.py
Fetch strategy: Event.get_historical_events() pulls events from database

Events are synced to local database regularly
Includes: start_time, end_time, summary, calendar_id, provider
Conflict Checking (Partial Implementation)
File: backend/calendars/google/fetch.py

Function exists: check_conflicts(user_id, start_time, end_time, calendar_id)

Current usage: Called in backend/calendars/google/create.py (lines 101-110)


# Check for conflicts
conflicts = check_conflicts(
    user_id=user_id,
    start_time=start_time,
    end_time=end_time,
    calendar_id=calendar_id
)

# BUT: Event is created anyway! No warning to user
if conflicts:
    logger.warning(f"Event created despite conflicts: {conflicts}")
    # NOTE: Still proceeds with creation
Problem: Conflicts are detected but not surfaced to user. Events are created silently even with overlaps.

Database Schema
Events table (backend/database/models.py):

Has all data needed: start_time, end_time, calendar_id, user_id
Can query for overlapping events
Sessions table:

Stores session results in result (JSONB)
Could include conflict warnings here
Intended Approach
Architecture: Detect Conflicts Before Event Creation

User Input
    ↓
Agent 2: Extract Facts (get date/time)
    ↓
Agent 3: Format Calendar Event (standardize times)
    ↓
>>> NEW: Conflict Detection Service <<<
    ↓
    - Query existing events in time range
    - Find overlaps
    - Generate conflict warnings
    ↓
Return to User with Warnings
    ↓
User Decision: Create anyway / Reschedule
Implementation Components
1. Conflict Detection Service
New file: backend/conflicts/detector.py

Purpose: Find overlapping events across all user's calendars

Service Class:


class ConflictDetector:
    def check_conflicts(
        self,
        user_id: int,
        start_time: datetime,
        end_time: datetime,
        exclude_event_id: Optional[int] = None
    ) -> List[ConflictInfo]:
        """
        Find all events that overlap with given time range

        Args:
            user_id: User ID
            start_time: Proposed event start
            end_time: Proposed event end
            exclude_event_id: Ignore this event (for updates)

        Returns:
            List of ConflictInfo objects with:
            - event_id
            - summary
            - start_time
            - end_time
            - calendar_name
            - provider (google/microsoft/apple)
            - overlap_type ("full" | "partial_start" | "partial_end" | "contains")
        """
        # Query database for overlapping events
        overlapping = Event.find_overlapping(
            user_id=user_id,
            start_time=start_time,
            end_time=end_time,
            exclude_id=exclude_event_id
        )

        conflicts = []
        for event in overlapping:
            conflict = ConflictInfo(
                event_id=event.id,
                summary=event.summary,
                start_time=event.start_time,
                end_time=event.end_time,
                calendar_name=event.calendar.name,
                provider=event.provider,
                overlap_type=self._classify_overlap(
                    new_start=start_time,
                    new_end=end_time,
                    existing_start=event.start_time,
                    existing_end=event.end_time
                )
            )
            conflicts.append(conflict)

        return conflicts

    def _classify_overlap(
        self,
        new_start: datetime,
        new_end: datetime,
        existing_start: datetime,
        existing_end: datetime
    ) -> str:
        """
        Classify type of overlap

        Returns:
            - "full": New event completely overlaps existing
            - "partial_start": New event starts during existing
            - "partial_end": New event ends during existing
            - "contains": New event is contained within existing
        """
        if new_start <= existing_start and new_end >= existing_end:
            return "full"
        elif new_start < existing_end and new_end > existing_end:
            return "partial_start"
        elif new_start < existing_start and new_end > existing_start:
            return "partial_end"
        else:
            return "contains"
Overlap Logic (SQL):


# In backend/database/models.py - Event class
@classmethod
def find_overlapping(
    cls,
    user_id: int,
    start_time: datetime,
    end_time: datetime,
    exclude_id: Optional[int] = None
) -> List['Event']:
    """Find events that overlap with given time range"""
    query = cls.query.filter(
        cls.user_id == user_id,
        # Overlap condition: events that START before new END and END after new START
        cls.start_time < end_time,
        cls.end_time > start_time
    )

    if exclude_id:
        query = query.filter(cls.id != exclude_id)

    return query.all()
2. Conflict Response Model
Add to: backend/extraction/models.py


class ConflictInfo(BaseModel):
    event_id: int
    summary: str
    start_time: datetime
    end_time: datetime
    calendar_name: str
    provider: str  # "google" | "microsoft" | "apple"
    overlap_type: str  # "full" | "partial_start" | "partial_end" | "contains"

    def to_user_message(self) -> str:
        """Generate human-readable conflict message"""
        time_range = f"{self.start_time.strftime('%I:%M%p')}-{self.end_time.strftime('%I:%M%p')}"

        if self.overlap_type == "full":
            return f"⚠️  Completely overlaps with '{self.summary}' ({time_range})"
        elif self.overlap_type == "contains":
            return f"⚠️  Conflicts with '{self.summary}' ({time_range})"
        else:
            return f"⚠️  Partially overlaps with '{self.summary}' ({time_range})"


class SessionResult(BaseModel):
    """Enhanced session result with conflict warnings"""
    events: List[CalendarEvent]
    conflicts: Optional[List[List[ConflictInfo]]]  # Per-event conflicts
    warnings: List[str]  # Human-readable messages
3. Integration into Session Processor
Modify: backend/processing/session_processor.py

After Agent 3 formatting, before event creation:


# Current: Agent 3 formats events
calendar_events = format_for_calendar(extracted_facts)

# NEW: Check for conflicts
detector = ConflictDetector()
all_conflicts = []
warnings = []

for i, event in enumerate(calendar_events):
    # Parse start/end times
    start_time = datetime.fromisoformat(f"{event.date}T{event.start_time}")
    end_time = datetime.fromisoformat(f"{event.date}T{event.end_time}")

    # Detect conflicts
    conflicts = detector.check_conflicts(
        user_id=user_id,
        start_time=start_time,
        end_time=end_time
    )

    all_conflicts.append(conflicts)

    # Generate warnings
    if conflicts:
        warning_header = f"Event {i+1} ({event.title}):"
        conflict_messages = [c.to_user_message() for c in conflicts]
        warnings.append(warning_header)
        warnings.extend(conflict_messages)

# Include conflicts in session result
session.result = {
    "events": [e.dict() for e in calendar_events],
    "conflicts": [[c.dict() for c in conflicts] for conflicts in all_conflicts],
    "warnings": warnings,
    "has_conflicts": any(all_conflicts)
}
session.save()
4. User Interface Updates
Session response (returned to frontend):


{
  "session_id": "123",
  "events": [
    {
      "title": "Team Meeting",
      "start_time": "14:00:00",
      "end_time": "15:00:00",
      "date": "2026-02-06"
    }
  ],
  "conflicts": [
    [
      {
        "event_id": 456,
        "summary": "1:1 with Sarah",
        "start_time": "2026-02-06T14:00:00",
        "end_time": "2026-02-06T14:30:00",
        "calendar_name": "Work Calendar",
        "provider": "google",
        "overlap_type": "partial_start"
      }
    ]
  ],
  "warnings": [
    "Event 1 (Team Meeting):",
    "⚠️  Partially overlaps with '1:1 with Sarah' (02:00PM-02:30PM)"
  ],
  "has_conflicts": true
}
Frontend should display:


✅ Team Meeting
   Feb 6, 2026 at 2:00 PM - 3:00 PM

⚠️  CONFLICT DETECTED:
   Partially overlaps with '1:1 with Sarah' (02:00PM-02:30PM)

[ Create Anyway ]  [ Reschedule ]  [ Cancel ]
5. Conflict Resolution Options (Future Enhancement)
Not implementing now, but enabled by this work:


# In session_processor.py
if has_conflicts and auto_resolve:
    # Option 1: Find next available slot
    next_slot = find_next_available_time(
        user_id=user_id,
        duration=end_time - start_time,
        after=start_time
    )
    suggestions.append(f"Next available: {next_slot}")

    # Option 2: Suggest adjacent time
    if conflicts[0].overlap_type == "partial_start":
        suggest_time = conflicts[0].end_time  # After existing event
        suggestions.append(f"Try after existing event: {suggest_time}")
6. Configuration & Preferences
User preferences (in users.preferences JSONB):


{
  "conflict_behavior": "warn",  // "warn" | "auto_resolve" | "block"
  "allow_overlaps_for": ["tentative", "out-of-office"],  // Event types to ignore
  "conflict_threshold_minutes": 0  // Ignore conflicts shorter than X minutes
}
Implementation:


# In ConflictDetector
def should_warn(self, event: Event, user_prefs: dict) -> bool:
    """Check if conflict should generate warning"""
    # Skip if event is tentative and user allows tentative overlaps
    if event.status == "tentative" and "tentative" in user_prefs.get("allow_overlaps_for", []):
        return False

    # Skip if conflict is very short
    threshold = user_prefs.get("conflict_threshold_minutes", 0)
    overlap_minutes = calculate_overlap_duration(...)
    if overlap_minutes < threshold:
        return False

    return True
Files to Create/Modify
New Files:

backend/conflicts/detector.py - ConflictDetector service
backend/tests/test_conflict_detector.py - Unit tests
Modified Files:

backend/processing/session_processor.py - Add conflict detection step
backend/extraction/models.py - Add ConflictInfo model
backend/database/models.py - Add Event.find_overlapping() method
backend/sessions/routes.py - Include conflicts in API response
No migrations needed - using existing event table data

Testing Strategy
Unit Tests (backend/tests/test_conflict_detector.py):


def test_detect_full_overlap():
    # New: 2pm-3pm, Existing: 2pm-3pm → full overlap

def test_detect_partial_overlap():
    # New: 2pm-3pm, Existing: 2:30pm-3:30pm → partial

def test_detect_contained_overlap():
    # New: 2pm-3pm, Existing: 1pm-4pm → contained

def test_no_overlap():
    # New: 2pm-3pm, Existing: 3pm-4pm → no conflict

def test_multi_calendar_conflicts():
    # Detect conflicts across Google + Microsoft calendars

def test_exclude_self_on_update():
    # When updating event, don't flag itself as conflict
Integration Tests:


def test_end_to_end_conflict_warning():
    # 1. Create event at 2pm-3pm
    # 2. Submit new session: "Meeting at 2:30pm"
    # 3. Verify response includes conflict warning
    # 4. Verify event NOT auto-created

def test_no_conflict_scenario():
    # 1. Create event at 2pm-3pm
    # 2. Submit session: "Meeting at 4pm"
    # 3. Verify no conflicts
    # 4. Verify event created successfully
Manual Testing:

Create event "Team Standup" on Feb 6 at 10:00-10:30am
Input: "Meeting with Sarah tomorrow at 10:15am"
Expected: Warning about overlap with "Team Standup"
Verify warning includes: event name, time, overlap type
Test across multiple calendar providers (Google + Microsoft)
Success Criteria
✅ Conflicts detected across all user's calendars (Google/Microsoft/Apple)
✅ Warnings displayed to user before event creation
✅ Conflict details include: event name, time, calendar, overlap type
✅ No false positives (events that don't actually overlap)
✅ No false negatives (missing actual conflicts)
✅ Performance: Conflict check completes in <200ms
✅ Works for both authenticated and guest users (if they have calendar synced)
Summary
Three independent features:

Location Resolution: Geocode messy location input → structured addresses (Google Places API)
Contact Integration: Sync contacts (Google + calendar mining) → resolve names to emails → auto-invite
Conflict Detection: Query existing events → detect overlaps → warn user before creation
All features integrate into the existing extraction pipeline with minimal disruption to current flow.