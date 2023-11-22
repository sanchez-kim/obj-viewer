const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs").promises;
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1800,
    height: 1000,
    icon: path.join(__dirname, "public/insighter.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(createWindow);

ipcMain.handle("open-directory-dialog", async (event) => {
  const mainWindow = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled) {
    return [];
  } else {
    return result.filePaths;
  }
});

ipcMain.handle('load-obj-files', async (event, directory) => {
  try {
      const files = await fs.readdir(directory);
      const objFiles = files.filter(file => path.extname(file).toLowerCase() === '.obj')
      .map(file => path.join(directory, file));
      return objFiles;
  } catch (error) {
      console.error("Error reading directory:", error);
      return [];
  }
});
