const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('slimeRaceRemote', Object.freeze({
    login: credentials => ipcRenderer.invoke('slime-remote:login', credentials),
    autoLogin: () => ipcRenderer.invoke('slime-remote:auto-login'),
    sync: mode => ipcRenderer.invoke('slime-remote:sync', mode),
    placeBets: intents => ipcRenderer.invoke('slime-remote:place-bets', intents),
    claimReward: rewardId => ipcRenderer.invoke('slime-remote:claim-reward', rewardId),
    syncDailyQuest: () => ipcRenderer.invoke('slime-remote:daily-sync'),
    submitDailyRecite: intent => ipcRenderer.invoke('slime-remote:daily-recite', intent),
    autoSubmitDailyRecite: () => ipcRenderer.invoke('slime-remote:daily-auto-recite'),
    completeDailyClick: clickCount => ipcRenderer.invoke('slime-remote:daily-click', clickCount),
    completeDailyTimer: () => ipcRenderer.invoke('slime-remote:daily-timer'),
    testDailyTimerError: () => ipcRenderer.invoke('slime-remote:daily-timer-error-test'),
    claimDailyGameReward: type => ipcRenderer.invoke('slime-remote:daily-claim', type),
    openDailyQuest: () => ipcRenderer.invoke('slime-remote:daily-open'),
    logout: () => ipcRenderer.invoke('slime-remote:logout')
}));
