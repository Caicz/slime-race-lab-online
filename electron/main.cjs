const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const remoteData = require('../app/scripts/remote-data.js');

const targetOrigin = 'https://zouzou-princess-fan.replit.app';
const liveEndpoints = Object.freeze(['current', 'racers', 'bets']);
const fullEndpoints = Object.freeze([...liveEndpoints, 'sessions', 'my-bets', 'my-stats']);
let sessionCookie = '';

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
    const response = await fetch(new URL(endpoint, targetOrigin), {
        method: options.method || 'GET',
        headers: {
            Accept: 'application/json',
            ...(options.data ? {'Content-Type': 'application/json'} : {}),
            ...(sessionCookie ? {Cookie: sessionCookie} : {})
        },
        body: options.data ? JSON.stringify(options.data) : undefined,
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw new Error(`请求失败，HTTP ${response.status}`);
    return {response, data: await response.json()};
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
    const values = await Promise.all(endpoints.map(name => requestJson(`/api/slime-race/${name}`).then(result => result.data)));
    const raw = Object.fromEntries(endpoints.map((name, index) => [name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), values[index]]));
    return remoteData.normalizeSnapshot({...raw, mode: normalizedMode});
}

ipcMain.handle('slime-remote:login', (event, credentials) => {
    assertTrustedSender(event);
    return loginRemote(credentials);
});
ipcMain.handle('slime-remote:sync', (event, mode) => {
    assertTrustedSender(event);
    return syncRemote(mode);
});
ipcMain.handle('slime-remote:logout', event => {
    assertTrustedSender(event);
    sessionCookie = '';
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
