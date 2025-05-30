const { app, BrowserWindow } = require('electron');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;

let mainWindow;
let server;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // If running in client mode, load the index.html directly
  if (argv.client) {
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    // Start the server and load from localhost
    server = require('./server');
    mainWindow.loadURL('http://localhost:8080');
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle app quit
app.on('before-quit', () => {
  if (server) {
    server.close();
  }
}); 