# External Providers & Tools

Everything DropCal depends on externally, organized by domain.

---

## AI / LLM Services

| Provider | Model | Used For | Config |
|----------|-------|----------|--------|
| **Anthropic (Claude)** | claude-sonnet-4-5-20250929 | Text extraction agents (identification, facts, formatting) | `ANTHROPIC_API_KEY` |
| **xAI (Grok)** | grok-3 | Default text + audio extraction (swappable with Claude/OpenAI) | `XAI_API_KEY`, base URL `https://api.x.ai/v1` |
| **OpenAI** | gpt-4o, whisper-1 | Alternative text processing; Whisper audio transcription | `OPENAI_API_KEY` |

Provider selection is configurable in `backend/config/text.py` and `backend/config/audio.py`. Current default: Grok for text, Deepgram for audio.

## Audio Transcription

| Provider | Model | Used For |
|----------|-------|----------|
| **Deepgram** | nova-2 | Default speech-to-text with timestamp support |
| **OpenAI Whisper** | whisper-1 | Alternative transcription |
| **Vapi** | - | Voice AI platform (transcription + voice interactions) |

Configured in `backend/config/audio.py`. Keys: `DEEPGRAM_API_KEY`, `VAPI_PRIVATE_KEY`, `VAPI_PUBLIC_KEY`.

## Calendar Integrations

| Provider | Protocol | Auth Method |
|----------|----------|-------------|
| **Google Calendar** | REST API | OAuth 2.0 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) |
| **Microsoft Outlook** | Microsoft Graph API | OAuth 2.0 via MSAL (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`) |
| **Apple Calendar** | CalDAV (`caldav.icloud.com`) | Apple ID + app-specific password |

Each has its own module under `backend/calendars/{google,microsoft,apple}/` handling auth, fetch, create, and transform.

## Authentication & Database

| Provider | Used For |
|----------|----------|
| **Supabase** | PostgreSQL database, user management, profile storage, provider connections. Used on both frontend (`@supabase/supabase-js`) and backend (`supabase` Python SDK). Keys: `SUPABASE_URL`, `SUPABASE_KEY`. |
| **MSAL (Azure)** | Microsoft OAuth popup flow on the frontend (`@azure/msal-browser`). |

## Web Scraping

| Provider | Used For |
|----------|----------|
| **Firecrawl** | Extracting event information from web page URLs. Key: `FIRECRAWL_API_KEY`. |

## Email Processing

| Provider | Used For |
|----------|----------|
| **Cloudflare Workers** | Serverless inbound email handler. Receives emails via Cloudflare Email Routing, parses with `postal-mime`, forwards to backend webhook at `/api/webhook/inbound-email`. Config in `cloudflare-worker/wrangler.toml`. |

## ML / Embeddings / Similarity

| Library | Used For |
|---------|----------|
| **Sentence Transformers** (Hugging Face) | Computing event embeddings for similarity matching |
| **FAISS** (Meta) | Fast similarity search over event embeddings |
| **scikit-learn** | Clustering and pattern analysis |
| **KeyBERT** | Keyword extraction from events for preference learning |
| **PyTorch** | ML runtime for the above |

All used in `backend/preferences/similarity/`.

## Orchestration

| Library | Used For |
|---------|----------|
| **LangChain** | Agent orchestration, prompt templates, structured outputs. Packages: `langchain-anthropic`, `langchain-openai`, `langchain-core`. |

## Deployment & Infrastructure

| Service | Used For |
|---------|----------|
| **AWS Elastic Beanstalk** | Backend deployment (region: `us-east-1`, env: `dropcal-prod`) |
| **AWS S3** | Frontend static hosting (bucket: `dropcal-frontend`) |
| **AWS CloudFront** | CDN for frontend delivery |
| **GitHub Actions** | CI/CD pipeline (`.github/workflows/ci.yml`) |
| **Redis** | Production rate limiting (optional, falls back to in-memory) |

## Frontend Stack

| Library | Version | Used For |
|---------|---------|----------|
| React | 18.3.1 | UI framework |
| Vite | 7.2.4 | Build tool / dev server |
| React Router | 7.13.0 | Client-side routing |
| Tailwind CSS | 4.1.18 | Styling |
| Framer Motion | 12.29.2 | Animations |
| Radix UI | 1.2.8 | Headless UI primitives (tooltips) |
| Phosphor Icons | 2.1.10 | Iconography |
| Sonner | 2.0.7 | Toast notifications |
| React Loading Skeleton | 3.5.0 | Skeleton loaders |
| React Voice Visualizer | 2.0.8 | Audio waveform display |

## Mobile Stack

| Library | Used For |
|---------|----------|
| **Expo** (~54.0.33) | React Native framework + build services (EAS) |
| **React Native** (0.81.5) | Cross-platform mobile runtime |
| **NativeWind** (4.2.1) | Tailwind CSS for React Native |

## Backend Stack

| Library | Used For |
|---------|----------|
| **Flask** (3.1.2) | Web framework |
| **Gunicorn** (21.2.0) | Production WSGI server |
| **Flask-CORS** | Cross-origin request handling |
| **Flask-Limiter** | Rate limiting (backed by Redis in prod) |
| **Pydantic** | Request/response validation |
| **Cryptography** | Token encryption (`backend/utils/encryption.py`) |
| **python-dateutil** | Date/time parsing |
| **PyPDF2 + pdf2image + Pillow** | PDF-to-image conversion for vision processing |
| **caldav + icalendar** | Apple Calendar protocol support |
