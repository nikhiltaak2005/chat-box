const { app, BrowserWindow, ipcMain, screen, Notification } = require("electron");
const path = require("path");

let chatWindow;
let petWindow;
let unreadCount = 0;
let isQuitting = false;

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
    title: "Personal Messenger", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (!app.isPackaged) chatWindow.loadURL("http://127.0.0.1:5173");
  else chatWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  chatWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      chatWindow.hide();
      petWindow?.show();
    }
  });
  chatWindow.on("closed", () => { chatWindow = null; });
}

app.whenReady().then(() => {
  createPetWindow();
  createChatWindow();
});
app.on("before-quit", () => { isQuitting = true; });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.on("window:minimize", () => { chatWindow?.hide(); petWindow?.show(); });
ipcMain.on("window:close", () => { chatWindow?.hide(); petWindow?.show(); });
ipcMain.on("window:toggle-top", (_event, enabled) => chatWindow?.setAlwaysOnTop(Boolean(enabled)));
ipcMain.on("pet:move", (_event, x, y) => {
  if (!petWindow || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const area = screen.getDisplayMatching(petWindow.getBounds()).workArea;
  const nx = Math.max(area.x, Math.min(Math.round(x), area.x + area.width - 104));
  const ny = Math.max(area.y, Math.min(Math.round(y), area.y + area.height - 120));
  petWindow.setPosition(nx, ny);
});
ipcMain.on("pet:open-chat", () => {
  if (!chatWindow) createChatWindow();
  const bounds = petWindow?.getBounds();
  if (bounds) {
    const display = screen.getDisplayMatching(bounds).workArea;
    const x = Math.max(display.x, Math.min(bounds.x + 100 - 380, display.x + display.width - 380));
    const y = Math.max(display.y, Math.min(bounds.y + 20 - 40, display.y + display.height - 610));
    chatWindow.setPosition(x, y);
  }
  petWindow?.hide();
  chatWindow.show();
  chatWindow.focus();
  unreadCount = 0;
  petWindow?.webContents.send("pet:unread-count", unreadCount);
});
ipcMain.on("notification:incoming", () => {
  unreadCount += 1;
  petWindow?.webContents.send("pet:unread-count", unreadCount);
  if (Notification.isSupported()) new Notification({ title: "PocketChat", body: "You received a new message." }).show();
});
ipcMain.on("pet:ready", () => petWindow?.webContents.send("pet:unread-count", unreadCount));
ipcMain.handle("app:platform", () => process.platform);
