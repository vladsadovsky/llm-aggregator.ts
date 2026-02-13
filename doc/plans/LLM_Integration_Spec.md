# LLM Integration Spec

## Chapter 1: Auto Titles

### Overview
LLM-powered generation of concise QA titles using OpenAI-compatible APIs. User provides API endpoint, key, and model. Titles are generated via a prompt and can be manually edited.

### Prompt Design
- System prompt: Summarize Q&A as a short title (max 80 chars).
- User prompt: Includes question and answer.

### UI Integration
- "✨ Generate" button in QAEditor and QAEditForm.
- Spinner during generation, editable result.
- Fallback to truncation if LLM fails.

### Backend & Architecture
- Electron service (llmService.ts) calls API.
- IPC handlers registered, exposed via preload.
- Title stored in QA pair object.

### Cost Estimate
- ~500 tokens per call, ~$0.001 per title.

### Error Handling
- Disabled button if no API key.
- Toasts for network/auth errors.
- Fallback logic for invalid/timeout/rate limit.

### Security
- API key encrypted, never sent to renderer.

---

## Chapter 2: Auto Tags

### Overview
LLM-powered tag suggestion for QA pairs. Tags are generated based on existing vocabulary and prompt rules. User can approve new tags.

### Prompt Design
- System prompt: Suggest 3-5 tags, prefer existing, JSON array output.
- User prompt: Includes question, answer, and allTags.

### Tag Vocabulary Control
- Soft limit (<50): Prefer existing, allow new.
- Hard limit (>=75): Only use existing.
- Approval flow: New tags highlighted, user confirms.

### UI Integration
- "✨ Suggest Tags" button in QAEditor and QAEditForm.
- Spinner during generation.
- Blue chips for existing, yellow for new tags.
- Manual add/remove allowed.

### Backend & Architecture
- Electron service (llmService.ts) calls API.
- IPC handlers registered, exposed via preload.
- Tags stored in QA pair object.

### Error Handling
- Disabled button if no API key.
- Toasts for errors.
- Approval for new tags.

---

## Chapter 3: Semantic Search (Hashed String Approach)

### Overview
Semantic search using precomputed embeddings (hashed strings) for QA pairs. Embeddings are generated via LLM API and stored locally for fast, meaningful search.

### Embedding Computation
- On QA creation/edit, compute embedding via API.
- Store embedding in QA pair object.
- Background job/service for batch updates.

### Search Flow
- User enters query, embedding computed.
- Compare query embedding to stored QA embeddings.
- Rank by cosine similarity, return top matches.

### UI Integration
- "Semantic" search option in QAListPanel.
- Results ranked by similarity.

### Backend & Architecture
- Electron service (llmService.ts) for embedding API.
- IPC handler for semantic search.
- Local similarity calculation (cosine similarity).

### Performance & Cost
- Only one API call per QA pair (not per search).
- Search is fast and local.

### Error Handling
- Fallback to keyword search if embeddings unavailable.
- Toasts for API errors.

---

## Implementation Phases & Estimate
- Settings + LLM Service: 1 day
- Settings UI: 0.5 day
- Title Generation: 0.5 day
- Tag Suggestion: 1 day
- Semantic Search: 1–1.5 days
- **Total:** 2–3 days for all features

---

## Future Extensibility
- Support for Ollama, Claude, Azure OpenAI, custom prompts.

---

## References
- UI: QAEditor.vue, QAEditForm.vue, QAListPanel.vue, SettingsDialog.vue
- Backend: electron/services/llmService.ts, electron/ipc/handlers.ts, electron/preload.ts, electron/services/settingsService.ts
- Data: src/types/QAPair.ts, src/stores/qaStore.ts
- Logging: electron/services/logger.ts
