const assert = require('node:assert/strict');
const test = require('node:test');
const betLedger = require('../app/scripts/bet-ledger.js');

function createSnapshot(overrides = {}) {
    return {
        mode: 'full',
        updatedAt: '2026-08-05T04:01:00.000Z',
        account: {storageKey: 'u-accountone'},
        sessions: [{
            sessionId: 701,
            status: 'finished',
            winnerId: 'melon',
            raceStartAt: '2026-08-05T04:00:00.000Z',
            totalDurationMs: 40000
        }],
        myBets: [
            {sessionId: 701, sessionStatus: 'finished', racerId: 'melon', amount: 200, won: true, rewardAmount: 600, rewardClaimed: false},
            {sessionId: 701, sessionStatus: 'finished', racerId: 'lemon', amount: 100, won: false, rewardAmount: 0, rewardClaimed: false},
            {sessionId: 702, sessionStatus: 'betting', racerId: 'blueberry', amount: 50, won: false, rewardAmount: 0, rewardClaimed: false}
        ],
        ...overrides
    };
}

test('已结算下注按场次归并并计算投入、返还和净盈亏', () => {
    const empty = betLedger.createEmptyLedger('u-accountone');
    const first = betLedger.mergeSettledBets(empty, createSnapshot());
    const record = first.ledger.records[0];

    assert.equal(first.changed, true);
    assert.equal(first.added, 1);
    assert.equal(record.sessionId, 701);
    assert.equal(record.dateKey, '2026-08-05');
    assert.equal(record.spent, 300);
    assert.equal(record.returned, 600);
    assert.equal(record.netProfit, 300);
    assert.deepEqual(record.bets.map(bet => bet.racerId), ['melon', 'lemon']);
    assert.equal(first.ledger.records.some(item => item.sessionId === 702), false);

    const duplicate = betLedger.mergeSettledBets(first.ledger, createSnapshot());
    assert.equal(duplicate.changed, false);
    assert.equal(duplicate.added, 0);
});

test('账本仅在领取状态等结算内容变化时更新同一场记录', () => {
    const first = betLedger.mergeSettledBets(betLedger.createEmptyLedger('u-accountone'), createSnapshot());
    const claimedBets = createSnapshot().myBets.map(bet => ({...bet, rewardClaimed: bet.sessionId === 701}));
    const refreshed = betLedger.mergeSettledBets(first.ledger, createSnapshot({myBets: claimedBets}), '2026-08-05T05:00:00.000Z');

    assert.equal(refreshed.changed, true);
    assert.equal(refreshed.added, 0);
    assert.equal(refreshed.ledger.records[0].bets.every(bet => bet.rewardClaimed), true);
});

test('场次退出服务端最近窗口后仍保留本地原结算时间', () => {
    const first = betLedger.mergeSettledBets(betLedger.createEmptyLedger('u-accountone'), createSnapshot());
    const withoutSession = createSnapshot({
        sessions: [],
        myBets: createSnapshot().myBets.filter(bet => bet.sessionId === 701).map(bet => ({
            ...bet,
            createdAt: '2026-08-05T03:50:00.000Z',
            rewardClaimed: true
        }))
    });
    const refreshed = betLedger.mergeSettledBets(first.ledger, withoutSession, '2026-08-20T00:00:00.000Z');

    assert.equal(refreshed.changed, true);
    assert.equal(refreshed.ledger.records[0].settledAt, '2026-08-05T04:00:40.000Z');
    assert.equal(refreshed.ledger.records[0].dateKey, '2026-08-05');
    assert.equal(refreshed.ledger.records[0].winnerId, 'melon');
});

test('前台汇总只返回上海时区最近三个自然日而保留更早本地数据', () => {
    const ledger = {
        schemaVersion: 1,
        accountKey: 'u-accountone',
        updatedAt: '2026-08-05T12:00:00.000Z',
        records: [
            {sessionId: 701, settledAt: '2026-08-05T04:00:40.000Z', winnerId: 'melon', bets: [{racerId: 'melon', amount: 200, won: true, rewardAmount: 600, rewardClaimed: false}]},
            {sessionId: 700, settledAt: '2026-08-04T04:00:40.000Z', winnerId: 'lemon', bets: [{racerId: 'blueberry', amount: 100, won: false, rewardAmount: 0, rewardClaimed: false}]},
            {sessionId: 699, settledAt: '2026-08-02T04:00:40.000Z', winnerId: 'lemon', bets: [{racerId: 'lemon', amount: 100, won: true, rewardAmount: 250, rewardClaimed: true}]}
        ]
    };
    const normalized = betLedger.mergeSettledBets(ledger, createSnapshot({myBets: [], sessions: []})).ledger;
    const summary = betLedger.getRecentDailySummaries(normalized, '2026-08-05T12:00:00.000Z', 3);

    assert.deepEqual(summary.days.map(day => day.dateKey), ['2026-08-05', '2026-08-04', '2026-08-03']);
    assert.equal(summary.sessions, 2);
    assert.equal(summary.spent, 300);
    assert.equal(summary.returned, 600);
    assert.equal(normalized.records.length, 3);
});

test('本地存储键按用户散列隔离且不含原始账号标识', () => {
    const first = betLedger.getAccountStorageKey({id: 9001, username: 'tester'});
    const second = betLedger.getAccountStorageKey({id: 9002, username: 'tester'});
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value)
    };
    const ledger = {...betLedger.createEmptyLedger(first), updatedAt: '2026-08-05T00:00:00.000Z'};
    betLedger.saveLedger(storage, ledger);

    assert.notEqual(first, second);
    assert.doesNotMatch(`${first}:${second}`, /9001|9002|tester/);
    assert.equal(betLedger.loadLedger(storage, first).updatedAt, ledger.updatedAt);
    assert.equal(betLedger.loadLedger(storage, second).records.length, 0);
});
