# DropCal - Implementation Todo List

**Total: 28 tasks | Completed: 1 | Remaining: 27**

---

## 🔴 NEED (Must-Have for V1) - 11 tasks

**Foundational (Do First):**

1. **[14] Validation Layer** - verify end > start, dates are real, times make sense
   - *Why NEED:* Creating events with invalid times/dates breaks everything. End before start, Feb 30, 25:00pm = database errors and broken UX. Must validate before creating.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Do this first

2. **[18-20] Test Calendar Integrations** (Google/Outlook/Apple) - end-to-end verification
   - *Why NEED:* The product IS calendar integration. If events don't actually appear in calendars, nothing else matters. Must verify the core functionality works.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Do immediately after validation

3. **[21] Inspect Event Application Process** - identify failure points, understand flow
   - *Why NEED:* Can't fix what you don't understand. Need to trace how events flow from extraction → database → calendar API. Find where failures happen.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Foundational knowledge

**Core Functionality:**

4. **[9] Uncertainty/Ambiguity Handler** - ask clarifying questions when input unclear
   - *Why NEED:* "Meeting next Monday" when it's Friday - which Monday? "Move it earlier" - how much? Wrong guesses = wrong events = angry users. Better to ask than guess wrong.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Prevents bad extractions

5. **[4] Recurring Events** - extract RRULE patterns, weekly/daily/monthly events
   - *Why NEED:* "Team standup every Monday at 10am" is extremely common. Without this, users create 52 individual events manually = massive pain point. Deal-breaker feature.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Top user need

6. **[5] Event Modifications & Updates** - move/reschedule/cancel existing events
   - *Why NEED:* Users WILL need to change events. "Move my 2pm to 3pm" - if this doesn't work, they manually fix in calendar = defeats DropCal's purpose.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Core workflow

7. **[3] Conflict Detection & Warnings** - query overlapping events, warn before creating
   - *Why NEED:* Double-booking = bad. Users expect calendars to warn about conflicts. Without this, DropCal creates chaos instead of order.
   - *Priority:* ⭐️⭐️ HIGH - Expected feature

8. **[23] Retry Handler** - API failures, exponential backoff, error recovery
   - *Why NEED:* APIs fail. Networks drop. Rate limits hit. Without retries, events silently fail to create. Users think it worked but calendar is empty = terrible UX.
   - *Priority:* ⭐️⭐️ HIGH - Reliability critical

**Important but Lower Priority:**

9. **[13] Verify Image/PDF Extraction** - test current implementation thoroughly
   - *Why NEED:* If you advertise "drop in an image", it must work. Broken features = lost trust. Need to verify or remove the feature.
   - *Priority:* ⭐️ MEDIUM - Depends on marketing claims

10. **[2] Contact Integration** - Google Contacts sync, name-to-email resolution
    - *Why NEED:* "Meeting with Sarah" should invite Sarah. Typing sarah@company.com every time is friction. Important for multi-person meetings.
    - *Priority:* ⭐️ MEDIUM - UX improvement

11. **[8] All-Day Events** - detect and format correctly
    - *Why NEED:* "Conference all day Friday", "Vacation next week" are common. All-day events behave differently (no times). Relatively easy to add.
    - *Priority:* ⭐️ LOW - Common enough to include

---

## 🟡 MAYBE (Nice-to-Have, Adds Value) - 10 tasks

**High Value:**

1. **[6] Reminders/Notifications** - extract from instructions, set calendar reminders
   - *Why MAYBE:* Users expect reminders on events. BUT they can set them manually in calendar after. Not a blocker.
   - *Value:* Standard calendar feature, high user expectation

2. **[28] Review/Improve Extraction Agents** - facts, formatting, guest agents
   - *Why MAYBE:* Quality improvements are ongoing. Should iterate based on real failures, not preemptively optimize.
   - *Value:* Better extraction = better UX

3. **[26] Integrate Stripe** - payments/billing
   - *Why MAYBE:* Business critical IF monetizing. But doesn't affect core product functionality. Can launch free beta first.
   - *Value:* Can't make money without this

**Medium Value:**

4. **[15] Calendar Selection Logic** - process which calendar to add to
   - *Why MAYBE:* Important for work/personal separation. BUT can default to primary calendar for now.
   - *Value:* Multi-calendar users need this

5. **[22] Batch Operations** - create multiple events efficiently
   - *Why MAYBE:* Performance optimization. Creating events one-by-one works but slower. Nice to have, not essential.
   - *Value:* Speed improvement for power users

6. **[1] Location Resolution & Geocoding** - spelling correction, full addresses
   - *Why MAYBE:* Nice UX polish. "Meehan Auditoruim" → corrected. BUT users can type full addresses. Works without it.
   - *Value:* Good polish, prevents small errors

7. **[25] Calendar Selection UI** - user chooses which calendar
   - *Why MAYBE:* Pairs with #15. UI work. Can default to primary for now.
   - *Value:* Needed if supporting multi-calendar properly

**Lower Value:**

8. **[7] Explicit Timezone Handling** - user traveling, multiple timezones
   - *Why MAYBE:* Edge case. Most users stay in one timezone. Important for distributed teams and travelers, but minority use case.
   - *Value:* Handles edge cases well

9. **[16] Event Description/Notes** - ensure rich context captured
   - *Why MAYBE:* Adds richness ("Meeting about Q1 planning" → in description). BUT users can add notes manually.
   - *Value:* Small UX improvement

10. **[17] Preview/Diff for Modifications** - show what changed before applying
    - *Why MAYBE:* Nice UX touch. "Move to 3pm" → show old vs new. BUT can just apply changes directly.
    - *Value:* Confidence builder

---

## ⚪️ SKIP FOR NOW (Save for V2) - 4 tasks

1. **[24] Interactive Editing via Chat** - post-extraction refinement workflow
   - *Why SKIP:* Complex feature. Requires chat state management, natural language understanding for edits, multi-turn conversations. Big v2 feature. Users can manually fix in calendar for MVP.

2. **[12] Web Scraping from URLs** - Eventbrite, Facebook event links
   - *Why SKIP:* Cool but not core input method. Most users will paste text or upload images. Each site needs custom scraping logic. Add later when demand proven.

3. **[11] Web Search Capability** - agent searches web for context
   - *Why SKIP:* Intelligence enhancement, not core functionality. Adds complexity (when to search? what queries?). Users can provide full info. Nice-to-have for v2.

4. **[27] Dynamic Greeting** - make greeting not hardcoded
   - *Why SKIP:* Minor polish. Hardcoded greeting works fine. Low impact, low priority. Fix when bored.

---

## ✅ Completed
- [x] **[10] Preference Learning System** - learn categories, formatting conventions, calendar colors
