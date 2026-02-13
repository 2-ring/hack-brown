# DropCal — Pre-Launch Plan

## 1. AI Pipeline Refinement

Frontend and infrastructure (database, auth, hosting, communication) are complete. The extraction pipeline currently produces low-quality output and is inefficient and costly — this is the primary blocker before putting the app in front of real users.

Focus is on inspecting and refining the pipeline end-to-end to ensure consistent, reliable event extraction across all input types (photos, PDFs, voice notes). PostHog is already well instrumented and will be the main tool for observability and iterative refinement during this phase.

No new features until the pipeline is solid.

## 2. Data, Privacy & Google Verification

Audit what is happening with files and events throughout the system — what is stored, where, and for how long. Primary goal is satisfying Google's OAuth consent screen verification requirements. Review data flows, permissions scoping, and privacy disclosures.

## 3. Feature Audit

Test each user-facing feature and verify it is functional. Anything that isn't working should be disabled or clearly marked to prevent user confusion. Ship with what works.