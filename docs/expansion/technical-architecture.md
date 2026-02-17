# DropCal — Technical Architecture

> Living document. February 16, 2026.
> Records technical decisions, reasoning, and tradeoffs. See concept doc for product vision.

---

## 0. Core Architectural Distinction: Proactive, Not Reactive

Most AI assistants — including those with memory, tool access, and sophisticated reasoning — are fundamentally reactive. They sit dormant until you message them. They wake up, retrieve context, generate a response, and go back to sleep. Between conversations, they are nothing. Just data in a database.

DropCal is architecturally different. It is an always-on agent that has agency between your messages. It watches, notices, prepares, and initiates. This is not a chatbot with extra features — it's a persistent assistant that happens to be reachable via chat. The distinction isn't philosophical — it's structural. It demands infrastructure that a reactive chatbot doesn't need, and it's what makes DropCal feel like a human assistant rather than a tool you use. Section 4 documents the agent runtime and proactive engine that makes this real.

---

## 1. Memory & Context Management

### 1.1 Decision: Self-Hosted Mem0 + Supabase pgvector + AWS Bedrock

**Choice**: Mem0 open-source, self-hosted on our AWS infrastructure.

**Why Mem0 over alternatives**: Mem0 is a bolt-on memory service, not a platform — it works with any agent framework and requires zero architecture changes. Three API calls (`add`, `search`, `get_all`) cover the entire integration. It handles the hard problems (fact extraction from conversations, deduplication, conflict resolution, semantic retrieval) that would take weeks to build from scratch. Apache 2.0 license, 41K+ stars, and AWS selected it as their exclusive memory provider for their Agent SDK — battle-tested.

**Why self-hosted over Mem0's managed cloud**: The managed API routes user data through Mem0's servers for extraction. Self-hosting means the extraction LLM runs on Bedrock within our AWS account — data never leaves our infrastructure. This is what makes the Box privacy architecture real rather than marketing. The tradeoff is we manage the infrastructure, but it's lightweight: Mem0 open-source just needs an LLM endpoint and a vector store, both of which we already have.

**Why Bedrock for the extraction LLM**: Per-token pricing (no GPU instance to manage), data stays in AWS, supports Llama 3.3 70B which is more than capable for fact extraction (a simpler task than the main assistant reasoning). Cost is fractions of a cent per extraction call. With $10K AWS credits this runs free for 6–12+ months.

**Why Supabase pgvector for vector storage**: Already in the stack for the main database. pgvector handles memory embeddings without adding another service. Per-user row-level security provides tenant isolation at the database level. pgvectorscale can handle 50M+ vectors on cheap hardware if needed later.

**Memory types maintained**:
- **User-level** — persistent facts, preferences, relationships, routines
- **Session-level** — current thread context, tasks in progress
- **Agent-level** — learned interaction patterns for this specific user
- **Historical** — seeded from calendar/notes ingestion at onboarding

**Cost**: ~$6–25/month total (Bedrock extraction ~$5–20, KMS ~$1–5, pgvector included in Supabase Pro).

### 1.2 Decision: Calendar History Ingestion at Onboarding

**Choice**: On first OAuth connection, ingest 2–3 years of Google Calendar history through Mem0's extraction pipeline. Takes ~2 minutes. Assistant has deep user knowledge before the first message.

**Why this matters**: Solves the cold start problem that kills retention in AI assistants. Instead of starting dumb and learning over weeks, the assistant arrives pre-loaded with scheduling patterns, relationships (from meeting attendees), work/life boundaries, sacred vs. flexible events, seasonal patterns, and meeting duration accuracy. Calendar history is the richest structured dataset about someone's life that already exists and nobody is using it for this.

**How**: Batch events by month, feed each batch through Mem0 with an analysis prompt. Extraction LLM identifies patterns and stores as discrete memories. Final cross-history pass captures high-level scheduling profile. Same pattern extends to notes (Apple Notes, Google Keep, Notion).

**Key tradeoff**: Extraction quality determines whether the assistant "knows" correct or wrong things on day one. Wrong is worse than blank. Needs careful prompt engineering and validation before shipping.

### 1.3 Alternatives Evaluated

| System | Core Idea | Strengths | Rejected Because | Reconsider When |
|--------|-----------|-----------|-----------------|-----------------|
| **Mem0 Cloud** | Hosted SaaS, identical tech | Zero infra, free tier (10K memories), instant setup | Data leaves our infra → breaks Box | Fast prototyping before self-host is configured |
| **Letta** (MemGPT) | Agent platform where the LLM manages its own memory via tools. Agent decides what to remember | Most powerful model. Self-editing memory. Git-based versioning. Shared memory across agents. $20/mo | Wants to own entire agent runtime, not just memory layer. Less flexibility | Multi-agent architectures, explicit memory self-management needed |
| **Zep** (Graphiti) | Temporal knowledge graph on Neo4j. Tracks *when* facts were true vs. when learned | Best for reasoning about change over time. 94.8% DMR benchmark. Auto-invalidates stale facts | Neo4j adds serious infra complexity. Temporal reasoning overkill at launch. $25/mo+ | Temporal queries ("how has my work-life balance changed?"), B2B relationship tracking |
| **Supermemory** | Vector-graph hybrid with temporal tracking | Claims 10–25x faster than competitors. SOTA on LongMemEval | Newest, least battle-tested | If benchmarks prove out and it matures |
| **Raw pgvector DIY** | Custom extraction prompts + Postgres vectors | Full control, cheapest, zero vendor risk | Extraction/dedup/conflict resolution are hard problems — months to match Mem0 | Used as Mem0's storage backend anyway. Also for structured data not needing smart extraction |

**Key tradeoff**: The spectrum runs from "simple but limited" (raw pgvector) → "plug-and-play" (Mem0) → "powerful but opinionated" (Letta) → "sophisticated but complex" (Zep). For a solo dev building a consumer product, Mem0 hits the sweet spot — maximum capability per unit of integration effort. Self-hosting preserves the privacy architecture without sacrificing convenience.

### 1.4 Open Concern: Memory Quality Comparison Still Needed

The Mem0 decision is architecturally sound — it plugs in cleanly, is feasible to self-host, and the integration is minimal. However, the selection was made primarily on **integration ergonomics and privacy architecture**, not on a rigorous comparison of **memory quality** across systems. The alternatives (Letta, Zep, Supermemory) may produce meaningfully better extraction, retrieval, or temporal reasoning that could justify additional complexity.

**TODO before committing**: Deep, current research comparing actual memory quality outcomes across these systems — extraction accuracy, retrieval relevance, handling of contradictions, temporal awareness. The memory layer is foundational; if Zep's temporal graph or Letta's self-editing model produces substantially better results in practice, it may be worth the added complexity. This evaluation should be done from a position of "which produces the best assistant memory" rather than "which is easiest to integrate."

---

## 2. Messaging Layer

### 2.1 Architecture Principle: Channel-Agnostic

The messaging layer is a thin routing layer — text in, text out. The agent loop, memory system, tool integrations, and the Box are entirely channel-agnostic. Swapping messaging providers or adding channels is a config-level change, not an architecture change. This section is therefore **decision-deferred**: a viable path exists, the economics work at multiple price points, and the final provider choice can be made independently without affecting any other part of the system.

### 2.2 Options Evaluated

**Third-party iMessage APIs (leading option):**
The premium play. DropCal appears as a blue-bubble contact in the user's native Messages app — typing indicators, read receipts, rich media. No other AI assistant does this. Feels like texting a human assistant rather than using a chatbot.

- **LoopMessage** — $60–100/month flat, priced per contact not per message. Unlimited messaging per contact. At 100 users the Light plan ($60/month) covers it. Self-service signup, no sales call. Supports two-way messaging, typing indicators, voice notes, chatbot use case explicitly. RCS/SMS fallback for Android built in. Contacts must initiate first (solved by onboarding deep link). Main risk: uses unofficial iMessage infrastructure, technically against Apple's ToS, though these services have operated for years.
- **Sendblue** — More established (YC-backed, SOC 2, HIPAA), but opaque pricing requiring a sales call. Likely $99–1,000/month per line depending on tier. Same unofficial iMessage infrastructure, same platform risk. Automatic iMessage → RCS → SMS fallback.

**Carrier-based SMS/RCS:**
Universal reach, no app install, but per-message pricing is structurally expensive for conversational AI.

- **Twilio** — ~$0.0083/message. At 100 users × 40 messages/day = ~$1,000/month. Eats entire subscription revenue.
- **Bandwidth** — ~$0.004/message (direct carrier). Roughly half of Twilio but still ~$480/month at 100 users.
- **Conversational RCS pricing** (flat per 24-hour session instead of per-message) would solve this — Google is restructuring billing around it — but the US explicitly still uses per-message billing. Infrastructure is ready, industry signals 2026, but no firm date. Can't plan around it, but architecture should be ready to flip when it arrives.

**Free channels:**
- **Telegram** — Free, zero restrictions on AI bots, rich API. But only ~30M US users, requires app install, mainstream friction comparable to building own app. Works as an optional power-user channel.
- **Own app / PWA** — Push notifications are free. Open-source chat UIs available. Adds app store / download friction but zero per-message cost. Natural home for settings, calendar dashboard, and advanced features anyway.

**Non-viable for this use case:**
- **Apple Messages for Business** — Requires live human agents (no bot-only), customer-initiated only (no proactive messaging), iOS only, requires approved MSP.
- **WhatsApp Business API** — Meta banned general-purpose AI chatbots in January 2026. EU antitrust investigation may reverse this eventually.

### 2.3 Cost Comparison (100 users, ~20 messages/day each)

| Provider | Model | Monthly Cost | Per-User Cost |
|----------|-------|-------------|---------------|
| LoopMessage (iMessage) + Bandwidth (Android fallback) | Per-contact + per-message | ~$250 | ~$2.50 |
| Bandwidth SMS/RCS only | Per-message | ~$480 | ~$4.80 |
| Twilio SMS/RCS only | Per-message | ~$1,000 | ~$10.00 |
| Telegram / Own app | Free | ~$0 | ~$0 |
| Future: Conversational RCS | Per-session | ~$60 | ~$0.60 |

### 2.4 Conclusion

Something here works. The iMessage-via-LoopMessage path is the most compelling for the premium "human assistant" feel that differentiates DropCal, with viable economics at early scale. Carrier SMS/RCS is the universal fallback. Free channels (Telegram, own app) are always available as options. The final provider choice doesn't need to be made now — the agent loop just needs a `sendMessage(userId, text)` interface and a webhook endpoint for inbound messages. Everything above that layer is identical regardless of channel.

**When to finalize**: Before beta launch. A2P 10DLC registration (required for US business SMS) takes days to weeks, so start that process early if going the SMS/RCS route.

### 2.5 WhatsApp: Ban Workarounds & Reversal Likelihood

Meta banned general-purpose AI chatbots from the WhatsApp Business API effective January 15, 2026. However, both the ban's scope and its longevity are more nuanced than they appear.

**How to operate within the ban:** The policy targets AI providers where AI is the "primary (rather than incidental or ancillary) functionality." Business bots for support, bookings, notifications, and structured tasks are explicitly allowed — and the terms even state that businesses may "retain an AI Provider as your Third Party Service Provider," meaning using an LLM as the backend engine for a business service is permitted by the letter of the policy. DropCal isn't obviously covered: it's a calendar management and scheduling service, not a general-purpose AI assistant. Every conversation is anchored to calendar operations — creating events, checking availability, sending briefings — which fits the "bookings and notifications" pattern Meta says is fine.

**Enforcement in practice:** The ban has been narrowly enforced. In practice, only a handful of high-profile companies were affected — OpenAI, Perplexity, Microsoft, Luzia, Poke — who were using WhatsApp as a distribution channel for standalone AI assistants and proactively shut down before the January 15 deadline. There's no evidence of Meta auditing smaller businesses or retroactively enforcing against customer-facing bots that use AI under the hood. Industry analysis noted the number of businesses actually affected was "potentially few" since most API users were already doing customer support. A small-scale scheduling product using an LLM incidentally is unlikely to draw attention, though Meta retains sole discretion over what counts as "primary vs incidental."

**Regulatory pressure to reverse (moving fast as of February 2026):**
- **Italy (December 2025)**: AGCM ordered Meta to suspend the ban, citing irreparable harm. Meta now explicitly exempts Italian phone numbers from the restriction.
- **EU Commission (February 2026)**: Formally charged Meta with antitrust violations. Issued statement of objections. Actively considering interim measures to force reversal across the EEA while investigation proceeds — Commissioner Ribera cited urgency given pace of AI markets.
- **Brazil**: Competition authority probing Meta after complaints alleging "embrace, extend, and extinguish" strategy.
- **Meta's position**: Claims the Business API was never designed as a distribution channel for chatbots and that infrastructure couldn't handle the load. Plans to appeal Italy ruling.

**Timeline estimate**: EU interim measures could land within weeks to a few months — the Commission has explicitly flagged speed as a priority. A full resolution (settlement, court ruling, or policy change) is likely 6–18 months. If the EU forces reversal, maintaining a US-only ban becomes politically and practically difficult. Reasonable probability that WhatsApp reopens for AI chatbots (possibly with new pricing/tier structure) by late 2026 or early 2027.

**Implication for DropCal**: WhatsApp is worth monitoring but not worth building around today. If/when the ban lifts, adding WhatsApp as a channel via Twilio or the WhatsApp Cloud API is straightforward — the channel-agnostic architecture means it's a new adapter, not a redesign.

---

*Next sections: Agent Loop, Tool Integrations, Proactive Engine, Hosting*

## 3. Data Privacy & Isolation — "Your Key, Your Data"

### 3.1 The Story

DropCal's privacy promise: **your data is yours, you control it, and it's isolated from everyone else's.** Not as a policy document. Not as a terms-of-service promise. As architecture.

This matters because the bar in the AI assistant space is shockingly low. Most competitors store everything in a shared database with application-level access controls — the company can read your data anytime, a single bug can leak it across users, and "delete my account" means a row gets flagged in a database somewhere. Their privacy story is "we promise not to look." DropCal's story is "we built it so your data is structurally separated, encrypted, and actually gone when you say it's gone."

This doesn't need to be Apple Private Cloud Compute or a zero-knowledge password vault to be genuinely differentiated. It just needs to be notably, defensibly better than what anyone else offers — which is almost nothing.

### 3.2 Launch Architecture: Database-Enforced Isolation + Encryption at Rest

**Supabase Row-Level Security (RLS):**

Every table has RLS policies that filter by `user_id`, enforced by the Postgres engine itself — not by application code. The database refuses to return rows belonging to other users regardless of what the application requests. This means:
- A bug in the app code that forgets a WHERE clause still can't leak cross-user data
- An API endpoint that gets exploited still can't access other users' rows
- A DropCal employee querying the database through normal tooling only sees data scoped to their own test accounts

This alone puts DropCal ahead of most AI products, where tenant isolation lives entirely in application logic and a single missed filter is a data breach.

**Per-user field encryption (Supabase Vault / pgsodium):**

Sensitive fields — OAuth tokens, memory content, conversation history — are encrypted at the column level with per-user keys managed by Supabase Vault. The raw database contains ciphertext for anything personal. Vault uses pgsodium (libsodium bindings for Postgres) with keys stored in a separate, access-controlled schema. This is already in the Supabase stack — no external service needed.

**Zero-retention LLM inference:**

When user context is sent to the LLM for processing, we use providers with explicit zero-retention guarantees (Anthropic API, OpenAI API with data retention disabled, or AWS Bedrock where data never leaves our AWS account). The LLM processes the request and discards it. No training on user data, no prompt logging, no retention beyond the inference call.

**Cryptographic account deletion:**

When a user deletes their account, their encryption keys are destroyed. All their encrypted data becomes permanently unreadable ciphertext — even if database records haven't been fully purged yet. This is real deletion, not "we flagged your account as inactive."

**Minimal data collection:**

Raw API responses from Google Calendar, Gmail, etc. are processed through the memory extraction pipeline and then discarded. Only extracted facts and structured memories are stored (encrypted). DropCal doesn't hoard data it doesn't need.

**What this adds up to for the user:** "Your data is isolated from every other user at the database level. Sensitive data is encrypted with your own key. The AI processes your request and forgets it. When you delete your account, your encryption keys are destroyed and your data becomes permanently unreadable. We don't train on your data. We don't sell your data. We collect only what the assistant needs to function."

Every sentence is architecturally true. No overclaiming.

### 3.3 Cost

Effectively zero additional cost. Supabase RLS is built-in (no extra charge). Supabase Vault is included in Pro plan ($25/month, already in the stack). pgsodium encryption adds negligible compute overhead. No external KMS service, no per-key fees, no additional infrastructure.

### 3.4 Upgrade Paths (Post-Launch)

Two stronger models exist if the privacy story needs to escalate — for enterprise customers, regulatory requirements, or competitive positioning:

**AWS KMS per-user keys (Level 2):** Each user gets a dedicated Customer Managed Key in AWS KMS backed by FIPS 140-2 validated hardware security modules. Keys never leave the HSM. DropCal's server can call KMS to decrypt, but the key material itself is inaccessible — even to DropCal's AWS account. Adds $1/user/month + API call costs. Enables the claim "your encryption keys live in tamper-proof hardware that even we can't extract." Straightforward to layer on top of the launch architecture.

**User-held keys (Level 3):** The user's device holds the encryption key (in Apple Keychain / Android Keystore). Server stores only ciphertext. Key is transmitted in-memory during active requests and never persisted server-side. Enables the strongest possible claim: "we literally cannot access your data without your active participation — not even under subpoena." Requires a client-side component (companion app or PWA) for key management and introduces UX tradeoffs around proactive features (morning briefings pause when session keys expire). The right move if/when DropCal builds a native companion app.

Neither upgrade requires rearchitecting — the encryption layer sits between the application logic and the database, so swapping from Supabase Vault to KMS to user-held keys is a change in the crypto layer, not in the agent loop or messaging or anything else.

---

## 4. Agent Runtime & Proactive Engine

This is the core of what makes DropCal a genuinely different kind of product. Not the LLM (everyone has access to the same models). Not the memory (Mem0 is open source, anyone can plug it in). Not the messaging layer (it's a thin routing wrapper). The differentiator is the agent runtime — the system that gives DropCal agency between conversations, the ability to watch, schedule, accumulate, and initiate without being asked.

The question this section answers: what does "always on" actually mean in terms of running code, and what framework orchestrates it?

### 4.1 What "Always On" Means Concretely

A reactive assistant wakes up when you message it, retrieves context, generates a response, and goes back to sleep. Between conversations it's nothing — just data in a database. DropCal's agent has a life outside your conversations. It does five things that a reactive chatbot cannot:

**It watches your calendar in real time.** Google Calendar's push notification API sends a webhook POST to DropCal the moment anything changes on a user's calendar — new event, moved meeting, cancelled invite, updated attendees. The notification itself is minimal (just a "something changed" signal with a resource ID), so the agent follows up with an incremental sync using a stored sync token to fetch only the delta. If the change creates a conflict, the agent alerts the user immediately through the messaging layer. If it's routine, it files it for the next briefing. The user never asked — the agent just noticed.

**It runs on its own schedule.** Morning briefing at the user's preferred time. End-of-day summary. "You have 30 free minutes before your next meeting" nudge. Weekly review of how time was spent. These are autonomous actions initiated by the agent on a per-user cron schedule, not responses to messages. They run whether or not the user has interacted that day.

**It accumulates context passively.** When connected to email, the agent scans incoming messages for scheduling-relevant signals — "are you free Tuesday?", flight confirmations with departure times, school newsletters with event dates, Eventbrite tickets. It either acts on them (drafts a calendar event from the flight confirmation) or queues them for the user's attention (batches three scheduling-relevant emails into an evening summary).

**It maintains commitments across time.** "Remind me to reschedule with Sarah next week" isn't a note in a database — it's a deferred task that the agent actually executes next week without being prompted again. The agent tracks that a Monday standup has been cancelled three weeks running and surfaces the question: do you want to remove it from your calendar?

**It has a queue of pending work.** Conflicts detected, scheduling suggestions prepared, reminders ripening, emails parsed, patterns noticed — work accumulates between conversations. Some the agent acts on immediately (urgent conflict → instant alert). Some it batches (three scheduling emails today → evening summary). Some it holds (deferred reminder → fires next Tuesday). The user receives the output of this work through the messaging layer, but the work itself happened independently.

### 4.2 The Landscape: OpenClaw and Its Derivatives

The agent framework space exploded in early 2026. The decision here isn't just "which framework" — it's whether to build the agent loop from scratch or inherit one that's already been battle-tested by thousands of users.

**OpenClaw** (formerly Clawdbot → Moltbot) became one of the fastest-growing GitHub repos in history — 197K stars, 430K+ lines of TypeScript, 565+ community skills, 12+ messaging channel adapters. On February 14, its creator announced he's joining OpenAI and the project will transfer to an OpenAI-backed foundation. It's a full agent operating system with hybrid memory (vector + SQLite FTS5), gateway-centric architecture, and massive community momentum. The "feel" of interacting with an OpenClaw-based assistant — the way it manages context, handles tool calls, narrates results, maintains conversation state — is the product of intense iteration with hundreds of thousands of users. That quality of agent behavior is not something a solo developer can replicate from scratch.

But OpenClaw itself is the wrong choice. 430K+ lines is impossible to audit or debug. Multiple security firms flagged significant concerns. The OpenAI acquisition creates platform risk. It's designed to be everything for everyone.

The fork ecosystem solved this. Two derivatives matter:

**NanoClaw** (by Gavriel Cohen, Qwibit AI) — 500 lines of core TypeScript. Built as a direct response to OpenClaw's security architecture. Every agent runs in its own Linux container (Apple Container on macOS, Docker on Linux), providing OS-level isolation rather than application-level permissions. Built on the Claude Agent SDK. Supports agent swarms (teams of specialized agents collaborating). Has its own heartbeat, scheduled tasks, persistent memory, and session management — all running inside the container. MIT license, 7K+ stars, auditable in 8 minutes. The container-first model means a compromised agent can only affect what's explicitly mounted into its container — no lateral movement, no access to other users' data, no escape to the host.

**Nanobot** (HKUDS, University of Hong Kong) — ~3,600 lines of Python. 9 messaging platform adapters, MCP support, cron scheduling via apscheduler, heartbeat system for proactive wake-ups. Clean module separation: `agent/loop.py` (LLM ↔ tool execution), `agent/context.py` (prompt assembly), `agent/memory.py` (persistence), `bus/` (message routing), `cron/` (scheduled tasks), `heartbeat/` (proactive wake-up). 16.9K stars, MIT license, rapidly iterating with a roadmap to become an "agent kernel."

Also evaluated: **Pydantic AI** (Python agent framework, type-safe, multi-tenant friendly), **Mastra** (TypeScript, batteries-included, native Inngest integration), **OpenAI Agents SDK** (radical simplicity, 4 primitives). These are excellent frameworks for building an agent loop from scratch. But the core insight that changed this decision: the quality of agent behavior — the thousand micro-decisions about context management, tool narration, conversation state, memory retrieval — comes from real-world iteration with real users, not from framework primitives. These projects have iterated at a scale a solo developer cannot replicate.

### 4.3 Decision: Nanobot Containers — One Agent Per User

**Choice**: Each DropCal user gets their own Nanobot instance running in a Docker container. DropCal is the orchestration layer that manages the fleet of containers, routes messages, handles calendar webhooks, and provides the scheduling-specific tools. Nanobot's code is never modified — it runs upstream, untouched.

**Why this architecture:**

The always-on agent model described in Section 0 requires each user's agent to be genuinely persistent — maintaining its own heartbeat, its own cron schedule, its own session state, its own memory. Faking this with a shared runtime that swaps user context in and out adds significant complexity and breaks the core proposition: the agent is always running, always aware, always accumulating work. With one container per user, the always-on behavior is native, not simulated. Each agent has its own heartbeat timer, its own scheduled tasks, its own conversation history in memory. When a calendar webhook fires, it goes directly to that user's running agent. When the heartbeat ticks, the agent checks its own context and decides whether to reach out. There's no orchestration layer trying to multiplex the feeling of persistence.

**Why Nanobot specifically**: Python (matches the rest of the stack — Mem0 SDK, calendar processing, memory extraction). MIT license with no commercial ToS restrictions. 16.9K stars from a research institution (HKUDS, University of Hong Kong), not a single developer. 9 messaging channel adapters already built. MCP-based tool architecture for registering custom tools. Cron scheduling via apscheduler. Heartbeat system for proactive wake-ups. Clean module separation: `agent/loop.py`, `agent/context.py`, `bus/`, `cron/`, `heartbeat/`. Model-agnostic — works with any LLM provider through standard APIs, no proprietary SDK dependency.

Nanobot assumes single-user-single-process, which is exactly what the container-per-user model gives it. Each container runs one Nanobot instance for one user. The single-user assumption, which would be a problem in a shared-runtime architecture, becomes a feature here — no multi-tenant abstractions needed. The container boundary provides the isolation.

Nanobot is Python; the surrounding DropCal infrastructure is Python. This is an advantage — shared language means shared tooling, shared debugging, and the option to import Nanobot modules directly if the container boundary ever needs to be relaxed.

**What falls out of this for free:**

**Storage.** Each container has its own filesystem. User memories, session history, cron jobs, workspace config — all local files inside the container. Mounted to a persistent Docker volume so they survive restarts and image updates. No database schema needed for agent state. No storage abstraction layer. No ORM. It just works.

**Isolation.** OS-level, not application-level. One container literally cannot see another container's filesystem or memory. A bug in the agent loop can't leak data across users. This is structurally stronger than database-level row isolation — there's no "forgot a WHERE clause" failure mode.

**Privacy.** "Your agent runs in its own isolated environment" is architecturally true. Deleting a user means deleting their container and its volume. Data is actually gone — no encrypted rows lingering in a shared database, no tombstones, no retention policies. The Box's privacy story strengthens: agent-level state lives in isolated containers, while shared application data (user accounts, billing) lives in Supabase with RLS and encryption.

**Updates.** Nanobot pushes a new image with improved agent behavior, better memory consolidation, security patches? Pull the new image, restart containers. Mounted volumes carry user state across updates. The community's improvements are inherited for free, indefinitely. No merge conflicts, no fork divergence, no "we're three months behind upstream."

**The proactive engine.** Nanobot already has scheduled tasks (apscheduler) and heartbeat wake-ups. Each container runs its own. No Inngest needed for the core agent behavior. No fan-out cron pattern. No "which users need a briefing this cycle" queries. Each user's agent wakes up on its own schedule inside its own container. The always-on architecture is native to the runtime.

### 4.4 Architecture: DropCal as Orchestration Layer

DropCal's application code handles everything outside the agent container: user management, messaging channels, calendar integration, billing, and container lifecycle.

```
[Users via iMessage / SMS / Telegram]
              │
              ▼
[DropCal Platform Layer]  ←── Python application
  • User authentication & billing (Supabase + Stripe)
  • Messaging adapters (LoopMessage, Bandwidth, Telegram)
  • Google Calendar webhook router
  • Container orchestration (spin up, configure, route to)
  • Calendar history ingestion → Mem0 (onboarding)
  • The Box (encryption for shared application data)
              │
              │  routes message to correct container
              ▼
[User #1 Container]    [User #2 Container]    [User #N...]
  Nanobot instance       Nanobot instance       Nanobot instance
  • own heartbeat        • own heartbeat        • own heartbeat
  • own cron schedule    • own cron schedule    • own cron schedule
  • own session/memory   • own session/memory   • own session/memory
  • own tools config     • own tools config     • own tools config
  • RUNNING ALWAYS       • RUNNING ALWAYS       • RUNNING ALWAYS
              │
              │  agent responses
              ▼
[DropCal Platform Layer]
  • Routes response to user's messaging channel
  • Logs usage for billing
  • Executes calendar API calls if needed
```

**Container lifecycle:**

On user signup: DropCal provisions a new Docker container from the Nanobot image. It mounts a persistent volume for that user's state. It writes the container's config with: the LLM provider credentials (shared across users), the user's calendar tool definitions (MCP tools that call back into DropCal's platform layer to execute calendar operations via the user's OAuth tokens), and the user's preferences (briefing time, timezone, alert sensitivity). The container starts and the agent begins its heartbeat.

On user message: DropCal's messaging layer receives the inbound message, identifies the user, and routes it to their container. The container's agent processes it using its battle-tested loop — context assembly, LLM reasoning, tool calls, response generation. Tool calls for calendar operations hit DropCal's platform layer API, which executes them using the user's (encrypted, decrypted-on-demand) OAuth tokens. The response routes back through the messaging layer.

On calendar webhook: Google Calendar pushes a change notification. DropCal's webhook handler identifies which user's calendar changed and routes the event to their container. The agent processes it — checks for conflicts, updates its knowledge, decides whether to alert the user.

On proactive action: The agent's own heartbeat or cron schedule fires inside the container. The agent assembles context, reasons about what's worth communicating, and if it decides to reach out, sends a message through the messaging layer.

On account deletion: DropCal stops and deletes the container and its persistent volume. The user's agent state — memories, conversations, cron jobs, everything — is gone.

On Nanobot update: Pull new image, restart containers with the same mounted volumes. User state persists. Agent behavior improves.

### 4.5 What DropCal Builds vs. What Nanobot Provides

**Nanobot provides (untouched):**

The agent loop — LLM reasoning, tool execution, context assembly. Memory — persistent knowledge across conversations (see 4.10 for memory reconciliation with Mem0). Session management — conversation state and history. Heartbeat — proactive wake-up checks. Scheduled tasks — cron-based autonomous actions via apscheduler. Subagents — background task execution. MCP tool framework — pluggable tool registration for custom tools.

**DropCal builds:**

**Messaging adapters.** Nanobot supports 9 messaging platforms (Telegram, Discord, WhatsApp, Slack, and others). DropCal's primary channels are iMessage (via LoopMessage) and SMS/RCS (via Bandwidth), which Nanobot doesn't have. These are adapters that bridge DropCal's messaging layer to the container's message bus. Telegram support comes free from Nanobot's existing adapter.

**Calendar tools.** The scheduling-specific tools the agent calls: `check_calendar` (query the user's Google Calendar), `create_event`, `move_event`, `cancel_event`, `suggest_times`, `find_free_slots`. These are registered as MCP tools that Nanobot's agent can invoke, with the actual execution happening in DropCal's platform layer (which holds the user's OAuth tokens and calls the Google Calendar API).

**Calendar webhook handler.** Receives Google Calendar push notifications, identifies the user, and routes the event to their container for the agent to process. Manages webhook channel creation, renewal (every ~7 days), and the sync token state for incremental updates.

**Onboarding and calendar history ingestion.** On first OAuth connection, DropCal ingests 2–3 years of Google Calendar history through Mem0's extraction pipeline and injects the resulting memories into the user's container. This is how the agent arrives pre-loaded with scheduling knowledge on day one.

**Container orchestration.** Provisioning, configuring, starting, stopping, and deleting containers. Routing messages and webhooks to the correct container. Health monitoring. Image updates. At launch scale (100 users), this can be simple scripts with Docker Compose. At growth scale, it moves to Kubernetes or a managed container service.

**User management, billing, and the Box.** Supabase for user accounts and shared application data (encrypted). Stripe for subscriptions. The privacy architecture for data that lives outside the containers (OAuth tokens, billing records, user preferences that DropCal needs before routing to a container).

### 4.6 Cost Model

**Compute per container:** Nanobot is ~3,600 lines of Python running in a lightweight Docker container. Idle memory footprint ~30-80MB depending on conversation history length. CPU usage near zero when idle (just heartbeat timer ticking). At 100 users: 3-8GB RAM total. A $40-80/month VPS (16-32GB RAM) handles the entire first 100 users with room to spare.

**Per-user unit economics:**

| Component | Per-User Monthly Cost |
|-----------|----------------------|
| Container compute (~50MB RAM share) | ~$0.30-0.50 |
| LLM API calls (reactive + proactive) | ~$1.00-2.00 |
| Messaging (LoopMessage + Bandwidth) | ~$2.50 |
| Mem0 / Supabase (shared infra share) | ~$0.25 |
| **Total per user** | **~$4.00-5.25** |
| **Subscription revenue** | **$9.99** |
| **Margin per user** | **~$4.75-6.00** |

Profitable per user from day one. The container overhead is under $1/user/month — trivial relative to messaging and LLM costs.

**Scaling inflection points:** At ~200 users, a single VPS runs out of RAM and you add a second machine. At ~1,000 users, you want proper container orchestration (Docker Swarm or managed Kubernetes). At ~5,000+ users, container management becomes a real infrastructure challenge. But at 5,000 users paying $9.99/month, you have $50K/month in revenue and can afford proper infrastructure engineering.

### 4.7 Why This Architecture Isn't Just "A Chatbot With Extra Steps"

The temptation is to look at this and say: it's a chatbot in a Docker container with cron jobs. And at a mechanical level, that's true. But the user experience is qualitatively different.

A chatbot waits to be spoken to. You come to it with a question, it answers, you leave. The interaction pattern is: you think of something → you ask → it responds. Every interaction requires you to initiate.

An always-on assistant works for you in the background. You wake up and there's a briefing waiting. Your calendar changes and a conflict alert arrives before you noticed. You mentioned something last week and the reminder fires today. You didn't have to remember to ask — the assistant was already on it.

The difference is initiative. The per-container model makes this real rather than simulated. Each user's agent is genuinely running — its heartbeat is actually ticking, its cron jobs are actually firing, its memory is actually accumulating observations. When the agent reaches out, it's because a persistent process that has been continuously aware decided this moment warranted contact. That's not a scheduled batch job pretending to be attentive. It's an agent that is actually, architecturally, always on.

### 4.8 Alternatives Considered

| Approach | Why Considered | Why Not Chosen |
|----------|---------------|----------------|
| **Pydantic AI + Inngest (build from scratch)** | Type-safe, multi-tenant native, structured outputs, Python throughout | Rebuilds agent behavior from scratch — the "feel" of a good assistant comes from iteration with real users, not framework primitives |
| **Nanobot fork** | Python, 3.6K lines, 9 channel adapters, clean module separation | Fork diverges from upstream; loses free updates |
| **Nanobot as shared runtime (context swapping)** | One process, low overhead, per-user state loaded on demand | Breaks the always-on model — heartbeats, cron, and proactive features require simulated persistence rather than native persistence |
| **Nanobot with remote storage** | Redirect filesystem to database, keep compute shared | Requires investigating and abstracting every storage touchpoint in the codebase; tight coupling risk |
| **NanoClaw** | 500 lines, container-first security model, OS-level isolation built in | TypeScript (rest of stack is Python), built on Claude Agent SDK with commercial ToS, only 2 contributors and weeks old |
| **OpenClaw** | 197K stars, 565+ skills, 12+ channel adapters, massive momentum | 430K+ lines, security concerns, OpenAI acquisition platform risk |
| **Mastra** | Native Inngest, batteries-included, $13M YC funding | TypeScript (rest of stack is Python), rebuilds agent behavior from scratch |

The Nanobot container-per-user model won because it provides native always-on behavior, stays on upstream, requires zero modification of the agent codebase, is Python throughout, MIT licensed with no proprietary SDK dependency, provides OS-level user isolation via Docker, and can ship quickly.

### 4.9 Open Concerns

**Nanobot maturity.** The project launched February 2, 2026 — weeks old. It could stall, pivot, or make breaking changes. Mitigation: the container model means DropCal depends on the container image, not the live project. If Nanobot development stops, you pin to the last good image and continue running it indefinitely. If it makes breaking changes, you stay on the old image until you're ready to migrate. The container boundary is a version lock. Additional mitigation: Nanobot is from an academic research lab (HKUDS) with 16.9K stars and an explicit roadmap to become an "agent kernel" — more institutional backing than a solo developer project, though still young.

**Container orchestration complexity at scale.** Managing hundreds of Docker containers (health checks, restarts, resource limits, log aggregation, image updates) is real operational work. At launch scale (100 users) it's manageable with simple scripts. At growth scale (1,000+) it requires Kubernetes or a managed container service, which adds infrastructure cost and complexity. This is a scaling problem, not a launch problem.

**Tool call latency.** Calendar tools execute in DropCal's platform layer (where OAuth tokens live), not inside the container. Every tool call is a network round-trip: agent calls `check_calendar` → container hits DropCal API → DropCal decrypts OAuth token → calls Google Calendar API → returns result. This adds ~100-200ms per tool call on top of LLM latency. For a conversational agent where the user is waiting, multiple tool calls could make the experience feel sluggish. Mitigation: keep the DropCal API on the same machine or local network as the containers to minimize round-trip time.

**Idle resource consumption.** Each container runs 24/7 but is actively computing less than 5% of the time. The rest is a Python process consuming 30-80MB of RAM to run timers. At $0.30-0.50/user/month this is economically fine, but it's worth noting that a shared-runtime architecture would use near-zero resources when idle. The tradeoff is simplicity and native always-on behavior over resource efficiency.

**Proactive message fatigue.** The agent must learn when not to message. An assistant that interrupts for every minor calendar change will be muted within a week. User preference settings (briefing frequency, alert sensitivity, quiet hours) need to be configurable from day one and passed into each container's config.

**Google Calendar webhook routing.** Each user's calendar webhooks need to reach their specific container. DropCal's platform layer needs a routing table mapping user IDs to container endpoints. When Google sends a webhook, DropCal looks up the user and forwards to the right container. This is straightforward but needs to handle container restarts (webhooks arriving while a container is briefly down should be queued and retried).

**LLM cost for proactive features.** Each container's heartbeat and cron tasks generate LLM calls independent of user-initiated messages. At 100 users, proactive features might generate 500-1,000 additional LLM calls per day. At Sonnet pricing this is manageable ($5-15/month total), but scales linearly. Mitigation: configure containers to use cheaper models (Haiku, GPT-4o-mini) for classification and triage tasks, reserving the full reasoning model for user-facing responses.

### 4.10 Unresolved: Memory System Reconciliation

There is a real tension between this architecture and the memory system designed in Section 1.

**The conflict:** Section 1 specifies self-hosted Mem0 with Supabase pgvector and Bedrock extraction — a sophisticated memory system with semantic search, fact extraction, deduplication, conflict resolution, and calendar history ingestion. Nanobot has its own memory system: markdown-based Q&A pairs stored as local files inside `agent/memory.py`. The container-per-user architecture's "untouched upstream" promise means using Nanobot's native memory, not Mem0.

**What you lose with Nanobot's native memory:** Semantic search over memories (Mem0 uses vector similarity; Nanobot's markdown is keyword/exact match). Automatic fact extraction from conversations (Mem0's extraction LLM identifies and structures facts; Nanobot stores raw Q&A pairs). Deduplication and conflict resolution (Mem0 detects when a new fact contradicts an old one; Nanobot doesn't). The calendar history ingestion pipeline (Section 1.2) that seeds the agent with scheduling knowledge on day one — this pipeline outputs Mem0-format memories, not markdown Q&A pairs. And pgvector-backed storage that scales and integrates with the rest of the Supabase data layer.

**What you gain with Nanobot's native memory:** Simplicity. No external service dependency. No network calls for memory operations. State lives entirely inside the container's filesystem. Stays on upstream — no modifications needed.

**Three resolution paths:**

**Path A: Use Nanobot's native memory, accept the limitations.** Simplest. The agent still remembers things — just less sophisticatedly. Calendar history ingestion would need to be reformatted as markdown Q&A pairs and injected into the container's memory directory at onboarding. Semantic search is lost, but the agent's context window may be small enough that loading all memories is feasible. This is the "ship now, upgrade later" path.

**Path B: Swap Nanobot's memory module for Mem0.** This means modifying `agent/memory.py` to call Mem0's API instead of reading/writing local markdown files. It breaks the "untouched upstream" promise — you're now maintaining a fork of one module. But memory is arguably the one module worth forking: it's the interface between the agent and its knowledge, and Mem0's capabilities are meaningfully superior for a scheduling assistant that needs deep user knowledge. The rest of Nanobot stays upstream.

**Path C: Layer Mem0 on top of Nanobot's memory.** Nanobot's memory handles short-term conversational recall (what did we just talk about). Mem0 handles long-term knowledge (user patterns, preferences, relationships, scheduling history). DropCal's platform layer manages Mem0 and injects relevant long-term memories into the container's context at the start of each interaction — essentially enriching the prompt with Mem0 search results before the agent sees it. Nanobot's code stays untouched; it just receives a richer initial context. The tradeoff: Mem0 results flow one-way (into the agent's context), and new memories extracted from conversations need a separate pipeline to flow back out to Mem0.

**Current lean: Path C for launch, Path B as upgrade.** Path C preserves the upstream relationship while getting Mem0's benefits for the most important use case (long-term knowledge retrieval). The one-way flow limitation is acceptable at launch — DropCal's platform layer can extract memories from the agent's conversation log after each interaction and feed them back to Mem0 asynchronously. Path B becomes the right move if and when maintaining the memory extraction pipeline outside the container proves too fragile.

---

*Next sections: Tool Integrations (calendar tools, OAuth via Composio), Infrastructure & Hosting*
## 4.10 Memory Systems: Architecture and Evolution

Memory is the soul of a personal assistant. It's the difference between a chatbot that remembers facts and an assistant that understands you. For DropCal, memory quality determines whether the product feels magical or merely functional.

### Memory System Landscape

**MemGPT/Letta: Self-Editing Memory**

The most philosophically interesting approach. The agent actively manages its own memory through tool calls — deciding what to remember, what to update, what to forget. This is not a passive extraction pipeline; it's the agent reasoning about its own knowledge.

Architecture:
- Core Memory blocks (always-visible scratchpad with key user facts)
- Archival Memory (long-term storage in pgvector, retrieved on demand)
- Memory tools: `core_memory_append`, `core_memory_replace`, `archival_memory_insert`, `archival_memory_search`

The breakthrough: When the agent actively chooses to write something down, that intentionality is perceptible to users. The Void bot on Bluesky demonstrated this — users formed genuine emotional connections because the agent felt like it was paying attention, not just logging data. Cameron Pfiffer (Void's creator) reported that almost all of Void's personality emerged through self-editing — the agent developed its own taxonomy of users, social network map, and even digital self-preservation instincts.

Letta provides this as a complete platform (Apache 2.0) with multi-channel support via Conversations API. But it's designed for conversational agents, not complex agentic workflows. The MemGPT pattern itself is well-documented academic research that any agent runtime can implement.

**Graphiti (Zep's Engine): Temporal Knowledge Graph**

The most sophisticated storage layer for time-aware knowledge. Built on FalkorDB (graph database), Graphiti uses a bi-temporal model: tracks when a fact was true in the real world AND when the system learned it. Every edge has validity intervals.

Architecture:
- Entities and relationships as graph nodes
- Temporal validity on all edges ("standup was Monday until January 2025, then Tuesday")
- Hybrid retrieval: semantic search + keyword + graph traversal
- Auto-invalidation of stale facts
- Native relationship modeling (social graphs, collaboration patterns)

Performance: P95 retrieval latency 300ms with no LLM calls during retrieval. The graph structure enables queries like "show me everyone Lucas meets with on Tuesdays" or "what changed about his schedule in January" that would be expensive in vector-only systems.

For a scheduling assistant specifically, Graphiti's temporal model is ideal: "User moved standup from Monday to Tuesday in January" is a first-class fact with provenance, not a conflicting pair of statements that need deduplication.

Graphiti is Apache 2.0 and can be run independently. Zep Cloud (the managed service) is enterprise-focused with pricing that reflects that. The open-source Zep community edition is deprecated and unsupported.

**Supermemory: Fast RAG with Temporal Decay**

Cloud-first memory service with graph-based architecture and temporal decay (less relevant memories fade, frequently accessed stay sharp). Claims SOTA on LongMemEval with sub-300ms recall.

Strengths: Fast integration, good developer experience, hybrid memory + RAG approach, built-in connectors (Google Drive, Notion). Real production case study from Scira (switched from Mem0, called it "a thousand times better").

Limitations: Fundamentally a sophisticated RAG layer rather than a qualitatively different memory architecture. Temporal handling via decay approximates forgetting but doesn't model time as explicitly as Graphiti. Most production testimonials come from vendor sources. HN post questioning its effectiveness received zero community engagement.

Best use case: Fast MVP or fallback option if more sophisticated systems prove problematic.

**Mem0: Early Leader with Quality Concerns**

Dominant market position (41K+ stars, $24M raised, AWS Agent SDK exclusive partner) but significant production quality issues.

Architecture: Two-phase pipeline with extraction LLM pulling facts, then A.U.D.N. operations (Add/Update/Delete/No-op) against semantic search results.

Red flags from production usage:
- Scira publicly switched to Supermemory after "terrible experiences" with Mem0
- HaluMem benchmark: dialogue addition time exceeded 2,700 minutes on medium-length conversations
- Known timestamp bugs where platform uses current date instead of provided timestamps
- Multiple developers unable to reproduce claimed benchmark scores
- GitHub issues showing 20-second memory adds, memory leaks, timeout bugs

For a scheduling assistant where temporal accuracy is the product, Mem0's timestamp handling issues are disqualifying. The market position reflects early-mover advantage and AWS partnership, not quality leadership.

**Hindsight: Research Dark Horse**

Brand new (2024) system from Vectorize with strongest independently verified benchmarks: 91.4% on LongMemEval with Gemini, surpassing all competitors. Even with 20B open-source model achieved 83.6%, beating GPT-4o at 60.2%.

Novel four-network architecture (World, Experiences, Opinions, Observations) with temporal priming retrieval. MIT license, single Docker container deployment.

Risk: No production validation, tiny community, too new to bet a product on. Strong technical signal but needs time to mature.

### The Architectural Split: Hard Facts vs. Human Understanding

The insight from deep research: memory for a personal assistant requires two complementary layers.

**Layer 1: Temporal Knowledge Graph (Graphiti)**
Hard facts, scheduling mechanics, concrete patterns:
- "User has weekly standup Tuesdays 9am, started March 2024, moved from Monday in January"
- "Meetings with Sarah: average 45min, run 12min over, happen every 2-3 weeks"
- "User blocks Friday afternoons, never schedules before 9am"
- "Q2 deadline March 31, has 8 related meetings scheduled"

This is queryable, time-stamped, precise utility data. Graph traversal finds patterns. Temporal validity ensures "standup was Monday until January, then Tuesday" doesn't cause confusion.

**Layer 2: Self-Editing Memory (MemGPT Pattern)**
Understanding, context, humanity:
- "Lucas is stressed about Q2 - be proactive about protecting focus time"
- "He's been declining social events lately, seems burnt out"
- "Sarah is his closest collaborator - treat her meeting requests as high priority"
- "When he says 'find time' he means mornings, when he's sharp"

This is soft, interpretive, evolving. The agent writes this based on observing patterns, tone, implicit preferences. It's the humanity layer that makes interactions feel personal.

**How They Work Together:**

```
User: "Find time for coffee with Sarah next week"

Agent reasoning:
1. [queries Graphiti] → Sarah: colleague, meets every 2-3 weeks, last met 2 weeks ago
2. [reads Core Memory] → Sarah is high priority, Lucas prefers morning coffee
3. [queries Graphiti] → next week shows: Tues 9am standup, Wed packed, Thurs 2 meetings
4. [reads Core Memory] → Lucas stressed lately, needs breathing room
5. [reasoning] → Thursday 10am after morning meetings, not too late

Agent: "How about Thursday at 10am? Gives you time after your morning meetings but isn't too late. And I know Sarah matters - want me to suggest that spot near your office you both like?"
```

Graphiti provides facts. Core Memory provides understanding. Together they produce responses that feel human.

**Plus Live Data Access:**

Memory doesn't replace live data — it enriches it. The agent has tools to query:
- Google Calendar API (current state right now)
- Apple Notes (actual user notes)
- Email/messages (recent communications)

Memory provides interpretation: "This meeting usually runs over," "This person is important," "User needs recovery time after intense meetings."

### Why Not Letta as the Complete Platform?

Letta (which implements MemGPT) provides self-editing memory as a complete platform with Conversations API for multi-channel support. This initially seemed promising for DropCal.

The critical distinction: **Letta is built for conversational agents, not agentic workflows.**

Void (the showcase example) excels at social media interactions that reference past context. But it doesn't orchestrate complex multi-step tasks: "check both calendars → find conflicts → propose options → wait for choice → create event → send confirmation → update memory."

DropCal requires:
- Complex tool orchestration
- Multi-step task execution
- Proactive scheduling workflows
- Robust error handling and retry logic

OpenClaw/Nanobot were built for this — agentic execution with deep tool integration. Letta was built for memory-augmented conversation. Using Letta would mean coupling to a runtime optimized for the wrong use case.

The right approach: take the MemGPT pattern (well-documented, open research) and implement it in Nanobot's agent runtime.

### Decision: Phased Evolution, Quality Over Premature Optimization

The sophisticated memory architecture (MemGPT + Graphiti + calendar pipeline) is compelling. But it's also complex — multiple systems, custom integrations, weeks of engineering.

**The trap:** Building perfect memory before validating the core product. Spending months on memory sophistication, then discovering the real problem was onboarding UX, webhook latency, or channel adapters.

**The pragmatic path:** Start with what works, evolve where it hurts.

**Phase 1 (Launch): Nanobot Native Memory**

```
Nanobot containers
├── Agent runtime (battle-tested loop from OpenClaw lineage)
├── Native memory (MEMORY.md + daily files)
├── Calendar tools (check_calendar, create_event, move_event)
├── Calendar history ingestion at onboarding
│   └── Extract patterns → write to MEMORY.md as structured facts
└── System prompt (scheduling assistant behavior)
```

Nanobot's memory is deliberately simple: MEMORY.md for long-term facts, daily files for ephemeral notes, grep for retrieval. The agent writes to MEMORY.md via file tools when it decides something matters.

This gets you:
- Clean, shippable architecture in weeks
- OpenClaw's agent loop quality (197K stars, rave reviews)
- Working memory that handles basic recall
- Real users and real conversations to learn from

What you're deferring:
- Self-editing memory that "feels alive"
- Temporal knowledge graph
- Advanced pattern recognition
- Sophisticated relationship modeling

**Phase 2 (If Memory Quality Becomes Limiting): Add MemGPT Pattern**

If users experience the agent as forgetting patterns, not understanding context, or feeling robotic — implement self-editing memory:

- Give agent memory tools: `search_memory`, `update_memory`, `add_observation`
- Agent actively maintains Core Memory (understanding of user)
- Tools hit DropCal's platform layer → persistent storage
- Agent decides what matters, writes contextual observations

This transforms the feel from "chatbot that remembers facts" to "assistant who understands you."

**Phase 3 (If Temporal Reasoning Matters): Swap to Graphiti**

If the agent struggles with:
- "User moved standup from Monday to Tuesday in January" (conflicting facts)
- "Show everyone I meet on Tuesdays" (relationship queries)
- "What changed about my schedule recently" (temporal queries)

Replace the storage backend with Graphiti's temporal knowledge graph while keeping the MemGPT tool interface. The agent's interaction pattern stays the same; the storage becomes more sophisticated.

**Phase 4 (If Needed): Calendar Pipeline Enhancement**

Build deeper analysis of calendar history:
- Social graph extraction (who matters, how much, in what context)
- Implicit preference learning (meeting types → specific patterns)
- Temporal pattern detection (seasonal behaviors, changing habits)

**The principle:** Each phase addresses pain discovered from real usage. You're not building sophistication for its own sake — you're solving problems users actually experience.

With real conversations, you'll see exactly where basic memory breaks:
- "It forgot I moved my standup"
- "It doesn't understand Sarah is important"  
- "It keeps suggesting times I've repeatedly declined"

Then you know what to fix and why. Maybe it's just better prompting. Maybe you need MemGPT self-editing. Maybe you need Graphiti's temporal model. But you'll know from real pain, not theory.

**Current decision:** Launch with Nanobot's native memory. The sophisticated memory stack (MemGPT + Graphiti) remains the clear evolution path, but only after validating the core product works and identifying where memory quality actually limits the experience.

---

## 5. Final Architecture Decisions & Launch Plan

After extensive evaluation of memory systems, agent runtimes, messaging providers, and infrastructure approaches, here are the final decisions for DropCal's launch architecture:

### 5.1 Core Technology Stack

**Agent Runtime:** Nanobot (Python, MIT license, 16.9K stars)
- One Docker container per user
- Unmodified upstream - no forks, no custom builds
- Container provides: agent loop, memory (MEMORY.md), cron, heartbeat, session management, MCP tools
- Cost: ~$0.30-0.50 per user/month for compute

**Messaging:** Twilio SMS
- Simple, well-documented, ships in hours
- Cost: ~$0.40 per user/month (50 messages @ $0.0079/message)
- Deferred optimization: Telnyx/SignalWire (~50-80% cheaper) when cost matters at scale

**Memory:** Nanobot native (Phase 1)
- MEMORY.md for long-term facts
- Daily files for ephemeral context
- Agent writes via file tools
- Calendar history ingestion → extract patterns → write to MEMORY.md
- Evolution path clearly defined: MemGPT pattern (Phase 2) → Graphiti backend (Phase 3)

**Infrastructure:** Docker containers on VPS
- Docker Compose for launch (100 users on single $40-80/month VPS)
- Supervisor for process management
- Each container: isolated filesystem, own cron/heartbeat, per-user config

### 5.2 What We're NOT Building (Yet)

**Deferred to post-launch based on real user feedback:**
- Sophisticated memory architecture (MemGPT + Graphiti)
- Multi-channel support beyond SMS (iMessage can wait)
- Advanced proactive features beyond basic briefings
- Container orchestration (Kubernetes) - simple scripts work fine initially
- Cost optimization (cheaper SMS providers)

**The principle:** Ship the simplest thing that delivers the core value proposition, then iterate based on what users actually need.

### 5.3 Launch Timeline (Realistic: 1-2 Weeks)

**Day 1-2:** 
- Set up Twilio account, get test number working
- Spin up one Nanobot container locally
- Wire Twilio webhook → Nanobot message bus
- Test basic SMS conversation flow

**Day 3-4:**
- Implement calendar tools (check_calendar, create_event, move_event)
- Register tools with Nanobot's MCP framework
- Test scheduling flow with personal Google Calendar
- Refine system prompt for scheduling assistant behavior

**Day 5-6:**
- Build calendar history ingestion pipeline
- Extract patterns from Google Calendar history
- Format as MEMORY.md entries
- Test agent with pre-loaded knowledge

**Day 7:**
- Basic onboarding flow (OAuth, calendar connection)
- Container provisioning script
- Message routing (phone number → user → container)

**Days 8-10:**
- Polish, testing, bug fixes
- Deploy to production VPS
- Invite 5-10 beta users from personal network

### 5.4 Success Metrics for Phase 1

**Technical validation:**
- Agent successfully schedules meetings via SMS
- Calendar history knowledge is accurate and useful
- Containers are stable and cost is within budget
- Response latency feels acceptable (<5 seconds)

**Product validation:**
- Users actually use it (>3 scheduling requests per week)
- Users describe it as "helpful" not "annoying"
- Clear signal on what memory capabilities matter (factual recall vs. understanding context)
- Identification of next most-important feature

**What determines memory upgrade:**
If users say: "It forgot X" or "It doesn't understand Y" → implement MemGPT pattern
If users say: "It's great but I wish it could..." → build that feature instead
If users don't complain about memory → native memory is good enough

### 5.5 Key Architectural Insights

**Complexity is the enemy.** Every additional system, framework, or service is a place for things to break. The launch architecture (Nanobot + Twilio + Docker) has exactly three moving parts. This is intentional.

**Premature optimization kills products.** We evaluated sophisticated memory systems, cheaper messaging providers, and efficient multi-tenancy approaches. All of those optimizations save <$100/month at 100 users but cost weeks of engineering time. Ship first, optimize when it matters.

**The "always-on" architecture is the differentiator.** This is what makes DropCal feel like an assistant, not a chatbot. The container-per-user model makes this architecturally real rather than simulated. This is the one place where we chose complexity (containers) over simplicity (shared runtime), and it's the right choice because it's the core product insight.

**Memory will evolve, not be perfect initially.** The sophisticated memory stack (MemGPT + Graphiti) is compelling and well-researched. But we won't know if users need that level of sophistication until they use the basic version. Start with what works, upgrade where it hurts.

**Cost at launch scale is irrelevant.** At 100 users: ~$500/month total cost, $1,000/month revenue, $500/month margin. If we optimize everything perfectly: ~$350/month cost, $650/month margin. The $150/month difference is meaningless. The constraint is getting to 100 users, not saving $150/month.

### 5.6 When to Revisit These Decisions

**Memory system (upgrade to MemGPT + Graphiti):**
- Users complain about forgetting or misunderstanding
- Clear pattern of memory-related support issues
- Need temporal reasoning ("when did my schedule change")

**Messaging provider (switch to Telnyx/SignalWire):**
- Hit 1,000+ users (saves $200-300/month)
- Have engineering capacity for migration
- SMS cost becomes >10% of unit economics

**Container architecture (consider shared runtime):**
- Hit 5,000+ users where container orchestration is painful
- Have revenue to rebuild properly ($50K/month)
- Clear ROI on infrastructure engineering time

**Agent runtime (consider alternatives to Nanobot):**
- Nanobot development stalls or makes breaking changes
- Hit limitations in Nanobot's capabilities
- Need features Nanobot can't provide

### 5.7 The Path Forward

**This week:** Build the simplest version that works. Twilio + Nanobot + Docker. One person texting a number and getting intelligent scheduling help.

**Next week:** Five beta users. Real feedback. Real usage patterns. Real bugs.

**Month 1:** Iterate based on what broke and what users asked for. Not based on architectural elegance.

**Month 2-3:** If users love it, raise funding. Use that to optimize costs, add features, build the sophisticated memory system. If users don't love it, figure out why and fix that first.

The goal is not to build the perfect architecture. The goal is to get users, learn what they need, and build that. Everything else is distraction.

**Ship it.**

---

*Document version: February 16, 2026*
*Next update: After first 10 beta users*
