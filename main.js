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
      contextIsolation: false,
      // Désactiver la sécurité web uniquement en mode développement
      webSecurity: !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
    }
  });

  // Si en mode client, charger directement le fichier index.html
  if (argv.client) {
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
    
    // Ouvrir les outils de développement uniquement en mode développement
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
    
    // Journaliser les erreurs de chargement
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Échec du chargement:', errorDescription);
    });
  } else {
    // Démarrer le serveur et charger depuis localhost
    server = require('./server');
    mainWindow.loadURL('http://localhost:8080');
  }

  // Journaliser les messages de la console du renderer uniquement en mode développement
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.on('console-message', (event, level, message) => {
      console.log('Console Renderer:', message);
    });
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

// Gestion de la fermeture de l'application
app.on('before-quit', () => {
  if (server) {
    server.close();
  }
}); 