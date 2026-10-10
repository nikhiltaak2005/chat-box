const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  minimize: () => ipcRenderer.send("window:minimize"),
  hide: () => ipcRenderer.send("window:close"),
  setAlwaysOnTop: (enabled) => ipcRenderer.send("window:toggle-top", enabled),
  openChat: () => ipcRenderer.send("pet:open-chat"),
  movePet: (x, y) => ipcRenderer.send("pet:move", x, y),
  notifyIncoming: () => ipcRenderer.send("notification:incoming"),
  onUnreadCount: (callback) => {
    const listener = (_event, count) => callback(count);
    ipcRenderer.on("pet:unread-count", listener);
    ipcRenderer.send("pet:ready");
    return () => ipcRenderer.removeListener("pet:unread-count", listener);
  },
  platform: () => ipcRenderer.invoke("app:platform")
});
