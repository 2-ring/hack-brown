# DropCal - Implementation Todo List

**Total: 31 tasks | Completed: 2 | Remaining: 29**

---

## 🔴 NEED (Must-Have for V1) - 14 tasks

### 📱 Group 1: Mobile App & Calendar Management
*React Native, Share Sheet, Calendar Integration, Event Submission UX/UI*

1. **[NEW] React Native + Share Sheet Integration**
   - Refactor frontend to React Native (iOS/Android native app)
   - Integrate iOS/Android share sheet (share from any app → DropCal)
   - **Auto-submit & auto-apply flow:** share → process → auto-apply to calendar → show results
   - Edit already submitted/applied events flow
   - *Why NEED:* Mobile-first experience. Share sheet = core UX for "drop anything in". Native app provides better performance and OS integration.
   - *Priority:* ⭐️⭐️⭐️⭐️ HIGHEST - Changes architecture, do before building more features

2. **[18] Google Calendar Integration Testing** - end-to-end verification (create, update, delete)
   - *Why NEED:* Core product. Must verify GCal events actually appear correctly.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Primary calendar provider

3. **[5] Event Modifications & Updates** - move/reschedule/cancel existing events
   - *Why NEED:* Users WILL need to change events. "Move my 2pm to 3pm" - if this doesn't work, they manually fix in calendar = defeats DropCal's purpose. Critical for share sheet edit flow.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Core workflow

4. **[21] Event Application Process** - batching, auto-apply, reapplication, reliability
   - *Why NEED:* Make sure events are applied correctly. Handle batching for multiple events. Auto-apply to calendar. Verify no silent failures.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Reliability

5. **[23] Retry Handler** - API failures, exponential backoff, error recovery
   - *Why NEED:* APIs fail. Networks drop. Rate limits hit. Without retries, events silently fail to create. Users think it worked but calendar is empty = terrible UX.
   - *Priority:* ⭐️⭐️ HIGH - Reliability critical

### 💰 Group 2: Payments

6. **[26] Stripe Integration** - payments/billing/subscriptions
   - *Why NEED:* Can't get paid without this. Business critical for launch.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Revenue requirement

### 🤔 Group 3: Intelligence & Extraction Quality

7. **[9] Uncertainty/Ambiguity Handler** - ask clarifying questions when input unclear
   - *Why NEED:* "Meeting next Monday" when it's Friday - which Monday? "Move it earlier" - how much? Wrong guesses = wrong events = angry users. Better to ask than guess wrong.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Prevents bad extractions

### 📅 Group 4: Core Event Features

8. **[4] Recurring Events** - extract RRULE patterns, weekly/daily/monthly events
   - *Why NEED:* "Team standup every Monday at 10am" is extremely common. Without this, users create 52 individual events manually = massive pain point. Deal-breaker feature.
   - *Priority:* ⭐️⭐️⭐️ CRITICAL - Top user need

9. **[3] Conflict Detection & Warnings** - query overlapping events, warn before creating
   - *Why NEED:* Double-booking = bad. Users expect calendars to warn about conflicts. Without this, DropCal creates chaos instead of order.
   - *Priority:* ⭐️⭐️ HIGH - Expected feature

### 🔧 Group 5: Additional Features & Testing

10. **[13] Verify Image/PDF Extraction** - test current implementation thoroughly
    - *Why NEED:* If you advertise "drop in an image", it must work. Broken features = lost trust. Need to verify or remove the feature.
    - *Priority:* ⭐️ MEDIUM - Depends on marketing claims

11. **[2] Contact Integration** - Google Contacts sync, name-to-email resolution
    - *Why NEED:* "Meeting with Sarah" should invite Sarah. Typing sarah@company.com every time is friction. Important for multi-person meetings.
    - *Priority:* ⭐️ MEDIUM - UX improvement

12. **[8] All-Day Events** - detect and format correctly
    - *Why NEED:* "Conference all day Friday", "Vacation next week" are common. All-day events behave differently (no times). Relatively easy to add.
    - *Priority:* ⭐️ LOW - Common enough to include

13. **[19] Test Microsoft Outlook Integration** - end-to-end verification
    - *Why NEED:* Support Outlook users. But lower priority than GCal.
    - *Priority:* ⭐️ LOW - Secondary provider

14. **[20] Test Apple Calendar Integration** - end-to-end verification
    - *Why NEED:* Support Apple Calendar users. But lower priority than GCal.
    - *Priority:* ⭐️ LOW - Secondary provider

---

## 🟡 MAYBE (Nice-to-Have, Adds Value) - 9 tasks

**High Value:**

1. **[6] Reminders/Notifications** - extract from instructions, set calendar reminders
   - *Why MAYBE:* Users expect reminders on events. BUT they can set them manually in calendar after. Not a blocker.
   - *Value:* Standard calendar feature, high user expectation

2. **[28] Review/Improve Extraction Agents** - facts, formatting, guest agents
   - *Why MAYBE:* Quality improvements are ongoing. Should iterate based on real failures, not preemptively optimize.
   - *Value:* Better extraction = better UX

**Medium Value:**

3. **[15] Calendar Selection Logic** - process which calendar to add to
   - *Why MAYBE:* Important for work/personal separation. BUT can default to primary calendar for now.
   - *Value:* Multi-calendar users need this

4. **[22] Batch Operations** - create multiple events efficiently
   - *Why MAYBE:* Performance optimization. Creating events one-by-one works but slower. Nice to have, not essential.
   - *Value:* Speed improvement for power users

5. **[1] Location Resolution & Geocoding** - spelling correction, full addresses
   - *Why MAYBE:* Nice UX polish. "Meehan Auditoruim" → corrected. BUT users can type full addresses. Works without it.
   - *Value:* Good polish, prevents small errors

6. **[25] Calendar Selection UI** - user chooses which calendar
   - *Why MAYBE:* Pairs with #3. UI work. Can default to primary for now.
   - *Value:* Needed if supporting multi-calendar properly

**Lower Value:**

7. **[7] Explicit Timezone Handling** - user traveling, multiple timezones
   - *Why MAYBE:* Edge case. Most users stay in one timezone. Important for distributed teams and travelers, but minority use case.
   - *Value:* Handles edge cases well

8. **[16] Event Description/Notes** - ensure rich context captured
   - *Why MAYBE:* Adds richness ("Meeting about Q1 planning" → in description). BUT users can add notes manually.
   - *Value:* Small UX improvement

9. **[17] Preview/Diff for Modifications** - show what changed before applying
   - *Why MAYBE:* Nice UX touch. "Move to 3pm" → show old vs new. BUT can just apply changes directly.
   - *Value:* Confidence builder

---

## ⚪️ SKIP FOR NOW (Save for V2) - 5 tasks

1. **[NEW] Email Forwarding Integration** - forward emails to dedicated address to start DropCal session
   - *Why SKIP:* Like share sheet but for emails. Complex to build (email parsing, spam prevention, auth). Share sheet handles most use cases. Nice v2 feature.

2. **[24] Interactive Editing via Chat** - post-extraction refinement workflow
   - *Why SKIP:* Complex feature. Requires chat state management, natural language understanding for edits, multi-turn conversations. Big v2 feature. Users can manually fix in calendar for MVP.

3. **[12] Web Scraping from URLs** - Eventbrite, Facebook event links
   - *Why SKIP:* Cool but not core input method. Most users will paste text or upload images. Each site needs custom scraping logic. Add later when demand proven.

4. **[11] Web Search Capability** - agent searches web for context
   - *Why SKIP:* Intelligence enhancement, not core functionality. Adds complexity (when to search? what queries?). Users can provide full info. Nice-to-have for v2.

5. **[27] Dynamic Greeting** - make greeting not hardcoded
   - *Why SKIP:* Minor polish. Hardcoded greeting works fine. Low impact, low priority. Fix when bored.

---

## ✅ Completed
- [x] **[10] Preference Learning System** - learn categories, formatting conventions, calendar colors
- [x] **[14] Validation Layer** - verify end > start, dates are real, times make sense
