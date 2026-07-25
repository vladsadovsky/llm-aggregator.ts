# Export Targets Feasibility Research

Date: 2026-07-24
Scope: research only (no design or implementation)
Focus: feasibility of exporting archive content to OneNote, Apple Notes, Notion, and Gemini Notebook (formerly NotebookLM), with priority on Gemini Notebook.

## Executive Summary

- Notion: high feasibility for direct programmatic export.
- OneNote: high feasibility for direct programmatic export.
- Apple Notes: low to medium feasibility for robust cross-platform direct export.
- Gemini Notebook: medium feasibility overall, primarily via indirect ingestion paths; no clear public Notebook-specific write API found.

## Feasibility Matrix

| Target | Direct API feasibility | Indirect feasibility | Notes |
|---|---|---|---|
| Notion | High | High | Well-documented page/content APIs, suitable for deterministic export flows. |
| OneNote | High | Medium | Microsoft Graph supports page creation with HTML/multipart payloads. |
| Apple Notes | Low | Medium | No broad public cloud REST surface identified; local automation paths exist but are fragile. |
| Gemini Notebook | Low (direct) | High (indirect) | Source ingestion is strong; practical route is Drive/Docs/files/URLs ingestion, not notebook write API. |

## Platform Findings

## 1) Notion

### What was verified

- Public API docs describe programmatic page creation and content insertion.
- API shape is well-suited for exported documents and structured blocks.

### Practical implication

- Export into Notion is feasible as a direct integration with strong predictability.

## 2) OneNote

### What was verified

- Microsoft Graph OneNote documentation supports creating pages in sections.
- Content submission is supported with HTML/multipart patterns.

### Practical implication

- Direct export is feasible, with standard Graph auth/permission requirements.

## 3) Apple Notes

### What was verified

- Apple user-facing Notes docs cover usage/import behavior, but not a broad third-party cloud REST API.
- Apple automation guidance indicates UI scripting and accessibility-driven automation are possible when app-level permissions are granted.

### Practical implication

- Feasible paths are mostly local/macOS automation (Shortcuts/AppleScript/UI scripting), with operational fragility and permission friction.

## 4) Gemini Notebook (formerly NotebookLM)

### Product/API availability findings

- Public API discovery lookup did not show a Gemini Notebook or NotebookLM-specific public API entry.
- Discovery matches returned only Google Cloud Notebooks APIs (infrastructure notebooks), which are unrelated to Gemini Notebook product export.

### Source ingestion capabilities (verified)

Gemini Notebook supports adding sources from:

- Google Docs, Slides, Sheets (via Drive)
- URLs
- Markdown, TXT, PDF, DOCX, PPTX, CSV, ePub
- Audio files
- YouTube URLs (with transcript/caption constraints)

### Source limits and constraints (verified)

- Per-source limit: up to 500,000 words or up to 200 MB uploaded file size.
- Free-tier source count: up to 50 sources.
- Drive-backed source sync: updates can appear after a short delay.
- URL ingestion caveat: text scraping only.
- Paywalled content caveat: unsupported.
- Google-file caveat: certain elements (such as comments/footnotes) may not import.

### Practical implication

- Direct notebook API export is not currently evidenced by public docs.
- Indirect export is feasible and strong through source handoff workflows:
  - create/update Google Docs,
  - upload supported files to Drive,
  - provide source URLs for ingestion.

## Confidence and Unknowns

## High confidence

- Notion and OneNote direct integration feasibility.
- Gemini Notebook ingestion capabilities and source limits.

## Medium confidence

- Long-term stability of Gemini Notebook ingestion-driven workflows, due to fast-evolving product surface and naming transitions.

## Key unknown

- Whether Google will publish a dedicated Gemini Notebook/NotebookLM write API in the future.

## Risks and Constraints

- Product evolution risk: NotebookLM to Gemini Notebook transition indicates active changes.
- Integration-mode risk: ingestion-driven paths are less contract-stable than explicit APIs.
- Data fidelity risk: parsing/format constraints can affect complex formatting and very large archives.

## Sources Consulted

## Gemini Notebook / Google

- https://support.google.com/gemininotebook/answer/16215270
- https://support.google.com/gemininotebook/answer/16164461
- https://support.google.com/gemininotebook/answer/17003757
- https://www.googleapis.com/discovery/v1/apis
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/create
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://ai.google.dev/

## Notion

- https://developers.notion.com/reference/intro
- https://developers.notion.com/reference/post-page

## OneNote

- https://learn.microsoft.com/en-us/graph/integrate-with-onenote
- https://learn.microsoft.com/en-us/graph/api/section-post-pages

## Apple Notes / Automation

- https://support.apple.com/guide/notes/import-and-export-notes-apd4b2161e74/mac
- https://support.apple.com/guide/shortcuts-mac/welcome/mac
- https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/AutomatetheUserInterface.html

## Appendix: API Discovery Verification Snippet

Executed query against Google API discovery directory:

- Search terms: notebook, gemini, notebooklm, gemininotebook
- Returned items:
  - notebooks:v1 (Google Cloud Notebooks API)
  - notebooks:v2 (Google Cloud Notebooks API)

Interpretation: no explicit public Gemini Notebook/NotebookLM API listing was found in the public discovery index at research time.
