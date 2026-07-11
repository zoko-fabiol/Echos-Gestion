const { contextBridge } = require('electron');

const { ipcRenderer } = require('electron');

// Expose safe APIs to renderer context
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  loginWithMicrosoft: () => ipcRenderer.invoke('microsoft-login')
});
