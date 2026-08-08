const {app, BrowserWindow, ipcMain, shell} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const remoteData = require('../app/scripts/remote-data.js');
const remoteActions = require('../app/scripts/remote-actions.js');
const dailyQuest = require('../app/scripts/daily-quest.js');
const heroAutomation = require('../app/scripts/hero-automation.js');
const requestPolicy = require('../app/scripts/request-policy.js');
const raceArchive = require('./race-archive.cjs');

const targetOrigin = 'https://zouzou-princess-fan-2.replit.app';
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
let archiveWriteQueue = Promise.resolve();

const captureArgument = process.argv.find(argument => argument.startsWith('--capture='));
const capturePath = captureArgument ? captureArgument.slice('--capture='.length) : null;
const captureScrollArgument = process.argv.find(argument => argument.startsWith('--capture-scroll='));
const captureScroll = captureScrollArgument ? Math.max(0, Number(captureScrollArgument.slice('--capture-scroll='.length)) || 0) : 0;

function getRaceArchiveDirectory() {
    return app.isPackaged
        ? path.join(app.getPath('userData'), 'race-archive')
        : path.join(__dirname, '..', '.local-data', 'race-archive');
}

function enqueueArchiveWrite(action) {
    const writeTask = archiveWriteQueue.catch(() => {}).then(action);
    archiveWriteQueue = writeTask;
    writeTask.catch(() => {});
    return writeTask;
}

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
        const match = line.match(/^([A-Za-z0-9_]+)\s*[:=]\s*(.*)$/);
        if (!match) return;
        let value = match[2].trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        values[match[1].toUpperCase()] = value;
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
    const username = String(env.SLIME_RACE_USERNAME || env.USERNAME || '').trim();
    const password = String(env.SLIME_RACE_PASSWORD || env.PASSWORD || '');
    let configuredOrigin;

    try {
        configuredOrigin = new URL(env.SLIME_RACE_URL || targetOrigin).origin;
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
    const snapshot = remoteData.normalizeSnapshot({...raw, mode: normalizedMode});
    const archiveDirectory = getRaceArchiveDirectory();

    if (raw.bets && raw.racers) {
        enqueueArchiveWrite(() => raceArchive.updatePoolCapture(
            archiveDirectory,
            raw.bets,
            raw.racers,
            raw.account?.id,
            snapshot.updatedAt
        ));
    }

    if (normalizedMode === 'full') {
        const writeTask = enqueueArchiveWrite(() => raceArchive.updateArchive(
            archiveDirectory,
            raw.sessions,
            raw.racers,
            snapshot.updatedAt
        ));

        try {
            const result = await writeTask;
            snapshot.archive = {
                supported: true,
                total: result.total,
                added: result.added,
                winnerMismatches: result.winnerMismatches,
                lap1LastMismatches: result.lap1LastMismatches,
                durationMismatches: result.durationMismatches,
                incompleteReplays: result.incompleteReplays
            };
        } catch (error) {
            snapshot.archive = {supported: true, error: String(error.message || error).slice(0, 180)};
        }
    }

    return snapshot;
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

async function syncCurrentHeroAutomation() {
    if (!sessionCookie) throw new Error('请先登录');
    const endpoints = {
        account: '/api/auth/me',
        battleStatus: '/api/hero/battle-status',
        skills: '/api/hero/skills',
        rebornSkills: '/api/hero/reborn-skills'
    };
    const names = Object.keys(endpoints);
    const values = await requestPolicy.mapSequential(
        names,
        name => requestJson(endpoints[name]).then(result => result.data),
        250
    );
    return heroAutomation.createSnapshot(Object.fromEntries(names.map((name, index) => [name, values[index]])));
}

async function switchHeroMode(heroMode) {
    await requestJson('/api/reborn/switch-mode', {
        method: 'POST',
        data: {mode: heroAutomation.getServerHeroMode(heroMode)}
    });
    await requestPolicy.delay(300);
}

async function syncHeroAutomation(options = {}) {
    const current = await syncCurrentHeroAutomation();
    if (options?.includeModes !== true || !current.account.rebornType) return current;
    const originalMode = current.heroMode;
    const otherMode = originalMode === 'base' ? 'reborn' : 'base';
    let other;
    await switchHeroMode(otherMode);
    try {
        other = await syncCurrentHeroAutomation();
        if (other.heroMode !== otherMode) throw new Error(`${heroAutomation.HERO_MODES[otherMode]}切换后未生效`);
    } finally {
        await switchHeroMode(originalMode);
    }
    if (heroAutomation.getBattleCount(current) !== heroAutomation.getBattleCount(other)) {
        throw new Error('读取双模式面板期间检测到并发战斗，方案已作废，请停止其他刷怪进程后重试');
    }
    return originalMode === 'base'
        ? heroAutomation.combineHeroModeSnapshots(current, other, originalMode)
        : heroAutomation.combineHeroModeSnapshots(other, current, originalMode);
}

async function ensureHeroMode(heroMode) {
    const targetMode = heroAutomation.normalizeHeroMode(heroMode);
    let snapshot = await syncCurrentHeroAutomation();
    if (snapshot.heroMode === targetMode) return snapshot;
    await switchHeroMode(targetMode);
    snapshot = await syncCurrentHeroAutomation();
    if (snapshot.heroMode !== targetMode) throw new Error(`${heroAutomation.HERO_MODES[targetMode]}切换后未生效`);
    return snapshot;
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

async function applyHeroAllocation(intent) {
    return runMutation(async () => {
        const snapshot = await ensureHeroMode(intent?.heroMode);
        const targetAllocation = intent?.targetAllocation || intent;
        const targetSkill = intent?.activeSkillKey;
        const hasTargetRebornSkill = Object.hasOwn(intent || {}, 'rebornSkillKey');
        const targetRebornSkill = hasTargetRebornSkill
            ? heroAutomation.validateRebornSkillSelection(snapshot, intent.rebornSkillKey)
            : undefined;
        if (intent?.guard) heroAutomation.validateBattleGuard(snapshot, intent.guard);
        if (targetSkill != null && (!heroAutomation.ACTIVE_SKILLS[targetSkill] || Number(snapshot.skills[targetSkill]) <= 0)) {
            throw new Error('推荐主动技能尚未解锁或无效');
        }
        const plan = heroAutomation.planAllocationChanges(snapshot.account, targetAllocation);

        for (const change of plan.deallocate) {
            await requestJson('/api/hero/deallocate-stats', {method: 'POST', data: change});
            await requestPolicy.delay(250);
        }
        for (const change of plan.allocate) {
            await requestJson('/api/hero/allocate-stats', {method: 'POST', data: change});
            await requestPolicy.delay(250);
        }
        if (targetSkill != null && targetSkill !== snapshot.account.equippedActiveSkill) {
            await requestJson('/api/hero/skills/equip', {method: 'POST', data: {skillKey: targetSkill}});
            await requestPolicy.delay(300);
        }
        if (snapshot.heroMode === 'reborn' && hasTargetRebornSkill && targetRebornSkill && targetRebornSkill !== (snapshot.account.equippedRebornSkill || null)) {
            await requestJson('/api/hero/reborn-skills/equip', {method: 'POST', data: {skillKey: targetRebornSkill}});
            await requestPolicy.delay(300);
        }

        const updated = await syncHeroAutomation();
        const actual = heroAutomation.getCurrentAllocation(updated.account);
        if (JSON.stringify(actual) !== JSON.stringify(plan.target)) throw new Error('服务器返回的能力值方案与目标不一致，自动刷怪已停止');
        if (targetSkill !== undefined && updated.account.equippedActiveSkill !== targetSkill) throw new Error('服务器返回的主动技能与推荐不一致，自动刷怪已停止');
        if (hasTargetRebornSkill && (updated.account.equippedRebornSkill || null) !== targetRebornSkill) throw new Error('服务器返回的转生技能与信仰路线不一致，自动刷怪已停止');
        if (intent?.guard) heroAutomation.validateBattleGuard(updated, {
            ...intent.guard,
            expectedAllocation: plan.target,
            ...(hasTargetRebornSkill ? {expectedRebornSkill: targetRebornSkill} : {})
        });
        return updated;
    });
}

async function prepareHeroHealing() {
    return runMutation(async () => {
        const before = await syncHeroAutomation();
        const currentRatio = Number(before.battleStatus.currentHp) / Math.max(1, Number(before.battleStatus.maxHp));
        if (currentRatio >= 0.2) return {snapshot: before, consumed: [], triggered: false};
        const inventory = await requestJson('/api/inventory').then(result => result.data);
        const plan = heroAutomation.planHealingConsumables(before, inventory);

        for (const use of plan.uses) {
            await requestJson('/api/inventory/use', {
                method: 'POST',
                data: {inventoryEntryId: use.inventoryEntryId, quantity: use.quantity}
            });
            await requestPolicy.delay(350);
        }

        const snapshot = await syncHeroAutomation();
        const hpRatio = Number(snapshot.battleStatus.currentHp) / Math.max(1, Number(snapshot.battleStatus.maxHp));
        if (hpRatio < 0.95) throw new Error('恢复药水已经提交，但 HP 未达到 95%；禁止立即重复使用，请先核对官方面板');
        return {snapshot, consumed: plan.uses.map(use => ({itemId: use.itemId, quantity: use.quantity})), triggered: true};
    });
}

async function getHeroUnlockChallenge() {
    if (!sessionCookie) throw new Error('请先登录');
    return requestJson('/api/hero/unlock-challenge').then(result => result.data);
}

async function submitHeroUnlock(letters) {
    return runMutation(async () => {
        const selected = Array.isArray(letters) ? letters.map(letter => String(letter)).filter(Boolean) : [];
        if (selected.length !== 2 || new Set(selected).size !== 2) throw new Error('请选择两个不同的字母');
        const submission = await requestJson('/api/hero/unlock-exp', {method: 'POST', data: {letters: selected}});
        if (submission.data?.success !== true) return {success: false, challenge: await getHeroUnlockChallenge()};
        const snapshot = await syncHeroAutomation();
        if (heroAutomation.getBattleCount(snapshot) >= 60) throw new Error('服务器已接受解锁请求，但 60 次限制尚未解除，请核对官方面板');
        return {success: true, snapshot};
    });
}

async function prepareHeroDefensePotions() {
    return runMutation(async () => {
        const before = await syncHeroAutomation();
        const currentStacks = Math.max(0, Math.min(30, Number(before.battleStatus.defenseBuffStacks) || 0));
        const needed = 30 - currentStacks;
        if (needed === 0) return {snapshot: before, consumed: 0};

        const inventory = await requestJson('/api/inventory').then(result => result.data);
        const entries = (Array.isArray(inventory) ? inventory : [])
            .filter(entry => Number(entry?.itemId) === 7 && Number(entry.quantity) > 0 && (entry.id || entry._id))
            .sort((left, right) => Number(right.quantity) - Number(left.quantity));
        const available = entries.reduce((sum, entry) => sum + Number(entry.quantity), 0);
        if (available < needed) throw new Error(`防御药水不足：补满 30 层还需要 ${needed} 瓶，当前只有 ${available} 瓶`);

        let remaining = needed;
        for (const entry of entries) {
            if (remaining === 0) break;
            const quantity = Math.min(remaining, Number(entry.quantity));
            await requestJson('/api/inventory/use', {
                method: 'POST',
                data: {inventoryEntryId: entry.id || entry._id, quantity}
            });
            remaining -= quantity;
            await requestPolicy.delay(400);
        }

        const snapshot = await syncHeroAutomation();
        if (Number(snapshot.battleStatus.defenseBuffStacks) !== 30) throw new Error('防御药水提交后未达到 30 层，请在官方面板核对，禁止立即重复使用');
        return {snapshot, consumed: needed};
    });
}

async function runHeroBattle(intent) {
    return runMutation(async () => {
        const snapshot = await ensureHeroMode(intent?.heroMode);
        const monster = heroAutomation.validateBattleGuard(snapshot, intent);
        const battleCount = heroAutomation.getBattleCount(snapshot);
        if (battleCount >= 60) throw new Error('今日战斗次数已达到 60 次上限');

        const result = heroAutomation.simulateBattle(snapshot, monster.id, {
            rebornSkillKey: intent?.expectedRebornSkill,
            battleOptions: intent?.battleOptions,
            pleasureResist: intent?.pleasureResist !== false
        });
        const payload = heroAutomation.createBattleResultPayload(monster.id, result);
        await requestPolicy.delay(600 + result.pleasureClimaxes * heroAutomation.FAMILIAR_MECHANIC.promptDelaySeconds * 1000);
        const submission = await requestJson('/api/hero/battle-result', {method: 'POST', data: payload});
        await requestPolicy.delay(700);
        const updated = await syncHeroAutomation();
        const nextLevel = heroAutomation.validateLevelTransition(monster.id, monster.level, updated, result.victory);
        heroAutomation.validateBattleCountTransition(battleCount, updated);
        return {snapshot: updated, result, nextLevel, message: String(submission.data?.message || '').slice(0, 180)};
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
ipcMain.handle('slime-remote:hero-sync', (event, options) => {
    assertTrustedSender(event);
    return syncHeroAutomation(options);
});
ipcMain.handle('slime-remote:hero-allocate', (event, targetAllocation) => {
    assertTrustedSender(event);
    return applyHeroAllocation(targetAllocation);
});
ipcMain.handle('slime-remote:hero-defense-potions', event => {
    assertTrustedSender(event);
    return prepareHeroDefensePotions();
});
ipcMain.handle('slime-remote:hero-heal', event => {
    assertTrustedSender(event);
    return prepareHeroHealing();
});
ipcMain.handle('slime-remote:hero-unlock-challenge', event => {
    assertTrustedSender(event);
    return getHeroUnlockChallenge();
});
ipcMain.handle('slime-remote:hero-unlock-submit', (event, letters) => {
    assertTrustedSender(event);
    return submitHeroUnlock(letters);
});
ipcMain.handle('slime-remote:hero-battle', (event, intent) => {
    assertTrustedSender(event);
    return runHeroBattle(intent);
});
ipcMain.handle('slime-remote:archive-open', async event => {
    assertTrustedSender(event);
    const directory = getRaceArchiveDirectory();
    await fs.mkdir(directory, {recursive: true, mode: 0o700});
    if (process.platform !== 'win32') await fs.chmod(directory, 0o700);
    const message = await shell.openPath(directory);
    if (message) throw new Error(`无法打开本地比赛档案：${message}`);
    return {ok: true};
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
            sandbox: true,
            backgroundThrottling: false
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
