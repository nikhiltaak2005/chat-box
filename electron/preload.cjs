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
  platform: () => ipcRenderer.invoke("app:platform")
});
