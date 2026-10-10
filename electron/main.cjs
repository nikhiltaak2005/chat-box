const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let win;
function createWindow() {
  win = new BrowserWindow({
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
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (!app.isPackaged) win.loadURL("http://127.0.0.1:5173");
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
ipcMain.on("window:minimize", () => win?.minimize());
ipcMain.on("window:close", () => win?.hide());
ipcMain.on("window:toggle-top", (_event, enabled) => win?.setAlwaysOnTop(Boolean(enabled)));
ipcMain.handle("app:platform", () => process.platform);
