# User Guide — LLM Aggregator

LLM Aggregator is a personal research archive. You capture Q&A pairs from your AI conversations, organize them into threads, and gradually build a knowledge base that reflects how your thinking has evolved. The **LLM Lens** layer lets you query that archive with AI — not to replace your thinking, but to act like a magnifying glass over what you already know.

---

## First Launch

1. **Start the app.** On first run it opens with an empty archive in the current working directory.
2. **Set your data folder.** Click the **gear icon** (top-left) → Settings → pick a directory. This is where your `archive/` folder and `threads.json` will live.
3. **Optional: connect LLM Lens.** In Settings → AI tab, enter your OpenAI API key, choose a model, and click **Test Connection**.

---

## Basic Workflow

### Saving a Q&A from an AI chat

1. Have a conversation with an AI tool (Claude, ChatGPT, etc.)
2. When you get an answer worth keeping, press `Ctrl/Cmd+N` to open the QA editor
3. Paste your question and the AI's answer
4. Set the **Source** (which AI), add **Tags**, and optionally a **URL** back to the conversation
5. Press `Ctrl/Cmd+Enter` to save

The entry is immediately available in search and for LLM Lens analysis.

### Organizing into threads

A **thread** is an ordered list of QA pairs — similar to a chat session, but fully editable and reorderable.

- Create a thread: click **+** in the Threads panel (left column)
- Add a QA to a thread: select the QA → right-click → Move to Thread
- Reorder within a thread: select a QA → `Alt+Up` / `Alt+Down`
- Rename a thread: `F2`
- Delete a thread: right-click → Delete (QA pairs are not deleted)

### Finding things

The **search bar** (middle column) works in three modes — switch with the dropdown:

| Mode | How it works |
|------|-------------|
| **Full-text** | Substring match across title, question, and answer |
| **Tags** | Match by tag name |
| **Semantic** | Find by meaning (requires embeddings, see below) |

Search scope can be set to the current thread or the whole archive.

---

## LLM Lens

The LLM Lens is a bottom drawer panel that analyses your archive using AI. It does **not** browse the web or use external knowledge — it works strictly from your own notes.

### Prerequisites

Before using LLM Lens:
1. Configure your OpenAI API key in Settings → AI
2. Click **Generate All Embeddings** in Settings → AI (takes a few seconds per entry on first run)

Embeddings are cached locally and only recomputed when a QA pair changes.

### Opening the panel

Press `Ctrl/Cmd+L` or click the **Lens** icon in the toolbar.

### Five insight modes

**Brief** — Re-enter a topic after a break. Type a topic and get:
- What your archive has already settled
- What remains unresolved
- Any contradictions between entries

> *Example: "gradient descent optimization"*

**Prior Art** — Before starting new research, check what you already know. Type a research question and get:
- What's already covered in your archive
- What's genuinely open

> *Example: "how does attention mechanism handle long sequences"*

**Steelman** — Test a hypothesis against your archive. Type a claim and get:
- Archive evidence that supports it
- Archive evidence that challenges it

> *Example: "fine-tuning is more reliable than prompting for structured output"*

**Gaps** — Identify the frontier of your thinking. Type a topic and get 5–8 specific questions your archive raises but doesn't answer.

> *Example: "transformer scaling laws"*

**Concept** — Synthesize your current understanding of a concept across all related entries. Type a concept name and get:
- Your working model
- Known limitations
- Open questions
- Abandoned directions

> *Example: "RAG retrieval quality"*

### Token usage

The panel footer shows accumulated token usage for the current session (LLM calls + embeddings). Click **Reset** to zero the counters.

---

## AI Metadata

### Auto-fill a single QA pair

Open a QA pair → click the **wand icon** (or use the command palette `Ctrl/Cmd+K`) → **Generate Metadata**.

This fills in:
- `ai_topic` — short topic label
- `ai_concepts` — 3–6 key concepts
- `ai_status` — `open` / `closed` / `speculative` / `dead-end`
- `ai_confidence` — see below
- `ai_summary` — 1–2 sentence summary

### Confidence levels

Confidence is a 4-level scale for tracking the maturity of ideas in your archive:

| Level | Meaning |
|-------|---------|
| `speculative` | Hypothesis with little support; might be wrong |
| `working` | Plausible and in active use, but not firmly established |
| `confident` | Well-supported by reasoning or evidence |
| `validated` | Empirically confirmed or cross-validated across multiple sources |

You can set confidence manually in the edit form, or use batch annotation.

### Batch confidence annotation

Use this to review and update confidence levels across many QA pairs at once.

1. Open the command palette (`Ctrl/Cmd+K`) → **Annotate Confidence** (or use the toolbar button)
2. The app sends batches of 20 QA pairs to the LLM, which proposes a confidence level and brief rationale for each
3. Review proposals one by one: confirm with `Enter`, skip with `S`, go back with `←`
4. You can override any proposed level before applying
5. Click **Apply** to write confirmed levels back to the archive

---

## Settings Reference

### General

| Setting | Description |
|---------|-------------|
| Data Directory | Folder containing `archive/` and `threads.json` |
| Dark Mode | Toggle light/dark theme |
| Remember Last Metadata | Pre-fill source, tags, URL from your most recent QA entry |

### AI

| Setting | Description |
|---------|-------------|
| Provider | AI provider (currently OpenAI; Anthropic coming) |
| Model | `gpt-4o` (best quality), `gpt-4o-mini` (lower cost), `o3-mini` (reasoning) |
| OpenAI API Key | Your API key — stored in OS user-data, never in the data directory |
| Test Connection | Verify the API key works |
| Generate All Embeddings | Index your archive for semantic search and LLM Lens |

---

## Data & Backup

All data lives in plain files you control:

- `<dataDirectory>/archive/*.md` — QA pairs as Markdown with YAML frontmatter
- `<dataDirectory>/threads.json` — thread definitions
- `<userData>/secrets.json` — API keys (separate from data, never synced)
- `<userData>/embeddings.json` — embedding cache (can be regenerated at any time)

**To back up your archive:** copy the `archive/` folder and `threads.json`. These are all you need to restore.

**To use git:** initialize a git repo in your data directory and commit regularly. The files are plain text and diff cleanly.

**To move to a new machine:** copy the data folder, install the app, point Settings → Data Directory at the folder, and regenerate embeddings.

---

## Tips

- **Build the archive incrementally.** Don't try to import everything at once. Save entries when they feel worth keeping, and quality will be higher than bulk imports.
- **Use tags deliberately.** A consistent tagging vocabulary makes tag search and LLM Lens more useful. Treat tags like research categories, not keywords.
- **Edit answers freely.** The archive is yours to revise. When your understanding changes, update the answer — the version counter tracks edits.
- **Run LLM Lens before starting a new session.** The Brief mode is particularly useful for re-entering a topic after a few days away.
- **Generate embeddings after bulk edits.** Settings → Generate All Embeddings is idempotent — it only recomputes entries that have changed.
- **Keep threads focused.** A thread works best when it represents a coherent line of inquiry rather than a catch-all.
