# Calendar Event Extraction System - Features & Ideas

## Core Architecture

### Three-Agent Pipeline

**Agent 1: Global Event Identification**
- Receives full user input context
- Identifies and segments multiple events from text
- Extracts per-event context
- This layer is considered stable/frozen

**Agent 2: Structured Extraction & Deterministic Enrichment** (Per Event)
- Receives raw event context from Agent 1
- Performs structured field extraction
- Executes deterministic enrichment (API calls, lookups)
- No inference or guessing
- Outputs structured event with confidence scores

**Agent 3: Personalization, Inference & Refinement** (Per Event)
- Receives enriched structured event
- Accesses user history and behavioral patterns
- Performs intelligent inference for missing fields
- Applies personalization based on user preferences
- Produces final calendar event

**Optional: Validation Layer**
- Post-processing validation
- Ensures structural integrity
- Validates constraints (start < end, timezone validity, etc.)
- Does not reinterpret, only validates

---

## Temporal Processing

### 1. Deterministic Time Resolution

**Technology: Duckling**
- Rule-based temporal parser (Haskell HTTP service)
- Deterministic and consistent outputs
- Handles relative dates and times accurately

**Capabilities:**
- Parse relative expressions: "next Friday", "last Monday", "in 2 weeks"
- Parse absolute dates: "March 3rd", "February 15, 2026"
- Parse times: "3pm", "noon", "9:30am", "18:30"
- Parse durations: "90 minutes", "2 hours", "3h", "45 min"
- Provides structured metadata:
  - `grain` (hour/day/minute/month)
  - ISO timestamp
  - Original text span
  - Unit normalization

**Architecture Pattern:**
- LLM extracts clean temporal strings (no math, no inference)
- Duckling resolves strings to structured datetime objects
- Separation: language understanding vs calendar arithmetic

**What Duckling Does NOT Do:**
- Context-aware reasoning
- Personalization
- Inference of missing information
- Understanding vague language ("after midterms")

### 2. Temporal Inference (Intelligent)

**Missing End Times**
- Infer event duration when not explicitly stated
- Use multiple signals for inference

**Missing Durations**
- Infer based on event type
- Statistical analysis of user history

**Inference Data Sources:**
- Historical similar events (median duration, variance)
- Event type patterns (dinner, meeting, exam, class)
- Time of day context
- Day of week patterns (weekday vs weekend)
- User behavioral patterns
- Calendar density and surrounding events
- Event content/description analysis

**Example Inference Logic:**
```
No end time provided
→ Retrieve 8 similar "dinner" events from history
→ Median duration: 102 minutes
→ Variance: low
→ Predicted duration: 105 minutes
→ Confidence: 0.84
```

**What NOT To Do:**
- Avoid hardcoded mappings (dinner → 90 mins)
- Avoid single-step "bludgeon" inference
- Keep inference separate from extraction
- Make inference explainable and traceable

### 3. Temporal Schema Fields

**From LLM Extraction:**
- `date_text`: Clean date expression
- `end_date_text`: For multi-day events only
- `start_time_text`: Clean time expression (None for all-day)
- `end_time_text`: Explicit end time (None if not stated)
- `duration_minutes`: Integer minutes (explicit or LLM-inferred from type)
- `is_all_day`: Boolean flag
- `explicit_timezone`: Only if mentioned in text

**Design Principle:**
- LLM extracts spans as strings
- Does NOT perform math or unit conversion
- Duckling handles all normalization

---

## Location Resolution

### 1. Location Classification

**Location Types:**
- Explicit full address: "123 Main St, Providence, RI"
- Business/venue name: "Starbucks on Thayer"
- Short ambiguous name: "The office", "Blue Room"
- Personal semantic: "My room", "Home", "Dorm"
- Virtual: "Zoom", "Google Meet"
- Missing/null

**Extraction Agent Responsibilities:**
- Extract raw location string
- Classify location type
- Flag whether external search is needed
- Assign confidence score
- Mark locations like "My room" as non-searchable

### 2. Location Resolution Pipeline (Ordered)

**Step 1: Special Categories (No External Search)**
- Personal semantic locations:
  - "Home" → user.home_address
  - "Office" → user.work_address
  - "My room" → user.dorm_address
- Virtual locations:
  - "Zoom" → attach meeting link placeholder
  - "Google Meet" → virtual flag

**Step 2: Past Similar Locations**
- Search user history BEFORE calling external APIs
- Match strategies:
  - Exact string match in past events
  - Semantic similarity to past event locations
  - Location used with similar event titles
- Reuse existing location object if high-confidence match
- Assign confidence boost for historical matches

**Why Past Locations Come First:**
- Faster than API calls
- Respects user habits
- Avoids Google Maps ambiguity
- More personalized
- User-specific memory > global search

**Step 3: External Lookup (Google Maps API)**
- Only if `needs_external_search = true` AND no strong past match
- Operations:
  - Geocoding
  - Retrieve Place ID
  - Get formatted address
  - Get latitude/longitude
  - Retrieve business hours (optional future)

**Step 4: Disambiguation**
- If multiple Google results, rank by:
  - Distance from user home/work
  - Frequency in past events
  - Time-based context (8am weekday → near office)
  - Same-day event clustering logic

**Step 5: Pass Candidates to Inference Layer**
- If ambiguity remains, don't guess
- Pass top 2-3 candidates to Agent 3
- Agent 3 uses context to choose (e.g., participant patterns, event type)

### 3. Location Data Sources

**From User Profile:**
- Home address
- Work address  
- Campus location
- Frequent cities/regions
- Current location (optional)

**From User History:**
- Most common locations per event type
- Recurring meeting locations
- Locations tied to specific participants
- Time-of-day location patterns
- Weekday vs weekend patterns

**From Event Context:**
- Participants (meeting with professor → campus)
- Event type (gym → specific gym used before)
- Event description ("at John's place")
- Time of day (morning → office, evening → home area)

**From Geography:**
- Distance weighting
- Travel feasibility between consecutive events
- Same-day event clustering

**From External Tools:**
- Google Maps API (geocoding, place search)
- Reverse geocoding
- Business information

---

## Contact/Attendee Resolution

### Future Functionality

**Contact Identification:**
- Match names in text to known contacts
- Disambiguate multiple contacts with same name
- Use historical meeting patterns
- Analyze past invite behavior

**Data Sources:**
- Contact database/address book
- Email history
- Past calendar event attendees
- Invite patterns and frequency

**Confidence Handling:**
- Assign confidence to matched contacts
- Ask for clarification if ambiguous
- Consider event type context

---

## Confidence & Uncertainty Management

### 1. Confidence Scoring

**Per-Field Confidence:**
- Not just per-event, but per individual field
- Track confidence for: time, location, duration, attendees, etc.

**Field Structure:**
```
Field {
  value: actual_value,
  confidence: 0.0-1.0,
  source: "explicit" | "inferred" | "historical" | "default",
  needs_confirmation: boolean,
  explanation: optional reasoning
}
```

**Confidence Sources:**
- Extraction clarity
- Historical pattern strength
- External lookup certainty
- Disambiguation difficulty
- Number of matching candidates

### 2. Uncertainty Flags

**Agent 1 Outputs Uncertainty Markers:**
```
uncertainty_flags: [
  "no_end_time",
  "location_ambiguous", 
  "contact_unresolved",
  "duration_unstated"
]
```

### 3. Confidence-Based Decision Matrix

**High Confidence (>0.85):**
- Auto-fill silently
- No user interaction needed

**Medium Confidence (0.60-0.85):**
- Auto-fill with suggestion UI
- Allow easy override
- Show alternative options

**Low Confidence (0.40-0.60):**
- Ask user for clarification
- Present top candidates
- Require user selection

**Very Low Confidence (<0.40):**
- Block auto-completion
- Require explicit user input
- Mark field as incomplete

---

## Clarification System

### When to Trigger Clarification

**Automatic Triggers:**
- Confidence below threshold
- Multiple equally-likely interpretations
- Conflicting signals in data
- Missing required fields
- Ambiguous temporal references
- Location with multiple strong candidates

**Clarification Types:**
- Single choice: "Did you mean Location A or Location B?"
- Time confirmation: "Should this end at 9:30pm?"
- Duration question: "How long will this last?"
- Missing field: "Where will this take place?"

**Design Principles:**
- Clarification is a feature, not a failure
- Better to ask than to guess incorrectly
- Calendar errors break user trust
- Keep questions focused and specific

---

## Web Search / External Context

### When to Use Web Search

**Appropriate Cases:**
- Public events (conferences, concerts)
- Venue information not in user history
- Event details requiring current information
- Disambiguating unclear references

**NOT Appropriate:**
- Personal events
- Routine activities
- When sufficient historical data exists
- As default behavior

**Gating Logic:**
- Only trigger on explicit low-confidence signals
- Event type suggests public/external event
- Combined with lack of historical data
- User preference for detail enrichment

**Architecture:**
- Web search is enrichment, not parsing
- Should NOT be called by extraction layer
- Belongs in inference/enrichment layer
- Controlled by confidence thresholds

---

## Personalization Engine

### User Behavioral Patterns

**Stylistic Patterns:**
- Title capitalization preferences
- Event naming conventions
- Description formatting
- Emoji usage

**Calendar Selection:**
- Which calendar for which event types
- Work vs personal calendar rules
- Project-specific calendars
- Time-based calendar selection

**Temporal Patterns:**
- Typical event start times
- Preferred meeting durations
- Buffer time between events
- Work hours vs personal time

**Location Patterns:**
- Frequently used locations
- Default locations per event type
- Commute and travel patterns
- Time-of-day location preferences

### Historical Event Analysis

**Semantically Similar Events:**
- Find past events matching current event type
- Compare event descriptions
- Match by participants
- Match by location patterns

**User Corrections:**
- Track when user edits auto-generated events
- Learn from correction patterns
- Adjust inference models based on feedback
- Improve personalization over time

**Statistical Analysis:**
- Median durations per event type
- Variance in user patterns
- Frequency distributions
- Confidence intervals

---

## Tool Loop Architecture

### What Tool Loops Are

**Basic Mechanism:**
- Model produces structured output
- Output may include tool call request
- Backend executes tool
- Append result to conversation
- Model runs again with new information
- Repeat until final answer or max iterations

### Tool Loop Components

**1. Tool Schema Definition:**
```json
{
  "name": "google_maps_search",
  "parameters": {
    "query": "string",
    "location_bias": "string (optional)"
  }
}
```

**2. Structured Model Output:**
```json
{
  "type": "tool_call",
  "tool_name": "google_maps_search",
  "arguments": {
    "query": "Blue Room Providence RI"
  }
}
```
OR
```json
{
  "type": "final_event",
  "event": { ... }
}
```

**3. Orchestrator (Backend Controller):**
```python
max_loops = 3
loop_count = 0

while loop_count < max_loops:
    response = call_llm(messages)
    
    if response.type == "final_event":
        return response.event
    
    if response.type == "tool_call":
        tool_result = execute_tool(response)
        messages.append(tool_result)
        loop_count += 1

raise Exception("Max loops exceeded")
```

### Tool Loop Best Practices

**Critical Constraints:**
- Hard cap on iterations (2-3 max)
- Strict JSON schema enforcement
- Tool whitelist (only predefined tools)
- Require justification for tool calls
- Confidence must improve each iteration

**Safety Rules:**
- No arbitrary tool invention
- No malformed arguments
- Tool results not too verbose
- Must have confidence threshold
- Stop if confidence doesn't increase

### When to Use Tool Loops

**Good Candidates:**
- Business location lookup
- Contact disambiguation  
- Address normalization
- Place ID resolution

**Bad Candidates (Use Clarification Instead):**
- Missing duration
- Unclear end time
- User preference inference
- Open-ended reasoning

**Where Loops Live:**
- Only in Agent 3 (inference layer)
- Never in Agent 2 (deterministic enrichment)
- Agent 2 executes predefined tools only
- Agent 3 can request contextual tools

### Loop Types

**Deterministic Loop:**
- Predefined tools for structured enrichment
- Maps, contact lookup, time resolution
- Appropriate for calendar system

**Exploratory Loop:**
- Web search, page summarization, query generation
- Open domain reasoning
- Much higher complexity (avoid for v1)

---

## System Design Principles

### Layer Separation

**Never Mix:**
- Extraction and inference
- Resolution and personalization
- Parsing and enrichment
- Language understanding and calendar arithmetic

**Each Layer Has Single Responsibility:**

| Layer | Inference? | API Calls? | Personalization? |
|-------|-----------|-----------|-----------------|
| 1. Structuring | No | No | No |
| 2. Enrichment | No | Yes | No |
| 3. Inference/Personalization | Yes | Uses provided data | Yes |
| 4. Validation | No | No | No |

### Data Flow Principles

**Pipeline Stages:**
1. Extract raw event structure
2. Enrich deterministically (APIs, lookups)
3. Infer missing pieces (with confidence)
4. Personalize using user history
5. Clarify if confidence too low
6. Validate final structure

**Object Evolution:**
```
Raw Input 
  → StructuredEvent_v1
  → EnrichedEvent_v1  
  → InferredEvent_v1
  → FinalEvent_v1
  → ValidatedEvent_v1
```

### What to Avoid

**Anti-Patterns:**
- "Smart monolith" agent doing everything
- LLMs doing calendar arithmetic
- Mixing inference into deterministic layers
- Uncontrolled loops
- Inference without confidence tracking
- Blind guessing instead of clarification
- Hardcoded inference rules (dinner → 90 min)
- Overlapping responsibilities between layers

**Debugging Principles:**
- Keep deterministic layers pure
- Make inference explainable
- Track confidence per field
- Avoid responsibility mixing
- Maintain clear provenance

---

## Advanced Features (Future)

### Multi-Event Context Awareness

**Calendar Density Analysis:**
- Detect scheduling conflicts
- Consider buffer time between events
- Analyze daily/weekly patterns

**Event Relationships:**
- Recurring event patterns
- Event series detection
- Related event clustering

### Timezone Intelligence

**Smart Timezone Handling:**
- Detect travel events
- Adjust for location changes
- Handle cross-timezone scheduling
- Explicit timezone override when stated

### Learning & Adaptation

**Feedback Loops:**
- Learn from user corrections
- Adjust confidence models over time
- Improve inference accuracy
- Personalization refinement

**Pattern Recognition:**
- Detect new behavioral patterns
- Adapt to changing user preferences
- Seasonal pattern recognition
- Context-dependent behavior learning

---

## Implementation Notes

### Technology Stack Decisions

**Duckling:**
- Run as Docker sidecar on Elastic Beanstalk
- Lightweight (100-200MB RAM)
- Minimal CPU requirements
- Can run on t3.micro

**Deployment:**
```yaml
# docker-compose.yml
services:
  web:
    build: .
    ports: ["80:5000"]
    depends_on: [duckling]
  
  duckling:
    image: rasa/duckling
    ports: ["8000:8000"]
```

**Alternative Simple Option:**
- Python `dateparser` library for lightweight use cases
- Trade determinism for simplicity
- Good for experimentation, not production-grade

### Confidence Model Considerations

**Per-Field Tracking:**
- Individual confidence scores
- Source attribution
- Uncertainty flags
- Explanation/reasoning

**Aggregation:**
- Overall event confidence
- Field-weighted importance
- Critical vs optional fields

### Schema Design

**Core Requirements:**
- Support field-level confidence
- Track provenance per field
- Mark fields needing confirmation
- Allow null/missing values
- Version events through pipeline stages

---

## Testing & Evaluation Strategy

### What to Measure

**Accuracy Metrics:**
- Temporal resolution correctness
- Location resolution accuracy
- Duration inference precision
- Confidence calibration

**User Experience:**
- Clarification frequency
- User correction rates
- Time to event creation
- User trust/satisfaction

**System Performance:**
- API latency (Duckling, Maps)
- Tool loop iterations
- Confidence score distribution
- Inference quality over time

### Stress Testing

**Edge Cases:**
- Month boundary dates
- Timezone transitions
- Ambiguous relative dates
- Multiple events same description
- Conflicting temporal references

**Real-World Examples:**
- Collect actual user inputs
- Test against historical corrections
- Measure improvement over baseline
- A/B test inference strategies

---

## Open Questions & Design Decisions

### Structural Decisions

**Tool Loop Inclusion:**
- Should v1 include dynamic tool loops?
- Or start with deterministic enrichment + single inference pass?
- What are confidence requirements for production?

**Agent 3 Scope:**
- How general should the inference agent be?
- Deterministically woven logic vs centralized intelligence?
- Balance between flexibility and debuggability

### Field-Specific Strategies

**Each field may need custom resolution:**
- Time: deterministic then inference
- Location: history → API → inference
- Duration: history-based statistical inference
- Contacts: lookup → pattern matching → clarification

### Confidence Thresholds

**Need to Define:**
- Threshold for auto-fill
- Threshold for suggestion
- Threshold for required clarification
- Threshold for blocking completion

**Calibration Strategy:**
- Start conservative (high thresholds)
- Adjust based on user feedback
- Field-specific thresholds
- User-specific adaptation

### Clarification UX

**Implementation Questions:**
- Inline vs modal clarification?
- Batch questions vs incremental?
- How to present confidence to users?
- Suggestion vs question phrasing?

---

## Success Criteria

### System Goals

**Accuracy:**
- High precision on temporal resolution
- Correct location most of the time
- Reasonable duration inference

**User Experience:**
- Feel intelligent and helpful
- Minimize user friction
- Build trust through consistency
- Graceful handling of uncertainty

**Engineering:**
- Maintainable and debuggable
- Measurable performance
- Scalable architecture
- Clear separation of concerns

**Trust:**
- Deterministic where possible
- Transparent when inferring
- Clear when uncertain
- Never silently wrong
