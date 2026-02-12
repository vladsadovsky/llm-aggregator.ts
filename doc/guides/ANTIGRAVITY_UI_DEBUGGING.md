# Interactive UI Debugging with AntiGravity

This guide explains how to use AntiGravity to debug and improve the LLM Aggregator UI in real-time.

## 1. Start the Dev Server

Run the following command in your terminal. This starts the Vite dev server with a mock API, allowing the app to run in a regular browser window.

```bash
npm run dev:server
```

## 2. Open AntiGravity Browser

Ask AntiGravity to "Open the app in the browser". It will use its browser tool to navigate to `http://localhost:5173`.

## 3. Interactive Debugging Loop

Once AntiGravity has the browser open, you can:

1. **Comment on fixes**: Describe what you want to change (e.g., "The 'New Q&A' button should be blue").
2. **See them implemented**: AntiGravity will modify the code, and the Vite dev server will hot-reload the changes.
3. **Verify in real-time**: AntiGravity will take a new screenshot or record its actions to show you the result.

### Example Commands:
- "Inspect the sidebar and tell me why the padding looks off."
- "Change the background color of the selected thread to a subtle purple."
- "Add a hover effect to the QA cards."

## Tips
- The application uses **mock data** in this mode, so you don't need to worry about your local files.
- If you notice a logical bug, AntiGravity can also debug the mock API in `src/api-mock.ts`.
