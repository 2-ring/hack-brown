# Pipeline Architecture

```
IDENTIFY → CONSOLIDATE → STRUCTURE → RESOLVE → PERSONALIZE
```

## IDENTIFY

Identify every single event in the input. This stage makes sure we can handle long or messy inputs — it splits up the content and understands fundamentally how many events and of what type we are processing.

**Current implementation**: LangExtract (text path), Agent 1 with vision (image path)

## CONSOLIDATE

Group the events, consider how they interact, remove duplicated events or events that for whatever reason shouldn't be included.

**Current implementation**: New stage — single lightweight LLM call that sees all identified events holistically. Outputs deduplicated groups + a cross-event context blurb.

## STRUCTURE

Go from semantic groupings to actual processable events with specifics. This is where raw text becomes structured data — titles, temporal expressions, locations, recurrence rules.

**Current implementation**: Agent 2 (Instructor), batched per group. One call per event group, groups processed in parallel.

## RESOLVE

Translate dates, times, and other ambiguous data into finished formats. Currently just temporal resolution, but this is the place to clarify ambiguity and get additional info — from Google Places API, a web search, or the user — alongside processing data formats and converting to a finished form.

**Current implementation**: Duckling (deterministic NL → ISO 8601 temporal resolution).

## PERSONALIZE

Go from a factually correct event to a finished and refined calendar event with all user context considered and applied. This is where more abstract and intelligent reasoning takes place — calendar routing, color assignment, naming preferences, learned patterns.

**Current implementation**: Agent 3 (LangChain), per event.
