const fs = require('node:fs/promises');
const path = require('node:path');

const ARCHIVE_SCHEMA_VERSION = 2;
const REPLAY_ALGORITHM = 'official-web-seeded-compact-v1';
const REPLAY_SOURCE = '/assets/index-C0uyOwnW.js@2026-08-03';
const STEP_MS = 50;
const MAX_REPLAY_MS = 180000;
const MAX_POOL_CHECKPOINTS = 24;
const MAX_POOL_SESSIONS = 100;
const POOL_STATE_SCHEMA_VERSION = 1;
const RACER_IDS_BY_NAME = Object.freeze({
    '迷你哈密瓜': 'melon',
    '迷你蓝莓': 'blueberry',
    '迷你火龙果': 'dragonfruit',
    '迷你柠檬': 'lemon'
});
const EVENT_RANGES = Object.freeze({
    stumble: Object.freeze({1: [0.65, 0.05], 2: [0.55, 0.15], 3: [0.5, 0.2], 4: [0.6, 0.1]}),
    burst: Object.freeze({1: [1.55, 0.05], 2: [1.45, 0.15], 3: [1.4, 0.2], 4: [1.5, 0.1]})
});
const RACER_LABELS = Object.freeze({melon: '迷你哈密瓜', blueberry: '迷你蓝莓', dragonfruit: '迷你火龙果', lemon: '迷你柠檬'});

function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function toNumber(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function createRandom(seed) {
    let state = toNumber(seed, 0) >>> 0;

    return function nextRandom() {
        state = state + 1831565813 >>> 0;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function getRacerId(racer) {
    return RACER_IDS_BY_NAME[String(racer?.name || '').trim()] || `source-${toNumber(racer?.id, -1)}`;
}

function normalizeProfiles(rawRacers) {
    if (!Array.isArray(rawRacers) || rawRacers.length === 0) throw new Error('比赛重放缺少史莱姆资料');

    return rawRacers.map((racer, index) => {
        const sourceId = toNumber(racer?.id, null);
        const speed = toNumber(racer?.spd, null);
        if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !Number.isFinite(speed) || speed <= 0) {
            throw new Error('比赛重放遇到无效的史莱姆编号或速度');
        }

        return {
            racerId: getRacerId(racer),
            sourceId,
            sourceOrder: index + 1,
            speed
        };
    });
}

function createReplayRacers(profiles, random) {
    return profiles.map((profile, index) => {
        const initialSpeedMultiplier = 0.8 + random() * 0.4;
        const initialEventTimerMs = 5000 + random() * 500;

        return {
            ...profile,
            laneIndex: index % 4,
            progress: 0,
            baseSpeed: profile.speed * 5e-7,
            currentSpeed: profile.speed * 5e-7,
            speedMultiplier: initialSpeedMultiplier,
            eventTimerMs: initialEventTimerMs,
            eventType: 'normal',
            finished: false,
            lap1Order: null,
            lap1TimeMs: null,
            finishOrder: null,
            finishTimeMs: null,
            interpolatedFinishTimeMs: null,
            timeInRankMs: [0, 0, 0, 0],
            stumbleByRank: [0, 0, 0, 0],
            burstByRank: [0, 0, 0, 0],
            stumbleCount: 0,
            burstCount: 0,
            leadEntryCount: 0,
            lastPlaceExitCount: 0
        };
    });
}

function selectNextEvent(racer, random, rank) {
    let type = 'normal';

    if (racer.eventType === 'stumble' || racer.eventType === 'burst') {
        racer.speedMultiplier = 0.9 + random() * 0.2;
        racer.eventTimerMs = 1000 + random() * 500;
    } else {
        const roll = random();
        if (roll < 0.15) type = 'stumble';
        else if (roll < 0.3) type = 'burst';

        if (type === 'normal') {
            racer.speedMultiplier = 0.9 + random() * 0.2;
        } else {
            const [base, spread] = EVENT_RANGES[type][racer.sourceId] || (type === 'stumble' ? [0.5, 0.2] : [1.4, 0.2]);
            racer.speedMultiplier = base + random() * spread;
        }
        racer.eventTimerMs = 1000 + random() * 500;
    }

    racer.eventType = type;
    if (type === 'stumble') {
        racer.stumbleCount += 1;
        racer.stumbleByRank[rank - 1] += 1;
    } else if (type === 'burst') {
        racer.burstCount += 1;
        racer.burstByRank[rank - 1] += 1;
    }
}

function getCrossingTime(previousProgress, nextProgress, target, elapsedMs) {
    const delta = nextProgress - previousProgress;
    if (delta <= 0) return elapsedMs + STEP_MS;
    return elapsedMs + STEP_MS * Math.min(1, Math.max(0, (target - previousProgress) / delta));
}

function advanceRacer(racer, random, counters, elapsedMs, rank) {
    if (racer.finished) return;
    const atMs = elapsedMs + STEP_MS;
    racer.eventTimerMs -= STEP_MS;
    if (racer.eventTimerMs <= 0) selectNextEvent(racer, random, rank);

    const targetSpeed = racer.baseSpeed * racer.speedMultiplier;
    racer.currentSpeed += (targetSpeed - racer.currentSpeed) * 0.1;
    const previousProgress = racer.progress;
    racer.progress += racer.currentSpeed * STEP_MS;

    if (racer.lap1TimeMs === null && racer.progress >= 1) {
        counters.lap1 += 1;
        racer.lap1Order = counters.lap1;
        racer.lap1TimeMs = round(getCrossingTime(previousProgress, racer.progress, 1, elapsedMs));
    }

    if (racer.progress < 2) return;
    const interpolatedFinishTimeMs = getCrossingTime(previousProgress, racer.progress, 2, elapsedMs);
    counters.finish += 1;
    racer.progress = 2;
    racer.finished = true;
    racer.finishOrder = counters.finish;
    racer.finishTimeMs = atMs;
    racer.interpolatedFinishTimeMs = round(interpolatedFinishTimeMs);
}

function rankRacers(racers) {
    return [...racers].sort((left, right) => {
        if (left.finished && right.finished) return left.finishOrder - right.finishOrder;
        if (left.finished) return -1;
        if (right.finished) return 1;
        return right.progress - left.progress || left.sourceOrder - right.sourceOrder;
    });
}

function getRankMap(racers) {
    return new Map(rankRacers(racers).map((racer, index) => [racer.sourceId, index + 1]));
}

function toRankObject(values) {
    return {1: values[0], 2: values[1], 3: values[2], 4: values[3]};
}

function replayRace(session, rawRacers) {
    const seed = toNumber(session?.seed, null);
    if (!Number.isSafeInteger(seed)) throw new Error('比赛重放缺少有效随机种子');
    const random = createRandom(seed);
    const racers = createReplayRacers(normalizeProfiles(rawRacers), random);
    const counters = {lap1: 0, finish: 0};
    let previousRanks = getRankMap(racers);
    let previousLeaderId = rankRacers(racers)[0]?.sourceId ?? null;
    let elapsedMs = 0;

    while (counters.finish < racers.length && elapsedMs < MAX_REPLAY_MS) {
        racers.forEach(racer => {
            if (!racer.finished) racer.timeInRankMs[previousRanks.get(racer.sourceId) - 1] += STEP_MS;
            advanceRacer(racer, random, counters, elapsedMs, previousRanks.get(racer.sourceId));
        });
        elapsedMs += STEP_MS;
        const nextRanks = getRankMap(racers);
        const nextLeader = rankRacers(racers)[0];
        if (nextLeader?.sourceId !== previousLeaderId) nextLeader.leadEntryCount += 1;
        racers.forEach(racer => {
            if (previousRanks.get(racer.sourceId) === 4 && nextRanks.get(racer.sourceId) < 4) racer.lastPlaceExitCount += 1;
        });
        previousRanks = nextRanks;
        previousLeaderId = nextLeader?.sourceId ?? null;
    }

    const finishOrder = [...racers].sort((left, right) => (left.finishOrder || 99) - (right.finishOrder || 99));
    const winnerTimeMs = finishOrder[0]?.interpolatedFinishTimeMs ?? null;
    return {
        algorithm: REPLAY_ALGORITHM,
        algorithmSource: REPLAY_SOURCE,
        stepMs: STEP_MS,
        complete: counters.finish === racers.length,
        replayTotalDurationMs: elapsedMs,
        racers: racers.map(racer => ({
            racerId: racer.racerId,
            sourceId: racer.sourceId,
            sourceOrder: racer.sourceOrder,
            speed: racer.speed,
            lap1Rank: racer.lap1Order,
            lap1TimeMs: racer.lap1TimeMs,
            finishRank: racer.finishOrder,
            finishTickMs: racer.finishTimeMs,
            finishTimeMs: racer.interpolatedFinishTimeMs,
            finishMarginMs: winnerTimeMs === null ? null : round(racer.interpolatedFinishTimeMs - winnerTimeMs),
            timeInRankMs: toRankObject(racer.timeInRankMs),
            stumbleCount: racer.stumbleCount,
            burstCount: racer.burstCount,
            stumbleByRank: toRankObject(racer.stumbleByRank),
            burstByRank: toRankObject(racer.burstByRank),
            leadEntryCount: racer.leadEntryCount,
            lastPlaceExitCount: racer.lastPlaceExitCount
        }))
    };
}

function isFinishedSession(session) {
    return String(session?.status || '') === 'finished'
        && Number.isSafeInteger(toNumber(session?.id, null))
        && Number.isSafeInteger(toNumber(session?.seed, null))
        && Number.isSafeInteger(toNumber(session?.winnerId, null))
        && toNumber(session?.totalDurationMs, 0) > 0;
}

function normalizeStakeMap(values) {
    return Object.fromEntries(Object.values(RACER_IDS_BY_NAME).map(id => [id, Math.max(0, toNumber(values?.[id], 0))]));
}

function aggregatePoolCheckpoint(rawPool, rawRacers, accountSourceId, capturedAt) {
    const bets = Array.isArray(rawPool?.bets) ? rawPool.bets : [];
    const profiles = normalizeProfiles(rawRacers);
    const idBySource = Object.fromEntries(profiles.map(profile => [profile.sourceId, profile.racerId]));
    const sessionIds = new Set(bets
        .map(bet => toNumber(bet?.sessionId, null))
        .filter(sessionId => Number.isSafeInteger(sessionId) && sessionId > 0));
    if (sessionIds.size !== 1) return null;
    const sessionId = [...sessionIds][0];

    const stakes = normalizeStakeMap({});
    const ownStakes = normalizeStakeMap({});
    bets.forEach(bet => {
        if (toNumber(bet?.sessionId, null) !== sessionId) return;
        const racerId = idBySource[toNumber(bet?.slimeId, null)];
        const amount = Math.max(0, toNumber(bet?.amount, 0));
        if (!racerId) return;
        stakes[racerId] += amount;
        if (Number.isSafeInteger(accountSourceId) && toNumber(bet?.userId, null) === accountSourceId) {
            ownStakes[racerId] += amount;
        }
    });

    return {
        sessionId,
        capturedAt,
        total: Object.values(stakes).reduce((sum, amount) => sum + amount, 0),
        stakes,
        jackpot: Math.max(0, toNumber(rawPool?.jackpot, 0)),
        witchBonus: Math.max(0, toNumber(rawPool?.witchBonus, 0)),
        ownPosition: {
            total: Object.values(ownStakes).reduce((sum, amount) => sum + amount, 0),
            stakes: ownStakes
        }
    };
}

function hasSamePoolValues(left, right) {
    if (!left || !right) return false;
    return left.total === right.total
        && left.jackpot === right.jackpot
        && left.witchBonus === right.witchBonus
        && Object.keys(left.stakes).every(id => left.stakes[id] === right.stakes[id])
        && Object.keys(left.ownPosition.stakes).every(id => left.ownPosition.stakes[id] === right.ownPosition.stakes[id]);
}

function downsampleCheckpoints(checkpoints) {
    if (checkpoints.length <= MAX_POOL_CHECKPOINTS) return checkpoints;
    const selected = new Set([0, checkpoints.length - 1]);
    for (let index = 1; index < MAX_POOL_CHECKPOINTS - 1; index += 1) {
        selected.add(Math.round(index * (checkpoints.length - 1) / (MAX_POOL_CHECKPOINTS - 1)));
    }
    return [...selected].sort((left, right) => left - right).map(index => checkpoints[index]);
}

function mergePoolCheckpoint(existing, checkpoint) {
    const previous = existing?.closing || null;
    const previousTime = Date.parse(previous?.capturedAt || '');
    const currentTime = Date.parse(checkpoint.capturedAt);
    const heartbeatDue = !Number.isFinite(previousTime) || !Number.isFinite(currentTime) || currentTime - previousTime >= 30000;
    if (hasSamePoolValues(previous, checkpoint) && !heartbeatDue) return {capture: existing, changed: false};

    const checkpoints = downsampleCheckpoints([...(existing?.checkpoints || []), checkpoint]);
    return {
        capture: {
            opening: existing?.opening || checkpoint,
            closing: checkpoint,
            checkpoints,
            ownPosition: checkpoint.ownPosition
        },
        changed: true
    };
}

function createRecord(session, rawRacers, poolCapture) {
    const replay = replayRace(session, rawRacers);
    const winnerSourceId = toNumber(session.winnerId, null);
    const lap1LastSourceId = toNumber(session.lap1LastId, null);
    const winner = replay.racers.find(racer => racer.finishRank === 1);
    const lap1Last = replay.racers.find(racer => racer.lap1Rank === replay.racers.length);
    const serverTotalDurationMs = toNumber(session.totalDurationMs, null);

    return {
        sessionId: toNumber(session.id, null),
        seed: toNumber(session.seed, null),
        raceType: String(session.raceType || 'unknown').slice(0, 30),
        startedAt: session.startedAt || null,
        raceStartAt: session.raceStartAt || null,
        authority: {
            winnerSourceId,
            winnerId: getRacerId(rawRacers.find(racer => toNumber(racer?.id, null) === winnerSourceId)),
            totalDurationMs: serverTotalDurationMs,
            lap1LastSourceId,
            lap1LastId: lap1LastSourceId === null
                ? null
                : getRacerId(rawRacers.find(racer => toNumber(racer?.id, null) === lap1LastSourceId))
        },
        replay,
        pool: poolCapture || null,
        validation: {
            complete: replay.complete,
            winnerMatches: winner?.sourceId === winnerSourceId,
            lap1LastMatches: lap1LastSourceId === null ? null : lap1Last?.sourceId === lap1LastSourceId,
            totalDurationDeltaMs: serverTotalDurationMs === null ? null : replay.replayTotalDurationMs - serverTotalDurationMs,
            poolOpeningCaptured: Boolean(poolCapture?.opening),
            poolClosingCaptured: Boolean(poolCapture?.closing),
            sessionGapBefore: null
        }
    };
}

function createEmptyArchive() {
    return {schemaVersion: ARCHIVE_SCHEMA_VERSION, updatedAt: null, recordCount: 0, records: []};
}

function mergeArchive(existing, rawSessions, rawRacers, archivedAt = new Date().toISOString(), poolCaptures = {}) {
    const archive = existing?.schemaVersion === ARCHIVE_SCHEMA_VERSION && Array.isArray(existing.records)
        ? existing
        : createEmptyArchive();
    const bySessionId = new Map(archive.records.map(record => [record.sessionId, record]));
    let added = 0;
    let refreshed = 0;

    (Array.isArray(rawSessions) ? rawSessions : []).filter(isFinishedSession).forEach(session => {
        const sessionId = toNumber(session.id, null);
        const previous = bySessionId.get(sessionId);
        const poolCapture = poolCaptures[sessionId] || null;
        const shouldRefresh = previous && (
            previous.replay?.algorithm !== REPLAY_ALGORITHM
            || previous.validation?.complete !== true
            || previous.validation?.winnerMatches !== true
            || (poolCapture?.closing && previous.pool?.closing?.capturedAt !== poolCapture.closing.capturedAt)
        );
        if (previous && !shouldRefresh) return;
        const record = createRecord(session, rawRacers, poolCapture || previous?.pool);
        bySessionId.set(sessionId, record);
        if (previous) refreshed += 1;
        else added += 1;
    });

    const records = [...bySessionId.values()].sort((left, right) => left.sessionId - right.sessionId);
    records.forEach((record, index) => {
        const previous = records[index - 1];
        record.validation.sessionGapBefore = previous ? Math.max(0, record.sessionId - previous.sessionId - 1) : null;
    });
    const changed = added > 0 || refreshed > 0;
    return {
        archive: {...archive, updatedAt: changed ? archivedAt : archive.updatedAt, recordCount: records.length, records},
        summary: {added, refreshed, total: records.length}
    };
}

function formatSeconds(milliseconds) {
    return Number.isFinite(milliseconds) ? (milliseconds / 1000).toFixed(3) : '';
}

function renderMarkdown(archive) {
    const rows = archive.records.map(record => {
        const racers = [...record.replay.racers].sort((left, right) => left.finishRank - right.finishRank);
        const result = racers.map(racer => `${racer.finishRank}. ${RACER_LABELS[racer.racerId] || racer.racerId} ${formatSeconds(racer.finishTimeMs)}s`).join('；');
        const pool = record.validation.poolOpeningCaptured && record.validation.poolClosingCaptured ? '开盘/封盘' : '不完整';
        const validation = record.validation.winnerMatches && record.validation.complete ? '通过' : '需复核';
        return `| ${record.sessionId} | ${record.raceType} | ${record.raceStartAt || record.startedAt || ''} | ${formatSeconds(record.authority.totalDurationMs)} | ${result} | ${pool} | ${validation} |`;
    });

    return [
        '# 史莱姆竞速逐场档案',
        '',
        `- 更新时间：${archive.updatedAt || '尚未更新'}`,
        `- 已归档完成场次：${archive.recordCount}`,
        `- 名次、单只完赛时间、首圈时间和按名次聚合的事件由官方前端种子算法重放；服务端权威字段保存在 JSON 的 \`authority\` 中。`,
        `- 重放时间步长为 ${STEP_MS} ms；个人完赛时间是跨越终点时的插值估算，不等同于服务端单独计时。`,
        `- 盘口最多保留 ${MAX_POOL_CHECKPOINTS} 个聚合检查点；没有保存逐笔下注、其他玩家身份或完整比赛轨迹。`,
        '- 只归档已经结束的比赛，不重放正在下注或进行中的场次。',
        '',
        '| 场次 | 类型 | 开赛时间 | 服务端总时长（秒） | 重放名次与个人时间 | 盘口 | 校验 |',
        '| ---: | --- | --- | ---: | --- | --- | --- |',
        ...rows,
        ''
    ].join('\n');
}

function escapeCsv(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function renderCsv(archive) {
    const headers = [
        'sessionId', 'raceType', 'raceStartAt', 'seed', 'sourceId', 'racerId', 'finishRank', 'finishTickMs',
        'finishTimeMs', 'finishMarginMs', 'lap1Rank', 'lap1TimeMs', 'timeInRank1Ms', 'timeInRank2Ms',
        'timeInRank3Ms', 'timeInRank4Ms', 'stumbleCount', 'burstCount', 'stumbleRank1', 'stumbleRank2',
        'stumbleRank3', 'stumbleRank4', 'burstRank1', 'burstRank2', 'burstRank3', 'burstRank4',
        'leadEntryCount', 'lastPlaceExitCount', 'speed', 'serverWinner', 'winnerMatches', 'serverTotalDurationMs',
        'replayTotalDurationMs', 'totalDurationDeltaMs', 'poolOpeningTotal', 'poolClosingTotal',
        'poolClosingStakeMelon', 'poolClosingStakeBlueberry', 'poolClosingStakeDragonfruit', 'poolClosingStakeLemon',
        'ownClosingStakeMelon', 'ownClosingStakeBlueberry', 'ownClosingStakeDragonfruit', 'ownClosingStakeLemon',
        'poolOpeningCaptured', 'poolClosingCaptured', 'sessionGapBefore'
    ];
    const rows = archive.records.flatMap(record => record.replay.racers.map(racer => [
        record.sessionId,
        record.raceType,
        record.raceStartAt || record.startedAt,
        record.seed,
        racer.sourceId,
        racer.racerId,
        racer.finishRank,
        racer.finishTickMs,
        racer.finishTimeMs,
        racer.finishMarginMs,
        racer.lap1Rank,
        racer.lap1TimeMs,
        racer.timeInRankMs[1],
        racer.timeInRankMs[2],
        racer.timeInRankMs[3],
        racer.timeInRankMs[4],
        racer.stumbleCount,
        racer.burstCount,
        racer.stumbleByRank[1],
        racer.stumbleByRank[2],
        racer.stumbleByRank[3],
        racer.stumbleByRank[4],
        racer.burstByRank[1],
        racer.burstByRank[2],
        racer.burstByRank[3],
        racer.burstByRank[4],
        racer.leadEntryCount,
        racer.lastPlaceExitCount,
        racer.speed,
        racer.sourceId === record.authority.winnerSourceId,
        record.validation.winnerMatches,
        record.authority.totalDurationMs,
        record.replay.replayTotalDurationMs,
        record.validation.totalDurationDeltaMs,
        record.pool?.opening?.total,
        record.pool?.closing?.total,
        record.pool?.closing?.stakes?.melon,
        record.pool?.closing?.stakes?.blueberry,
        record.pool?.closing?.stakes?.dragonfruit,
        record.pool?.closing?.stakes?.lemon,
        record.pool?.ownPosition?.stakes?.melon,
        record.pool?.ownPosition?.stakes?.blueberry,
        record.pool?.ownPosition?.stakes?.dragonfruit,
        record.pool?.ownPosition?.stakes?.lemon,
        record.validation.poolOpeningCaptured,
        record.validation.poolClosingCaptured,
        record.validation.sessionGapBefore
    ]));

    return [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n') + '\n';
}

async function readArchive(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT') return createEmptyArchive();
        throw new Error(`本地比赛档案无法读取：${String(error.message || error).slice(0, 180)}`);
    }
}

async function writeAtomic(filePath, content) {
    const temporaryPath = `${filePath}.tmp-${process.pid}`;
    await fs.writeFile(temporaryPath, content, {encoding: 'utf8', mode: 0o600});
    await fs.rename(temporaryPath, filePath);
}

async function ensureArchiveDirectory(directory) {
    await fs.mkdir(directory, {recursive: true, mode: 0o700});
    if (process.platform !== 'win32') await fs.chmod(directory, 0o700);
}

function createEmptyPoolState() {
    return {schemaVersion: POOL_STATE_SCHEMA_VERSION, updatedAt: null, sessions: {}};
}

async function readPoolState(filePath) {
    try {
        const state = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return state?.schemaVersion === POOL_STATE_SCHEMA_VERSION
            && state.sessions
            && typeof state.sessions === 'object'
            && !Array.isArray(state.sessions)
            ? state
            : createEmptyPoolState();
    } catch (error) {
        if (error?.code === 'ENOENT') return createEmptyPoolState();
        throw new Error(`本地盘口状态无法读取：${String(error.message || error).slice(0, 180)}`);
    }
}

async function updatePoolCapture(directory, rawPool, rawRacers, accountSourceId, capturedAt = new Date().toISOString()) {
    const checkpoint = aggregatePoolCheckpoint(rawPool, rawRacers, toNumber(accountSourceId, null), capturedAt);
    if (!checkpoint) return {changed: false, sessionId: null, checkpointCount: 0};

    await ensureArchiveDirectory(directory);
    const statePath = path.join(directory, 'slime-race-pool-state.json');
    const state = await readPoolState(statePath);
    const {capture, changed} = mergePoolCheckpoint(state.sessions[checkpoint.sessionId], checkpoint);
    if (!changed) {
        return {changed: false, sessionId: checkpoint.sessionId, checkpointCount: capture.checkpoints.length, statePath};
    }

    const sessions = {...state.sessions, [checkpoint.sessionId]: capture};
    const retainedSessionIds = Object.keys(sessions)
        .map(Number)
        .filter(Number.isSafeInteger)
        .sort((left, right) => right - left)
        .slice(0, MAX_POOL_SESSIONS);
    const retainedSessions = Object.fromEntries(retainedSessionIds.map(sessionId => [sessionId, sessions[sessionId]]));
    const nextState = {schemaVersion: POOL_STATE_SCHEMA_VERSION, updatedAt: capturedAt, sessions: retainedSessions};
    await writeAtomic(statePath, JSON.stringify(nextState, null, 2) + '\n');
    return {changed: true, sessionId: checkpoint.sessionId, checkpointCount: capture.checkpoints.length, statePath};
}

async function updateArchive(directory, rawSessions, rawRacers, archivedAt = new Date().toISOString()) {
    await ensureArchiveDirectory(directory);
    const jsonPath = path.join(directory, 'slime-race-archive.json');
    const markdownPath = path.join(directory, 'slime-race-archive.md');
    const csvPath = path.join(directory, 'slime-race-archive.csv');
    const poolStatePath = path.join(directory, 'slime-race-pool-state.json');
    const existing = await readArchive(jsonPath);
    const poolState = await readPoolState(poolStatePath);
    const {archive, summary} = mergeArchive(existing, rawSessions, rawRacers, archivedAt, poolState.sessions);
    const filesExist = await Promise.all([jsonPath, markdownPath, csvPath].map(filePath => fs.access(filePath).then(() => true, () => false)));
    if (summary.added > 0 || summary.refreshed > 0 || filesExist.some(exists => !exists)) {
        await Promise.all([
            writeAtomic(jsonPath, JSON.stringify(archive, null, 2) + '\n'),
            writeAtomic(markdownPath, renderMarkdown(archive)),
            writeAtomic(csvPath, renderCsv(archive))
        ]);
    }

    const winnerMismatches = archive.records.filter(record => !record.validation.winnerMatches).length;
    const lap1LastMismatches = archive.records.filter(record => record.validation.lap1LastMatches === false).length;
    const durationMismatches = archive.records.filter(record => record.validation.totalDurationDeltaMs !== 0).length;
    const incompleteReplays = archive.records.filter(record => !record.validation.complete).length;
    return {
        ...summary,
        winnerMismatches,
        lap1LastMismatches,
        durationMismatches,
        incompleteReplays,
        directory,
        jsonPath,
        markdownPath,
        csvPath
    };
}

module.exports = Object.freeze({
    ARCHIVE_SCHEMA_VERSION,
    REPLAY_ALGORITHM,
    REPLAY_SOURCE,
    STEP_MS,
    MAX_POOL_CHECKPOINTS,
    MAX_POOL_SESSIONS,
    createRandom,
    replayRace,
    isFinishedSession,
    aggregatePoolCheckpoint,
    mergePoolCheckpoint,
    mergeArchive,
    renderMarkdown,
    renderCsv,
    updatePoolCapture,
    updateArchive
});
