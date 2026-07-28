# LLM Aggregator - UX Improvement Plan

**Analysis Date:** February 9, 2026  
**Re-assessment Date:** February 13, 2026  
**Total Issues Identified:** 67  
**Categories:** 11 major areas

---

## Executive Summary

This document outlines comprehensive usability improvements for the LLM Aggregator application based on analysis of all Vue components and stores.

**Status note (February 13, 2026):** Phase 1 items (auto-title, metadata pre-fill, core shortcuts, real-time search, URL validation, loading state) are implemented. Remaining highest-value gaps are:

1. **Thread assignment in all-QA create flow** - newly created QAs can remain unfiled
2. **Data-entry acceleration for repeated creates/edits** - missing duplicate/create-next workflows
3. **Accessibility coverage** - ARIA semantics and focus management remain partial
4. **Advanced search/filter depth** - source/date/url filters and highlights still missing
5. **Undo/history and bulk actions** - still unimplemented

**Re-assessment note (July 27, 2026):** Re-audited against the current codebase (not just doc claims). Items #1 (thread assignment), #2 (create&continue, duplicate, thread quick-create, source shortcuts, focus restoration, paste parser) and toast-based error feedback (9.1) are now implemented — see inline updates below. Accessibility (7.x), advanced search/filters (4.1/4.3/4.4), bulk ops (5.1), undo/history (6.1/6.2), and mobile responsiveness (8.x) remain the real gaps. Two doc items were previously mis-marked as not started: **11.8 Duplicate/Copy QA** and **11.9 Breadcrumb navigation** are both fully implemented.

---

## 1. KEYBOARD NAVIGATION ISSUES

### 1.1 Arrow Key Navigation for Threads ✅ DONE

**Location:** `src/components/ThreadsPanel.vue`  
**Current State:** Threads can only be selected via mouse clicks. No keyboard shortcuts exist.  
**Problem:** Users cannot use arrow keys to navigate between threads, requiring frequent mouse usage.  
**Recommendation:**

- Add @keydown handler to thread items
- Implement Up/Down arrow keys to navigate threads
- Add Enter key to select thread
- Add `tabindex` attributes for accessibility
- Implement `Ctrl+N` for new thread creation

**Difficulty:** ⭐⭐ Medium

---

### 1.2 Arrow Key Navigation for QA Pairs ✅ DONE

**Location:** `src/components/QAListPanel.vue`  
**Current State:** QA items lack keyboard navigation between items.  
**Problem:** Users must click each QA pair individually; no keyboard shortcuts for quick browsing.  
**Recommendation:**

- Add Up/Down arrow key navigation in QA list
- Add `j/k` keys for vim-style navigation (optional)
- Implement `Ctrl+E` to open editor
- Add focus indicators for keyboard navigation

**Difficulty:** ⭐⭐ Medium

---

### 1.3 Global Keyboard Shortcuts ✅ DONE

**Location:** `src/App.vue`  
**Current State:** Core global shortcuts are implemented, but coverage and platform docs need continuous updates.  
**Problem:** Users may miss discoverability or hit platform-specific gaps if docs lag code.

**Recommended Shortcuts:**

| Shortcut                              | Action                                   | Priority        |
| ------------------------------------- | ---------------------------------------- | --------------- |
| `Ctrl/Cmd+F` or `/`                   | Focus search bar                         | 🔴 Critical     |
| `Ctrl/Cmd+N`                          | New QA pair                              | 🔴 Critical     |
| `Ctrl/Cmd+S`                          | Save (in edit mode)                      | 🔴 Critical     |
| `Escape`                              | Close dialogs/cancel actions             | 🔴 Critical     |
| `Ctrl/Cmd+,`                          | Open settings                            | 🟡 High         |
| `Delete`                              | Delete selected item (with confirmation) | 🟡 High         |
| `F2` (often `Fn+F2` on Mac keyboards) | Rename selected thread                   | 🟡 High         |
| `E`                                   | Edit selected QA                         | 🟡 Medium       |
| `Alt+Up/Down`                         | Move QA in thread                        | 🟡 Medium       |
| `Ctrl/Cmd+K`                          | Command palette                          | 🟢 Nice to have |
| `?`                                   | Show keyboard shortcuts help             | 🟢 Nice to have |

**Difficulty:** ⭐⭐ Medium

---

### 1.4 Tab Order Issues in Forms ⚠️ Partial

**Location:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`  
**Current State (verified July 27, 2026):**
- ✅ `Ctrl/Cmd+Enter` submits in `QAEditor.vue` (`handleKeydown`); `QAEditForm.vue` supports `Ctrl/Cmd+S`/Enter to save.
- ✅ Focus after create returns via `QAListPanel.vue` `onQACreated()` → `selectPair()` + `focusQAList()`, landing on the list container so arrow keys work immediately.
- ⚠️ Focus trap is inconsistent: `QAEditor.vue` uses PrimeVue's `v-focustrap`; `SettingsDialog.vue`/`ApplicationStatusDialog.vue`/`ArchiveResetDialog.vue` get it for free via PrimeVue `<Dialog>`. But `AnnotationDialog.vue`, `HealthReportDialog.vue`, and `TagManagerDialog.vue` are plain overlay `<div>`s with no focus-trap directive.
- ⚠️ QA list items are plain non-focusable `<div>`s (no per-item `tabindex`) — focus lands on the list container, not the specific item.

**Remaining Recommendation:**
- Add focus-trap (`v-focustrap` or wrap in PrimeVue `Dialog`) to `AnnotationDialog.vue`, `HealthReportDialog.vue`, `TagManagerDialog.vue`

**Difficulty:** ⭐ Easy

---

### 1.5 Keyboard Access to Action Buttons ✅ DONE

**Location:** `src/components/QAContentPanel.vue`  
**Current State:** Edit/Delete/Move buttons require mouse clicks.  
**Problem:** Power users cannot quickly perform actions on selected QA.  
**Recommendation:**

- `E`: Edit selected QA
- `Delete`: Delete selected QA
- `Alt+Up/Down`: Move QA in thread
- `R`: Remove from thread

**Difficulty:** ⭐ Easy

---

## 2. AUTO-POPULATION & ASSISTED ENTRY

### 2.1 Last-Used Metadata Pre-fill (Re-assessed) ✅ Partial
**Location:** `src/components/QAEditor.vue`, `src/stores/uiStore.ts`, `src/components/SettingsDialog.vue`  
**Current State:** Implemented. New QA pre-fills `source`, `tags`, and `url` from last create action; user can toggle "Remember last-used metadata" in Settings.  
**Update (verified July 27, 2026):** The persistence gap is closed — `uiStore.ts` now persists `lastUsedSource`/`lastUsedTags`/`lastUsedUrl`/`rememberLastMetadata`/`lastUsedThreadId` to `window.localStorage`, so values do survive app restarts.  
**Remaining Gap:** Persistence is via renderer `localStorage`, not the app's `settings.json` (`electron/services/settingsService.ts`'s `AppSettings` has no such fields) — so these values aren't portable with data-directory backups/exports and aren't visible in `SettingsDialog.vue`. There is still no one-click "Clear remembered metadata" action.
**Recommendation (next increment):**
- Optionally move persistence into `settings.json` if portability across data directories matters
- Add one-click "Clear remembered metadata" action in Settings

**Feasibility:** High  
**Difficulty:** ⭐ Easy  
**Impact on Data Entry:** Medium

---

### 2.2 Thread Assignment During Create Flow ✅ DONE
**Location:** `src/components/QAEditor.vue`, `src/components/QAListPanel.vue`  
**Current State (verified July 27, 2026):** Implemented. `QAEditor.vue` always renders an "Add to Thread" `<Select>` (`data-testid="target-thread-select"`) with a "+ Create new thread…" inline option. `onMounted` falls back through `initialTargetThreadId` → `threadStore.selectedThreadId` → `uiStore.lastUsedThreadId`, so even from "All QAs" mode it defaults to the last-used thread while still allowing "None (unassigned)" or any other thread.  
**Remaining Gap (minor):** No explicit "Recent threads" quick-pick list beyond the single last-used default — the full thread dropdown covers this adequately for now.

**Feasibility:** High  
**Difficulty:** ⭐⭐ Medium  
**Impact on Data Entry:** High

---

### 2.3 Smart Tag Suggestions (Re-assessed) ✅ Partial
**Location:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`, `src/stores/qaStore.ts`  
**Current State:** Implemented with PrimeVue `AutoComplete` + multi-select suggestions from existing tags (`qaStore.allTags` frequency-sorted).  
**Remaining Gaps (verified July 27, 2026):**
- `commitPendingTags()` (`QAEditor.vue`, `QAEditForm.vue`) only parses comma-separated input at submit time, not live on comma/Tab keypress — mid-typing a comma still doesn't instantly spawn a chip
- No "recent tags" quick-pick row (confirmed absent)
- ✅ Casing normalization **is** implemented — `tagStore.resolveTag()` (`src/stores/tagStore.ts`) normalizes via `.trim().toLowerCase()`, and `TagManagerDialog.vue` (net-new, not in original doc scope) provides full canonical tag/alias management

**Recommendation (next increment):**
- Commit tag chip on comma/Enter/Tab consistently (live, not just on submit)
- Add recent/popular tag chips below input for single-click insertion

**Feasibility:** Medium-High  
**Difficulty:** ⭐⭐ Medium  
**Impact on Data Entry:** Medium-High

---

### 2.4 Section 2 Feasibility Snapshot (updated July 27, 2026)
| Item | Status | Feasibility | Difficulty | Suggested Priority |
|------|--------|-------------|------------|--------------------|
| 2.1 Persist pre-fill across restarts | ✅ Done (via localStorage) | High | ⭐ Easy | — |
| 2.2 Add thread selector in create form | ✅ Done | High | ⭐⭐ Medium | — |
| 2.3 Improve tag commit/quick-pick behavior | Not started | Medium-High | ⭐⭐ Medium | P2 |
| 2.1 Clear remembered metadata action | Not started | High | ⭐ Easy | P2 |

---

### 2.5 Additional Faster Data Entry Improvements (All Forms & Flows)
Analysis covered: `QAEditor`, `QAEditForm`, `QAListPanel`, `ThreadsPanel`, `SettingsDialog`, `QAContentPanel`, and app-level shortcuts in `App.vue`.

**Status re-verified July 27, 2026 — 7 of 9 fully done, 1 partial, 1 not started:**

1. **Create + continue workflow (high ROI)** ✅ DONE
- `QAEditor.vue` "Create & Add Another" button wired to `create(true)`, keeps thread/metadata, clears question/answer/title, refocuses question field
- Shortcut `Ctrl/Cmd+Shift+Enter` implemented

2. **Duplicate current QA into pre-filled create form** ✅ DONE
- `QAContentPanel.vue` `duplicateSelectedQA()` opens `QAEditor` pre-populated from selected QA (title suffixed `(copy)`)
- Shortcut is **`Ctrl/Cmd+D`**, not bare `D` as originally proposed (`App.vue`)

3. **Consistent validation parity between create and edit** ✅ DONE
- `QAEditForm.vue` and `QAEditor.vue` both use identical `new URL()` try/catch validation with an `urlError` message and disabled save

4. **Thread quick-create inside QAEditor** ✅ DONE
- `QAEditor.vue`'s thread `<Select>` has a "+ Create new thread…" option with an inline "New Thread Name" field

5. **Source quick-select shortcuts** ✅ DONE
- `Alt+1..5` mapped to source options in both `QAEditor.vue` and `QAEditForm.vue`

6. **Focus restoration after create/save** ✅ DONE
- `nextTick` refocus of question textarea on create; `focusQAList()` after edit save/cancel in `QAContentPanel.vue`

7. **Settings dialog keyboard ergonomics** ✅ DONE
- `Ctrl/Cmd+Enter` saves in `SettingsDialog.vue`; `Escape` closes via PrimeVue `Dialog`'s `closeOnEscape`

8. **Quick metadata cloning in edit form** ⚠️ Partial
- Tags/URL/source *are* auto-prefilled from last-used metadata on mount (`uiStore.getLastUsedMetadata()`) when "Remember last-used metadata" is on, but there's no explicit user-triggered "Copy tags from last-used" button — it's implicit/automatic only, and "Use current URL as template" doesn't exist
- **Difficulty:** ⭐⭐ Medium

9. **Paste parser for structured imports** ✅ DONE
- `parseStructuredPaste()` in `QAEditor.vue` handles `Q:`/`A:` and `## Question`/`## Answer` blocks plus `title:`/`source:`/`url:`/`tags:` meta lines, with batch-entry support — implemented beyond the original "optional advanced" scope

---

## 3. TITLE AUTO-GENERATION

### 3.1 Auto-title Generation Logic ✅ DONE

**Location:** `src/components/QAEditor.vue` (lines 39-40)  
**Current State:** Defaults to "Untitled" if empty; no smart generation.  
**Problem:** Users must manually title every QA, which is tedious.  
**Recommendation:**

- Auto-generate title from first 50-80 chars of question
- Strip markdown formatting and trim whitespace
- Update title field reactively as user types question
- Add "Use generated title" checkbox or button

**Implementation Sketch:**

```typescript
const autoTitle = computed(() => {
  if (!question.value.trim()) return "";
  const clean = question.value
    .replace(/[#*_~`]/g, "") // Remove markdown
    .replace(/\n/g, " ") // Replace newlines with spaces
    .trim();
  return clean.length > 70 ? clean.substring(0, 70) + "..." : clean;
});

// Watch question and update title if it's empty or matches previous auto-title
watch(question, (newQuestion) => {
  if (!title.value || title.value === previousAutoTitle.value) {
    title.value = autoTitle.value;
    previousAutoTitle.value = autoTitle.value;
  }
})
```

**Difficulty:** ⭐ Easy  
**Priority:** 🔴 Critical - Immediate high-value improvement

---

### 3.2 No Title Uniqueness Check ⚠️

**Location:** `src/components/QAEditor.vue`, `src/stores/qaStore.ts`  
**Current State:** Multiple QAs can have identical titles.  
**Problem:** Confusing in list view; hard to distinguish items.  
**Recommendation:**

- Check for duplicate titles and append suffix (e.g., "Title (2)")
- Show warning indicator if title already exists
- Add validation message below title field

**Difficulty:** ⭐ Easy

---

## 4. SEARCH & FILTER FUNCTIONALITY

### 4.1 Limited Search Capabilities ⚠️

**Location:** `src/components/QAListPanel.vue` (lines 81-94)  
**Current State:** Only available in "All QAs" mode; limited to full-text and tags.  
**Problem:** Cannot search within specific thread; no advanced filters.  
**Recommendation:**

- Enable search within selected thread
- Add filters: by source (Claude, ChatGPT, etc.), by date range, by URL presence
- Implement multi-criteria search (tags AND full-text)
- Add saved searches/filters

**Difficulty:** ⭐⭐⭐ Hard

---

### 4.2 Real-time Search ✅ DONE

**Location:** `src/components/QAListPanel.vue` (lines 62-68)  
**Current State:** Requires pressing Enter or clicking search button.  
**Problem:** Slower workflow; no instant feedback.  
**Recommendation:**

- Debounce search input (300-500ms delay)
- Show results as user types
- Add loading indicator during search
- Cache search results for better performance

**Difficulty:** ⭐ Easy  
**Priority:** 🟡 High - Quick win for better UX

---

### 4.3 No Search Result Highlighting ⚠️

**Location:** `src/components/QAListPanel.vue`  
**Current State:** Search results shown but no indication of where matches occur.  
**Problem:** Users can't quickly see why item matched query.  
**Recommendation:**

- Highlight search terms in QA title and snippet
- Show matched tags with different styling
- Display match location (question vs. answer)

**Difficulty:** ⭐⭐ Medium

---

### 4.4 No Advanced Sorting Options ⚠️ Partial

**Location:** `src/components/QAListPanel.vue`  
**Current State (verified July 27, 2026):** Confirmed still only date (fixed descending) or title (fixed ascending) sorting via a single global `uiStore.sortBy` setting — no per-context (thread vs. all-QAs) memory, no source/tag-count/length sort, no asc/desc toggle.  
**Problem:** Cannot sort by source, tags, or relevance.  
**Recommendation:**

- Add sort by: source, tag count, question length, last modified
- Add ascending/descending toggle
- Remember sort preference per context (thread vs all QAs)

**Difficulty:** ⭐ Easy

---

## 5. BULK OPERATIONS

### 5.1 No Multi-select Capability ❌

**Location:** `src/components/QAListPanel.vue`, `src/components/ThreadsPanel.vue`  
**Current State:** Can only work with one item at a time.  
**Problem:** Cannot move/delete/tag multiple QAs simultaneously.  
**Recommendation:**

- Add checkbox selection mode (toggle with toolbar button)
- Implement `Ctrl+Click` for multi-select
- `Shift+Click` for range selection
- Show bulk action toolbar when items selected
- Actions: Delete, Move to thread, Add tags, Export

**Difficulty:** ⭐⭐⭐ Hard

---

### 5.2 No Export/Import Functionality ⚠️ Partial

**Location:** `electron/services/qaExportFormatService.ts`, `QAContentPanel.vue`, `ThreadsPanel.vue`  
**Current State (verified July 27, 2026):** Export now exists — `formatQAExport`/`formatThreadExport` produce a Markdown document with a frontmatter-style header, wired to "Export" actions in `QAContentPanel.vue` and `ThreadsPanel.vue`. Import is comprehensive (see `electron/services/import/` — shared-link + bulk account-export pipelines documented in `CLAUDE.md`).  
**Problem:** Export is Markdown-only — no JSON or CSV format, and no "export entire archive" bulk action.  
**Recommendation:**

- Add JSON export (for lossless re-import / interop)
- Add CSV export (for spreadsheet workflows)
- Add "export entire archive" bulk action

**Difficulty:** ⭐⭐ Medium

---

## 6. UNDO/REDO FUNCTIONALITY

### 6.1 No Undo/Redo System ❌

**Location:** All stores (`src/stores/threadStore.ts`, `src/stores/qaStore.ts`)  
**Current State:** Destructive actions are permanent.  
**Problem:** Accidental deletions or edits cannot be reversed.  
**Recommendation:**

- Implement command pattern for reversible actions
- Add undo/redo stack to stores
- `Ctrl+Z` / `Ctrl+Y` keyboard shortcuts
- Show "Undo" toast action after certain operations
- Store action history (limited to last 20-50 actions)

**Difficulty:** ⭐⭐⭐ Hard

---

### 6.2 No Edit History ❌

**Location:** `src/stores/qaStore.ts`, QA data structure  
**Current State:** No version history for QA pairs.  
**Problem:** Cannot see what changed or restore previous versions.  
**Recommendation:**

- Store edit timestamps and version numbers
- Keep revision history (at least 5 previous versions)
- Add "View history" button in QAContentPanel
- Show diff view for changes

**Difficulty:** ⭐⭐⭐ Hard

---

## 7. ACCESSIBILITY (ARIA & SCREEN READERS)

### 7.1 Missing ARIA Labels ❌

**Location:** All components  
**Current State:** Very few `aria-label` or `role` attributes.  
**Problem:** Screen reader users cannot effectively navigate app.  
**Recommendation:**

- Add `aria-label` to all icon-only buttons
- Add `role="list"` and `role="listitem"` to thread/QA lists
- Add `aria-current="page"` to selected items
- Add `aria-expanded` to collapsible sections
- Add `aria-describedby` to form fields with helper text

**Files to update:**

- `src/components/ThreadsPanel.vue`
- `src/components/QAListPanel.vue`
- `src/components/QAContentPanel.vue`
- `src/components/QAEditor.vue`
- `src/components/SettingsDialog.vue`

**Difficulty:** ⭐ Easy (but touches many files)

---

### 7.2 No Skip Navigation Links ❌

**Location:** `src/App.vue`  
**Current State:** No skip links for keyboard users.  
**Problem:** Keyboard users must tab through all UI to reach content.  
**Recommendation:**

- Add hidden skip links at top: "Skip to threads", "Skip to content", "Skip to search"
- Show on focus with CSS

**Difficulty:** ⭐ Easy

---

### 7.3 Missing Focus Indicators ⚠️

**Location:** Custom button styles in all components  
**Current State:** Default focus styles may be overridden or unclear.  
**Problem:** Keyboard users cannot see which element has focus.  
**Recommendation:**

- Ensure visible focus outline on all interactive elements
- Use `:focus-visible` for modern browsers
- Add higher contrast focus indicator (3:1 ratio)

**Difficulty:** ⭐ Easy

---

### 7.4 No Screen Reader Announcements ❌

**Location:** All components with dynamic content  
**Current State:** Screen readers not notified of state changes.  
**Problem:** Blind users miss important updates (e.g., "Thread created", "Search complete").  
**Recommendation:**

- Add `role="status"` live region for announcements
- Use PrimeVue Toast's `aria-live` properly
- Announce list changes ("Showing 5 of 20 results")
- Announce loading states

**Difficulty:** ⭐ Easy

---

## 8. MOBILE RESPONSIVENESS

### 8.1 Fixed Width Panels ⚠️

**Location:** `src/components/ThreadsPanel.vue` (line 165), `src/components/QAListPanel.vue` (line 197)  
**Current State:** Hard-coded widths (220px, 300px).  
**Problem:** Not usable on small screens or tablets.  
**Recommendation:**

- Implement responsive breakpoints with media queries
- Convert to mobile layout: collapsible sidebar, stack panels
- Add hamburger menu for mobile navigation
- Use flexbox with `min-width` instead of fixed width

**Difficulty:** ⭐⭐⭐ Hard

---

### 8.2 No Touch Gestures ❌

**Location:** All interactive components  
**Current State:** Mouse-only interactions.  
**Problem:** Touch device users have poor experience.  
**Recommendation:**

- Swipe left/right to navigate between panels
- Swipe on item for quick actions (delete, edit)
- Pull-to-refresh in lists
- Long-press for context menu

**Difficulty:** ⭐⭐⭐ Hard

---

### 8.3 Small Touch Targets ⚠️

**Location:** Action buttons throughout  
**Current State:** Button `size="small"` may be too small for touch.  
**Problem:** Difficult to tap accurately on mobile devices.  
**Recommendation:**

- Minimum 44x44px touch targets for mobile
- Increase padding/spacing in mobile view
- Larger icon buttons in mobile mode

**Difficulty:** ⭐ Easy

---

## 9. ERROR HANDLING & USER FEEDBACK

### 9.1 Silent Failures ✅ DONE

**Location:** `src/App.vue`, `src/components/QAContentPanel.vue`, `src/components/QAListPanel.vue`, `src/components/ThreadsPanel.vue`, `src/components/TagManagerDialog.vue`  
**Current State (verified July 27, 2026):** `useToast()` is used extensively on error paths — `App.vue`'s `onErrorCaptured`, load/import failures; per-component failures (AI metadata, tag sync, etc.) all surface toast notifications. Global `<Toast position="bottom-right" />` mounted in `App.vue`.  
**Remaining Gap:** No dedicated error-boundary component and no "Retry"/"Report bug" action buttons embedded in error toasts (a plain retry does exist for IPC calls — see 9.4).  
**Recommendation (residual):**
- Add recovery actions in error toasts ("Retry", "Report bug") for the operations that support it

**Difficulty:** ⭐⭐ Medium

---

### 9.2 Loading States ✅ DONE

**Location:** All async operations (load, search, save)  
**Current State:** No visual indication during async operations.  
**Problem:** Users don't know if app is working or frozen.  
**Recommendation:**

- Add spinner/skeleton loaders during data fetch
- Show progress bar for long operations (export, bulk delete)
- Disable buttons during async operations
- Add loading indicator to search button

**Difficulty:** ⭐ Easy  
**Priority:** 🟡 High - Essential for perceived performance

---

### 9.3 Confirmation for Destructive Actions ✅

**Location:** `src/components/ThreadsPanel.vue` (lines 55-66), `src/components/QAContentPanel.vue` (lines 36-50)  
**Current State:** Confirmation dialogs exist and work well.  
**Problem:** Minor - could show more context.  
**Recommendation:**

- Show impact in confirmation ("This will delete 5 QAs")
- Add "Don't ask again" checkbox option with localStorage
- Use color-coded confirmations (red for danger)

**Difficulty:** ⭐ Easy  
**Note:** Already well-implemented, just minor enhancements possible

---

### 9.4 No Network/IPC Error Recovery ⚠️ Partial

**Location:** `src/utils/retry.ts`, `src/stores/qaStore.ts`, `src/stores/threadStore.ts`  
**Current State (verified July 27, 2026):** Automatic retry **is** implemented — `withRetry()` (exponential backoff, 3 attempts) wraps `qaListAll`/`qaCreate`/`qaUpdate`/`qaDelete`/`searchQuery`/`searchSemantic` in `qaStore.ts` and `threadsLoad`/`threadsSave` in `threadStore.ts`.  
**Problem:** No offline/connectivity indicator and no manual "Retry" button surfaced in error toasts; no queueing of failed operations for later retry.  
**Recommendation (residual):**

- Show "offline" indicator if IPC fails repeatedly
- Provide manual "Retry" button in error toasts
- Queue failed operations for retry

**Difficulty:** ⭐⭐ Medium

---

## 10. EMPTY STATES

### 10.1 Weak Empty States ⚠️

**Location:** `src/components/ThreadsPanel.vue` (lines 141-146), `src/components/QAListPanel.vue` (lines 121-135)  
**Current State:** Basic icons and text only.  
**Problem:** Not actionable or helpful for new users.  
**Recommendation:**

- Add call-to-action buttons in empty states
- Show onboarding tips for first-time users
- Add illustration or better visuals
- Provide quick-start guide ("Create your first thread")

**Difficulty:** ⭐ Easy

---

### 10.2 No Onboarding Experience ❌

**Location:** `src/App.vue`  
**Current State:** App starts empty with no guidance.  
**Problem:** New users don't understand workflow.  
**Recommendation:**

- Detect first launch and show welcome modal
- Provide interactive tutorial (highlight features)
- Add "Help" or "?" button with documentation
- Create sample thread and QA on first launch (optional)

**Difficulty:** ⭐⭐ Medium

---

## 11. ADDITIONAL USABILITY ISSUES

### 11.1 No Drag-and-Drop Reordering ❌

**Location:** `src/components/ThreadsPanel.vue`, `src/components/QAListPanel.vue`  
**Current State:** Manual move up/down buttons only for QAs in threads.  
**Problem:** Tedious to reorder many items; no drag-and-drop for threads.  
**Recommendation:**

- Implement drag-and-drop for threads and QAs
- Use PrimeVue's `OrderList` or implement custom draggable
- Show visual feedback during drag (ghost image)
- Allow dragging QAs between threads

**Difficulty:** ⭐⭐⭐ Hard

---

### 11.2 No Recent/Favorites Feature ❌

**Location:** Missing entirely  
**Current State:** No quick access to frequently used items.  
**Problem:** Users must navigate to find commonly accessed QAs.  
**Recommendation:**

- Add "Favorites" or "Starred" system for QAs
- Show "Recent" list in dropdown or panel
- Track access frequency for smart suggestions
- Add favorites indicator in list items (star icon)

**Difficulty:** ⭐⭐ Medium

---

### 11.3 No Markdown Preview in Editor ❌

**Location:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`  
**Current State:** Plain textarea for question/answer input.  
**Problem:** Users can't see how markdown will render until after saving.  
**Recommendation:**

- Add split-pane editor with live preview
- Use markdown toolbar with common formatting buttons
- Show preview on hover or toggle mode
- Consider using a markdown editor component (e.g., `@toast-ui/vue-editor`)

**Difficulty:** ⭐⭐ Medium

---

### 11.4 Dark Mode Toggle ✅ DONE

**Location:** `src/stores/uiStore.ts` (lines 9-10)  
**Current State:** Dark mode toggle exists in store but not connected to UI.  
**Problem:** Feature implemented but not accessible to users.  
**Recommendation:**

- Add dark mode toggle button in app toolbar or settings
- Persist preference to localStorage
- Add system theme detection on startup
- Ensure all colors support dark mode

**Difficulty:** ⭐ Easy  
**Priority:** 🟡 High - Feature exists but hidden from users

---

### 11.5 URL Validation ✅ DONE

**Location:** `src/components/QAEditor.vue` (line 24), `src/components/QAEditForm.vue` (line 29)  
**Current State:** URL field accepts any string.  
**Problem:** Invalid URLs stored, links may not work.  
**Recommendation:**

- Add URL format validation (regex or URL constructor)
- Show validation error below field
- Add "Open URL" button to test link
- Make URL clickable in QAMetadataBar

**Difficulty:** ⭐ Easy

---

### 11.6 Keyboard Shortcut Help ✅ DONE

**Location:** Missing entirely  
**Current State:** No documentation of keyboard shortcuts.  
**Problem:** Users unaware of keyboard navigation features (once implemented).  
**Recommendation:**

- Add "?" key to show keyboard shortcut modal
- Create cheat sheet overlay with all shortcuts
- Add shortcuts tooltip to relevant UI elements
- Include in settings or help menu

**Difficulty:** ⭐ Easy

---

### 11.7 Missing Context Menus ❌

**Location:** All list items  
**Current State:** Actions only via hover buttons or action bar.  
**Problem:** Right-click context menu is expected pattern.  
**Recommendation:**

- Add right-click context menu to threads and QAs
- Include actions: Edit, Delete, Move, Copy, Duplicate
- Use PrimeVue ContextMenu component
- Add "Open in new window" for QA (if multi-window support added)

**Difficulty:** ⭐⭐ Medium

---

### 11.8 No Duplicate/Copy Functionality ✅ DONE

**Location:** `src/components/QAContentPanel.vue`  
**Current State (verified July 27, 2026):** Implemented — an explicit "Duplicate" button (`data-testid="duplicate-qa-button"`) calls `duplicateSelectedQA()`, which opens `QAEditor` pre-filled with a `(copy)`-suffixed title, the same source/URL/tags/question/answer, and targeting the current thread. Bound to shortcut `Ctrl/Cmd+D`.

**Difficulty:** ⭐ Easy

---

### 11.9 No Breadcrumb Navigation ✅ DONE

**Location:** `src/App.vue`  
**Current State (verified July 27, 2026):** Implemented — a breadcrumb bar (`class="breadcrumb"`) shows "All QAs" / "Threads → {thread name}" / "Unthreaded", followed by the selected QA's title when applicable, with clickable `bc-item` segments for quick navigation.

**Difficulty:** ⭐ Easy

---

### 11.10 No Global Quick Search ✅ DONE

**Location:** Search only in `src/components/QAListPanel.vue`  
**Current State:** Search bar only visible in "All QAs" mode.  
**Problem:** Must switch modes to search.  
**Recommendation:**

- Add global search bar in top app toolbar
- Make it accessible from any view
- Show results in modal or slide-out panel
- Implement command palette (Ctrl+K) like VS Code

**Difficulty:** ⭐⭐ Medium

---

## IMPLEMENTATION PRIORITY MATRIX

### ✅ COMPLETED

- 1.1, 1.2, 1.3 Arrow key navigation & Global shortcuts
- 1.5 Keyboard access to action buttons & forms (1.4 remains partial — see item)
- 2.1 Field pre-filling (now persisted across restarts via localStorage)
- 2.2 Thread assignment during create flow
- 2.3 Tag autocomplete (casing normalization done; live comma/Tab commit + recent-tags row still pending)
- 2.5.1 Create & Add Another
- 2.5.2 Duplicate → pre-filled create form (`Ctrl/Cmd+D`)
- 2.5.3 URL validation parity (create vs. edit)
- 2.5.4 Thread quick-create inline
- 2.5.5 Alt+1..5 source quick-select
- 2.5.6 Focus restoration after create/save
- 2.5.7 Settings dialog keyboard ergonomics
- 2.5.9 Structured paste parser (Q:/A: blocks)
- 3.1 Auto-title generation
- 4.2 Real-time search
- 9.1 Toast notifications for errors
- 9.2 Loading states
- 11.4 Dark mode toggle
- 11.5 URL validation
- 11.6 Shortcut help
- 11.8 Duplicate/Copy QA functionality
- 11.9 Breadcrumb navigation
- 11.10 Global Search
5. ~~Thread selector in editor (2.2)~~ — ✅ done, see item 2.2
6. ~~Breadcrumb navigation (11.9)~~ — ✅ done, see item 11.9


*(Re-verified against code July 27, 2026 — see inline "verified" notes on each item above for evidence.)*

---

### 🔴 PHASE 1: Core UX Refinement (Near-term)

**Goal:** Address high-value usability gaps
1.  **Real time name filter in threads list **
   - Impact: with very long list of threads easier navigation
3. **Search result highlighting** (4.3)
   - Impact: Shows why items matched the search
4. **Context menus** (11.7)
   - Impact: Familiar right-click workflow
5. **Duplicate QA functionality** (11.8)
   - Impact: Create new QAs from templates
6. **Recent/Favorites feature** (11.2)
   - Impact: Quick access to frequent QAs
7. **compressible box for tags selectors above threads list ** 
   - Impact: if too many tags for threads, box takes too much vertical room 
---

### 🟡 PHASE 2: Advanced Features (Mid-term)

**Goal:** Power user capabilities

1. **Bulk operations** (5.1) — still not started
   - Impact: Manage multiple QAs/threads
2. **Filter by date range in thread list ** 
   - Impact: very long thread list is more manageable
3. **Advanced search filters** (4.1) — still not started
   - Imact: Filter by source, dateRange, etc.
4. **Undo/Redo system** (6.1, 6.2) — still not started
   - Impact: Reversible actions
5. ** LLM generated titles for QAs and threads ** 
   - Impact: for imported threads (Gemini) or constructed threads smarter title proposal 
6. ** LLM generated tag list for QAs and threads ** 
   - Impact: smarter tagging 
---

### 🔵 PHASE 3: Mobile & Polish (Long-term)

1. **Mobile responsiveness** (8.1, 8.2, 8.3)
2. **Drag & drop reordering** (11.1)
3. **Onboarding experience** (10.2)
4. **Touch gestures** (8.2)

---

### 🔵 PHASE 4: Postponed indefinetely (Long-term)

1. **Accessibility & ARIA labels** (7.1, 7.2, 7.3, 7.4)
   - Impact: Essential for screen reader support
2. **Markdown preview in editor** (11.3)
   - Impact: WYSIWYG experience while editing
3. **Export/Import functionality** (5.2) — export now partially done (Markdown-only); JSON/CSV export still open
   - Impact: Backup and share data
   - Difficulty: ⭐⭐ Medium



---

## NOTES

- **Total identified issues:** 67 improvements
- **Critical gaps remaining (as of July 27, 2026):** accessibility (7.1-7.4, essentially unaddressed), bulk operations (5.1), undo/redo (6.1/6.2), advanced search filters & highlighting (4.1/4.3), mobile responsiveness (8.1-8.3)
- **Quick wins available:** title uniqueness check (3.2), search highlighting (4.3), "clear remembered metadata" action (2.1)
- **Biggest ROI already realized:** Auto-title + keyboard shortcuts + real-time search + thread-assignment-on-create + duplicate/breadcrumb/toast feedback
- **Architecture debt:** Undo/redo, mobile responsive, bulk operations, accessibility semantics

**Out-of-scope net-new features found during the July 27, 2026 audit** (not covered by this doc, built independently of it — no action needed here, noted for completeness):
- `AnnotationDialog.vue` — guided LLM confidence-annotation review workflow
- `HealthReportDialog.vue` — archive health check (orphans, metadata gaps, duplicates, dead-ends)
- `InsightsPanel.vue` ("LLM Lens") — AI-query panel (Brief/Prior Art/Steelman/Gaps/Concept Summary)
- `TagManagerDialog.vue` — canonical tag/alias management with usage counts
- `ApplicationStatusDialog.vue` — settings/secrets/provider/model-catalog status view
- `ArchiveResetDialog.vue` — safe "reset to virgin state" (moves to a `purged-<stamp>` backup, deletes nothing)

**Maintainer:** This doc should be updated as Phase 1 items are completed.

---

**Document Version:** 1.2  
**Last Updated:** July 27, 2026 (re-audited against live codebase; Version 1.1 content from February 13, 2026 preserved with inline updates)  
**Status:** In progress (Phase 1 complete; Phase 2 partially complete — thread assignment, duplicate, breadcrumb, toast feedback, retry logic done; bulk ops, undo/redo, advanced search, accessibility still open)


## Progress

### Phase 1
✅ Phase 1 Implementation Complete!
I've successfully implemented all 8 Phase 1 improvements from the UX plan:

1. Auto-title Generation ✅
QAEditor.vue now auto-generates title from first 70 chars of question
Strips markdown formatting and shows preview hint
Updates reactively as user types
2. Pre-fill Last-Used Metadata ✅
uiStore.ts stores last source, tags, URL
QAEditor.vue pre-fills these fields automatically
New rememberLastMetadata toggle in Settings
3. Global Keyboard Shortcuts ✅
App.vue now handles:
Ctrl/Cmd+F or /: Focus search
Ctrl/Cmd+N: Create new QA
Ctrl/Cmd+S: Save current edit form
Ctrl/Cmd+,: Open settings
Escape: Close dialogs / cancel current edit
F2 (Fn+F2 on some Macs): Rename selected thread
Alt+Up/Down: Move selected QA in thread
E: Edit selected QA
Delete (Backspace on many Macs): Delete selected QA
Ctrl/Cmd+K: Open command palette
?: Show keyboard shortcuts help
Ctrl/Cmd+Enter: Submit forms (in QAEditor)
4. Real-time Search ✅
QAListPanel.vue debounces search with 400ms delay
Updates as you type with loading spinner
Placeholder text updated to "Search as you type..."
5. Loading States ✅
App.vue shows spinner during initial data load
QAListPanel.vue shows spinner during search
Button disabled during validation errors
6. Dark Mode Toggle ✅
Sun/Moon icon button in App.vue toolbar
Checkbox in SettingsDialog.vue
Toggles existing dark mode functionality
7. URL Validation ✅
QAEditor.vue validates URLs in real-time
Shows "Invalid URL format" error below field
Disables Create button when URL is invalid
8. Form Submit Shortcuts ✅
QAEditor.vue handles Ctrl+Enter to submit
Escape key cancels/closes editor
Shortcut hint shown in button row
Bonus:
Added electron:prod script to package.json for non-packaged production testing
All Phase 1 changes are complete and ready to test! Run npm run dev to see the improvements in action.
