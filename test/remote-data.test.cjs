const assert = require('node:assert/strict');
const test = require('node:test');
const remoteData = require('../app/scripts/remote-data.js');

const racers = [
    {id: 11, name: '迷你哈密瓜', wins: 79},
    {id: 12, name: '迷你蓝莓', wins: 115},
    {id: 13, name: '迷你火龙果', wins: 168},
    {id: 14, name: '迷你柠檬', wins: 99}
];

test('下注快照只读取必要接口并复用史莱姆映射', () => {
    assert.deepEqual(remoteData.getSnapshotEndpointNames('bet', true), ['current', 'bets', 'account']);
    assert.deepEqual(remoteData.getSnapshotEndpointNames('bet', false), ['racers', 'current', 'bets', 'account']);
    assert.deepEqual(remoteData.getSnapshotEndpointNames('live', true), ['current', 'racers', 'bets', 'pendingRewards', 'account']);
    assert.deepEqual(remoteData.getSnapshotEndpointNames('full', true), ['current', 'racers', 'bets', 'pendingRewards', 'account', 'sessions', 'myBets', 'myStats']);

    const snapshot = remoteData.normalizeSnapshot({mode: 'bet', racers, bets: {bets: []}});
    assert.equal(snapshot.mode, 'bet');
});

test('逐笔实盘押注会聚合并丢弃其他玩家标识', () => {
    const snapshot = remoteData.normalizeSnapshot({
        mode: 'full',
        account: {id: 9001, username: 'tester', magicFragments: 12345, checkinEnabled: true},
        racers,
        bets: {
            bets: [
                {id: 1, userId: 9001, slimeId: 13, sessionId: null, amount: 12000},
                {id: 2, userId: 9002, slimeId: 13, sessionId: null, amount: 8000},
                {id: 3, userId: 9001, slimeId: 12, sessionId: null, amount: 5000}
            ],
            jackpot: 30000,
            witchBonus: 500
        },
        pendingRewards: [{id: 81, userId: 9001, amount: 600, claimed: false}],
        sessions: []
    });

    assert.equal(snapshot.pool.stakes.dragonfruit, 20000);
    assert.equal(snapshot.pool.stakes.blueberry, 5000);
    assert.equal(snapshot.pool.total, 25000);
    assert.equal(snapshot.pool.phase, 'unbound');
    assert.equal(snapshot.account.magicFragments, 12345);
    assert.match(snapshot.account.storageKey, /^u-[a-z0-9]+$/);
    assert.equal(snapshot.currentUserPool.total, 17000);
    assert.deepEqual(snapshot.currentUserPool.selectedIds, ['blueberry', 'dragonfruit']);
    assert.deepEqual(snapshot.pendingRewards, [{rewardId: 81, amount: 600}]);
    assert.equal(snapshot.pendingRewardTotal, 600);
    assert.doesNotMatch(JSON.stringify(snapshot), /userId|betId|9001|9002|tester/);
});

test('上一场状态与下一场未绑定盘口保持独立', () => {
    const snapshot = remoteData.normalizeSnapshot({
        racers,
        current: {id: 481, status: 'finished', winnerId: 11, totalDurationMs: 42100},
        bets: {bets: [{userId: 1, slimeId: 12, sessionId: null, amount: 1000}]},
        sessions: [{id: 481, status: 'finished', winnerId: 11, totalDurationMs: 42100}]
    });

    assert.equal(snapshot.current.sessionId, 481);
    assert.equal(snapshot.current.winnerId, 'melon');
    assert.equal(snapshot.pool.sessionId, null);
    assert.equal(snapshot.pool.phase, 'unbound');
});

test('个人下注只保留分析所需字段', () => {
    const snapshot = remoteData.normalizeSnapshot({
        racers,
        bets: {bets: []},
        myBets: [{betId: 77, slimeId: 14, amount: 300, sessionId: 480, sessionStatus: 'finished', won: true, rewardAmount: 900, rewardClaimed: false}],
        myStats: {totalSpent: 1000, totalWon: 1200, netProfit: 200, totalBets: 4, totalWins: 2}
    });

    assert.deepEqual(snapshot.myBets[0], {
        racerId: 'lemon',
        amount: 300,
        sessionId: 480,
        sessionStatus: 'finished',
        won: true,
        rewardAmount: 900,
        rewardClaimed: false,
        createdAt: null
    });
    assert.doesNotMatch(JSON.stringify(snapshot), /betId|77/);
    assert.equal(snapshot.myStats.netProfit, 200);
});
