# LLM Aggregator
A desktop application for organizing and searching your LLM conversation Q&A pairs. Built with **Vue 3**, **TypeScript**, **Electron**, and **PrimeVue**.


## What is this repository for? 

This repository containd a source code for the app - LLM_Aggregator.
It allows you to maintain a local archive of your selected conversations with LLM chats.
Current implementation does not provide any automatic integration with the chats -
it assumes that the user manually copies selected questions and answers and pastes them
into the app. The entries of such archive are called QAs - "Query&Answer".
The app allows grouping the QAs in "threads" - very similar to how typical LLM chats
are organized, with the important difference that all data in the archive are editable.
After that the user can change the order of QAs, edit both questions and answers.
Actually, QAs are just pairs if texts (in markdown format), so the user can add
QA pairs without any interaction with LLMs.

## Generative AI usage
Specifications for the application were prepared manually. Baseline version of the code designed by Claude Opus 4.6 to a large degree, collaborating on planning and design document to formalize requirements.  

## Features

- **Three-column OneNote-style layout** — Threads | QA List | QA Content
- **Thread management** — create, rename, delete, and reorder threads
- **QA pair management** — create, edit, delete Q&A entries; move/reorder within threads
- **Markdown rendering** — questions and answers displayed as rich Markdown with syntax-highlighted code blocks
- **Metadata tracking** — model/source, timestamp, tags, URL, version history
- **Search** — full-text and tag-based search across all QAs
- **Configurable data directory** — point the app at any folder; defaults to current working directory
- **Cross-platform** — builds native installers for macOS, Windows, and Linux


## User Interface

### Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| **Ctrl/Cmd+F** or **/** | Focus search box | Global — works from any panel |
| **Ctrl/Cmd+N** | Create new QA pair | Global — opens the QA editor dialog |
| **Ctrl/Cmd+S** | Save current edit | Edit mode — saves the current QA |
| **Ctrl/Cmd+,** | Open settings | Global — access app configuration |
| **Escape** | Close dialog / cancel | Global — closes any open modal |
| **F2** (often **Fn+F2** on Mac keyboards) | Rename selected thread | Global |
| **Alt+Up / Alt+Down** | Move selected QA up/down in thread | Global — thread mode |
| **E** | Edit selected QA | Global |
| **Delete** (often **Backspace** on Mac keyboards) | Delete selected QA (with confirmation) | Global |
| **Ctrl/Cmd+K** | Open command palette | Global |
| **?** | Show keyboard shortcuts help | Global |
| **Ctrl/Cmd+Enter** | Submit form | QA Editor — saves the current QA pair |
| **Arrow Up / Down** | Navigate list items | Thread list or QA list — when the list is focused |

### Search

- **Always visible** — the search bar is shown in both thread mode and "All QAs" mode
- **Real-time filtering** — results update as you type with a 400ms debounce
- **Search types** — switch between full-text and tag-based search
- **Sort options** — sort results by date or title

### Smart Tag Suggestions

- Typing in the tag field shows **suggestions from existing tags** across all QA pairs
- Suggestions are sorted by frequency (most-used tags appear first)
- Duplicate tags are automatically excluded from suggestions
- New tags can still be entered freely

### QA Editor Enhancements

- **Auto-title generation** — title is automatically generated from the first 70 characters of the question text
- **Pre-fill metadata** — source, tags, and URL are remembered from your last QA entry (configurable in Settings)
- **URL validation** — invalid URLs are flagged with an error message before saving
- **Auto-focus** — the Question field receives focus automatically when the editor opens

### Dark Mode

- Toggle dark mode from the **moon/sun icon** in the toolbar or from **Settings**


## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+
- **Vue Visual code extensions for debugging .vue files **
- **VueTools in system browser, used for debugging ** 
## Getting Started

When running from the cloned repository follow the steps below. To build native application, currently enabled for Windows only, refer to BUILD.md. 

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm run dev
```

This starts the Vite dev server and launches the Electron window with hot-reload enabled.

By default, the app reads data from the **current working directory**. To use an existing data folder, either:
- Launch from that directory: `cd /path/to/your/data && /path/to/llm-aggregator/npm run dev`
- Or open **Settings** (gear icon) in the app and pick the folder containing your `archive/` and `threads.json`

### Type checking

```bash
npm run typecheck
```

### Run tests

```bash
npm test
```

## Extensions for Visual Code

In addition to standard TypeScript extensions you need to install official Vue VS Code extension to be able to set breakpoints in .vue files 

## Configuration

On first launch, the app creates a `settings.json` file:
- **Development**: in the current working directory
- **Packaged app**: in the OS user-data directory (`~/Library/Application Support/LLM Aggregator` on macOS, `%APPDATA%/LLM Aggregator` on Windows)

```json
{
  "dataDirectory": "/path/to/your/data"
}
```

You can also change this from within the app via the **Settings** dialog (gear icon, top-left).

## Technology Stack

| Component | Technology |
|-----------|-----------|
| UI Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript |
| Desktop Shell | Electron |
| Build Tool | Vite + vite-plugin-electron |
| State Management | Pinia |
| Component Library | PrimeVue 4 (Aura theme) |
| Markdown Rendering | markdown-it + highlight.js |
| Frontmatter Parsing | gray-matter |
| Native Packaging | electron-builder |


### Contribution guidelines 

* For now the project does not have any tests - you are welcome to add some.
* The implementation is currently very primitive and in some respects is not user-friendly - you are welcom to create a PR to improve.

### Who do I talk to? 

* Repo owner or admin - eveselov@hotmail.com
* Contributor - sadovskyvlad@gmail.com 
