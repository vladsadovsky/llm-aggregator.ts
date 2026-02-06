"use strict";
const electron = require("electron");
const api = {
  // Settings
  settingsLoad: () => electron.ipcRenderer.invoke("settings:load"),
  settingsSave: (settings) => electron.ipcRenderer.invoke("settings:save", settings),
  settingsPickDirectory: () => electron.ipcRenderer.invoke("settings:pickDirectory"),
  // Threads
  threadsLoad: () => electron.ipcRenderer.invoke("threads:load"),
  threadsSave: (threads) => electron.ipcRenderer.invoke("threads:save", threads),
  // QA Pairs
  qaListAll: () => electron.ipcRenderer.invoke("qa:listAll"),
  qaGet: (id) => electron.ipcRenderer.invoke("qa:get", id),
  qaCreate: (data) => electron.ipcRenderer.invoke("qa:create", data),
  qaUpdate: (id, data) => electron.ipcRenderer.invoke("qa:update", id, data),
  qaDelete: (id) => electron.ipcRenderer.invoke("qa:delete", id),
  // Search
  searchQuery: (query, type) => electron.ipcRenderer.invoke("search:query", query, type)
};
electron.contextBridge.exposeInMainWorld("api", api);
