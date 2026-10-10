const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

let chatWindow;
let petWindow;
let unreadCount = 0;

function petPage() {
  return path.join(__dirname, "pet.html");
}

function createPetWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    width: 104,
    height: 120,
    x: area.x + area.width - 118,
    y: area.y + area.height - 138,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  petWindow.loadFile(petPage());
  petWindow.once("ready-to-show", () => petWindow.show());
  petWindow.on("closed", () => { petWindow = null; });
}

function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 380,
    height: 610,
    minWidth: 320,
    minHeight: 420,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: "#111318",
    title: "Personal Messenger",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (!app.isPackaged) chatWindow.loadURL("http://127.0.0.1:5173");
  else chatWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  chatWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      chatWindow.hide();
      petWindow?.show();
    }
  });
  chatWindow.on("closed", () => { chatWindow = null; });
}

app.whenReady().then(() => {
  createChatWindow();
  createPetWindow();
});
app.on("before-quit", () => { app.isQuitting = true; });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.on("window:minimize", () => { chatWindow?.hide(); petWindow?.show(); });
ipcMain.on("window:close", () => { chatWindow?.hide(); petWindow?.show(); });
ipcMain.on("window:toggle-top", (_event, enabled) => {
  chatWindow?.setAlwaysOnTop(Boolean(enabled));
  petWindow?.setAlwaysOnTop(true);
});
ipcMain.on("pet:open-chat", () => {
  if (!chatWindow) createChatWindow();
  chatWindow.show();
  chatWindow.focus();
  petWindow?.show();
  unreadCount = 0;
  petWindow?.webContents.send("pet:unread-count", unreadCount);
});
ipcMain.on("notification:incoming", () => {
  unreadCount += 1;
  petWindow?.webContents.send("pet:unread-count", unreadCount);
  if (NotificationIsAvailable()) {
    new (require("electron").Notification)({
      title: "PocketChat",
      body: "You received a new message."
    }).show();
  }
});
ipcMain.on("pet:ready", () => petWindow?.webContents.send("pet:unread-count", unreadCount));
ipcMain.handle("app:platform", () => process.platform);

function NotificationIsAvailable() {
  return process.platform === "win32" || process.platform === "darwin" || process.platform === "linux";
}
