# Task: Add Validation to Extraction Pipeline

## Problem Statement

The current extraction pipeline has **zero programmatic validation** of data formats. We rely entirely on LLM prompts to produce correctly formatted outputs, but there's no enforcement layer to catch errors. This creates several risks:

1. **Format violations**: LLM could output `date="February 5th"` instead of `"2026-02-05"`
2. **Title length issues**: No max length constraint - could get 15+ word titles
3. **Invalid data propagation**: Bad data flows through entire pipeline unchecked
4. **API failures**: Malformed data could break Google Calendar API calls
5. **Silent degradation**: Errors aren't caught until they cause downstream failures

### Current State

From [backend/extraction/models.py](backend/extraction/models.py):
- All fields are just `str` or `Optional[str]` with descriptions
- No regex validation, no format checking, no length constraints
- Pydantic models exist but aren't using validators
- Pipeline code ([app.py:226-233](backend/app.py:226)) just passes data through with no checks

### Expected Formats (from prompts)

**Agent 2 Output** ([ExtractedFacts](backend/extraction/models.py:52)):
- `date`: YYYY-MM-DD (e.g., "2026-02-05")
- `time`: HH:MM:SS 24-hour format (e.g., "14:00:00")
- `end_time`: HH:MM:SS format
- `title`: ≤3 words 90% of time, hard limit ~8-10 words max
- `location`: Physical places only (or null)

**Agent 3 Output** ([CalendarEvent](backend/extraction/models.py:84)):
- `start.dateTime` / `end.dateTime`: ISO 8601 with timezone (e.g., "2026-02-05T14:00:00-05:00")
- `start.timeZone` / `end.timeZone`: IANA timezone (e.g., "America/New_York")
- `summary`: Event title (should match Agent 2 title constraints)

## What Is Needed

Add Pydantic field validators to enforce format constraints at the model level. Validation should:

1. **Catch errors early**: Fail immediately when LLM produces bad format
2. **Provide clear error messages**: Tell us exactly what's wrong and where
3. **Be strict but graceful**:
   - Hard errors for critical formats (date, time, ISO 8601)
   - Warnings for soft limits (title length)
4. **Not break existing functionality**: Validate without changing behavior
5. **Be maintainable**: Clear, well-documented validator functions

### Validation Points Needed

| Field | Validation Rule | Error Type |
|-------|----------------|------------|
| `ExtractedFacts.date` | YYYY-MM-DD regex + valid date | Hard error |
| `ExtractedFacts.time` | HH:MM:SS regex + valid time | Hard error |
| `ExtractedFacts.end_time` | HH:MM:SS regex + valid time | Hard error |
| `ExtractedFacts.title` | ≤100 chars (hard), ≤8 words (warning) | Mixed |
| `CalendarDateTime.dateTime` | ISO 8601 with timezone regex | Hard error |
| `CalendarDateTime.timeZone` | Valid IANA timezone | Hard error |
| `CalendarEvent.summary` | ≤100 chars (hard limit) | Hard error |

## How It Could Be Done

### Approach 1: Pydantic Field Validators (Recommended)

Use Pydantic v2 `@field_validator` decorators directly in the model classes.

**Pros**:
- Validation happens automatically when model is instantiated
- Integrates with LangChain's `with_structured_output()`
- Clear error messages via Pydantic ValidationError
- No changes needed to agent code

**Cons**:
- Need to check Pydantic v2 syntax (we're using v2, right?)
- ValidationError needs to be handled in app.py

**Example**:
```python
from pydantic import BaseModel, field_validator
import re
from datetime import datetime

class ExtractedFacts(BaseModel):
    date: Optional[str] = None

    @field_validator('date')
    @classmethod
    def validate_date_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError(f"Date must be YYYY-MM-DD, got: {v}")
        try:
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError(f"Invalid date: {v}")
        return v
```

### Approach 2: Separate Validation Layer

Create a validation service that checks outputs after agent execution.

**Pros**:
- Separation of concerns (models vs validation logic)
- Can add retry logic if validation fails
- Easier to add logging/monitoring

**Cons**:
- Extra code in pipeline (app.py changes needed)
- Validation happens after LLM call (wasted tokens if invalid)
- More complex architecture

### Approach 3: Hybrid (Recommended for Production)

- Use Pydantic validators for format checking (immediate feedback)
- Add validation service for semantic checks (e.g., date not in past, title makes sense)
- Add retry logic in app.py if validation fails repeatedly

## Exploration and Thinking Needed

Before implementing, explore these questions:

### 1. **Pydantic Version Check**
- What version of Pydantic is the project using?
- Is it v1 or v2? (syntax differs significantly)
- Check `backend/requirements.txt` or run `pip show pydantic`

### 2. **LangChain Structured Output Behavior**
- How does LangChain's `with_structured_output()` handle ValidationError?
- Does it retry? Fail immediately? Return partial results?
- Test with a simple validator to understand error flow
- Look at [backend/extraction/agents/facts.py:28](backend/extraction/agents/facts.py:28)

### 3. **Error Handling Strategy**
- Where should validation errors be caught? In agents or in app.py?
- Should we retry LLM call if validation fails?
- How many retries before giving up?
- What error message to show user?

### 4. **Current Error Behavior**
- What happens now if LLM outputs bad format?
- Does Pydantic already throw some errors?
- Test by manually creating invalid models:
  ```python
  facts = ExtractedFacts(title="Test", date="bad-date")
  # Does this work or fail?
  ```

### 5. **Title Length Philosophy**
- What should the hard limit be? 60? 80? 100 chars?
- Should we count words or characters?
- Warning vs error threshold?
- Check Google Calendar API limits (if any)

### 6. **Location Validation**
- How to validate "physical places only"?
- Can we detect "Zoom", "http://", "virtual" and reject?
- Or just allow any string and rely on prompt?

### 7. **Timezone Validation**
- How to validate IANA timezone strings?
- Use `pytz` library? `zoneinfo`?
- What's the default timezone if invalid?

### 8. **ISO 8601 Edge Cases**
- Does Google Calendar API accept different ISO 8601 variants?
- Is timezone offset required? (+05:00 vs Z)
- What about milliseconds? (.000)

### 9. **Recurrence Validation**
- Should we validate RRULE format?
- Check that `pattern` is one of: daily, weekly, monthly, yearly
- Validate `days` array contains valid day names

### 10. **Integration Testing**
- After adding validators, test with real inputs
- Check if any existing functionality breaks
- Monitor for increased validation errors (means prompts need tuning)

## Investigation Steps

1. **Read and understand current models**:
   - [backend/extraction/models.py](backend/extraction/models.py)
   - Understand all field types and descriptions

2. **Check Pydantic version**:
   ```bash
   cd backend
   pip show pydantic
   # or check requirements.txt
   ```

3. **Understand LangChain integration**:
   - Read [backend/extraction/agents/facts.py](backend/extraction/agents/facts.py)
   - See how `with_structured_output()` is used (line 28)
   - Check LangChain docs for validation error handling

4. **Test current behavior**:
   - Create test script to manually instantiate models with bad data
   - See what errors (if any) are currently raised
   ```python
   from extraction.models import ExtractedFacts
   facts = ExtractedFacts(
       title="Test",
       date="February 5th",  # Bad format
       time="2pm"  # Bad format
   )
   # What happens?
   ```

5. **Research validation patterns**:
   - Look at Pydantic v2 docs: https://docs.pydantic.dev/latest/concepts/validators/
   - Find examples of datetime validation
   - Find examples of regex validation

6. **Design error handling**:
   - Decide where to catch ValidationError
   - Design retry logic (if needed)
   - Design user-facing error messages

7. **Implement incrementally**:
   - Start with one validator (e.g., date format)
   - Test thoroughly
   - Add more validators one by one
   - Test after each addition

8. **Update documentation**:
   - Document validation rules in models.py
   - Add comments explaining why each validator exists
   - Update CLAUDE.md if needed

## Success Criteria

Validation is complete when:

1. ✅ All critical format fields have validators (date, time, ISO 8601)
2. ✅ Title length is enforced (hard limit + warning)
3. ✅ Validators catch LLM errors before data propagates
4. ✅ Clear error messages indicate what's wrong
5. ✅ Existing functionality still works (no regressions)
6. ✅ Error handling in app.py gracefully handles ValidationError
7. ✅ Tests exist to verify validators work correctly
8. ✅ Documentation explains validation rules

## Files to Modify

### Primary:
- [backend/extraction/models.py](backend/extraction/models.py) - Add validators to Pydantic models

### Secondary (if needed):
- [backend/app.py](backend/app.py) - Add ValidationError handling around agent calls (lines 226-240)
- [backend/extraction/agents/facts.py](backend/extraction/agents/facts.py) - Optional: add retry logic if validation fails
- [backend/extraction/agents/formatting.py](backend/extraction/agents/formatting.py) - Optional: add retry logic if validation fails

### Testing:
- Create `backend/tests/test_validation.py` - Unit tests for validators
- Update `backend/tests/test_extraction.py` - Integration tests with validation

## References

- Pydantic v2 Validators: https://docs.pydantic.dev/latest/concepts/validators/
- ISO 8601: https://en.wikipedia.org/wiki/ISO_8601
- IANA Timezones: https://www.iana.org/time-zones
- Google Calendar API: https://developers.google.com/calendar/api/v3/reference/events

## Notes

- This task is about **enforcing** format constraints, not changing what formats we use
- The prompts already instruct the LLM on correct formats - validators are a safety net
- Start simple (date/time validation) and expand from there
- Don't over-engineer - focus on catching real errors that could break downstream systems
- Consider whether validation should be strict (fail) or lenient (warn + fix)

---

**Priority**: Medium-High (improves reliability but not blocking)
**Complexity**: Medium (requires Pydantic knowledge and careful testing)
**Estimated effort**: 2-4 hours (investigation + implementation + testing)
