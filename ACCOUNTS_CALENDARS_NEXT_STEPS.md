# Accounts & Calendars - Next Steps

**Status:** Backend architecture complete. Frontend UI needed.

**Last Updated:** 2026-02-03

---

## 🎯 Immediate Next Steps (MVP)

### 1. Sign-In/Sign-Out UI

**Where:** Menu sidebar

**What to build:**
- **Bottom of menu bar:** Account section showing:
  - User avatar + name (when signed in)
  - "Sign in with Google" button (when signed out)
  - Click to expand account details
- **Account details panel:**
  - User email, profile picture
  - Connected accounts list (from `provider_connections`)
  - Sign-out button
  - Settings link (future)

**Mobile consideration:** Could move to top-right (where close menu button is) on desktop for cleaner layout.

### 2. Calendar Selector Dropdown

**Where:** Top-left of events workspace, replace current "Google Calendar" text

**What to build:**
- Dropdown showing all connected calendars
- Display: `[Provider Icon] Provider Name (email)`
- Example: `🗓️ Google Calendar (user@gmail.com)`
- Highlights currently active calendar
- Click to switch active calendar

**Backend connection:**
- Reads from `user.provider_connections` filtered by `usage: ["calendar"]`
- Shows `user.primary_calendar_provider` as selected
- On switch: calls backend to update `primary_calendar_provider`

### 3. Submit Button Integration

**What to change:**
- Submit button uses calendar selected in dropdown
- No per-event calendar selection (keep it simple)
- All events in current session go to the selected calendar

**Flow:**
1. User selects calendar from dropdown
2. User drops text/uploads file
3. Events are extracted
4. User clicks "Add to Calendar"
5. Events go to whichever calendar is currently selected in dropdown

---

## 🤔 Design Decisions to Make

### Decision 1: Calendar Scope - Per Chat or Global?

**Option A: Global (Recommended for MVP)**
- Selected calendar applies across all chats
- Simpler UX - set it once, forget it
- Users typically have one "main" calendar they use

**Option B: Per Chat**
- Each chat remembers which calendar was selected
- More complex - need to store `active_calendar` per session
- Useful if user wants work events → work calendar, personal → personal calendar

**Recommendation:** Start with **Global**. Add per-chat later if users request it.

### Decision 2: Default Calendar Behavior

**Options:**

**A. No Default - Force Selection**
- First time user connects calendar, must explicitly select it
- Prevents accidental submissions to wrong calendar
- More clicks required

**B. Auto-set Primary (Recommended)**
- First connected calendar automatically becomes primary
- User can change in settings
- Smoother onboarding

**C. Ask on First Submission**
- Wait until user tries to add events
- Then prompt: "Which calendar should we use?"
- Just-in-time decision

**Recommendation:** **B - Auto-set Primary**. Set `primary_calendar_provider` when first calendar is connected.

### Decision 3: Switching Calendars After Events Sent

**Scenario:** User adds events to Google Calendar, then switches to Apple Calendar. What happens?

**Options:**

**A. Nothing - Clean Slate (Recommended)**
- Switching calendar only affects NEW events going forward
- Past events stay where they were sent
- Simple, no complications

**B. Offer to Migrate**
- "You have 5 events in Google Calendar. Move them to Apple Calendar?"
- Complex - need to track which events were sent where
- Risk of duplicates or sync issues

**C. Warning**
- "You have events in Google Calendar. Switching won't move them."
- Inform user but don't migrate

**Recommendation:** **A - Clean Slate** for MVP. Can add migration later if needed.

### Decision 4: User-Controlled Default Calendar

**Can users change their default calendar?**

**Yes - In Settings**
- Account settings section
- "Default Calendar" dropdown
- Updates `primary_calendar_provider`

**Yes - Via Dropdown (Recommended)**
- Whatever is selected in dropdown becomes the default
- No separate "set as default" step
- Simpler UX

**Recommendation:** Dropdown selection = primary calendar. No separate setting needed.

---

## 🎨 UI/UX Considerations

### Onboarding Flow (ChatGPT-Inspired)

**Free Usage Without Sign-In:**
```
┌─────────────────────────────────────────┐
│  Drop text → Extract events → Preview   │
│         ✅ Works without sign-in         │
└─────────────────────────────────────────┘
```

**Require Sign-In For:**
1. **Uploading certain documents** (images, audio, PDFs)
   - Show: "Sign in to upload files"
   - Reason: File storage costs money
2. **Exporting to calendar** (the main feature!)
   - Show: "Sign in to add events to your calendar"
   - This is the conversion funnel
3. **Saving session history**
   - Show: "Sign in to save your event history"

**Flow:**
```
1. User opens app → Can immediately try it (no login wall)
2. User drops text → Events extracted and shown
3. User clicks "Add to Calendar" → Sign-in modal appears
4. User signs in with Google → Automatically connects Google Calendar
5. User can now submit events
```

**Benefits:**
- Low friction to try the product
- Shows value before asking for sign-in
- Natural conversion point (when they want to actually use it)

### Account Area Design

**Location Options:**

**Bottom of Menu Sidebar (Recommended for Mobile-First):**
```
┌──────────────────┐
│  🏠 Home         │
│  📝 Sessions     │
│  ⚙️  Settings    │
│                  │
│  ─────────────   │ ← Divider
│                  │
│  👤 John Doe     │ ← Account section
│     user@gmail   │
└──────────────────┘
```

**Top-Right (Alternative for Desktop):**
```
┌─────────────────────────────────────────┐
│  DropCal           [X] Close  👤 Menu   │ ← Account in top-right
└─────────────────────────────────────────┘
```

**Expanded Account Panel:**
```
┌──────────────────────────────────────┐
│  👤 John Doe                         │
│     user@gmail.com                   │
│  ─────────────────────────────────   │
│  Connected Accounts:                 │
│    🗓️ Google Calendar                │
│       user@gmail.com (active)        │
│  ─────────────────────────────────   │
│  [⚙️ Settings]  [🚪 Sign Out]       │
└──────────────────────────────────────┘
```

---

## 📋 Implementation Checklist

### Phase 1: Basic Auth UI
- [ ] Add account section to menu sidebar
- [ ] "Sign in with Google" button
- [ ] User avatar + name display when signed in
- [ ] Sign-out button
- [ ] Account details panel (expandable)

### Phase 2: Calendar Selection
- [ ] Calendar dropdown in workspace header
- [ ] Fetch connected calendars from backend
- [ ] Display current primary calendar
- [ ] Switch primary calendar on selection
- [ ] Backend endpoint: `PUT /api/calendar/set-primary`

### Phase 3: Submission Flow
- [ ] Update "Add to Calendar" button to use primary calendar
- [ ] Show which calendar events will go to
- [ ] Success message: "Added 3 events to Google Calendar"
- [ ] Error handling for no calendar connected

### Phase 4: Onboarding
- [ ] Allow event extraction without sign-in
- [ ] Show sign-in modal when clicking "Add to Calendar"
- [ ] Show sign-in prompt for file uploads
- [ ] Onboarding tooltips for first-time users

### Phase 5: Settings & Management
- [ ] Connected accounts list in settings
- [ ] Disconnect calendar button
- [ ] Default calendar selector (if needed)
- [ ] Account preferences

---

## 🚀 Future Enhancements (Post-MVP)

### Multiple Calendars per Provider
- Connect both personal and work Google accounts
- Distinguish by email in dropdown
- Example: "Google Calendar (work@company.com)" vs "Google Calendar (personal@gmail.com)"

### Per-Session Calendar Selection
- Remember which calendar was used for each session
- "Last time you used: Work Calendar. Use again?"
- Stored in session metadata

### Calendar Migration
- Move events between calendars
- "Switch to Apple Calendar and move 5 existing events?"
- Requires tracking which events were sent where

### Smart Default Calendar
- Auto-detect based on event content
- "Meeting with boss" → Work calendar
- "Dinner with friends" → Personal calendar
- Uses AI to suggest calendar

### Calendar Colors & Icons
- Show calendar color from provider
- Visual distinction in dropdown
- Matches user's actual calendar app

---

## 📝 Technical Notes

### Backend Endpoints Needed

```python
# Switch primary calendar
PUT /api/calendar/set-primary
Body: { "provider": "google" }

# List connected calendars
GET /api/calendar/connections
Response: [
  {
    "provider": "google",
    "email": "user@gmail.com",
    "is_primary": true
  },
  {
    "provider": "apple_calendar",
    "email": "user@icloud.com",
    "is_primary": false
  }
]

# Disconnect calendar
DELETE /api/calendar/disconnect/{provider}
```

### Frontend State Management

```typescript
// Current user state
interface UserState {
  isSignedIn: boolean;
  user: {
    id: string;
    email: string;
    display_name: string;
    photo_url: string;
  };
  connectedCalendars: Calendar[];
  primaryCalendar: string | null;
}

interface Calendar {
  provider: string;
  email: string;
  isPrimary: boolean;
}
```

---

## 🎯 Success Metrics

**MVP Success:**
- ✅ User can sign in with Google
- ✅ User can connect Google Calendar
- ✅ User can see which calendar is active
- ✅ User can add events to their calendar
- ✅ Events go to the correct calendar

**Stretch Goals:**
- Users can switch between multiple calendars
- Onboarding flow with free trial before sign-in
- Settings page with account management

---

## 🤝 Open Questions

1. **Should we support email/password auth?** Or just OAuth providers?
2. **What happens if user's calendar tokens expire?** Re-auth flow?
3. **Should users be able to delete their account?** GDPR compliance?
4. **Do we need a "settings" page?** Or is account panel enough?
5. **Should we show calendar sync status?** (last synced, number of events, etc.)

---

**Next Action:** Start with Phase 1 - Basic Auth UI in the sidebar.
