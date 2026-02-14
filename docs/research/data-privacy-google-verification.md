# Data, Privacy & Google Verification Audit

## Current State: Data & Storage

### How Files Are Stored

1. **Upload** — `backend/storage/file_handler.py` stores files in a Supabase Storage bucket called `uploads`, at path `{user_id}/{uuid}.{extension}`
2. **Processing** — `backend/processing/session_processor.py` downloads files to local temp files (Python `tempfile`), processes them (transcription, OCR, etc.), then cleans up with `os.unlink()` in `finally` blocks
3. **After processing** — The original file stays in Supabase Storage **indefinitely**. The extracted text gets stored in `sessions.input_content`. There is no cleanup job.

### What's Stored in the Database

| Table | Sensitive data stored |
|-------|----------------------|
| `users` | Email, name, photo URL, **encrypted OAuth tokens** (in `provider_connections`), learned style preferences |
| `sessions` | Raw input text/file path, extracted events, processed events, status. Guest sessions have a plaintext access token |
| `events` | Event details, original input text, extracted facts, AI suggestions, 384-dim vector embeddings, correction history |
| `calendars` | Calendar metadata, AI-generated descriptions, event type patterns |

**Supabase Storage**: All uploaded files (images, audio, PDFs, documents) persist forever.

### OAuth Tokens

Already solid — Fernet encryption via `backend/utils/encryption.py`, stored in `users.provider_connections[].encrypted_tokens`. Satisfies Google's encryption-at-rest requirement.

---

## Google Verification Requirements

**Google Calendar scopes (`calendar` + `calendar.events`) are classified as "sensitive" — not restricted.** This means:
- No CASA security audit needed (saves $500-$7,500/yr)
- No annual recertification
- Review timeline: ~1-2 weeks best case, 3-4 weeks typical

**Without verification, the app is capped at 100 lifetime users** and shows a scary "Google hasn't verified this app" → "Go to DropCal (unsafe)" warning that kills conversion.

### What Google Absolutely Requires

| Requirement | Current State | Action Needed |
|-------------|--------------|---------------|
| **Privacy policy on verified domain** | Exists at `frontend/src/legal/Privacy.tsx` → `dropcal.ai/privacy` | **Fix inaccuracy** — says "We do not use analytics trackers" but PostHog is active with autocapture. Google reviewers will check. |
| **Domain ownership verified** (Google Search Console) | Unknown | Verify `dropcal.ai` in Search Console if not done |
| **Demo video** (unlisted YouTube) | Not created | Record: show full OAuth flow, demonstrate how calendar data is used |
| **Scope justification** | Not written | Write justification for each scope |
| **Scope narrowing** | Requesting **both** `calendar` AND `calendar.events` | **Drop `calendar` scope** — it's a superset that includes share/delete calendars. Only need `calendar.events`. Google flags over-broad scopes. |

### Data Handling Gaps Google Will Care About

| Issue | Why It Matters | Fix |
|-------|---------------|-----|
| **No file cleanup** | Uploaded files stay in Supabase Storage forever. No retention policy. | Add cleanup job or delete files after processing completes |
| **No account deletion endpoint** | Google requires users to be able to delete their data. Currently only "contact us at privacy@dropcal.ai" | Build a delete account API endpoint that nukes user data, files, sessions, events, and revokes OAuth tokens |
| **Session input stored forever** | `sessions.input_content` (raw text, file paths) has no expiration | Define retention policy; either auto-clean after N days or delete when user deletes session |
| **Privacy policy lies about PostHog** | Line 102-103: "We do not use analytics trackers" — but PostHog autocapture is enabled in `frontend/src/main.tsx` | Update privacy policy to disclose PostHog usage |
| **Soft delete isn't real delete** | `Event.soft_delete()` just sets `deleted_at` — data remains in DB | Fine for normal operation, but account deletion must hard-delete |
| **Session.delete() doesn't delete files** | Deleting a session leaves orphaned files in Supabase Storage | Chain file deletion when sessions are deleted |
| **No token revocation on disconnect** | When a user disconnects a calendar provider, tokens should be revoked with Google (not just deleted from DB) | Call Google's revoke endpoint before deleting tokens |

### Privacy Policy Fixes Needed

The existing `frontend/src/legal/Privacy.tsx` needs:

1. **PostHog disclosure** — Must disclose PostHog (product analytics, pageviews, autocapture). The current "no analytics trackers" claim is false.
2. **AI processing disclosure** — Should clarify that calendar event data from Google is also sent to AI models (preferences agent reads historical events).
3. **Data retention specifics** — Currently vague ("stored for as long as you maintain your account"). Google wants actual retention periods or clear policies.
4. **Google-specific section** — Google reviewers like seeing an explicit "Google User Data" section that spells out exactly what Google data you access, why, how it's stored, and that you don't use it for advertising/selling.

### Scope Recommendation

In `frontend/src/auth/supabase.ts:27`, we request:
```
email profile openid https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events
```

`calendar` is a **superset** of `calendar.events` — it includes sharing and deleting entire calendars, which DropCal never does. Requesting both is redundant and raises flags during review. Drop `calendar` and keep only `calendar.events`. Same change needed in `backend/calendars/google/auth.py:14` and `backend/calendars/service.py:20`.

---

## Action Items

### Must-do for Google verification
- [ ] Fix privacy policy (PostHog disclosure, Google data section, retention specifics)
- [ ] Narrow OAuth scopes (drop `calendar`, keep `calendar.events` only)
- [ ] Verify `dropcal.ai` domain ownership in Google Search Console
- [ ] Record unlisted YouTube demo video showing OAuth flow + calendar usage
- [ ] Write scope justifications for submission
- [ ] Build account deletion endpoint (hard delete: DB rows + Storage files + token revocation)

### Should-do for data hygiene
- [ ] Delete uploaded files from Supabase Storage after processing completes
- [ ] Chain file deletion to session deletion (clean up orphaned files)
- [ ] Add Google token revocation when user disconnects calendar provider
- [ ] Define and implement data retention policy for sessions
