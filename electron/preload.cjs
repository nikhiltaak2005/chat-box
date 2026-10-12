const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  minimize: () => ipcRenderer.send("window:minimize"),
  hide: () => ipcRenderer.send("window:close"),
  quit: () => ipcRenderer.send("window:quit"),
  setAlwaysOnTop: (enabled) => ipcRenderer.send("window:toggle-top", enabled),
  openChat: () => ipcRenderer.send("pet:open-chat"),
  movePet: (x, y) => ipcRenderer.send("pet:move", x, y),
  notifyIncoming: (body) => ipcRenderer.send("notification:incoming", body),
  setUnreadCount: (count) => ipcRenderer.send("unread:set-count", count),
  onUnreadCount: (callback) => {
    const listener = (_event, count) => callback(count);
    ipcRenderer.on("pet:unread-count", listener);
    ipcRenderer.send("pet:ready");
    return () => ipcRenderer.removeListener("pet:unread-count", listener);
  },
  onChatVisibility: (callback) => {
    const listener = (_event, visible) => callback(Boolean(visible));
    ipcRenderer.on("chat:visibility", listener);
    return () => ipcRenderer.removeListener("chat:visibility", listener);
  },
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
  getUpdateStatus: () => ipcRenderer.invoke("updater:get-status"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
  platform: () => ipcRenderer.invoke("app:platform")
});
