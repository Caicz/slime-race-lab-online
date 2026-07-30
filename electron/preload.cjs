const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('slimeRaceRemote', Object.freeze({
    login: credentials => ipcRenderer.invoke('slime-remote:login', credentials),
    sync: mode => ipcRenderer.invoke('slime-remote:sync', mode),
    logout: () => ipcRenderer.invoke('slime-remote:logout')
}));
