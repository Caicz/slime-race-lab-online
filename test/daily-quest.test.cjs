const assert = require('node:assert/strict');
const test = require('node:test');
const dailyQuest = require('../app/scripts/daily-quest.js');

function createState(overrides = {}) {
    return {
        text: {id: 31, content: '今天也要支持奏奏公主'},
        recite: {completionCount: 2, fragmentsEarned: 2, maxDaily: 10},
        click: {completionCount: 3, fragmentsEarned: 3, maxDaily: 10},
        dodge: {gamesPlayed: 1, rewardsEarned: 3, rewardsClaimed: 1, unclaimed: 2, maxRewards: 10},
        timer: {gamesPlayed: 0, rewardsEarned: 0, rewardsClaimed: 0, unclaimed: 0, maxRewards: 10},
        ...overrides
    };
}

test('日常任务状态只保留进度和当前题目', () => {
    const state = dailyQuest.normalizeDailyQuest({
        text: {id: 31, content: '  今天也要支持奏奏公主  ', createdAt: 'secret', isActive: true},
        progress: {
            recite: {completionCount: 2, fragmentsEarned: 2, maxDaily: 10, userId: 99},
            click: {completionCount: 3, fragmentsEarned: 3, maxDaily: 10},
            dodge: {gamesPlayed: 1, rewardsEarned: 3, rewardsClaimed: 1, unclaimed: 2, maxRewards: 10},
            timer: {gamesPlayed: 0, rewardsEarned: 0, rewardsClaimed: 0, unclaimed: 0, maxRewards: 10}
        }
    });

    assert.deepEqual(state.text, {id: 31, content: '今天也要支持奏奏公主'});
    assert.equal(state.dodge.unclaimed, 2);
    assert.doesNotMatch(JSON.stringify(state), /userId|createdAt|secret/);
});

test('复述任务要求当前题目和待提交内容', () => {
    assert.deepEqual(dailyQuest.validateReciteSubmission(createState(), {text: '今天也要支持奏奏公主', questTextId: 31}), {
        text: '今天也要支持奏奏公主',
        questTextId: 31
    });
    assert.throws(() => dailyQuest.validateReciteSubmission(createState(), {text: '', questTextId: 31}), /提供题目文字/);
    assert.throws(() => dailyQuest.validateReciteSubmission(createState(), {text: '旧题目', questTextId: 30}), /题目已经变化/);
});

test('自动复述使用当前服务器题目', () => {
    assert.deepEqual(dailyQuest.createAutomaticReciteSubmission(createState()), {
        text: '今天也要支持奏奏公主',
        questTextId: 31
    });
    assert.throws(() => dailyQuest.createAutomaticReciteSubmission(createState({text: null})), /没有可用/);
});

test('点击任务只接受整轮 100 次点击', () => {
    assert.deepEqual(dailyQuest.validateClickCompletion(createState(), 100), {count: 100});
    assert.throws(() => dailyQuest.validateClickCompletion(createState(), 99), /一轮 100 次/);
    assert.throws(() => dailyQuest.validateClickCompletion(createState({click: {completionCount: 10, fragmentsEarned: 10, maxDaily: 10}}), 100), /达到上限/);
});

test('自动报时固定提交 60.00 秒并遵守每日奖励上限', () => {
    assert.deepEqual(dailyQuest.createAutomaticTimerSubmission(createState()), {actualTime: 60});
    assert.throws(() => dailyQuest.createAutomaticTimerSubmission(createState({
        timer: {gamesPlayed: 10, rewardsEarned: 10, rewardsClaimed: 0, unclaimed: 10, maxRewards: 10}
    })), /达到上限/);
});

test('随机误差报时覆盖正负 0.20 秒且始终保留百分之一秒精度', () => {
    assert.deepEqual(dailyQuest.createRandomTimerSubmission(createState(), () => 0), {actualTime: 59.8});
    assert.deepEqual(dailyQuest.createRandomTimerSubmission(createState(), () => 0.5), {actualTime: 60});
    assert.deepEqual(dailyQuest.createRandomTimerSubmission(createState(), () => 0.999999), {actualTime: 60.2});
    assert.deepEqual(dailyQuest.createRandomTimerSubmission(createState(), () => 1), {actualTime: 60.2});

    for (let index = 0; index <= 1000; index += 1) {
        const result = dailyQuest.createRandomTimerSubmission(createState(), () => index / 1000);
        const hundredths = Math.round(result.actualTime * 100);
        assert.ok(result.actualTime >= 59.8 && result.actualTime <= 60.2);
        assert.equal(result.actualTime * 100, hundredths);
    }
});

test('随机误差报时拒绝无效随机数和已达每日上限的任务', () => {
    assert.throws(() => dailyQuest.createRandomTimerSubmission(createState(), () => -0.01), /0 到 1/);
    assert.throws(() => dailyQuest.createRandomTimerSubmission(createState(), () => Number.NaN), /0 到 1/);
    assert.throws(() => dailyQuest.createRandomTimerSubmission(createState({
        timer: {gamesPlayed: 10, rewardsEarned: 10, rewardsClaimed: 0, unclaimed: 10, maxRewards: 10}
    }), () => 0.5), /达到上限/);
});

test('报时结果只保留提交值、误差和服务端判定', () => {
    assert.deepEqual(dailyQuest.normalizeTimerSubmissionResult({
        isSuccess: true,
        diff: -0.1996,
        message: '测试成功',
        userId: 99,
        achievement: {secret: true}
    }, 59.8), {
        actualTime: 59.8,
        absoluteError: 0.2,
        isSuccess: true,
        diff: 0.2,
        message: '测试成功'
    });
    assert.deepEqual(dailyQuest.normalizeTimerSubmissionResult({}, 60.01), {
        actualTime: 60.01,
        absoluteError: 0.01,
        isSuccess: false,
        diff: null,
        message: ''
    });
});

test('小游戏只允许领取已经产生的待领奖励', () => {
    assert.deepEqual(dailyQuest.CLAIM_ENDPOINTS, {
        dodge: '/api/dodge-game/claim',
        timer: '/api/timer-game/claim'
    });
    assert.deepEqual(dailyQuest.validateGameClaim(createState(), 'dodge'), {
        type: 'dodge',
        endpoint: '/api/dodge-game/claim',
        unclaimed: 2
    });
    assert.throws(() => dailyQuest.validateGameClaim(createState(), 'timer'), /没有可领取/);
    assert.throws(() => dailyQuest.validateGameClaim(createState(), 'unknown'), /不支持/);
});
