# Extraction Pipeline Research: Architecture, Tradeoffs, and Improvement Opportunities

Research conducted Feb 2026. Covers batch vs per-event extraction, multi-pass identification, self-correcting structured output, and document preprocessing.

---

## Current Architecture

```
Input → [PDF/Audio/Image preprocessing] → Agent 1 (Identification) → Agent 2 (Extraction, per-event) → Agent 3 (Personalization, per-event, conditional)
```

**LLM calls per session with N events:**
- Without personalization: `1 + N` (identification + N extractions)
- With personalization: `1 + 2N` (identification + N extractions + N personalizations)
- Title generation: 0 (KeyBERT, not LLM)
- Embeddings: 0 (SentenceTransformers, not LLM)

**Non-LLM costs that are already efficient:**
- Title gen uses KeyBERT (local, free)
- Embeddings use SentenceTransformers `all-MiniLM-L6-v2` (local, free)
- Pattern refresh is background/async (non-blocking)

---

## Key Research Finding: Per-Event Extraction Is Correct

The per-event Agent 2 design is NOT a problem to fix. Research validates it as the right approach for complex inputs.

### Evidence: Output Volume Is the Binding Constraint

**ExtractBench (2026)** — PDF-to-JSON extraction across frontier models:

| Output complexity | Fields | Pass Rate |
|---|---|---|
| 13 fields (~0.9k tokens) | Simple | 56% |
| 16 fields + arrays | Medium | 39% |
| 369 fields | Complex | **0%** |

A syllabus with 30 events x ~10 fields = 300+ fields of structured output. Every frontier model scored 0% at that output volume. Batching Agent 2 for a syllabus would make extraction **worse**.

Source: https://arxiv.org/html/2602.12247

### Evidence: Per-Item Eliminates Hallucination

A peer-reviewed medical extraction study (PMC 2025) explicitly abandoned multi-patient batching because "simultaneous entry of multiple patients was associated with hallucinations." Per-item extraction achieved F1 of **0.992**.

Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC11751965/

### Evidence: Lost in the Middle

Liu et al. (TACL 2024): LLM performance degrades **30%+** when relevant information is in the middle of long contexts. When extracting event 15 of 30, the middle events are most likely to be missed or hallucinated.

Source: https://aclanthology.org/2024.tacl-1.9/

### Evidence: The Repeat Curse

Research (2025) on "Repetition Features" in LLMs: enumeration tasks with time-related fields (exactly what calendar events are) are the **most vulnerable** to degenerate repetitive output. Testing showed repeat scores jumping from 0.37 to 0.72 on enumeration tasks.

Source: https://arxiv.org/html/2504.14218v1

### Evidence: Context Rot

Chroma Research (2025) tested 18 models: performance consistently declines as input length increases. Even a single distractor reduces performance. When extracting one event from a batch of 50, all other 49 events act as distractors.

Source: https://research.trychroma.com/context-rot

---

## The Real Bottleneck: Agent 1 (Identification)

Agent 1 must find ALL events in a single document. For a 40-event syllabus at ~85% recall (typical single-pass), that means ~6 events are missed. This is where the biggest quality improvement opportunity exists.

Current mitigation: chunking at 15k chars with 500 char overlap, parallel chunk processing, deduplication via SequenceMatcher (0.85 threshold).

---

## Improvement Opportunity 1: Multi-Pass Identification

### The Pattern

Run Agent 1 multiple times independently on the same input, then merge results. Exploits LLM stochastic variation — different runs surface different entities.

| Passes | Recall | Missed events (out of 40) |
|---|---|---|
| 1 (current) | ~85% | ~6 |
| 2 | ~93% | ~3 |
| 3 | ~96% | ~2 |

Source: LangExtract research — https://genmind.ch/posts/LangExtract-Production-LLM-Powered-Information-Extraction/

### Implementation Without LangExtract

Run `identify_events_chunked()` twice with the same input, merge results by description similarity, deduplicate. Cost: 2x Agent 1 calls (the cheapest agent in the pipeline). Latency: parallelizable.

### LangExtract Library (Google)

`pip install langextract` — 37k GitHub stars, Google-backed, production-ready.

**Core features:**
- Multi-pass extraction with automatic merging (first-pass-wins for overlapping character spans)
- Source grounding: every entity maps to exact character offsets in source text
- Smart chunking respecting sentence/paragraph boundaries
- Parallel processing across chunks and passes

**Schema definition:** Few-shot examples, not Pydantic models:
```python
import langextract as lx

examples = [
    lx.data.ExampleData(
        text="Midterm exam on March 5th at 6:30pm in Smith Hall 201.",
        extractions=[
            lx.data.Extraction(
                extraction_class="calendar_event",
                extraction_text="Midterm exam on March 5th at 6:30pm in Smith Hall 201",
                attributes={
                    "title": "Midterm Exam",
                    "date": "2026-03-05",
                    "time": "18:30",
                    "location": "Smith Hall 201",
                }
            )
        ]
    )
]

result = lx.extract(
    text_or_documents=syllabus_text,
    prompt_description="Extract all calendar events.",
    examples=examples,
    model_id="gemini-2.5-flash",
    extraction_passes=2,
    max_workers=10,
    max_char_buffer=1500
)
```

**Cost:** ~$0.03 for a 148K char document with Gemini Flash, ~45 seconds wall-clock.

**Limitation:** Gemini-first (supports OpenAI too, no native Anthropic/xAI). Would need to use it with Gemini Flash for identification, then hand off to existing Grok/Claude agents for extraction.

**How it fits:** Could replace or augment Agent 1. Agent 2 (per-event extraction) and Agent 3 (personalization) stay the same.

GitHub: https://github.com/google/langextract
PyPI: https://pypi.org/project/langextract/
Google blog: https://developers.googleblog.com/en/introducing-langextract-a-gemini-powered-information-extraction-library/

---

## Improvement Opportunity 2: Instructor (Self-Correcting Structured Output)

`pip install instructor` — 11k GitHub stars, 3M+ monthly PyPI downloads, production-ready.

### The Problem It Solves

Current pipeline: if LLM returns `date: "Feb 5"` and Pydantic rejects it, the event is **lost**. With Instructor: the validation error gets fed back to the LLM as context, it retries, and produces `"2026-02-05"`.

### How It Works

Instructor wraps the LLM client and adds automatic retry when Pydantic validation fails. The validation error message becomes part of the retry prompt:

```python
import instructor
from openai import OpenAI

client = instructor.from_openai(OpenAI(), max_retries=2)

# Your existing Pydantic model works as-is
event = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": event_text}],
    response_model=CalendarEvent,
)
```

### Comparison

| Feature | `.with_structured_output()` (current) | Instructor |
|---|---|---|
| Pydantic model enforcement | Yes | Yes |
| Auto-retry on validation failure | No | Yes (sends error context back to LLM) |
| Max retries config | No | `max_retries=N` |
| Streaming partial objects | No | Yes |
| Custom validators as LLM feedback | No | Pydantic `@field_validator` errors become retry prompts |
| Provider support | Via LangChain | 15+ providers natively |

### Impact

For a 40-event syllabus where 2-3% of extractions hit validation errors, that's 1-2 events recovered per session. Cost: +5-10% (retries only happen on failures). No architecture change needed.

### Integration Notes

Instructor patches the raw provider client (OpenAI, Anthropic), not LangChain. Two integration paths:
1. Replace `.with_structured_output()` in Agent 2 with Instructor, keep LangChain for prompt templating
2. Use Instructor standalone for extraction, LangChain for other pipeline steps

Docs: https://python.useinstructor.com/
GitHub: https://github.com/567-labs/instructor

---

## Improvement Opportunity 3: Docling (Structured Document Preprocessing)

`pip install docling` — 37k GitHub stars, IBM-backed, production-ready.

### The Problem It Solves

Current PDF path: PDF -> markitdown -> raw text (tables become flat text, structure is lost). With Docling: PDF -> structured Markdown with tables, headings, and reading order preserved.

### Before vs After for a Syllabus PDF

**Without Docling (current):**
```
Course Schedule Week Topic Assignment Due 1 Introduction — 2 Data Structures HW1 (Jan 28)
```

**With Docling:**
```markdown
## Course Schedule
| Week | Topic | Assignment Due |
| 1 | Introduction | — |
| 2 | Data Structures | HW1 (Jan 28) |
```

The structured input dramatically reduces extraction errors for table-heavy documents.

### Benchmarks (2025)

| Framework | Text Accuracy | Table Accuracy | Speed (50 pages) |
|---|---|---|---|
| **Docling** | 100% | 97.9% | 65 seconds |
| LlamaParse | High (with errors) | Column misalignment | 6 seconds |
| Unstructured | Variable | 75% | 141 seconds |

### Integration

```python
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("syllabus.pdf")
markdown_text = result.document.export_to_markdown()
# Feed to Agent 1 as text instead of vision
```

Also has a LangChain loader: `DoclingLoader` in `langchain-docling`.

**Cost/latency:** Free (runs locally). ~1 second per page. Saves vision API costs entirely for PDFs.

**Granite-Docling:** IBM also released a 258M parameter vision-language model specifically for document conversion. Runs locally, outputs structured DocTags format.

GitHub: https://github.com/docling-project/docling

---

## Improvement Opportunity 4: Verification Agent

### The Pattern

After Agent 2 produces a CalendarEvent, a lightweight model checks that extracted facts match the raw text. Catches hallucinated dates — the LLM fabricating a date not present in the input.

### Research

Dual-LLM adversarial framework (BioRxiv 2025): Extractor + Verifier with iterative refinement.
- Single-LLM baseline: 56.76
- Dual-LLM adversarial: 63.25
- Optimal at 2 iterations, diminishing returns after that

Source: https://www.biorxiv.org/content/10.1101/2025.09.11.675507v1.full

### Implementation

A lightweight model (grok-3-mini-beta, Gemini Flash, GPT-4o-mini) verifies each Agent 2 output:

```
Original text: "Team meeting Tuesday at 3pm in Room 204"
Extracted: {summary: "Team Meeting", start: "2026-02-17T15:00:00", location: "Room 204"}

Verify: Does the date match? Does the time match? Is the title accurate?
→ {is_correct: true} or {errors: ["date should be Tuesday Feb 18, not Feb 17"]}
```

**Cost:** +1 cheap LLM call per event. For grok-3-mini-beta, negligible.

**Where it fits:** Between Agent 2 and Agent 3. Or as part of Agent 2 with Instructor-style retry.

---

## Other Tools Evaluated

### NuExtract 2.0 (NuMind)

Fine-tuned extraction models (2B-8B params). Outperforms GPT-4.1 by +9 F-Score on extraction benchmarks. Trained to say "I don't know" when info isn't present (reduces hallucination). Open-source on HuggingFace: `numind/NuExtract-2.0-8B`.

High potential but high integration effort. Would require replacing the LLM for Agent 2 entirely.

Source: https://numind.ai/blog/outclassing-frontier-llms----nuextract-2-0-takes-the-lead-in-information-extraction

### LangChain Extraction

`create_extraction_chain` is deprecated since v0.1.14. The modern approach is `model.with_structured_output(PydanticModel)` with LCEL chains — **which is exactly what we already use.** No improvement available from switching LangChain APIs.

### GLiNER

Lightweight transformer for NER. Runs on CPU, deterministic. Less relevant — we need full structured extraction, not just entity recognition.

### PydanticAI

Official agent runtime from Pydantic team. Adds typed tools, dataset replays, observability. Community recommendation: "Use Instructor for extraction, PydanticAI for agents." Worth watching but not a direct improvement.

---

## Recommendation Priority Matrix

| Improvement | Quality Impact | Effort | Cost Change | Priority |
|---|---|---|---|---|
| **Instructor retry for Agent 2** | Recovers 2-5% of events that fail validation | Low | +5-10% (retries) | **1 - High** |
| **Multi-pass Agent 1** (2 passes) | +8% recall (85% -> 93%) for complex docs | Low | +1x Agent 1 cost | **2 - High** |
| **Docling PDF preprocessing** | Better text extraction, avoids vision API | Medium | Saves vision API cost | **3 - High (PDF inputs)** |
| **Lightweight verification agent** | Catches hallucinated dates/facts | Medium | +1 cheap call/event | **4 - Medium** |
| **LangExtract for Agent 1** | Source grounding + multi-pass + parallel | High | Comparable (Gemini Flash) | **5 - Medium** |
| **NuExtract for Agent 2** | Better extraction, less hallucination | High | Lower (smaller model) | **6 - Low priority** |

---

## Key Tradeoff: Simple vs Complex Inputs

The optimal pipeline differs by input complexity:

| Input | Events | Optimal Strategy |
|---|---|---|
| "Meeting tomorrow 2pm" | 1 | Light model, could merge Agent 1+2 into single call |
| Email with 3 events | 2-5 | Light models, current design is fine |
| Syllabus (10-30 events) | 10-30 | Standard models, per-event extraction is **essential** |
| Full semester schedule (30-50) | 30-50 | Standard models + multi-pass Agent 1 + verification |

The dynamic complexity routing (implemented in `config/complexity.py`) already handles the simple vs complex model selection. The improvements above focus on making the complex path more robust.

---

## Sources

- ExtractBench (2026): https://arxiv.org/html/2602.12247
- Lost in the Middle (TACL 2024): https://aclanthology.org/2024.tacl-1.9/
- Context Rot (Chroma 2025): https://research.trychroma.com/context-rot
- GM-Extract (2025): https://arxiv.org/html/2511.13900v1
- Repeat Curse (2025): https://arxiv.org/html/2504.14218v1
- Medical EHR Extraction (PMC 2025): https://pmc.ncbi.nlm.nih.gov/articles/PMC11751965/
- LangExtract (Google): https://github.com/google/langextract
- LangExtract blog: https://genmind.ch/posts/LangExtract-Production-LLM-Powered-Information-Extraction/
- Instructor library: https://python.useinstructor.com/
- Docling (IBM): https://github.com/docling-project/docling
- PDF Benchmark (2025): https://procycons.com/en/blogs/pdf-data-extraction-benchmark/
- Dual-LLM Adversarial (BioRxiv 2025): https://www.biorxiv.org/content/10.1101/2025.09.11.675507v1.full
- NuExtract 2.0: https://numind.ai/blog/outclassing-frontier-llms----nuextract-2-0-takes-the-lead-in-information-extraction
- Bad Schemas (Instructor): https://python.useinstructor.com/blog/2024/09/26/bad-schemas-could-break-your-llm-structured-outputs/
- Sensible Document Extraction: https://www.sensible.so/blog/llm-document-extraction
- Calendara: https://www.usecalendara.com/blog/ai-powered-event-extraction
- Chunking Strategies (Pinecone): https://www.pinecone.io/learn/chunking-strategies/
- LangChain Extraction: https://python.langchain.com/docs/tutorials/extraction/
- Azure OpenAI Extraction Best Practices: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/best-practices-for-structured-extraction-from-documents-using-azure-openai/4397282