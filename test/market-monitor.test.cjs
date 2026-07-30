const assert = require('node:assert/strict');
const test = require('node:test');
const monitor = require('../app/scripts/market-monitor.js');

const probabilities = {melon: 78, blueberry: 115, dragonfruit: 167, lemon: 99};

function snapshot(total, stakes, options = {}) {
    return {
        pool: {total, stakes, sessionId: options.sessionId ?? null},
        currentUserPool: {total: options.ownTotal || 0, stakes: options.ownStakes || {}},
        account: {magicFragments: 10000},
        current: {status: options.status || 'finished', sessionId: options.sessionId ?? null, winnerId: options.winnerId || null}
    };
}

test('盘口监控只记录聚合池、个人仓位和余额', () => {
    const state = monitor.recordSnapshot({}, snapshot(10000, {
        melon: 1000,
        blueberry: 2000,
        dragonfruit: 5000,
        lemon: 2000
    }, {ownTotal: 100, ownStakes: {melon: 100}}), probabilities, 1000);
    const text = JSON.stringify(state);

    assert.equal(state.active.points[0].total, 10000);
    assert.equal(state.active.points[0].ownTotal, 100);
    assert.doesNotMatch(text, /userId|username|betId/);
});

test('奖池重置时完成上一场并计算近期平均封盘池', () => {
    let state = monitor.recordSnapshot({}, snapshot(10000, {melon: 1000, blueberry: 2000, dragonfruit: 5000, lemon: 2000}), probabilities, 1000);
    state = monitor.recordSnapshot(state, snapshot(30000, {melon: 3000, blueberry: 7000, dragonfruit: 14000, lemon: 6000}), probabilities, 4000);
    state = monitor.recordSnapshot(state, snapshot(1000, {melon: 250, blueberry: 250, dragonfruit: 250, lemon: 250}), probabilities, 7000);
    const analysis = monitor.analyze(state, probabilities);

    assert.equal(state.rounds.length, 1);
    assert.equal(state.rounds[0].closingTotal, 30000);
    assert.equal(analysis.completedRounds, 1);
    assert.equal(analysis.averageClosingTotal, 30000);
});

test('连续增量样本可以拟合公众高赔率倾向', () => {
    const points = [
        {stakes: {melon: 1000, blueberry: 4000, dragonfruit: 12000, lemon: 3000}},
        {stakes: {melon: 5000, blueberry: 5500, dragonfruit: 12500, lemon: 6500}},
        {stakes: {melon: 8000, blueberry: 7000, dragonfruit: 13000, lemon: 9000}}
    ];
    const fitted = monitor.fitOddsShare(points, probabilities);

    assert.ok(fitted.oddsShare >= 0.5);
});

test('未绑定的新盘口不会误记上一场冠军', () => {
    let state = monitor.recordSnapshot({}, snapshot(1000, {
        melon: 250,
        blueberry: 250,
        dragonfruit: 250,
        lemon: 250
    }, {winnerId: 'melon'}), probabilities, 1000);

    assert.equal(state.active.winnerId, null);
    state = monitor.recordSnapshot(state, snapshot(2000, {
        melon: 500,
        blueberry: 500,
        dragonfruit: 500,
        lemon: 500
    }, {sessionId: 501, winnerId: 'blueberry'}), probabilities, 4000);
    assert.equal(state.active.winnerId, 'blueberry');
});
