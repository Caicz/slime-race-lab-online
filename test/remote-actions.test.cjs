const assert = require('node:assert/strict');
const test = require('node:test');
const actions = require('../app/scripts/remote-actions.js');

function createSnapshot(overrides = {}) {
    return {
        account: {magicFragments: 1000, checkinEnabled: true},
        current: {status: 'finished'},
        racers: [
            {id: 'melon', sourceId: 11},
            {id: 'blueberry', sourceId: 12},
            {id: 'dragonfruit', sourceId: 13},
            {id: 'lemon', sourceId: 14}
        ],
        currentUserPool: {stakes: {melon: 100, blueberry: 0, dragonfruit: 0, lemon: 0}},
        pendingRewards: [{rewardId: 91, amount: 500}],
        ...overrides
    };
}

test('远程下注只接受大于等于 1 的整数并映射实盘编号', () => {
    const result = actions.validateBetIntent(createSnapshot(), {racerId: 'blueberry', amount: 1});

    assert.deepEqual(result, {racerId: 'blueberry', slimeId: 12, amount: 1});
    assert.throws(() => actions.validateBetIntent(createSnapshot(), {racerId: 'blueberry', amount: 0}), /大于等于 1/);
    assert.throws(() => actions.validateBetIntent(createSnapshot(), {racerId: 'blueberry', amount: 1.5}), /整数/);
});

test('远程下注拒绝余额不足、封盘和第三只史莱姆', () => {
    assert.throws(() => actions.validateBetIntent(createSnapshot(), {racerId: 'blueberry', amount: 1001}), /持有碎片不足/);
    assert.throws(() => actions.validateBetIntent(createSnapshot({current: {status: 'countdown'}}), {racerId: 'blueberry', amount: 1}), /已经封盘/);
    assert.throws(() => actions.validateBetIntent(createSnapshot({
        currentUserPool: {stakes: {melon: 100, blueberry: 100, dragonfruit: 0, lemon: 0}}
    }), {racerId: 'lemon', amount: 1}), /第三只/);
});

test('远程领取只接受当前待领取列表中的奖励', () => {
    assert.deepEqual(actions.validateClaimIntent(createSnapshot(), 91), {rewardId: 91, amount: 500});
    assert.throws(() => actions.validateClaimIntent(createSnapshot(), 92), /已领取或已失效/);
});
