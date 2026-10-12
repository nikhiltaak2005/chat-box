const { app, BrowserWindow, ipcMain, screen, Notification } = require("electron");
const path = require("path");

let chatWindow;
let petWindow;
let unreadCount = 0;
let isQuitting = false;

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
    width: 104, height: 120,
    x: area.x + area.width - 118, y: area.y + area.height - 138,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
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
  const nx = Math.max(area.x, Math.min(Math.round(x), area.x + area.width - 104));
  const ny = Math.max(area.y, Math.min(Math.round(y), area.y + area.height - 120));
  petWindow.setPosition(nx, ny);
});
ipcMain.on("pet:open-chat", showChat);
ipcMain.on("notification:incoming", (_event, body) => {
  // The badge is driven by the server's unread:count event, never incremented locally.
  if (chatWindow && chatWindow.isVisible()) return;
  if (Notification.isSupported()) {
    new Notification({ title: "PocketChat", body: typeof body === "string" && body ? body.slice(0, 180) : "You received a new message." }).show();
  }
});
ipcMain.on("unread:set-count", (_event, count) => setUnreadCount(count));
ipcMain.on("pet:ready", () => petWindow?.webContents.send("pet:unread-count", unreadCount));
ipcMain.handle("app:platform", () => process.platform);
