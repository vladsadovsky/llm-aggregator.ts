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

### 1.4 Tab Order Issues in Forms ⚠️

**Location:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`  
**Current State:** Tab order follows DOM order, but no skip links or focus management.  
**Problem:** After creating/editing QA, focus is not returned to logical location.  
**Recommendation:**

- Return focus to newly created QA item after creation
- Trap focus within modal dialogs
- Add `autofocus` directive to first input in forms (already exists in some places)
- Implement `Ctrl+Enter` to submit forms quickly

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
**Remaining Gap:** Values are currently store-memory only (reset on app restart).  
**Recommendation (next increment):**
- Persist `lastUsedSource`, `lastUsedTags`, `lastUsedUrl`, and `rememberLastMetadata` to app settings/localStorage
- Add one-click "Clear remembered metadata" action in Settings

**Feasibility:** High  
**Difficulty:** ⭐ Easy  
**Impact on Data Entry:** Medium

---

### 2.2 Thread Assignment During Create Flow (Re-assessed) ⚠️
**Location:** `src/components/QAEditor.vue`, `src/components/QAListPanel.vue`  
**Current State:** If user creates QA from a selected thread, it is added to that thread on create. In "All QAs" mode, new QA remains unassigned (not added to any thread).  
**Problem:** In all-QA workflow, users must do extra navigation/actions to file the QA into a thread.  
**Recommendation:**
- Add optional "Add to thread" selector inside QAEditor
- Default to:
  - selected thread when one is active
  - last-used thread when in all-QA mode
- Add quick options: "None", "Recent threads", "Create new thread and add"

**Feasibility:** High  
**Difficulty:** ⭐⭐ Medium  
**Impact on Data Entry:** High

---

### 2.3 Smart Tag Suggestions (Re-assessed) ✅ Partial
**Location:** `src/components/QAEditor.vue`, `src/components/QAEditForm.vue`, `src/stores/qaStore.ts`  
**Current State:** Implemented with PrimeVue `AutoComplete` + multi-select suggestions from existing tags (`qaStore.allTags` frequency-sorted).  
**Remaining Gaps:**
- No explicit delimiter workflow (comma/enter behavior can feel inconsistent)
- No "recent tags" quick-pick row
- No tag normalization guidance (case/plural variants still possible)

**Recommendation (next increment):**
- Commit tag chip on comma/Enter/Tab consistently
- Add recent/popular tag chips below input for single-click insertion
- Normalize and display canonical tag casing (e.g., preserve first-seen case)

**Feasibility:** Medium-High  
**Difficulty:** ⭐⭐ Medium  
**Impact on Data Entry:** Medium-High

---

### 2.4 Section 2 Feasibility Snapshot (February 13, 2026)
| Item | Status | Feasibility | Difficulty | Suggested Priority |
|------|--------|-------------|------------|--------------------|
| 2.1 Persist pre-fill across restarts | Not started | High | ⭐ Easy | P1 |
| 2.2 Add thread selector in create form | Not started | High | ⭐⭐ Medium | P1 |
| 2.3 Improve tag commit/quick-pick behavior | Not started | Medium-High | ⭐⭐ Medium | P2 |
| 2.1 Clear remembered metadata action | Not started | High | ⭐ Easy | P2 |

---

### 2.5 Additional Faster Data Entry Improvements (All Forms & Flows)
Analysis covered: `QAEditor`, `QAEditForm`, `QAListPanel`, `ThreadsPanel`, `SettingsDialog`, `QAContentPanel`, and app-level shortcuts in `App.vue`.

1. **Create + continue workflow (high ROI)**
- Add "Create & Add Another" button in `QAEditor`
- Keep metadata/thread selection, clear question/answer/title, keep focus in question field
- Shortcut: `Ctrl/Cmd+Shift+Enter`
- **Difficulty:** ⭐⭐ Medium

2. **Duplicate current QA into pre-filled create form**
- Add action from `QAContentPanel` and shortcut (`D`) to open `QAEditor` pre-populated from selected QA
- Speeds up variants/edits of similar prompts
- **Difficulty:** ⭐⭐ Medium

3. **Consistent validation parity between create and edit**
- `QAEditForm` currently lacks URL validation parity with `QAEditor`
- Add same inline URL validation + disabled save on invalid URL
- **Difficulty:** ⭐ Easy

4. **Thread quick-create inside QAEditor**
- If desired thread does not exist, let user type and create thread inline without leaving form
- **Difficulty:** ⭐⭐ Medium

5. **Source quick-select shortcuts**
- In `QAEditor`/`QAEditForm`, map `Alt+1..5` to source options (Claude, ChatGPT, Gemini, Copilot, DeepSeek)
- **Difficulty:** ⭐ Easy

6. **Focus restoration after create/save**
- After create/save/cancel, restore focus to the selected QA list item (or to search if list is filtered)
- Reduces mouse repositioning cost
- **Difficulty:** ⭐⭐ Medium

7. **Settings dialog keyboard ergonomics**
- Add `Ctrl/Cmd+Enter` to save and `Escape` to close in `SettingsDialog`
- **Difficulty:** ⭐ Easy

8. **Quick metadata cloning in edit form**
- Add one-click actions: "Copy tags from last-used", "Use current URL as source URL template"
- **Difficulty:** ⭐⭐ Medium

9. **Paste parser for structured imports (optional advanced)**
- Detect pasted "Q:/A:" blocks in `QAEditor` and auto-split question/answer
- **Difficulty:** ⭐⭐⭐ Hard

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

### 4.4 No Advanced Sorting Options ⚠️

**Location:** `src/components/QAListPanel.vue` (lines 19-37)  
**Current State:** Only date or title sorting.  
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

### 5.2 No Export/Import Functionality ❌

**Location:** None - missing entirely  
**Current State:** No way to export QAs or threads.  
**Problem:** Cannot backup, share, or migrate data easily.  
**Recommendation:**

- Export selected QAs as JSON/Markdown/CSV
- Export entire thread as single document
- Import QAs from external files
- Add to Settings dialog or context menu

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

### 9.1 Silent Failures ⚠️

**Location:** `src/App.vue` (lines 19-32), all store operations  
**Current State:** Errors logged to console with `debugError` but user may not see feedback.  
**Problem:** Users don't know when operations fail.  
**Recommendation:**

- Show toast notifications for all critical errors
- Add error boundary components
- Provide recovery actions in error messages ("Retry", "Report bug")
- Add validation feedback in forms (required fields, format checks)

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

### 9.4 No Network/IPC Error Recovery ⚠️

**Location:** All store IPC calls  
**Current State:** Errors caught but no retry logic.  
**Problem:** Transient failures require app restart.  
**Recommendation:**

- Implement automatic retry with exponential backoff
- Queue failed operations for retry
- Show "offline" indicator if IPC fails repeatedly
- Provide manual "Retry" button in error toasts

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

### 11.8 No Duplicate/Copy Functionality ❌

**Location:** Missing entirely  
**Current State:** Cannot duplicate existing QA.  
**Problem:** Must manually recreate similar QAs.  
**Recommendation:**

- Add "Duplicate" button in QAContentPanel action bar
- Create copy with "(Copy)" suffix in title
- Copy all metadata and content
- Auto-open for editing after duplicate

**Difficulty:** ⭐ Easy

---

### 11.9 No Breadcrumb Navigation ⚠️

**Location:** `src/App.vue`  
**Current State:** Current location shown in panel titles only.  
**Problem:** In deep thread, users lose context of location.  
**Recommendation:**

- Add breadcrumb bar: "Threads > Thread Name > QA Title"
- Make breadcrumb segments clickable for quick navigation
- Show breadcrumb in main content area header

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
- 1.4, 1.5 Keyboard access to action buttons & forms
- 2.1 Field pre-filling
- 2.3 Tag autocomplete
- 3.1 Auto-title generation
- 4.2 Real-time search
- 9.2 Loading states
- 11.4 Dark mode toggle
- 11.5 URL validation
- 11.6 Shortcut help
- 11.10 Global Search

---

### 🔴 PHASE 1: Core UX Refinement (Near-term)

**Goal:** Address high-value usability gaps

1. **Accessibility & ARIA labels** (7.1, 7.2, 7.3, 7.4)
   - Impact: Essential for screen reader support
2. **Search result highlighting** (4.3)
   - Impact: Shows why items matched the search
3. **Context menus** (11.7)
   - Impact: Familiar right-click workflow
4. **Duplicate QA functionality** (11.8)
   - Impact: Create new QAs from templates
5. **Markdown preview in editor** (11.3)
   - Impact: WYSIWYG experience while editing
6. **Recent/Favorites feature** (11.2)
   - Impact: Quick access to frequent QAs

---

### 🟡 PHASE 2: Advanced Features (Mid-term)

**Goal:** Power user capabilities

1. **Bulk operations** (5.1)
   - Impact: Manage multiple QAs/threads
2. **Export/Import functionality** (5.2)
   - Impact: Backup and share data
   - Difficulty: ⭐⭐ Medium

3. **Advanced search filters** (4.1)
   - Impact: Filter by source, dateRange, etc.
4. **Undo/Redo system** (6.1, 6.2)
   - Impact: Reversible actions
5. **Thread selector in editor** (2.2)
   - Impact: Assign thread during creation from "All QAs" mode
6. **Breadcrumb navigation** (11.9)
   - Impact: Better context in deep threads

---

### 🔵 PHASE 3: Mobile & Polish (Long-term)

1. **Mobile responsiveness** (8.1, 8.2, 8.3)
2. **Drag & drop reordering** (11.1)
3. **Onboarding experience** (10.2)
4. **Touch gestures** (8.2)

---

## NOTES

- **Total identified issues:** 67 improvements
- **Critical gaps:** thread assignment flow, advanced data-entry acceleration, accessibility
- **Quick wins available:** 15-20 easy fixes (1 week of work)
- **Biggest ROI:** Auto-title + keyboard shortcuts + real-time search
- **Architecture debt:** Undo/redo, mobile responsive, bulk operations

**Maintainer:** This doc should be updated as Phase 1 items are completed.

---

**Document Version:** 1.1  
**Last Updated:** February 13, 2026  
**Status:** In progress (Phase 1 complete, Phase 2 planning/refinement)


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
