"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const matter = require("gray-matter");
const SETTINGS_FILENAME = "settings.json";
function getSettingsPath() {
  if (electron.app.isPackaged) {
    return path.join(electron.app.getPath("userData"), SETTINGS_FILENAME);
  }
  return path.join(process.cwd(), SETTINGS_FILENAME);
}
function getDefaultDataDir() {
  return process.cwd();
}
function loadSettings() {
  const filepath = getSettingsPath();
  const defaults = {
    dataDirectory: getDefaultDataDir()
  };
  if (!fs.existsSync(filepath)) {
    return defaults;
  }
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      ...defaults,
      ...parsed
    };
  } catch (err) {
    console.error("Failed to load settings, using defaults:", err);
    return defaults;
  }
}
function saveSettings(settings) {
  const filepath = getSettingsPath();
  const dir = path.join(filepath, "..");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(settings, null, 2), "utf-8");
}
function getDataDirectory() {
  return loadSettings().dataDirectory;
}
function getDataDir() {
  return getDataDirectory();
}
function getThreadsPath() {
  return path.join(getDataDir(), "threads.json");
}
function loadThreads() {
  const filepath = getThreadsPath();
  if (!fs.existsSync(filepath)) {
    return {};
  }
  const content = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(content);
}
function saveThreads(threads) {
  const filepath = getThreadsPath();
  const dir = path.join(getDataDir());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(threads, null, 2), "utf-8");
}
function getArchiveDir() {
  const dir = path.join(getDataDir(), "archive");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function parseQAFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const { data: metadata, content: body } = matter(content);
    const qMatch = body.match(/##?\s*Question\s*\n([\s\S]*?)(?=##?\s*Answer|\s*$)/);
    const aMatch = body.match(/##?\s*Answer\s*\n([\s\S]*)/);
    const question = qMatch ? qMatch[1].trim() : "";
    const answer = aMatch ? aMatch[1].trim() : body.trim();
    return {
      id: metadata.id || filepath.replace(/\.md$/, ""),
      filepath,
      title: metadata.title || "Untitled",
      source: metadata.source || "unknown",
      url: metadata.url || "",
      tags: metadata.tags || [],
      timestamp: metadata.timestamp || "",
      version: metadata.version || 0,
      threadPairs: metadata.thread_pairs || [],
      question,
      answer
    };
  } catch (err) {
    console.error(`Error parsing ${filepath}:`, err);
    return null;
  }
}
function listAllPairs() {
  const dir = getArchiveDir();
  const result = {};
  const files = fs.readdirSync(dir).filter((f) => path.extname(f) === ".md");
  for (const file of files) {
    const filepath = path.join(dir, file);
    const pair = parseQAFile(filepath);
    if (pair) {
      result[pair.id] = pair;
    }
  }
  return result;
}
function getPair(id) {
  const dir = getArchiveDir();
  const files = fs.readdirSync(dir).filter((f) => path.extname(f) === ".md");
  for (const file of files) {
    const filepath = path.join(dir, file);
    const pair = parseQAFile(filepath);
    if (pair && pair.id === id) {
      return pair;
    }
  }
  return null;
}
function createPair(data) {
  const dir = getArchiveDir();
  const now = /* @__PURE__ */ new Date();
  const id = formatTimestamp(now);
  const firstWords = data.question.substring(0, 50).replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").substring(0, 30);
  const sourceStr = data.source || "unknown";
  const filename = `${id}_00_${sourceStr}_${firstWords}.md`;
  const filepath = path.join(dir, filename);
  const metadata = {
    id,
    title: data.title,
    timestamp: now.toISOString(),
    source: data.source,
    url: data.url,
    tags: data.tags,
    version: 0,
    thread_pairs: []
  };
  const content = matter.stringify(
    `
## Question
${data.question}

## Answer
${data.answer}
`,
    metadata
  );
  fs.writeFileSync(filepath, content, "utf-8");
  return {
    id,
    filepath,
    title: data.title,
    source: data.source,
    url: data.url,
    tags: data.tags,
    timestamp: now.toISOString(),
    version: 0,
    threadPairs: [],
    question: data.question,
    answer: data.answer
  };
}
function updatePair(id, data) {
  const pair = getPair(id);
  if (!pair) return null;
  const updatedPair = { ...pair, ...data };
  const newVersion = pair.version + 1;
  const metadata = {
    id: pair.id,
    title: updatedPair.title,
    timestamp: pair.timestamp,
    source: updatedPair.source,
    url: updatedPair.url,
    tags: updatedPair.tags,
    version: newVersion,
    thread_pairs: pair.threadPairs
  };
  const content = matter.stringify(
    `
## Question
${updatedPair.question}

## Answer
${updatedPair.answer}
`,
    metadata
  );
  fs.writeFileSync(pair.filepath, content, "utf-8");
  return { ...updatedPair, version: newVersion };
}
function deletePair(id) {
  const pair = getPair(id);
  if (pair && fs.existsSync(pair.filepath)) {
    fs.unlinkSync(pair.filepath);
  }
}
function formatTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}_${h}${min}`;
}
function search(query, type) {
  const pairs = listAllPairs();
  const lowerQuery = query.toLowerCase();
  const results = [];
  for (const [id, pair] of Object.entries(pairs)) {
    if (type === "tags") {
      const matchesTags = pair.tags.some(
        (tag) => tag.toLowerCase().includes(lowerQuery)
      );
      if (matchesTags) {
        results.push(id);
      }
    } else {
      const text = `${pair.title} ${pair.question} ${pair.answer}`.toLowerCase();
      if (text.includes(lowerQuery)) {
        results.push(id);
      }
    }
  }
  return results;
}
function registerIpcHandlers() {
  electron.ipcMain.handle("settings:load", async () => {
    return loadSettings();
  });
  electron.ipcMain.handle("settings:save", async (_event, settings) => {
    saveSettings(settings);
  });
  electron.ipcMain.handle("settings:pickDirectory", async () => {
    const win = electron.BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Data Directory",
      message: "Choose the folder containing your archive/ and threads.json"
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle("threads:load", async () => {
    return loadThreads();
  });
  electron.ipcMain.handle("threads:save", async (_event, threads) => {
    saveThreads(threads);
  });
  electron.ipcMain.handle("qa:listAll", async () => {
    return listAllPairs();
  });
  electron.ipcMain.handle("qa:get", async (_event, id) => {
    return getPair(id);
  });
  electron.ipcMain.handle("qa:create", async (_event, data) => {
    return createPair(data);
  });
  electron.ipcMain.handle("qa:update", async (_event, id, data) => {
    return updatePair(id, data);
  });
  electron.ipcMain.handle("qa:delete", async (_event, id) => {
    return deletePair(id);
  });
  electron.ipcMain.handle("search:query", async (_event, query, type) => {
    return search(query, type);
  });
}
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "LLM Aggregator",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
