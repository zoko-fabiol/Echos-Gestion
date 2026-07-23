const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: "Echo Gestion",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Autoriser les fenêtres popups pour l'authentification Microsoft & Firebase
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.includes('login.microsoftonline.com') ||
      url.includes('echo-gestion-d2fd2.firebaseapp.com') ||
      url.includes('microsoft.com') ||
      url.includes('live.com') ||
      url.includes('microsoftonline.com')
    ) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          width: 600,
          height: 720,
          center: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        }
      };
    }
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handler IPC pour la connexion Microsoft dans Electron
ipcMain.handle('microsoft-login', async () => {
  return new Promise((resolve) => {
    const tenantId = "d64f809a-e0da-4724-abb6-6f2aac3bdef9";
    const redirectUri = encodeURIComponent("https://echo-gestion-d2fd2.firebaseapp.com/__/auth/handler");
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=1:959654285593:web:8920fd9218b866150d3588&response_type=id_token+token&redirect_uri=${redirectUri}&scope=openid+email+profile+User.Read&response_mode=fragment&prompt=select_account`;

    const authWindow = new BrowserWindow({
      width: 600,
      height: 720,
      show: true,
      autoHideMenuBar: true,
      title: "Connexion Microsoft - Echo Gestion",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    authWindow.loadURL(authUrl);

    let resolved = false;

    const handleUrlChange = (newUrl) => {
      if (newUrl.includes('id_token=') || newUrl.includes('access_token=')) {
        resolved = true;
        const hash = newUrl.split('#')[1] || '';
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');
        const accessToken = params.get('access_token');
        resolve({ idToken, accessToken });
        authWindow.close();
      }
    };

    authWindow.webContents.on('will-navigate', (_, url) => handleUrlChange(url));
    authWindow.webContents.on('did-redirect-navigation', (_, url) => handleUrlChange(url));

    authWindow.on('closed', () => {
      if (!resolved) {
        resolve({ error: 'La fenêtre de connexion Microsoft a été fermée.' });
      }
    });
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
