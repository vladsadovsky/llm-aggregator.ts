# OneNote Export Agent — Specification

## Overview

An intelligent export agent that analyzes the QA archive, learns from the user's
past export patterns, and autonomously exports/archives threads to Microsoft OneNote.

## User Story

> As a user, I want an agent that understands which threads I typically export,
> suggests new threads ready for archiving, and exports them to my OneNote
> notebook — organized the way I prefer — with minimal manual intervention.

## Agentic Behaviors

### 1. Archive Analysis
The agent examines the current state of the archive:
- Threads with many QAs (mature content)
- Threads not modified recently (stable/complete)
- Threads with tags matching previously exported topics
- Threads explicitly marked "ready to export" by user

### 2. Export History Learning
The agent tracks past exports and learns patterns:
- Which threads/tags the user typically exports
- How the user organizes content in OneNote (notebook → section → page mapping)
- Frequency of exports (weekly? after N new QAs?)
- What the user skipped when suggested (negative signal)

### 3. Smart Suggestions
Based on analysis + history, the agent suggests:
- "Thread 'Vue Reactivity' has 12 QAs and hasn't been modified in 2 weeks — archive?"
- "You usually export 'TypeScript' threads monthly — 8 new QAs since last export"
- "3 threads match your typical export pattern — batch export?"

### 4. Autonomous Export (with approval)
When user approves, the agent:
1. Converts QA markdown to OneNote-compatible HTML
2. Creates/updates OneNote sections and pages
3. Records the export in history
4. Optionally marks threads as "archived" in the app

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Export Agent UI (renderer)                              │
│                                                         │
│  ┌─ Agent Dashboard ─────────────────────────────────┐  │
│  │ 📊 Archive Status                                 │  │
│  │   • 24 threads, 186 QAs total                     │  │
│  │   • 5 threads not exported, 3 ready for archive   │  │
│  │                                                    │  │
│  │ 🤖 Agent Suggestions                              │  │
│  │   ☑ "Vue Reactivity" (12 QAs, idle 14 days)       │  │
│  │   ☑ "TypeScript Tips" (8 new QAs since last)      │  │
│  │   ☐ "CSS Tricks" (3 QAs, still active)            │  │
│  │                                                    │  │
│  │ 📁 OneNote Target                                  │  │
│  │   Notebook: [LLM Archive        ▾]                │  │
│  │   Section:  [Auto-detect from tags ▾]              │  │
│  │                                                    │  │
│  │ [Export Selected]  [Export All Suggested]           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Export Progress ─────────────────────────────────┐  │
│  │ 🔎 Analyzing archive...                           │  │
│  │ 📖 Reading export history (12 past exports)...    │  │
│  │ 🤔 Comparing with past patterns...                │  │
│  │ 📝 Converting "Vue Reactivity" → HTML...          │  │
│  │ ☁️  Uploading to OneNote > LLM Archive > Vue...   │  │
│  │ ✅ 2/3 threads exported successfully              │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Microsoft Graph API Integration

### Authentication Flow

```
User clicks "Connect to OneNote"
        │
        ▼
┌─ Electron Main Process ────────────────────────────┐
│                                                     │
│  1. Open Azure OAuth2 popup (BrowserWindow)         │
│     URL: https://login.microsoftonline.com/...      │
│     Scopes: Notes.ReadWrite, Notes.Create           │
│                                                     │
│  2. User logs in, grants permission                 │
│                                                     │
│  3. Receive authorization code via redirect          │
│                                                     │
│  4. Exchange code for access_token + refresh_token   │
│                                                     │
│  5. Store tokens securely (encrypted in settings)    │
│                                                     │
│  6. Refresh token automatically before expiry        │
└─────────────────────────────────────────────────────┘
```

### Required Azure App Registration (Free)
1. Go to https://portal.azure.com → Azure Active Directory → App registrations
2. Create new registration:
   - Name: "LLM Aggregator"
   - Redirect URI: `http://localhost:3847/auth/callback` (for dev)
   - Platform: Mobile and desktop applications
3. Note the **Application (client) ID**
4. Under API permissions, add:
   - `Notes.ReadWrite` (delegated)
   - `Notes.Create` (delegated)
5. No client secret needed (public client / PKCE flow)

### Key API Endpoints

| Action | Method | Endpoint |
|--------|--------|----------|
| List notebooks | GET | `/me/onenote/notebooks` |
| List sections | GET | `/me/onenote/notebooks/{id}/sections` |
| Create section | POST | `/me/onenote/notebooks/{id}/sections` |
| Create page | POST | `/me/onenote/sections/{id}/pages` |
| Update page | PATCH | `/me/onenote/pages/{id}/content` |
| Get page content | GET | `/me/onenote/pages/{id}/content` |

### OneNote Page Format

OneNote accepts a specific HTML format:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Vue 3 Reactivity — LLM Archive</title>
    <meta name="created" content="2026-02-09T10:00:00Z" />
  </head>
  <body>
    <h1>Vue 3 Reactivity</h1>
    <p style="color: #666; font-size: 11px;">
      Exported from LLM Aggregator • 12 QA pairs • Tags: vue, reactivity
    </p>
    <hr />

    <h2>Q: How does Vue 3 reactivity work?</h2>
    <div style="background: #f5f5f5; padding: 10px; border-left: 3px solid #42b883;">
      <!-- Rendered markdown HTML here -->
      <p>Vue 3 uses ES6 Proxy objects to...</p>
    </div>

    <h2>A:</h2>
    <div style="padding: 10px;">
      <!-- Rendered answer HTML here -->
      <p>The reactivity system in Vue 3...</p>
      <pre><code>const state = reactive({ count: 0 })</code></pre>
    </div>

    <hr />
    <!-- Next QA pair -->
  </body>
</html>
```

**Limitations:**
- No `<style>` blocks — must use inline styles
- No `<script>` tags
- Limited CSS support (no flexbox, grid)
- Images must be embedded as base64 or separate API calls
- Code blocks render but without syntax highlighting colors

## Export History Schema

```typescript
interface ExportRecord {
  id: string                    // UUID
  timestamp: string             // ISO date
  threadId: string              // Which thread was exported
  threadName: string            // Thread name at time of export
  qaCount: number               // How many QAs were in the thread
  tags: string[]                // Tags at time of export
  oneNoteNotebook: string       // Target notebook name
  oneNoteSection: string        // Target section name
  oneNotePageId: string         // OneNote page ID (for updates)
  status: 'success' | 'failed' | 'partial'
  errorMessage?: string
}

interface ExportPreference {
  // Learned patterns
  tagToSectionMapping: Record<string, string>  // e.g., "vue" → "Frontend"
  minQAsBeforeExport: number                    // e.g., 5
  minIdleDaysBeforeExport: number               // e.g., 7
  autoSuggest: boolean                          // Show suggestions on app start
  defaultNotebook: string                       // Preferred notebook
}
```

Storage: `export-history.json` in data directory.

## Agent Decision Logic

```typescript
interface ExportSuggestion {
  threadId: string
  threadName: string
  reason: string           // Human-readable explanation
  confidence: number       // 0.0 - 1.0
  suggestedNotebook: string
  suggestedSection: string
  isUpdate: boolean        // true if previously exported (new QAs added)
}

// Agent scoring factors:
// +0.3  Thread has >= minQAsBeforeExport QA pairs
// +0.2  Thread idle for >= minIdleDaysBeforeExport days
// +0.2  Thread tags match previously exported tags
// +0.1  Thread has complete metadata (all QAs have titles, tags)
// +0.1  Similar thread was exported before (name/tag similarity)
// +0.1  User exported at this cadence before (weekly/monthly pattern)
// -0.3  Thread was suggested before and user declined
// -0.5  Thread was recently modified (still active)
```

### LLM Enhancement (Optional)

If LLM integration is configured (from LLM_Integration_Spec.md), the agent can:
- Generate export summaries for each thread
- Suggest better section names based on content analysis
- Identify threads that should be merged before export
- Write a "table of contents" page for the notebook

Prompt:
```
You are an archive organizer. Given these threads and their QA pairs,
suggest the best OneNote organization:

Threads to export:
1. "Vue Reactivity" (12 QAs, tags: vue, reactivity, proxy)
2. "TypeScript Generics" (8 QAs, tags: typescript, generics, types)
3. "CSS Grid Layouts" (5 QAs, tags: css, grid, layout)

Existing OneNote sections: ["Frontend", "Backend", "DevOps"]

Suggest which section each thread belongs to, or propose new sections.
Return as JSON.
```

## Implementation Phases

### Phase 1: OneNote Connection (2-3 days)
| File | Change |
|------|--------|
| `electron/services/oneNoteAuthService.ts` | NEW — OAuth2 PKCE flow with Azure AD |
| `electron/services/oneNoteApiService.ts` | NEW — Graph API client (notebooks, sections, pages) |
| `electron/main.ts` | Register IPC handlers for OneNote auth and API |
| `electron/preload.ts` | Expose `oneNote.login()`, `oneNote.listNotebooks()`, etc. |
| `src/components/SettingsDialog.vue` | Add "Connect to OneNote" button with status |
| `settingsService.ts` | Store encrypted tokens, Azure client ID |

### Phase 2: Basic Export (2-3 days)
| File | Change |
|------|--------|
| `electron/services/exportService.ts` | NEW — Convert threads to OneNote HTML |
| `electron/services/exportHistoryService.ts` | NEW — Track export records |
| `src/components/ExportDialog.vue` | NEW — Select threads, pick notebook/section, export |
| `src/stores/exportStore.ts` | NEW — Export state management |
| Data directory | `export-history.json` — persistent export log |

### Phase 3: Smart Agent (2-3 days)
| File | Change |
|------|--------|
| `electron/services/exportAgentService.ts` | NEW — Analysis engine, scoring, suggestions |
| `src/components/ExportAgentPanel.vue` | NEW — Agent dashboard with suggestions |
| `src/App.vue` | Add export agent button/panel to toolbar |

### Phase 4: LLM-Enhanced Agent (1-2 days)
| File | Change |
|------|--------|
| `electron/services/exportAgentService.ts` | Add LLM calls for section suggestions, summaries |
| `src/components/ExportAgentPanel.vue` | Show LLM-generated summaries and organization tips |

**Total estimated effort: 7-11 days**

## Prerequisites

- Azure account (free tier sufficient)
- Azure App Registration (free, ~10 minutes to set up)
- User must be signed into a Microsoft account with OneNote access
- LLM integration (from LLM_Integration_Spec.md) for Phase 4 only

## Settings UI Addition

```
┌─ OneNote Integration ──────────────────────────────┐
│                                                     │
│  Status: ✅ Connected as user@outlook.com           │
│  [Disconnect]                                       │
│                                                     │
│  Default Notebook: [LLM Archive           ▾]        │
│  Section Mapping:  [Auto-detect from tags  ▾]       │
│                                                     │
│  Export Agent:                                       │
│  ☑ Show suggestions on startup                      │
│  Min QAs before suggesting export: [5]               │
│  Min idle days before suggesting:  [7]               │
│  ☑ Require approval before exporting                 │
│                                                     │
│  [View Export History (12 exports)]                  │
│                                                     │
│  Azure Client ID: [xxxxxxxx-xxxx-xxxx-xxxx-xxx]     │
│  (From Azure Portal → App Registrations)             │
└─────────────────────────────────────────────────────┘
```

## Comparison with Other Agentic Ideas

| Idea | Agentic Depth | Practical Value | Effort | Learning Value |
|------|:---:|:---:|:---:|:---:|
| QA Research Agent | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 3-5 days | ⭐⭐⭐⭐⭐ |
| **OneNote Export Agent** | **⭐⭐⭐⭐** | **⭐⭐⭐⭐⭐** | **7-11 days** | **⭐⭐⭐⭐** |
| Archive Organizer Agent | ⭐⭐⭐⭐ | ⭐⭐⭐ | 3-4 days | ⭐⭐⭐⭐ |
| Import Agent | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 2-3 days | ⭐⭐⭐ |
| Knowledge Gap Agent | ⭐⭐⭐⭐ | ⭐⭐⭐ | 3-4 days | ⭐⭐⭐⭐ |
| Quality Review Agent | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 4-5 days | ⭐⭐⭐⭐ |

### OneNote Export Agent Unique Strengths
- **Highest practical value** — real productivity workflow
- **OAuth2 + external API** — teaches real-world integration patterns
- **Learning from behavior** — true adaptive agent behavior
- **External side effects** — agent creates real content (not just suggestions)

## Security Considerations

1. **Tokens stored encrypted** — use Electron `safeStorage` API
2. **Minimal scopes** — only `Notes.ReadWrite` and `Notes.Create`
3. **PKCE flow** — no client secret needed (public client)
4. **Token refresh** — automatic, transparent to user
5. **Disconnect option** — user can revoke at any time
6. **No data sent to LLM** — OneNote content goes directly to Microsoft Graph
7. **Export history local only** — never leaves the machine
