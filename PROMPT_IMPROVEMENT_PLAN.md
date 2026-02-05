# DropCal Prompt Improvement Plan

**Goal:** Improve extraction quality and robustness on real-world messy inputs
**Focus:** High-impact changes that directly improve output quality
**Timeline:** 2-3 weeks of iterative improvements

---

## Executive Summary

Your prompts are already solid. You've recently added validation sections to facts.txt and formatting.txt, which is exactly the right direction. This plan focuses on **two high-impact improvements**:

1. **Expand examples** with edge cases, ambiguous inputs, and messy real-world scenarios
2. **Add negative examples** showing common mistakes and what NOT to do

These changes will significantly improve quality on the messy, informal text users actually provide (emails, texts, screenshots, flyers).

**Skip:** Structural reorganization (XML tags, contract format, shortening) - these are maintainability improvements, not quality improvements.

---

## Current State Assessment

### ✅ What's Working Well

| Prompt File | Strengths |
|-------------|-----------|
| **identification.txt** | Clear role definition, good event splitting rules, context awareness section |
| **facts.txt** | Strong normalization rules, NEW validation section (lines 47-61), good temporal context handling |
| **formatting.txt** | NEW validation section (lines 58-79), explicit RRULE format rules, clear ISO 8601 examples |
| **modification.txt** | Good consistency checks, clear minimal changes principle, solid examples |
| **preferences.txt** | Concise, clear enhancement categories, good dynamic few-shot from history |

### ⚠️ What Needs Improvement

| Issue | Impact | Priority |
|-------|--------|----------|
| **Limited edge case coverage** | Model struggles with ambiguous/messy inputs | 🔴 HIGH |
| **No negative examples** | Model repeats common mistakes | 🔴 HIGH |
| **Few examples of typos/abbreviations** | Poor quality on informal text (texts, quick emails) | 🟡 MEDIUM |
| **Missing multi-day event examples** | Conferences, trips parsed incorrectly | 🟡 MEDIUM |
| **No examples of conflicting information** | Model picks wrong data when corrections appear | 🟡 MEDIUM |

---

## Improvement Priorities

### 🔴 Priority 1: Edge Case Examples (Week 1)

**Why:** Current examples are clean and straightforward. Real users provide messy, ambiguous, abbreviated text.

**Target:** Add 8-10 examples per prompt covering:
- Ambiguous dates/times
- Typos and abbreviations
- Conflicting information
- Minimal context
- Multi-day events
- Complex recurrence patterns

**Expected Impact:** 30-40% improvement in quality on real-world inputs

---

### 🔴 Priority 2: Negative Examples (Week 2)

**Why:** Claude learns effectively from contrasts. Showing "don't do this" alongside "do this" reduces errors.

**Target:** Add 5-8 negative examples per prompt showing common mistakes

**Expected Impact:** 20-30% reduction in format errors and extraction mistakes

---

### 🟢 Priority 3: Validation Expansion (Week 3)

**Why:** You've already started this in facts.txt and formatting.txt. Extend to all prompts.

**Target:** Add pre-output validation checklists to identification.txt and modification.txt

**Expected Impact:** 15-20% reduction in downstream errors

---

## Specific Changes by File

### 1. identification.txt

#### Current Examples (Lines 65-95)
- ✅ Basic team meeting
- ✅ Homework + midterm
- ✅ Tentative coffee/lunch

#### Add These Edge Cases

```markdown
Example: Abbreviations and typos
Input: "mtg tmrw @ 2 in conf rm B w/ Sarah re: Q1 #s"
Output:
Event 1:
- raw_text: ["mtg tmrw @ 2 in conf rm B w/ Sarah re: Q1 #s"]
- description: "Meeting tomorrow 2pm in Conference Room B with Sarah about Q1 numbers"
- confidence: "definite"

Example: Multi-day event
Input: "Conference in Boston March 15-17. Hotel confirmation attached."
Output:
Event 1:
- raw_text: ["Conference in Boston March 15-17.", "Hotel confirmation attached."]
- description: "Conference in Boston (March 15-17)"
- confidence: "definite"

Example: Conflicting information (correction)
Input: "Team sync Thursday at 2pm. Actually, can we do 3pm instead? Thanks!"
Output:
Event 1:
- raw_text: ["Team sync Thursday at 3pm"]
- description: "Team sync (Thursday 3pm)"
- confidence: "definite"
Note: Use the corrected time (3pm), not the original (2pm)

Example: Minimal context
Input: "Office hours"
Output:
Event 1:
- raw_text: ["Office hours"]
- description: "Office hours"
- confidence: "definite"

Example: Time range ambiguity
Input: "Meeting either 2-3 or 3-4 tomorrow, will confirm"
Output:
Event 1:
- raw_text: ["Meeting either 2-3 or 3-4 tomorrow, will confirm"]
- description: "Meeting tomorrow (time TBD: 2-3pm or 3-4pm)"
- confidence: "tentative"

Example: Recurring with exceptions
Input: "Weekly standup every Monday at 9am. No meeting Feb 17 (holiday)."
Output:
Event 1:
- raw_text: ["Weekly standup every Monday at 9am.", "No meeting Feb 17 (holiday)."]
- description: "Weekly standup (Mondays 9am, except Feb 17)"
- confidence: "definite"

Example: Multiple events in conversational text
Input: "Hey! Can you make dentist appt for Tuesday at 10am? Also need to schedule car service sometime next week, maybe Thursday afternoon?"
Output:
Event 1:
- raw_text: ["Can you make dentist appt for Tuesday at 10am?"]
- description: "Dentist appointment (Tuesday 10am)"
- confidence: "definite"
Event 2:
- raw_text: ["Also need to schedule car service sometime next week, maybe Thursday afternoon?"]
- description: "Car service (possibly next Thursday afternoon)"
- confidence: "tentative"

Example: Event with no time (all-day or deadline)
Input: "Birthday party for Mom on March 20. Sarah's thesis defense March 15."
Output:
Event 1:
- raw_text: ["Birthday party for Mom on March 20."]
- description: "Birthday party for Mom (March 20)"
- confidence: "definite"
Event 2:
- raw_text: ["Sarah's thesis defense March 15."]
- description: "Sarah's thesis defense (March 15)"
- confidence: "definite"
```

#### Add Negative Examples

```markdown
COMMON MISTAKES TO AVOID:

❌ WRONG: Treating course descriptions as events
Input: "This course covers algorithms and data structures"
Bad Output: Event identified
✅ RIGHT: No events found (this is a description, not a calendar event)

❌ WRONG: Extracting vague suggestions
Input: "We should grab coffee sometime"
Bad Output: Event identified
✅ RIGHT: No events found (no specific time = not an event)

❌ WRONG: Missing the corrected information
Input: "Meeting at 2pm. Wait, make that 3pm."
Bad Output: Event at 2pm
✅ RIGHT: Event at 3pm (use the correction, not the original)

❌ WRONG: Splitting recurring events into multiple events
Input: "Team standup every Monday and Wednesday"
Bad Output: 2 separate events
✅ RIGHT: 1 recurring event with days=["Monday", "Wednesday"]

❌ WRONG: Generic descriptions that don't differentiate events
Input: "CSCI 0200 midterm Feb 25. CSCI 0200 final April 15."
Bad Output: Both described as "Exam"
✅ RIGHT: "CSCI 0200 midterm (Feb 25)" and "CSCI 0200 final (April 15)"
```

#### Add Validation Checklist

Add after line 62, before examples:

```markdown
BEFORE RETURNING - VALIDATE YOUR OUTPUT:
□ Did I find ALL events in the input? (count them)
□ Is each description UNIQUE and SPECIFIC? (not generic like "Meeting")
□ Did I extract ALL relevant text for each event? (complete sentences/phrases)
□ Did I use the CORRECTED information if there were changes?
□ Did I properly distinguish recurring vs one-time events?
□ Are tentative events marked correctly?

If any check fails → review and fix before returning
```

---

### 2. facts.txt

✅ **You already added validation (lines 47-61) - good work!**

#### Current Examples (Lines 95-130)
- ✅ Basic meeting
- ✅ Recurring homework
- ✅ Midterm with duration
- ✅ Recitation
- ✅ Wedding inference
- ✅ Zoom with attendees
- ✅ Hybrid meeting

#### Add These Edge Cases

```markdown
Example: Abbreviations and informal language
Input: ["mtg tmrw @ 2pm w/ Sarah re: Q1 projections"]
Current context shows tomorrow = 2026-02-05
Output:
title="Meeting", date="2026-02-05", time="14:00:00", people=["Sarah"], notes="regarding Q1 projections", is_recurring=false

Example: Time range (start and end both specified)
Input: ["Workshop 2-4pm Friday in Building A"]
Current context shows Next Friday = 2026-02-13
Output:
title="Workshop", date="2026-02-13", time="14:00:00", end_time="16:00:00", location="Building A", is_recurring=false

Example: Multi-day event (conference/trip)
Input: ["Conference in Boston March 15-17", "Flights booked"]
Output:
title="Conference", date="2026-03-15", end_date="2026-03-17", location="Boston", notes="flights booked", is_recurring=false

Example: All-day event (no specific time)
Input: ["Mom's birthday March 20"]
Output:
title="Mom's Birthday", date="2026-03-20", time=null, is_recurring=false

Example: Deadline (end of day)
Input: ["Homework 3 due Thursday"]
Current context shows Next Thursday = 2026-02-12
Output:
title="Homework 3", date="2026-02-12", time="23:59:00", notes="due", is_recurring=false

Example: Recurring with specific days (multiple)
Input: ["Lectures Monday, Wednesday, Friday at 1pm in Smith Hall"]
Current context shows Next Monday = 2026-02-09
Output:
title="Lecture", date="2026-02-09", time="13:00:00", location="Smith Hall", is_recurring=true, pattern="weekly", days=["Monday", "Wednesday", "Friday"]

Example: Complex recurrence (bi-weekly)
Input: ["Team retrospective every other Friday at 3pm starting Feb 13"]
Output:
title="Team Retrospective", date="2026-02-13", time="15:00:00", is_recurring=true, pattern="weekly", interval=2, days=["Friday"]

Example: Minimal information (just a name and day)
Input: ["Office hours Thursday"]
Current context shows Next Thursday = 2026-02-12
Output:
title="Office Hours", date="2026-02-12", time=null, is_recurring=false

Example: Correction/conflicting info (use latest)
Input: ["Meeting at 2pm", "Actually make it 3pm"]
Current context shows tomorrow = 2026-02-05
Output:
title="Meeting", date="2026-02-05", time="15:00:00", is_recurring=false
Note: Use the corrected time (3pm), ignore the original (2pm)

Example: Time with timezone conversion needed
Input: ["Client call tomorrow 2pm PST"]
Current context shows tomorrow = 2026-02-05
Output:
title="Client Call", date="2026-02-05", time="17:00:00", notes="originally 2pm PST, converted to EST", is_recurring=false
```

#### Add Negative Examples

Add after line 94, before current examples:

```markdown
COMMON MISTAKES TO AVOID:

❌ WRONG: title="Team meeting tomorrow with Sarah in Conference Room B"
✅ RIGHT: title="Team Meeting"
Reason: Title should be ≤3 words, abstract. Details go in other fields.

❌ WRONG: location="Zoom" or location="virtual"
✅ RIGHT: location=null, meeting_url="https://zoom.us/..."
Reason: Virtual platforms are NOT physical locations.

❌ WRONG: date="tomorrow" or date="next week"
✅ RIGHT: date="2026-02-05" (use temporal context to get actual date)
Reason: Must normalize to YYYY-MM-DD format.

❌ WRONG: time="2pm" or time="14:00"
✅ RIGHT: time="14:00:00"
Reason: Must be HH:MM:SS format with seconds.

❌ WRONG: duration="1.5 hours"
✅ RIGHT: duration="90 minutes"
Reason: Keep duration as written (system will parse it).

❌ WRONG: Inventing information not in the text
Input: ["Team meeting tomorrow"]
Bad: time="14:00:00" (hallucinated)
✅ RIGHT: time=null (not mentioned)
Reason: Only extract what's explicit or strongly inferable.

❌ WRONG: Extracting virtual platform name as location
Input: ["Meeting on Teams in Conference Room A"]
Bad: location="Teams, Conference Room A"
✅ RIGHT: location="Conference Room A", notes="meeting on Teams"
Reason: Teams is the platform, not the location.
```

---

### 3. formatting.txt

✅ **You already added comprehensive validation (lines 58-79) - excellent!**

#### Current Examples (Lines 81-90)
- ✅ Basic meeting
- ✅ Recurring homework
- ✅ Midterm with duration

#### Add These Edge Cases

```markdown
Example: Multi-day event (conference)
Input facts (normalized):
title="Conference", date="2026-03-15", end_date="2026-03-17", location="Boston"

Output:
summary="Conference"
start: dateTime="2026-03-15T00:00:00-05:00", timeZone="{timezone}"
end: dateTime="2026-03-17T23:59:00-05:00", timeZone="{timezone}"
location="Boston"
recurrence=null

Example: All-day event (birthday)
Input facts (normalized):
title="Mom's Birthday", date="2026-03-20", time=null

Output:
summary="Mom's Birthday"
start: date="2026-03-20"
end: date="2026-03-21"
recurrence=null
Note: All-day events use "date" field, not "dateTime"

Example: Time range specified (start and end)
Input facts (normalized):
title="Workshop", date="2026-02-13", time="14:00:00", end_time="16:00:00", location="Building A"

Output:
summary="Workshop"
start: dateTime="2026-02-13T14:00:00-05:00", timeZone="{timezone}"
end: dateTime="2026-02-13T16:00:00-05:00", timeZone="{timezone}"
location="Building A"
recurrence=null

Example: Recurring with multiple days
Input facts (normalized):
title="Lecture", date="2026-02-09", time="13:00:00", location="Smith Hall", is_recurring=true, pattern="weekly", days=["Monday", "Wednesday", "Friday"]

Output:
summary="Lecture"
start: dateTime="2026-02-09T13:00:00-05:00", timeZone="{timezone}"
end: dateTime="2026-02-09T14:00:00-05:00", timeZone="{timezone}"
location="Smith Hall"
recurrence=["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]

Example: Bi-weekly recurrence
Input facts (normalized):
title="Team Retrospective", date="2026-02-13", time="15:00:00", is_recurring=true, pattern="weekly", interval=2, days=["Friday"]

Output:
summary="Team Retrospective"
start: dateTime="2026-02-13T15:00:00-05:00", timeZone="{timezone}"
end: dateTime="2026-02-13T16:00:00-05:00", timeZone="{timezone}"
recurrence=["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"]

Example: Deadline (end of day)
Input facts (normalized):
title="Homework 3", date="2026-02-12", time="23:59:00", notes="due"

Output:
summary="Homework 3"
start: dateTime="2026-02-12T23:59:00-05:00", timeZone="{timezone}"
end: dateTime="2026-02-13T00:29:00-05:00", timeZone="{timezone}"
description="due"
recurrence=null
```

#### Add Negative Examples

Add after line 80, before current examples:

```markdown
COMMON MISTAKES TO AVOID:

❌ WRONG: dateTime="2026-02-05 14:00:00" (space separator)
✅ RIGHT: dateTime="2026-02-05T14:00:00-05:00" (T separator + timezone)
Reason: Must use ISO 8601 format with T and timezone offset.

❌ WRONG: dateTime="2026-02-05T14:00:00" (missing timezone)
✅ RIGHT: dateTime="2026-02-05T14:00:00-05:00"
Reason: Timezone offset is REQUIRED.

❌ WRONG: timeZone="EST" or timeZone="Eastern"
✅ RIGHT: timeZone="America/New_York"
Reason: Must use IANA timezone format.

❌ WRONG: recurrence=["FREQ=WEEKLY;BYDAY=TU"]
✅ RIGHT: recurrence=["RRULE:FREQ=WEEKLY;BYDAY=TU"]
Reason: Must start with "RRULE:" prefix.

❌ WRONG: recurrence=["RRULE:BYDAY=MO,WE"]
✅ RIGHT: recurrence=["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]
Reason: FREQ parameter is REQUIRED.

❌ WRONG: end time before start time
Input: start="2026-02-05T15:00:00-05:00", end="2026-02-05T14:00:00-05:00"
✅ RIGHT: Ensure end > start, or set end = start + 1 hour if unclear
Reason: End must always be after start.
```

---

### 4. modification.txt

#### Current Examples (Lines 49-100)
- ✅ Move to 3pm
- ✅ Add Zoom link
- ✅ Move to next Tuesday + change duration
- ✅ Cancel recurrence

#### Add These Edge Cases

```markdown
Example: Add person to meeting
Original Event:
{
  "summary": "Team Meeting",
  "start": {"dateTime": "2026-02-05T14:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-05T15:00:00-05:00", "timeZone": "America/New_York"},
  "attendees": [{"email": "john@company.com"}]
}

Edit: "Add sarah@company.com to the meeting"
Result:
{
  "summary": "Team Meeting",
  "start": {"dateTime": "2026-02-05T14:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-05T15:00:00-05:00", "timeZone": "America/New_York"},
  "attendees": [
    {"email": "john@company.com"},
    {"email": "sarah@company.com"}
  ]
}

Example: Extend duration
Original Event:
{
  "summary": "Workshop",
  "start": {"dateTime": "2026-02-10T14:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-10T15:00:00-05:00", "timeZone": "America/New_York"}
}

Edit: "Make it 2 hours long"
Result:
{
  "summary": "Workshop",
  "start": {"dateTime": "2026-02-10T14:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-10T16:00:00-05:00", "timeZone": "America/New_York"}
}

Example: Move earlier by amount
Original Event:
{
  "summary": "Dentist",
  "start": {"dateTime": "2026-02-12T14:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-12T15:00:00-05:00", "timeZone": "America/New_York"}
}

Edit: "Move 30 minutes earlier"
Result:
{
  "summary": "Dentist",
  "start": {"dateTime": "2026-02-12T13:30:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-12T14:30:00-05:00", "timeZone": "America/New_York"}
}

Example: Change to recurring
Original Event:
{
  "summary": "Team Sync",
  "start": {"dateTime": "2026-02-10T10:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-10T11:00:00-05:00", "timeZone": "America/New_York"}
}

Edit: "Make this weekly"
Result:
{
  "summary": "Team Sync",
  "start": {"dateTime": "2026-02-10T10:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-10T11:00:00-05:00", "timeZone": "America/New_York"},
  "recurrence": ["RRULE:FREQ=WEEKLY"]
}

Example: Multiple changes at once
Original Event:
{
  "summary": "Client Call",
  "start": {"dateTime": "2026-02-08T14:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-08T15:00:00-05:00", "timeZone": "America/New_York"}
}

Edit: "Move to Friday at 3pm and add Teams link: https://teams.microsoft.com/l/meetup/..."
Result:
{
  "summary": "Client Call",
  "start": {"dateTime": "2026-02-13T15:00:00-05:00", "timeZone": "America/New_York"},
  "end": {"dateTime": "2026-02-13T16:00:00-05:00", "timeZone": "America/New_York"},
  "location": "https://teams.microsoft.com/l/meetup/..."
}
```

#### Add Validation Checklist

Add after line 48, before examples:

```markdown
BEFORE RETURNING - VALIDATE YOUR OUTPUT:
□ Did I apply ONLY the requested changes? (not extra modifications)
□ Is end time after start time? (especially after time shifts)
□ Did I preserve all other fields unchanged?
□ Is the result valid? (proper ISO 8601, valid RRULE if applicable)
□ If recurrence added/modified, is RRULE format correct?

If any check fails → fix before returning
```

#### Add Negative Examples

```markdown
COMMON MISTAKES TO AVOID:

❌ WRONG: Changing multiple things when only one was requested
Edit: "Move to 3pm"
Bad: Changes time AND location AND adds attendees
✅ RIGHT: Changes time only, everything else unchanged
Reason: Minimal changes principle - only modify what was requested.

❌ WRONG: Creating invalid end time
Edit: "Move to 11pm"
Bad: start="2026-02-05T23:00:00-05:00", end="2026-02-05T22:00:00-05:00"
✅ RIGHT: start="2026-02-05T23:00:00-05:00", end="2026-02-06T00:00:00-05:00"
Reason: End must be after start.

❌ WRONG: Misunderstanding relative changes
Edit: "Make it 30 minutes"
Bad: Changes start time to 30 minutes past the hour
✅ RIGHT: Changes duration to 30 minutes (adjusts end time)
Reason: Context matters - "make it X" usually means duration.

❌ WRONG: Losing data during modification
Edit: "Change location to Building B"
Bad: Removes attendees, description, and other fields
✅ RIGHT: Only changes location field, all other fields preserved
Reason: Surgical precision - change only what's requested.
```

---

### 5. preferences.txt

This prompt is already concise (37 lines) and works with dynamic few-shot examples built in code.

#### Add Brief Guidance

Add after line 36:

```markdown
COMMON MISTAKES TO AVOID:

❌ WRONG: Removing or losing original facts
Input has location="Conference Room A", preferences don't mention location
Bad: Returns location=null
✅ RIGHT: Preserves location="Conference Room A"
Reason: ONLY ADD or ENHANCE, never remove information.

❌ WRONG: Overriding explicit user data with preferences
Input has title="URGENT: Board Meeting", user usually uses short titles
Bad: Changes to title="Board Meeting" (removes "URGENT")
✅ RIGHT: Preserves title="URGENT: Board Meeting"
Reason: User's explicit information takes precedence over learned patterns.

❌ WRONG: Applying preferences when confidence is low
No similar events in history, unclear which calendar to use
Bad: Assigns to "Work" calendar with low confidence
✅ RIGHT: Assigns to "Default" (primary calendar)
Reason: Default to primary calendar when uncertain.
```

---

## Implementation Timeline

### Week 1: Edge Case Examples (Feb 10-16)

**Monday-Tuesday:** identification.txt
- Add 8-10 edge case examples
- Add 5-6 negative examples
- Add validation checklist
- Test with real messy inputs

**Wednesday-Thursday:** facts.txt
- Add 8-10 edge case examples
- Add 5-6 negative examples
- Test with abbreviations, typos, conflicts

**Friday:** formatting.txt + modification.txt
- Add 5-6 edge cases to each
- Add negative examples
- Add validation to modification.txt

**Weekend:** Testing
- Run through 20-30 real-world inputs
- Collect failure cases
- Document what still needs improvement

---

### Week 2: Refinement Based on Testing (Feb 17-23)

**Monday-Wednesday:** Iterate on examples
- Add examples for any failure patterns discovered
- Refine existing examples based on test results
- Expand negative examples where errors persist

**Thursday-Friday:** preferences.txt
- Add negative examples
- Test preference application with edge cases

**Weekend:** Integration testing
- Test full pipeline with various inputs
- Measure quality improvement
- Document before/after metrics

---

### Week 3: Polish and Documentation (Feb 24-28)

**Monday-Tuesday:** Add any remaining examples
- Focus on highest-error scenarios
- Ensure comprehensive edge case coverage

**Wednesday-Thursday:** Prompt versioning
- Add version numbers to prompts
- Document prompt history
- Set up A/B testing if desired

**Friday:** Final validation
- Run full test suite
- Compare quality metrics to baseline
- Document improvements

---

## Success Metrics

Track these metrics before and after improvements:

### Primary Quality Metrics
- **Extraction Accuracy:** % of events correctly identified
- **Format Compliance:** % of outputs matching schema on first try
- **Edge Case Success:** % of messy/ambiguous inputs handled correctly

### Before (Baseline - Estimate Current Performance)
- Clean inputs (straightforward meetings, clear dates): ~95% accuracy
- Messy inputs (typos, abbreviations, informal): ~70% accuracy
- Edge cases (conflicts, ambiguity, multi-day): ~60% accuracy

### After (Target with Improvements)
- Clean inputs: ~98% accuracy (marginal improvement)
- Messy inputs: ~90% accuracy (20-point improvement) ⭐
- Edge cases: ~85% accuracy (25-point improvement) ⭐

### How to Measure
1. Create test suite with 50-100 real-world examples
2. Run through pipeline, collect outputs
3. Manually grade accuracy (correct/incorrect)
4. Calculate percentage
5. Re-run after improvements to measure delta

---

## Testing Strategy

### 1. Build Test Dataset

Create `backend/tests/prompt_test_data.json`:

```json
{
  "identification_tests": [
    {
      "input": "mtg tmrw @ 2 w/ Sarah re: Q1",
      "expected_event_count": 1,
      "expected_confidence": "definite",
      "test_category": "abbreviations"
    },
    {
      "input": "Conference in Boston March 15-17",
      "expected_event_count": 1,
      "test_category": "multi_day"
    }
    // ... more test cases
  ],
  "facts_tests": [
    {
      "input": ["Team meeting tomorrow at 2pm"],
      "expected_output": {
        "title": "Team Meeting",
        "date": "2026-02-05",
        "time": "14:00:00"
      },
      "test_category": "basic"
    }
    // ... more test cases
  ]
}
```

### 2. Automated Testing Script

```python
# backend/tests/test_prompts_quality.py

def test_identification_quality():
    """Test identification agent on edge cases"""
    agent = EventIdentificationAgent(llm)

    test_cases = load_test_data("identification_tests")
    results = {"passed": 0, "failed": 0, "by_category": {}}

    for test in test_cases:
        result = agent.process(test["input"])

        if result.event_count == test["expected_event_count"]:
            results["passed"] += 1
        else:
            results["failed"] += 1
            log_failure(test, result)

        # Track by category
        category = test["test_category"]
        results["by_category"][category] = results["by_category"].get(category, 0) + 1

    return results

def test_facts_quality():
    """Test fact extraction on messy inputs"""
    # Similar structure

def test_full_pipeline():
    """Test end-to-end extraction quality"""
    # Run real-world inputs through full pipeline
```

### 3. Manual Review Process

Weekly review session:
1. Collect 10-20 real user inputs from production (if available)
2. Run through pipeline
3. Manually grade outputs (scale 1-5)
4. Identify failure patterns
5. Add examples to prompts for failures
6. Re-test

---

## Rollout Strategy

### Phase 1: Development (Week 1-2)
- Implement changes in development environment
- Test with synthetic data
- Iterate based on test results

### Phase 2: Internal Testing (Week 3)
- Deploy to staging environment
- Test with real user inputs (saved from production)
- Collect quality metrics
- Make final adjustments

### Phase 3: Gradual Production Rollout (Week 4)
- A/B test: 10% of traffic to new prompts
- Monitor quality metrics closely
- Gradually increase to 50%, then 100%
- Rollback if quality degrades

### Phase 4: Continuous Improvement (Ongoing)
- Collect failure cases from production
- Add new examples quarterly
- Refine prompts based on real-world usage
- Track quality trends over time

---

## Maintenance & Iteration

### Quarterly Prompt Review
1. Analyze last 3 months of failures
2. Add 5-10 new edge case examples
3. Update validation rules if needed
4. Document changes

### Prompt Versioning System
```
# Add to top of each prompt file:
# Version: 2.1.0
# Last updated: 2026-02-15
# Changes: Added 10 edge case examples for abbreviations and typos
```

### Feedback Loop
- Log all LLM failures to database
- Weekly review of top 10 failure patterns
- Prioritize prompt improvements based on frequency
- Track success rate over time

---

## Appendix: Additional Resources

### Prompt Engineering Research
- [Claude 4 Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Few-Shot Prompting Guide](https://www.promptingguide.ai/techniques/fewshot)
- [Chain-of-Thought Prompting](https://arxiv.org/abs/2201.11903)

### LangChain Structured Outputs
- [LangChain Structured Output Documentation](https://python.langchain.com/docs/modules/model_io/output_parsers/structured)
- Already using `with_structured_output()` - keep this!

### Testing Tools
- pytest for automated prompt testing
- LangSmith for LLM observability (optional)
- Manual grading spreadsheet template (create if needed)

---

## Questions & Next Steps

### Open Questions
1. Do you have production data we can use for testing?
2. What are the most common user complaints about extraction quality?
3. Are there specific input types (emails, syllabi, flyers) with lower quality?

### Immediate Next Steps
1. ✅ Review this plan
2. ✅ Prioritize which prompts to improve first
3. ✅ Set up test data collection
4. ✅ Start with identification.txt improvements (highest impact)
5. ✅ Establish baseline quality metrics

---

**Last Updated:** 2026-02-04
**Plan Owner:** Lucas
**Status:** Draft - Ready for Review
