const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const remoteData = require('../app/scripts/remote-data.js');
const remoteActions = require('../app/scripts/remote-actions.js');

const targetOrigin = 'https://zouzou-princess-fan.replit.app';
const endpointPaths = Object.freeze({
    current: '/api/slime-race/current',
    racers: '/api/slime-race/racers',
    bets: '/api/slime-race/bets',
    pendingRewards: '/api/slime-race/pending-rewards',
    account: '/api/auth/me',
    sessions: '/api/slime-race/sessions',
    myBets: '/api/slime-race/my-bets',
    myStats: '/api/slime-race/my-stats'
});
const liveEndpoints = Object.freeze(['current', 'racers', 'bets', 'pendingRewards', 'account']);
const fullEndpoints = Object.freeze([...liveEndpoints, 'sessions', 'myBets', 'myStats']);
let sessionCookie = '';
let mutationInFlight = false;

const captureArgument = process.argv.find(argument => argument.startsWith('--capture='));
const capturePath = captureArgument ? captureArgument.slice('--capture='.length) : null;
const captureScrollArgument = process.argv.find(argument => argument.startsWith('--capture-scroll='));
const captureScroll = captureScrollArgument ? Math.max(0, Number(captureScrollArgument.slice('--capture-scroll='.length)) || 0) : 0;

function getSessionCookie(response) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    return setCookies.map(value => value.split(';', 1)[0]).join('; ');
}

function assertTrustedSender(event) {
    const senderUrl = event.senderFrame?.url || '';
    if (!senderUrl.startsWith('file://')) throw new Error('拒绝非本地页面调用联网桥接');
}

async function requestJson(endpoint, options = {}) {
    let response;

    try {
        response = await fetch(new URL(endpoint, targetOrigin), {
            method: options.method || 'GET',
            headers: {
                Accept: 'application/json',
                ...(options.data ? {'Content-Type': 'application/json'} : {}),
                ...(sessionCookie ? {Cookie: sessionCookie} : {})
            },
            body: options.data ? JSON.stringify(options.data) : undefined,
            signal: AbortSignal.timeout(10000)
        });
    } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
            throw new Error('远程请求超时；如果刚才正在提交，请先同步核对，禁止立即重复提交');
        }
        throw error;
    }

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }

    if (!response.ok) {
        const message = String(data?.message || data?.error || `请求失败，HTTP ${response.status}`).slice(0, 240);
        throw new Error(message);
    }
    return {response, data};
}

async function loginRemote(credentials) {
    const username = String(credentials?.username || '').trim();
    const password = String(credentials?.password || '');

    if (!username || !password || username.length > 160 || password.length > 512) throw new Error('账号或密码格式无效');
    sessionCookie = '';
    const result = await requestJson('/api/auth/login', {method: 'POST', data: {username, password}});
    sessionCookie = getSessionCookie(result.response);
    if (!sessionCookie) throw new Error('登录成功但没有取得会话');
    return syncRemote('full');
}

async function syncRemote(mode) {
    if (!sessionCookie) throw new Error('请先登录');
    const normalizedMode = mode === 'live' ? 'live' : 'full';
    const endpoints = normalizedMode === 'live' ? liveEndpoints : fullEndpoints;
    const values = await Promise.all(endpoints.map(name => requestJson(endpointPaths[name]).then(result => result.data)));
    const raw = Object.fromEntries(endpoints.map((name, index) => [name, values[index]]));
    return remoteData.normalizeSnapshot({...raw, mode: normalizedMode});
}

async function runMutation(action) {
    if (mutationInFlight) throw new Error('已有远程操作正在提交，请等待同步完成');
    mutationInFlight = true;

    try {
        return await action();
    } finally {
        mutationInFlight = false;
    }
}

async function placeRemoteBet(intent) {
    return runMutation(async () => {
        const preflight = await syncRemote('live');
        const validated = remoteActions.validateBetIntent(preflight, intent);
        await requestJson('/api/slime-race/bet', {
            method: 'POST',
            data: {slimeId: validated.slimeId, amount: validated.amount}
        });
        return syncRemote('full');
    });
}

async function claimRemoteReward(rewardId) {
    return runMutation(async () => {
        const preflight = await syncRemote('live');
        const reward = remoteActions.validateClaimIntent(preflight, rewardId);
        await requestJson('/api/slime-race/claim-reward', {method: 'POST', data: {rewardId: reward.rewardId}});
        return syncRemote('full');
    });
}

ipcMain.handle('slime-remote:login', (event, credentials) => {
    assertTrustedSender(event);
    return loginRemote(credentials);
});
ipcMain.handle('slime-remote:sync', (event, mode) => {
    assertTrustedSender(event);
    return syncRemote(mode);
});
ipcMain.handle('slime-remote:place-bet', (event, intent) => {
    assertTrustedSender(event);
    return placeRemoteBet(intent);
});
ipcMain.handle('slime-remote:claim-reward', (event, rewardId) => {
    assertTrustedSender(event);
    return claimRemoteReward(rewardId);
});
ipcMain.handle('slime-remote:logout', event => {
    assertTrustedSender(event);
    sessionCookie = '';
    mutationInFlight = false;
    return {ok: true};
});

function createWindow() {
    const window = new BrowserWindow({
        width: 1380,
        height: 900,
        minWidth: 980,
        minHeight: 700,
        backgroundColor: '#07111f',
        show: !capturePath,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    window.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

    if (capturePath) {
        window.webContents.once('did-finish-load', async () => {
            try {
                await new Promise(resolve => setTimeout(resolve, 600));
                if (captureScroll > 0) {
                    await window.webContents.executeJavaScript(`window.scrollTo(0, ${captureScroll})`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                const image = await window.webContents.capturePage();
                await fs.writeFile(capturePath, image.toPNG());
            } finally {
                app.quit();
            }
        });
    }
    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
}

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
