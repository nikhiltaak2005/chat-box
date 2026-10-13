const { app, BrowserWindow, ipcMain, screen, Notification } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let chatWindow;
let petWindow;
let unreadCount = 0;
let petSettings = { avatar: "cat", size: 88, opacity: 100, alwaysOnTop: true, animate: true };
let isQuitting = false;
let updateState = { status: "idle", version: "", percent: 0, message: "Check for updates" };

function publishUpdateState(next) {
  updateState = { ...updateState, ...next };
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.webContents.send("updater:status", updateState);
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => publishUpdateState({ status: "checking", message: "Checking for updates…" }));
  autoUpdater.on("update-available", info => publishUpdateState({ status: "available", version: info.version, percent: 0, message: `Version ${info.version} is available` }));
  autoUpdater.on("update-not-available", info => publishUpdateState({ status: "current", version: info.version || app.getVersion(), percent: 0, message: "You’re using the latest version" }));
  autoUpdater.on("download-progress", progress => publishUpdateState({ status: "downloading", percent: Math.round(progress.percent || 0), message: `Downloading update… ${Math.round(progress.percent || 0)}%` }));
  autoUpdater.on("update-downloaded", info => publishUpdateState({ status: "downloaded", version: info.version, percent: 100, message: `Version ${info.version} is ready to install` }));
  autoUpdater.on("error", err => {
    console.error("[updater]", err);
    publishUpdateState({ status: "error", message: err?.message || "Update check failed" });
  });
  setTimeout(() => autoUpdater.checkForUpdates().catch(err => console.error("[updater] startup check failed", err)), 8000);
}

function sendChatVisibility(visible) {
  if (!chatWindow || chatWindow.isDestroyed()) return;
  chatWindow.webContents.send("chat:visibility", Boolean(visible));
}

function hideChat() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    sendChatVisibility(false);
    chatWindow.hide();
  }
  if (petWindow && !petWindow.isDestroyed()) petWindow.show();
}

function showChat() {
  if (!chatWindow || chatWindow.isDestroyed()) createChatWindow();
  if (!chatWindow) return;
  petWindow?.hide();
  chatWindow.show();
  chatWindow.focus();
  sendChatVisibility(true);
}

function setUnreadCount(count) {
  unreadCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:unread-count", unreadCount);
  }
}

function createPetWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    width: petSettings.size + 16, height: petSettings.size + 32,
    x: area.x + area.width - petSettings.size - 26, y: area.y + area.height - petSettings.size - 44,
    frame: false, transparent: true, alwaysOnTop: petSettings.alwaysOnTop, resizable: false,
    movable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  petWindow.loadFile(path.join(__dirname, "pet.html"));
  petWindow.once("ready-to-show", () => petWindow.show());
  petWindow.on("closed", () => { petWindow = null; });
}

function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 380, height: 610, minWidth: 320, minHeight: 420,
    frame: false, transparent: false, alwaysOnTop: true, resizable: true,
    maximizable: false, autoHideMenuBar: true, backgroundColor: "#111318",
    title: "PocketChat", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (!app.isPackaged) chatWindow.loadURL("http://127.0.0.1:5173");
  else chatWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  chatWindow.on("blur", () => {
    // Clicking anywhere outside the chat returns the user to the floating pet.
    if (!isQuitting) hideChat();
  });
  chatWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideChat();
    }
  });
  chatWindow.on("show", () => sendChatVisibility(true));
  chatWindow.on("hide", () => sendChatVisibility(false));
  chatWindow.on("closed", () => { chatWindow = null; });
}

app.whenReady().then(() => {
  createPetWindow();
  createChatWindow();
  configureAutoUpdater();
});
app.on("before-quit", () => { isQuitting = true; });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.on("window:minimize", hideChat);
ipcMain.on("window:close", hideChat);
ipcMain.on("window:quit", () => app.quit());
ipcMain.on("window:toggle-top", (_event, enabled) => chatWindow?.setAlwaysOnTop(Boolean(enabled)));
ipcMain.on("pet:move", (_event, x, y) => {
  if (!petWindow || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const area = screen.getDisplayMatching(petWindow.getBounds()).workArea;
  const width = petSettings.size + 16, height = petSettings.size + 32;
  const nx = Math.max(area.x, Math.min(Math.round(x), area.x + area.width - width));
  const ny = Math.max(area.y, Math.min(Math.round(y), area.y + area.height - height));
  petWindow.setPosition(nx, ny);
});
ipcMain.on("pet:settings", (_event, settings = {}) => {
  const avatars = ["cat", "fox", "dog", "panda", "rabbit", "robot", "ghost", "frog"];
  const size = Number(settings.size);
  const opacity = Number(settings.opacity);
  petSettings = {
    avatar: avatars.includes(settings.avatar) ? settings.avatar : "cat",
    size: Number.isFinite(size) ? Math.max(64, Math.min(144, Math.round(size / 8) * 8)) : 88,
    opacity: Number.isFinite(opacity) ? Math.max(40, Math.min(100, opacity)) : 100,
    alwaysOnTop: settings.alwaysOnTop !== false,
    animate: settings.animate !== false
  };
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setSize(petSettings.size + 16, petSettings.size + 32);
    petWindow.setOpacity(petSettings.opacity / 100);
    petWindow.setAlwaysOnTop(petSettings.alwaysOnTop);
    petWindow.webContents.send("pet:settings", petSettings);
  }
});
ipcMain.on("app:set-launch-at-startup", (_event, enabled) => {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
});
ipcMain.on("pet:open-chat", showChat);
ipcMain.on("notification:incoming", (_event, body, options = {}) => {
  // The badge is driven by the server's unread:count event, never incremented locally.
  if (chatWindow && chatWindow.isVisible()) return;
  if (Notification.isSupported()) {
    new Notification({
      title: "PocketChat",
      body: typeof body === "string" && body ? body.slice(0, 180) : "You received a new message.",
      silent: options?.sound === false
    }).show();
  }
});
ipcMain.on("unread:set-count", (_event, count) => setUnreadCount(count));
ipcMain.on("pet:ready", () => {
  petWindow?.webContents.send("pet:unread-count", unreadCount);
  petWindow?.webContents.send("pet:settings", petSettings);
});
ipcMain.handle("app:platform", () => process.platform);


ipcMain.handle("updater:get-status", () => updateState);
ipcMain.handle("updater:check", async () => {
  if (!app.isPackaged) return { ...updateState, status: "dev", message: "Updates are available in the installed app." };
  try {
    await autoUpdater.checkForUpdates();
    return updateState;
  } catch (err) {
    publishUpdateState({ status: "error", message: err?.message || "Could not check for updates" });
    return updateState;
  }
});
ipcMain.handle("updater:download", async () => {
  if (!app.isPackaged) return updateState;
  try { await autoUpdater.downloadUpdate(); return updateState; }
  catch (err) { publishUpdateState({ status: "error", message: err?.message || "Could not download update" }); return updateState; }
});
ipcMain.handle("updater:install", () => {
  if (updateState.status === "downloaded") { isQuitting = true; autoUpdater.quitAndInstall(false, true); return true; }
  return false;
});
