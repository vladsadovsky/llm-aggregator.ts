# User Guide — LLM Aggregator

LLM Aggregator is a personal research archive. You capture Q&A pairs from your AI conversations, organize them into threads, and gradually build a knowledge base that reflects how your thinking has evolved.

For the optional LLM Lens setup, operation, limits, and enable/disable instructions, see the
[canonical Lens guide in README](README.md#optional-llm-lens).

---

## First Launch

1. **Start the app.** On first run it opens with an empty archive in the current working directory.
2. **Set your data folder.** Click the **gear icon** (top-left) → Settings → pick a directory. This is where your `archive/` folder and `threads.json` will live.
3. **Optional: configure AI features.** In Settings → AI, choose a provider, enter its API key, choose a model, and click **Test Connection**.

---

## Basic Workflow

### Saving a Q&A from an AI chat

1. Have a conversation with an AI tool (Claude, ChatGPT, etc.)
2. When you get an answer worth keeping, press `Ctrl/Cmd+N` to open the QA editor
3. Paste your question and the AI's answer
4. Set the **Source** (which AI), add **Tags**, and optionally a **URL** back to the conversation
5. Press `Ctrl/Cmd+Enter` to save

The entry is immediately available in search.

### Importing a whole conversation from a share link

Instead of copying pairs one at a time, you can import an entire public conversation at once.

1. In the source chat, use its own **Share** action to create a public link
2. In LLM Aggregator, press `Ctrl/Cmd+Shift+O` (or **File → Import from Shared Link**)
3. Paste the link and press **Import**

The conversation is split into ordered Q&A pairs and grouped into a new thread, tagged with the
provider and — where the provider reports it — the model.

| Provider | Link looks like |
|----------|-----------------|
| Claude | `https://claude.ai/share/…` |
| ChatGPT | `https://chatgpt.com/share/…` |
| Gemini | `https://share.gemini.google/…` |
| Copilot | `https://copilot.microsoft.com/shares/…` |

Only **public** links work — the app cannot sign in as you, so private, expired, or deleted
conversations will fail. Gemini links take a few seconds longer, because that page has to be
rendered before it can be read.

Read the import summary before closing it. It reports the thread name, the tags applied, and any
warnings — for example, that no title was found and the thread needs renaming, or that a Claude
link is an older snapshot because the original conversation continued after it was shared.

> **This feature can break without notice.** Share links are read through private endpoints that
> the AI vendors do not publish or support. When a vendor changes their format, an importer stops
> working until the app is updated — usually with a "no conversation content could be extracted"
> error. Nothing in your archive is harmed when this happens; the import simply produces nothing.
> Less often, a vendor adds a new kind of message that the importer does not recognize and quietly
> skips, so **skim a large imported thread** to confirm it looks complete. For anything you truly
> need to keep, saving the pair by hand (above) is the reliable path.

### Importing your whole history from an account export

Claude, ChatGPT, and Google all let you download everything you've ever asked them. That download
can be imported in one go.

1. Request the export from the provider (Claude: Settings → Privacy → Export data; Google: use
   [takeout.google.com](https://takeout.google.com) and select only **Gemini**). They email you a
   link, usually within a few hours.
2. In LLM Aggregator press `Ctrl/Cmd+O` (**File → Import from File**)
3. Select the `.zip` **exactly as you downloaded it** — no need to unzip. The unzipped folder or
   the `conversations.json` inside also work.

A preview appears first — nothing is written until you approve it. It shows the format detected,
how many conversations and Q&A pairs were found, the date range, and a checklist of every
conversation. Untick anything you don't want, then press Import. A progress bar shows the
percentage, estimated time remaining, and which Q&A is being written.

| Provider | Works today | Where to get the export |
|----------|-------------|--------------------------|
| Claude | Yes — verified | Settings → Privacy → Export data |
| Gemini | Yes — verified | [takeout.google.com](https://takeout.google.com), select **Gemini** |
| Copilot | Yes — verified | Microsoft privacy dashboard → Copilot → Export all activity history (a `.csv`) |
| ChatGPT | Yes, but unverified — the app warns you before importing; check the results | Settings → Data controls → Export data |

Two things worth knowing:

- **Gemini exports are not conversations.** Google gives you an activity log — every prompt and
  answer as a separate record, with nothing connecting a follow-up to what came before. Rather than
  invent threads that don't exist, the app groups your Gemini history **by day**. You can reorganize
  afterwards. Either format Takeout offers (HTML or JSON) works, and importing both won't duplicate.
- **Hand over the whole Takeout file.** It normally contains your YouTube, Chrome, Search, and Maps
  history too — all in files with the same name. The app finds the Gemini part and ignores the rest,
  so there's no need to trim it down first.
- **Claude exports don't say which model answered**, so those pairs are tagged just `claude`.
- **Copilot arrives as a spreadsheet (`.csv`), not a zip** — select it directly. Unlike Gemini it
  does keep your conversation titles, so those threads come across intact.

### Re-importing, and cleaning up duplicates

Importing the same export twice will **not** duplicate your archive. Every imported Q&A quietly
records where it came from, and the preview tells you how many pairs it already recognizes before
you commit. Leave "Skip pairs already in the archive" ticked and only genuinely new conversations
are added — so it's safe to re-import a fresh export every few months to top up.

If duplicates do creep in — from copy/paste, or from imports made before this was added — use
**Tools → Find Duplicate Q&As**. It scans the whole archive and groups pairs that are either
provably the same import or identical in content after ignoring formatting. You pick which copy to
keep in each group; nothing is deleted until you press the delete button, and deleted pairs are
also removed from any threads that referenced them.

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
| Provider | **OpenAI** or **Anthropic**. Both support metadata generation and analysis; embeddings are OpenAI-only. |
| Model | Fetched from the provider when a key is present, otherwise a cached/curated list. Each option shows Quality / Cost / Latency hints. |
| Refresh | Re-fetch the model list from the provider |
| API Key | The key for the selected provider. Encrypted with OS secure storage; never written to the data directory. |
| Test Connection | Verify the API key works |
| Re-check secure storage | Re-probe OS secure storage if it was unavailable |
| Generate All Embeddings | Index your archive for semantic search (OpenAI only) |

**About the API key field.** After you save a key, the field goes blank and shows a
masked preview (`sk-…a1b2`) as placeholder text — the app never reads the stored key
back out of secure storage into the window. Leave it blank to keep the current key;
type a new value to replace it.

**Upgrading?** Keys saved by earlier versions lived in a clear-text `secrets.json` and
are no longer read. That file is renamed to `secrets.json.orphaned.bak` on first launch;
re-enter your key in Settings, then delete the renamed file.

**Anthropic note.** Embedding generation and semantic indexing require OpenAI; the
button is disabled when Anthropic is selected.

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
- **Use tags deliberately.** A consistent tagging vocabulary makes tag search more useful. Treat tags like research categories, not keywords.
- **Edit answers freely.** The archive is yours to revise. When your understanding changes, update the answer — the version counter tracks edits.
- **Generate embeddings after bulk edits.** Settings → Generate All Embeddings is idempotent — it only recomputes entries that have changed.
- **Keep threads focused.** A thread works best when it represents a coherent line of inquiry rather than a catch-all.
