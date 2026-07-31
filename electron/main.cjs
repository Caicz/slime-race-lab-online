const {app, BrowserWindow, ipcMain, shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const remoteData = require('../app/scripts/remote-data.js');
const remoteActions = require('../app/scripts/remote-actions.js');
const dailyQuest = require('../app/scripts/daily-quest.js');
const requestPolicy = require('../app/scripts/request-policy.js');

const targetOrigin = 'https://zouzou-princess-fan.replit.app';
const localEnvPath = path.join(__dirname, '..', '.env.slime-race.local');
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
const dailyEndpointPaths = Object.freeze({progress: '/api/quest/progress', text: '/api/quest/text'});
let sessionCookie = '';
let mutationInFlight = false;
let cachedRemoteRacers = null;

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

function parseLocalEnv(text) {
    const values = {};

    text.split(/\r?\n/).forEach(line => {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) return;
        let value = match[2].trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        values[match[1]] = value;
    });

    return values;
}

async function readLocalCredentials() {
    let stat;
    let text;

    try {
        [stat, text] = await Promise.all([fs.stat(localEnvPath), fs.readFile(localEnvPath, 'utf8')]);
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }

    if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) throw new Error('本地凭据文件权限必须为 600');
    const env = parseLocalEnv(text);
    const username = String(env.SLIME_RACE_USERNAME || '').trim();
    const password = String(env.SLIME_RACE_PASSWORD || '');
    let configuredOrigin;

    try {
        configuredOrigin = new URL(env.SLIME_RACE_URL || '').origin;
    } catch {
        throw new Error('本地凭据文件中的 SLIME_RACE_URL 无效');
    }

    if (configuredOrigin !== targetOrigin) throw new Error('本地凭据文件必须使用固定目标站点');
    if (!username || !password) throw new Error('本地凭据文件缺少账号或密码');
    return {username, password};
}

async function requestJson(endpoint, options = {}, attempt = 0) {
    let response;
    const method = String(options.method || 'GET').toUpperCase();

    try {
        response = await fetch(new URL(endpoint, targetOrigin), {
            method,
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

    if (response.status === 429 && method === 'GET' && attempt === 0) {
        const retryAfter = requestPolicy.getHeaderValue(response.headers, 'retry-after');
        await requestPolicy.delay(requestPolicy.getRetryDelayMilliseconds(retryAfter));
        return requestJson(endpoint, options, attempt + 1);
    }

    if (!response.ok) {
        if (response.status === 429 && method === 'POST') {
            if (endpoint === '/api/auth/login') {
                throw new Error('登录请求过于频繁，请等待站点限流恢复后再试；软件不会自动重试登录');
            }
            throw new Error('站点请求过于频繁，本次提交不会自动重试；请先同步核对结果');
        }
        if (response.status === 429) throw new Error('站点请求过于频繁，请等待几秒后再同步');
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
    cachedRemoteRacers = null;
    const result = await requestJson('/api/auth/login', {method: 'POST', data: {username, password}});
    sessionCookie = getSessionCookie(result.response);
    if (!sessionCookie) throw new Error('登录成功但没有取得会话');
    return syncRemote('full');
}

async function autoLoginRemote() {
    if (capturePath) return null;
    const credentials = await readLocalCredentials();
    if (!credentials) return null;

    try {
        return await loginRemote(credentials);
    } catch (error) {
        sessionCookie = '';
        throw error;
    }
}

async function syncRemote(mode) {
    if (!sessionCookie) throw new Error('请先登录');
    const normalizedMode = mode === 'bet' ? 'bet' : mode === 'live' ? 'live' : 'full';
    const endpoints = remoteData.getSnapshotEndpointNames(normalizedMode, Boolean(cachedRemoteRacers));
    const fetchEndpoint = name => requestJson(endpointPaths[name]).then(result => result.data);
    const values = normalizedMode === 'bet'
        ? await Promise.all(endpoints.map(fetchEndpoint))
        : await requestPolicy.mapSequential(endpoints, fetchEndpoint);
    const raw = Object.fromEntries(endpoints.map((name, index) => [name, values[index]]));

    if (raw.racers) cachedRemoteRacers = raw.racers;
    else raw.racers = cachedRemoteRacers;
    return remoteData.normalizeSnapshot({...raw, mode: normalizedMode});
}

async function syncDailyQuest() {
    if (!sessionCookie) throw new Error('请先登录');
    const names = Object.keys(dailyEndpointPaths);
    const values = await requestPolicy.mapSequential(
        names,
        name => requestJson(dailyEndpointPaths[name]).then(result => result.data),
        400
    );

    return dailyQuest.normalizeDailyQuest(Object.fromEntries(names.map((name, index) => [name, values[index]])));
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

async function placeRemoteBets(intents) {
    return runMutation(async () => {
        await requestPolicy.delay(800);
        let snapshot = await syncRemote('bet');
        const planned = remoteActions.validateBetBatch(snapshot, intents);
        let completed = 0;

        try {
            for (let index = 0; index < planned.length; index += 1) {
                if (index > 0) {
                    await requestPolicy.delay(2000);
                    snapshot = await syncRemote('bet');
                }

                const validated = remoteActions.validateBetIntent(snapshot, planned[index]);
                await requestPolicy.delay(400);
                await requestJson('/api/slime-race/bet', {
                    method: 'POST',
                    data: {slimeId: validated.slimeId, amount: validated.amount}
                });
                completed += 1;
            }

            await requestPolicy.delay(600);
            return await syncRemote('bet');
        } catch (error) {
            const message = String(error?.message || error);
            if (completed === planned.length) throw new Error(`${completed} 笔下注已经提交，但结果同步失败：${message}`);
            if (completed > 0) throw new Error(`已完成 ${completed}/${planned.length} 笔下注，剩余操作已停止：${message}`);
            throw error;
        }
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

async function submitDailyRecite(intent) {
    return runMutation(async () => {
        const state = await syncDailyQuest();
        const payload = dailyQuest.validateReciteSubmission(state, intent);
        await requestPolicy.delay(500);
        await requestJson('/api/quest/submit', {method: 'POST', data: payload});
        await requestPolicy.delay(600);
        return syncDailyQuest();
    });
}

async function autoSubmitDailyRecite() {
    return runMutation(async () => {
        const state = await syncDailyQuest();
        const payload = dailyQuest.createAutomaticReciteSubmission(state);
        await requestPolicy.delay(500);
        await requestJson('/api/quest/submit', {method: 'POST', data: payload});
        await requestPolicy.delay(600);
        return syncDailyQuest();
    });
}

async function completeDailyClick(clickCount) {
    return runMutation(async () => {
        const progress = await requestJson('/api/quest/progress').then(result => result.data);
        const state = dailyQuest.normalizeDailyQuest({progress});
        dailyQuest.validateClickCompletion(state, clickCount);
        await requestPolicy.delay(500);
        await requestJson('/api/quest/click-complete', {method: 'POST'});
        await requestPolicy.delay(600);
        return syncDailyQuest();
    });
}

async function completeDailyTimer() {
    return runMutation(async () => {
        const progress = await requestJson('/api/quest/progress').then(result => result.data);
        const state = dailyQuest.normalizeDailyQuest({progress});
        const payload = dailyQuest.createAutomaticTimerSubmission(state);
        await requestPolicy.delay(500);
        await requestJson('/api/timer-game/submit', {method: 'POST', data: payload});
        await requestPolicy.delay(600);
        return syncDailyQuest();
    });
}

async function testDailyTimerError() {
    return runMutation(async () => {
        const progress = await requestJson('/api/quest/progress').then(result => result.data);
        const state = dailyQuest.normalizeDailyQuest({progress});
        const payload = dailyQuest.createRandomTimerSubmission(state);
        await requestPolicy.delay(500);
        const submission = await requestJson('/api/timer-game/submit', {method: 'POST', data: payload});
        const result = dailyQuest.normalizeTimerSubmissionResult(submission.data, payload.actualTime);
        await requestPolicy.delay(600);
        return {state: await syncDailyQuest(), result};
    });
}

async function claimDailyGameReward(type) {
    return runMutation(async () => {
        const progress = await requestJson('/api/quest/progress').then(result => result.data);
        const state = dailyQuest.normalizeDailyQuest({progress});
        const claim = dailyQuest.validateGameClaim(state, type);
        await requestPolicy.delay(500);
        await requestJson(claim.endpoint, {method: 'POST'});
        await requestPolicy.delay(600);
        return syncDailyQuest();
    });
}

ipcMain.handle('slime-remote:login', (event, credentials) => {
    assertTrustedSender(event);
    return loginRemote(credentials);
});
ipcMain.handle('slime-remote:auto-login', event => {
    assertTrustedSender(event);
    return autoLoginRemote();
});
ipcMain.handle('slime-remote:sync', (event, mode) => {
    assertTrustedSender(event);
    return syncRemote(mode);
});
ipcMain.handle('slime-remote:place-bets', (event, intents) => {
    assertTrustedSender(event);
    return placeRemoteBets(intents);
});
ipcMain.handle('slime-remote:claim-reward', (event, rewardId) => {
    assertTrustedSender(event);
    return claimRemoteReward(rewardId);
});
ipcMain.handle('slime-remote:daily-sync', event => {
    assertTrustedSender(event);
    return syncDailyQuest();
});
ipcMain.handle('slime-remote:daily-recite', (event, intent) => {
    assertTrustedSender(event);
    return submitDailyRecite(intent);
});
ipcMain.handle('slime-remote:daily-auto-recite', event => {
    assertTrustedSender(event);
    return autoSubmitDailyRecite();
});
ipcMain.handle('slime-remote:daily-click', (event, clickCount) => {
    assertTrustedSender(event);
    return completeDailyClick(clickCount);
});
ipcMain.handle('slime-remote:daily-timer', event => {
    assertTrustedSender(event);
    return completeDailyTimer();
});
ipcMain.handle('slime-remote:daily-timer-error-test', event => {
    assertTrustedSender(event);
    return testDailyTimerError();
});
ipcMain.handle('slime-remote:daily-claim', (event, type) => {
    assertTrustedSender(event);
    return claimDailyGameReward(type);
});
ipcMain.handle('slime-remote:daily-open', event => {
    assertTrustedSender(event);
    return shell.openExternal(new URL('/daily-quest', targetOrigin).href);
});
ipcMain.handle('slime-remote:logout', event => {
    assertTrustedSender(event);
    sessionCookie = '';
    mutationInFlight = false;
    cachedRemoteRacers = null;
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
