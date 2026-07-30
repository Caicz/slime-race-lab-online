const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('slimeRaceRemote', Object.freeze({
    login: credentials => ipcRenderer.invoke('slime-remote:login', credentials),
    sync: mode => ipcRenderer.invoke('slime-remote:sync', mode),
    placeBets: intents => ipcRenderer.invoke('slime-remote:place-bets', intents),
    claimReward: rewardId => ipcRenderer.invoke('slime-remote:claim-reward', rewardId),
    logout: () => ipcRenderer.invoke('slime-remote:logout')
}));
