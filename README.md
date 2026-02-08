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


## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+

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

