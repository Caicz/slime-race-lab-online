const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../app/scripts/engine.js');
const realStats = require('../app/scripts/real-stats.js');

const racers = [
    {id: 'melon', wins: 80},
    {id: 'blueberry', wins: 120},
    {id: 'dragonfruit', wins: 170},
    {id: 'lemon', wins: 100}
];

test('全量同步生成最小胜场快照并过滤无效最近冠军', () => {
    const snapshot = realStats.mergeRemoteSnapshot(null, {
        mode: 'full',
        updatedAt: '2026-08-03T08:00:00.000Z',
        racers,
        sessions: [{sessionId: 502}, {sessionId: 501}],
        recentWinnerIds: ['melon', 'unknown', 'blueberry']
    });

    assert.deepEqual(snapshot, {
        schemaVersion: 1,
        updatedAt: '2026-08-03T08:00:00.000Z',
        historyUpdatedAt: '2026-08-03T08:00:00.000Z',
        lastSessionId: 502,
        wins: {melon: 80, blueberry: 120, dragonfruit: 170, lemon: 100},
        recentWinnerIds: ['melon', 'blueberry']
    });
    assert.doesNotMatch(JSON.stringify(snapshot), /account|user|password|cookie|token|sessions/i);
});

test('轻量同步更新累计胜场并保留最近场次摘要', () => {
    const existing = realStats.mergeRemoteSnapshot(null, {
        mode: 'full',
        updatedAt: '2026-08-03T08:00:00.000Z',
        racers,
        sessions: [{sessionId: 502}],
        recentWinnerIds: ['melon', 'blueberry']
    });
    const next = realStats.mergeRemoteSnapshot(existing, {
        mode: 'live',
        updatedAt: '2026-08-03T08:00:04.000Z',
        racers: racers.map(racer => racer.id === 'lemon' ? {...racer, wins: 101} : racer),
        recentWinnerIds: []
    });

    assert.equal(next.updatedAt, '2026-08-03T08:00:04.000Z');
    assert.equal(next.historyUpdatedAt, '2026-08-03T08:00:00.000Z');
    assert.equal(next.lastSessionId, 502);
    assert.equal(next.wins.lemon, 101);
    assert.deepEqual(next.recentWinnerIds, ['melon', 'blueberry']);
});

test('损坏或不完整的缓存和联网数据不会进入胜场模型', () => {
    assert.equal(realStats.normalizeStoredSnapshot({schemaVersion: 1, wins: {melon: 1}}), null);
    assert.equal(realStats.mergeRemoteSnapshot(null, {mode: 'live', racers: racers.slice(0, 3)}), null);
    assert.equal(realStats.mergeRemoteSnapshot(null, {
        mode: 'live',
        racers: racers.map(racer => racer.id === 'melon' ? {...racer, wins: -1} : racer)
    }), null);
});

test('胜率只由缓存的联网累计胜场计算', () => {
    const snapshot = realStats.mergeRemoteSnapshot(null, {
        mode: 'full',
        updatedAt: '2026-08-03T08:00:00.000Z',
        racers,
        sessions: [],
        recentWinnerIds: []
    });
    const stats = realStats.calculateStats(engine.RACERS, snapshot);

    assert.equal(stats.total, 470);
    assert.equal(stats.racers.find(racer => racer.id === 'dragonfruit').wins, 170);
    assert.equal(stats.racers.find(racer => racer.id === 'dragonfruit').rate, 170 / 470);
    assert.equal(engine.RACERS.some(racer => Object.hasOwn(racer, 'observedWins')), false);
});
