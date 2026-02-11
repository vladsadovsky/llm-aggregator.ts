# LLM Integration Spec — Title & Tag Generation

## Overview

Add LLM-powered auto-generation of QA titles and tag suggestions using the OpenAI API.
The user provides their own API key. The system uses gpt-4o-mini for cost efficiency.

## Approach: Configurable OpenAI-Compatible Endpoint

The user provides:
- **API URL** (e.g., `https://api.openai.com/v1` or `http://localhost:11434/v1` for Ollama)
- **API key** (required for OpenAI, optional for local endpoints)
- **Model name** (e.g., `gpt-4o-mini`, `llama3.2:1b`)

## Feature 1: LLM-Generated Titles

### Prompt Design

**System prompt:**
```
You are a concise technical summarizer. Generate a short title (max 80 characters)
that captures the essence of a Q&A exchange. Return only the title, no quotes or
explanation.
```

**User prompt:**
```
Question: {question}
Answer: {answer}

Title:
```

### UI Integration
- "✨ Generate" button next to the Title field in QAEditor
- Button disabled when question is empty
- Shows spinner while generating
- Generated title populates the field (user can edit)
- Falls back to current truncation logic if LLM call fails

### Cost Estimate
- ~500 tokens per call (question excerpt + answer excerpt + prompt)
- gpt-4o-mini: ~$0.00015 per 1K input tokens → ~$0.001 per title generation

## Feature 2: LLM-Generated Tags

### Prompt Design

**System prompt:**
```
You are a tag generator for a technical knowledge base. Suggest 3-5 relevant tags
for the given Q&A exchange. Follow these rules:
1. Prefer tags from the existing vocabulary when they fit
2. Only create new tags when no existing tag covers the topic
3. Tags must be lowercase, single words or short hyphenated phrases
4. Return as a JSON array of strings, nothing else
```

**User prompt:**
```
Existing tags in the knowledge base: {allTags as JSON array}

Question: {question}
Answer: {answer}

Tags:
```

### Tag Vocabulary Control

| Strategy | Trigger |
|----------|---------|
| **Soft limit** | Total tags < 50: prompt says "prefer existing, but create new if needed" |
| **Hard limit** | Total tags >= 75: prompt says "ONLY use existing tags" |
| **Approval flow** | New tags highlighted in yellow; user confirms before saving |

### UI Integration
- "✨ Suggest Tags" button next to the Tags autocomplete field
- Shows spinner while generating
- Existing tags appear as blue chips (auto-accepted)
- New tags appear as yellow chips with ⚠️ icon (user can remove)
- User can still manually add/remove tags after generation

## Architecture

```
┌─────────────────────────────────────────────┐
│  QAEditor.vue (renderer)                    │
│  ┌─────────────────┐ ┌───────────────────┐  │
│  │ ✨ Generate Title│ │ ✨ Suggest Tags   │  │
│  └────────┬────────┘ └────────┬──────────┘  │
│           │ IPC                │ IPC         │
├───────────┼───────────────────┼─────────────┤
│  preload.ts                                 │
├───────────┼───────────────────┼─────────────┤
│  main process                               │
│  ┌────────┴───────────────────┴──────────┐  │
│  │  llmService.ts                        │  │
│  │  - generateTitle(q, a)                │  │
│  │  - generateTags(q, a, existingTags)   │  │
│  │  - calls OpenAI-compatible endpoint   │  │
│  └───────────────────┬───────────────────┘  │
│                      │ HTTP                  │
├──────────────────────┼──────────────────────┤
│  External LLM        │                      │
│  - OpenAI (primary)  ▼                      │
│  - Ollama (future)                          │
│  - Any OpenAI-compatible API                │
└─────────────────────────────────────────────┘
```

## Settings UI

```
┌─ LLM Integration ──────────────────────────┐
│                                             │
│  ☑ Enable LLM-powered suggestions          │
│                                             │
│  API Endpoint:  [https://api.openai.com/v1] │
│  API Key:       [sk-••••••••••]             │
│  Model:         [gpt-4o-mini             ]  │
│                                             │
│  [Test Connection]  ✅ Connected            │
│                                             │
│  Tag Vocabulary:                            │
│  Max tags before restricting: [50]          │
│  ☑ Require approval for new tags            │
└─────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Settings + LLM Service (1 day)

| File | Change |
|------|--------|
| `electron/services/settingsService.ts` | Add `llmEnabled`, `llmEndpoint`, `llmApiKey`, `llmModel` fields |
| `electron/services/llmService.ts` | NEW — OpenAI-compatible HTTP client with `generateTitle()` and `generateTags()` |
| `electron/ipc/handlers.ts` | Register `llm:generateTitle`, `llm:generateTags`, `llm:testConnection` handlers |
| `electron/preload.ts` | Expose `llm.generateTitle()`, `llm.generateTags()`, `llm.testConnection()` |
| `src/global.d.ts` | Add LLM API types |

### Phase 2: Settings UI (0.5 day)

| File | Change |
|------|--------|
| `src/components/SettingsDialog.vue` | Add LLM configuration section with endpoint, key, model, test button |

### Phase 3: Title Generation (0.5 day)

| File | Change |
|------|--------|
| `src/components/QAEditor.vue` | Add "✨ Generate" button, loading state, call `llm.generateTitle()` |
| `src/components/QAEditForm.vue` | Same button for editing existing QAs |

### Phase 4: Tag Suggestion (1 day)

| File | Change |
|------|--------|
| `src/components/QAEditor.vue` | Add "✨ Suggest Tags" button, new/existing tag visual distinction |
| `src/components/QAEditForm.vue` | Same for edit form |
| `src/stores/qaStore.ts` | Feed `allTags` to the prompt |

### Total Estimated Effort: 2-3 days

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No API key configured | "✨ Generate" buttons disabled with tooltip "Configure LLM in Settings" |
| API call fails (network) | Toast error, title/tags field unchanged |
| API call fails (auth) | Toast error with "Check API key in Settings" |
| API returns invalid format | Fall back to current behavior, log warning |
| Rate limited | Toast with "Rate limited, try again in a moment" |
| Timeout (>10s) | Cancel request, show timeout message |

## Security

- API key stored using Electron `safeStorage.encryptString()` — encrypted at rest
- Key never sent to renderer process — all API calls from main process via IPC
- Key displayed as masked (`sk-••••••••••`) in Settings UI
- No telemetry or analytics — key stays on user's machine

## Future Extensibility

- **Ollama support** — same OpenAI-compatible endpoint, just different URL
- **Claude API** — different endpoint format, but similar HTTP client
- **Azure OpenAI** — different auth header, configurable
- **Custom prompts** — let user customize system prompts in settings
