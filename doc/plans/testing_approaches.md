# Testing Approaches & Automation Strategy

This document outlines the strategy for automating testing across all layers of the LLM Aggregator project. The goal is to establish a robust regression testing procedure that minimizes manual effort and ensures reliability, security, and visual consistency.

---

## 1. UI Functionality (E2E Testing)

**Objective:** Verify that the application behaves correctly from a user's perspective, including navigation, thread management, and QA operations.

### Recommended Tool: **Playwright**

Playwright provides excellent support for testing Electron applications and allows for cross-platform automation.

**Key Implementation Areas:**

- **Navigation:** Test switching between "All QAs" and individual threads.
- **CRUD Operations:** Automate creating, editing, and deleting threads and QAs.
- **Search:** Verify real-time search results and debouncing logic.
- **Global Actions:** Test keyboard shortcuts (Ctrl+F, Ctrl+N, etc.) in a real desktop environment.
- **Multi-window/Modals:** Ensure settings and command palette overlays behave correctly.

---

## 2. UI Rendering (Visual Regression)

**Objective:** Detect unintended visual changes, layout shifts, or CSS regressions across updates.

### Recommended Tool: **Playwright Visual Comparisons**

Playwright's built-in `toHaveScreenshot()` method allows for pixel-to-pixel comparison of the rendered UI against baseline images.

**Key Implementation Areas:**

- **Component Snapshots:** Capture screenshots of complex components like `QAContentPanel` or the `ThreadsPanel`.
- **Theme Testing:** Automatically verify that switching between Light and Dark modes preserves readability and styling.
- **Responsive Layout:** Verify the layout remains stable at different window sizes (minWidth/minHeight).

---

## 3. Input Functions (Unit & Integration Testing)

**Objective:** Ensure that individual utility functions, store logic, and component logic work correctly in isolation.

### Recommended Tool: **Vitest + Vue Test Utils**

The project already includes `vitest`. We should leverage it for fast, Vite-native unit testing.

**Key Implementation Areas:**

- **Store Logic:** Test `qaStore.ts` and `threadStore.ts` for correct state transitions and IPC call handling.
- **Utility Functions:** Test auto-title generation, markdown stripping, and URL validation logic.
- **Component Logic:** Use `Vue Test Utils` to test isolated component behavior without launching the full Electron app.

---

## 4. Fundamentals (Stability & Security)

**Objective:** Ensure the application remains stable under load, recovers from errors gracefully, and follows security best practices.

### Stability

- **Stress Testing:** Use Playwright to automate rapid creation/deletion of hundreds of QAs to check for memory leaks or performance degradation.
- **Error Recovery:** Mock IPC failures or network timeouts (e.g., using Playwright's network interception) to verify that the UI shows appropriate error toasts instead of crashing.
- **IPC Validation:** Ensure `electron/ipc/handlers.ts` has robust input validation for all messages coming from the renderer.

### Security

- **Static Analysis:**
  - `npm audit`: Regularly run to identify and patch vulnerable dependencies.
  - `eslint-plugin-security`: Integrate into the linting pipeline to catch common security pitfalls early.
- **Electron Best Practices:**
  - **Context Isolation:** Already enabled in `main.ts`. Maintain this boundary.
  - **CSP (Content Security Policy):** Implement a strict CSP in `index.html` to prevent XSS attacks.
  - **Sandbox:** Ensure the renderer process is sandboxed whenever possible.

---

## 5. Automated Regression Procedure

To minimize regression defects, the following testing pipeline is proposed:

1.  **Pre-commit Hook:** Run `npm run lint` and `npm run test` (Vitest) to catch immediate functional issues and type errors.
2.  **Pull Request (CI):**
    - Automated `npm audit`.
    - Build the application for all target platforms (Linux, macOS, Windows).
    - Run the full E2E suite via Playwright in a headless environment.
    - Run Visual Regression tests against baselines.
3.  **Release Gate:**
    - Manual smoketest of the production build (`npm run electron:prod`) on actual OS environments before tagging a release.

---

## 6. Implementation Roadmap

1.  **Phase 1: Foundation (Weeks 1-2)**
    - Initialize Playwright configuration for Electron.
    - Setup baseline unit tests for `uiStore` and title generation logic.
2.  **Phase 2: Core E2E (Weeks 3-4)**
    - Implement E2E tests for the most common user flows (Create/Search/Delete).
    - Initialize visual regression baselines for core screens.
3.  **Phase 3: Security & Polish (Weeks 5-6)**
    - Implement IPC input validation.
    - Setup automated CSP headers and security linting.
