const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const archive = require('../electron/race-archive.cjs');

const racers = [
    {id: 1, name: '迷你哈密瓜', color: '#4ade80', hp: 100, atk: 50, def: 50, spd: 85},
    {id: 2, name: '迷你蓝莓', color: '#60a5fa', hp: 100, atk: 50, def: 50, spd: 87},
    {id: 3, name: '迷你火龙果', color: '#f87171', hp: 100, atk: 50, def: 50, spd: 88},
    {id: 4, name: '迷你柠檬', color: '#facc15', hp: 100, atk: 50, def: 50, spd: 86}
];

function createSession(overrides = {}) {
    const replay = archive.replayRace({seed: overrides.seed ?? 12345}, racers);
    const winner = replay.racers.find(racer => racer.finishRank === 1);
    const lap1Last = replay.racers.find(racer => racer.lap1Rank === racers.length);

    return {
        id: overrides.id ?? 501,
        seed: overrides.seed ?? 12345,
        startedAt: '2026-08-03T02:00:00.000Z',
        raceStartAt: '2026-08-03T02:00:10.000Z',
        status: overrides.status || 'finished',
        winnerId: winner.sourceId,
        totalDurationMs: replay.replayTotalDurationMs,
        raceType: 'official',
        lap1LastId: lap1Last.sourceId,
        ...overrides
    };
}

function createPool(amount = 100, sessionId = 501) {
    return {
        jackpot: 9000,
        witchBonus: 300,
        bets: [
            {id: 11, userId: 91, slimeId: 1, sessionId, amount},
            {id: 12, userId: 92, slimeId: 2, sessionId, amount: 200},
            {id: 13, userId: 93, slimeId: 3, sessionId, amount: 300},
            {id: 14, userId: 91, slimeId: 4, sessionId, amount: 50},
            {id: 15, userId: 91, slimeId: 1, sessionId: null, amount: 99999}
        ]
    };
}

test('official seeded replay produces stable compact rankings and metrics', () => {
    const first = archive.replayRace({seed: 12345}, racers);
    const second = archive.replayRace({seed: 12345}, racers);

    assert.deepEqual(first, second);
    assert.equal(first.complete, true);
    assert.deepEqual(first.racers.map(racer => racer.finishRank).sort(), [1, 2, 3, 4]);
    assert.deepEqual(first.racers.map(racer => racer.lap1Rank).sort(), [1, 2, 3, 4]);
    assert.ok(first.racers.every(racer => racer.finishTimeMs > racer.lap1TimeMs));
    assert.ok(first.racers.some(racer => racer.finishTimeMs % archive.STEP_MS !== 0));
    first.racers.forEach(racer => {
        assert.equal(Object.values(racer.timeInRankMs).reduce((sum, value) => sum + value, 0), racer.finishTickMs);
        assert.equal(Object.values(racer.stumbleByRank).reduce((sum, value) => sum + value, 0), racer.stumbleCount);
        assert.equal(Object.values(racer.burstByRank).reduce((sum, value) => sum + value, 0), racer.burstCount);
    });
    assert.equal(Object.hasOwn(first, 'events'), false);
    assert.equal(Object.hasOwn(first, 'rankTimeline'), false);
    assert.equal(Object.hasOwn(first, 'finishOrder'), false);
    assert.equal(JSON.stringify(first).includes('events'), false);
});

test('archive rejects unfinished sessions so it never predicts an active race', () => {
    assert.equal(archive.isFinishedSession(createSession({status: 'racing'})), false);
    assert.equal(archive.isFinishedSession(createSession()), true);
    const result = archive.mergeArchive(null, [createSession({status: 'racing'})], racers);
    assert.equal(result.archive.recordCount, 0);
});

test('incremental merge deduplicates validated sessions and records gaps', () => {
    const first = archive.mergeArchive(null, [createSession()], racers, '2026-08-03T03:00:00.000Z');
    const second = archive.mergeArchive(first.archive, [createSession()], racers, '2026-08-03T04:00:00.000Z');
    const third = archive.mergeArchive(second.archive, [createSession({id: 503, seed: 12346})], racers);
    const record = second.archive.records[0];

    assert.deepEqual(first.summary, {added: 1, refreshed: 0, total: 1});
    assert.deepEqual(second.summary, {added: 0, refreshed: 0, total: 1});
    assert.equal(record.validation.complete, true);
    assert.equal(record.validation.winnerMatches, true);
    assert.equal(record.validation.lap1LastMatches, true);
    assert.equal(record.validation.totalDurationDeltaMs, 0);
    assert.equal(third.archive.records[1].validation.sessionGapBefore, 1);
    assert.equal(JSON.stringify(record).includes('userId'), false);
});

test('schema v2 discards verbose v1 records and can refresh a completed race with later pool data', () => {
    const oldArchive = {
        schemaVersion: 1,
        records: [{sessionId: 400, replay: {events: [{type: 'burst'}], rankTimeline: []}}]
    };
    const session = createSession();
    const migrated = archive.mergeArchive(oldArchive, [session], racers, '2026-08-03T03:00:00.000Z');
    const checkpoint = archive.aggregatePoolCheckpoint(createPool(), racers, 91, '2026-08-03T03:01:00.000Z');
    const poolCapture = archive.mergePoolCheckpoint(null, checkpoint).capture;
    const refreshed = archive.mergeArchive(
        migrated.archive,
        [session],
        racers,
        '2026-08-03T03:02:00.000Z',
        {501: poolCapture}
    );

    assert.equal(migrated.archive.schemaVersion, 2);
    assert.deepEqual(migrated.archive.records.map(record => record.sessionId), [501]);
    assert.deepEqual(refreshed.summary, {added: 0, refreshed: 1, total: 1});
    assert.equal(refreshed.archive.records[0].pool.closing.total, 650);
    assert.equal(JSON.stringify(refreshed.archive).includes('rankTimeline'), false);
});

test('pool checkpoints retain only aggregate totals and the current account position', () => {
    const checkpoint = archive.aggregatePoolCheckpoint(
        createPool(),
        racers,
        91,
        '2026-08-03T02:00:00.000Z'
    );

    assert.equal(checkpoint.sessionId, 501);
    assert.deepEqual(checkpoint.stakes, {melon: 100, blueberry: 200, dragonfruit: 300, lemon: 50});
    assert.deepEqual(checkpoint.ownPosition, {
        total: 150,
        stakes: {melon: 100, blueberry: 0, dragonfruit: 0, lemon: 50}
    });
    assert.equal(JSON.stringify(checkpoint).includes('userId'), false);
    assert.equal(archive.aggregatePoolCheckpoint(createPool(), racers, null, new Date().toISOString()).ownPosition.total, 0);
    assert.equal(archive.aggregatePoolCheckpoint({bets: []}, racers, 91, new Date().toISOString()), null);
    assert.equal(archive.aggregatePoolCheckpoint({
        bets: [...createPool().bets, {userId: 91, slimeId: 1, sessionId: 502, amount: 10}]
    }, racers, 91, new Date().toISOString()), null);
});

test('pool checkpoint history keeps opening, closing, heartbeats and at most 24 samples', () => {
    let capture;
    let firstCheckpoint;

    for (let index = 0; index < 40; index += 1) {
        const checkpoint = archive.aggregatePoolCheckpoint(
            createPool(100 + index),
            racers,
            91,
            new Date(Date.UTC(2026, 7, 3, 2, 0, index)).toISOString()
        );
        firstCheckpoint ||= checkpoint;
        capture = archive.mergePoolCheckpoint(capture, checkpoint).capture;
    }

    assert.deepEqual(capture.opening, firstCheckpoint);
    assert.equal(capture.closing.stakes.melon, 139);
    assert.equal(capture.checkpoints.length, archive.MAX_POOL_CHECKPOINTS);
    assert.deepEqual(capture.ownPosition, capture.closing.ownPosition);

    const duplicate = {...capture.closing, capturedAt: '2026-08-03T02:00:45.000Z'};
    assert.equal(archive.mergePoolCheckpoint(capture, duplicate).changed, false);
    const heartbeat = {...capture.closing, capturedAt: '2026-08-03T02:01:09.000Z'};
    assert.equal(archive.mergePoolCheckpoint(capture, heartbeat).changed, true);
});

test('writes compact v2 JSON, CSV, Markdown and pool state with restrictive permissions', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slime-race-archive-'));
    await archive.updatePoolCapture(
        directory,
        createPool(),
        racers,
        91,
        '2026-08-03T04:59:00.000Z'
    );
    const result = await archive.updateArchive(directory, [createSession()], racers, '2026-08-03T05:00:00.000Z');
    const poolStatePath = path.join(directory, 'slime-race-pool-state.json');
    const [json, csv, markdown, poolState, directoryStat, jsonStat, csvStat, markdownStat, poolStat] = await Promise.all([
        fs.readFile(result.jsonPath, 'utf8'),
        fs.readFile(result.csvPath, 'utf8'),
        fs.readFile(result.markdownPath, 'utf8'),
        fs.readFile(poolStatePath, 'utf8'),
        fs.stat(directory),
        fs.stat(result.jsonPath),
        fs.stat(result.csvPath),
        fs.stat(result.markdownPath),
        fs.stat(poolStatePath)
    ]);
    const document = JSON.parse(json);

    assert.equal(document.schemaVersion, 2);
    assert.equal(document.recordCount, 1);
    assert.equal(document.records[0].pool.closing.total, 650);
    assert.equal(document.records[0].validation.poolOpeningCaptured, true);
    assert.equal(document.records[0].validation.poolClosingCaptured, true);
    assert.match(csv, /finishRank,finishTickMs,finishTimeMs,finishMarginMs/);
    assert.match(csv, /poolOpeningTotal,poolClosingTotal/);
    assert.match(markdown, /盘口最多保留 24 个聚合检查点/);
    assert.match(markdown, /开盘\/封盘/);
    assert.equal(JSON.parse(poolState).sessions['501'].closing.ownPosition.total, 150);
    assert.doesNotMatch(json + poolState, /events|rankTimeline|userId|username|password|cookie|token/i);
    if (process.platform !== 'win32') {
        assert.equal(directoryStat.mode & 0o777, 0o700);
        [jsonStat, csvStat, markdownStat, poolStat].forEach(stat => assert.equal(stat.mode & 0o777, 0o600));
    }
});
