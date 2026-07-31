(function exposeDailyQuest(root, factory) {
    const dailyQuest = factory();

    if (typeof module === 'object' && module.exports) module.exports = dailyQuest;
    if (root) root.SlimeDailyQuest = dailyQuest;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDailyQuest() {
    'use strict';

    const CLAIM_ENDPOINTS = Object.freeze({
        dodge: '/api/dodge-game/claim',
        timer: '/api/timer-game/claim'
    });
    const CLAIM_TYPES = Object.freeze(Object.keys(CLAIM_ENDPOINTS));
    const AUTOMATIC_TIMER_SECONDS = 60;
    const TIMER_MAX_ERROR_SECONDS = 0.2;
    const TIMER_ERROR_STEP_SECONDS = 0.01;

    function toNonNegativeInteger(value) {
        const number = Number(value);
        return Number.isSafeInteger(number) && number >= 0 ? number : 0;
    }

    function normalizeCountTask(raw) {
        return {
            completionCount: toNonNegativeInteger(raw?.completionCount),
            fragmentsEarned: toNonNegativeInteger(raw?.fragmentsEarned),
            maxDaily: toNonNegativeInteger(raw?.maxDaily)
        };
    }

    function normalizeGameTask(raw) {
        return {
            gamesPlayed: toNonNegativeInteger(raw?.gamesPlayed),
            rewardsEarned: toNonNegativeInteger(raw?.rewardsEarned),
            rewardsClaimed: toNonNegativeInteger(raw?.rewardsClaimed),
            unclaimed: toNonNegativeInteger(raw?.unclaimed),
            maxRewards: toNonNegativeInteger(raw?.maxRewards)
        };
    }

    function normalizeText(raw) {
        const id = Number(raw?.id);
        const content = String(raw?.content || '').trim();

        if (!Number.isSafeInteger(id) || id < 1 || !content) return null;
        return {id, content};
    }

    function normalizeDailyQuest(raw = {}) {
        return {
            updatedAt: new Date().toISOString(),
            text: normalizeText(raw.text),
            recite: normalizeCountTask(raw.progress?.recite),
            click: normalizeCountTask(raw.progress?.click),
            dodge: normalizeGameTask(raw.progress?.dodge),
            timer: normalizeGameTask(raw.progress?.timer)
        };
    }

    function validateReciteSubmission(state, input) {
        if (!state?.text) throw new Error('当前没有可用的复述题目，请先刷新日常任务');
        const text = String(input?.text || '');

        if (!text.trim()) throw new Error('请提供题目文字');
        if (text.length > 2000) throw new Error('复述内容过长，请重新刷新题目');
        if (Number(input?.questTextId) !== state.text.id) throw new Error('题目已经变化，请刷新后重新输入');
        return {text, questTextId: state.text.id};
    }

    function createAutomaticReciteSubmission(state) {
        return validateReciteSubmission(state, {text: state?.text?.content, questTextId: state?.text?.id});
    }

    function validateClickCompletion(state, clickCount) {
        const count = toNonNegativeInteger(clickCount);

        if (count !== 100) throw new Error('必须完成一轮 100 次点击');
        if (!state?.click) throw new Error('点击任务状态尚未同步');
        if (state.click.maxDaily > 0 && state.click.completionCount >= state.click.maxDaily) throw new Error('今日点击任务奖励已经达到上限');
        return {count};
    }

    function validateTimerAvailability(state) {
        if (!state?.timer) throw new Error('报时任务状态尚未同步');
        if (state.timer.maxRewards > 0 && state.timer.rewardsEarned >= state.timer.maxRewards) throw new Error('今日报时奖励已经达到上限');
    }

    function createAutomaticTimerSubmission(state) {
        validateTimerAvailability(state);
        return {actualTime: AUTOMATIC_TIMER_SECONDS};
    }

    function createRandomTimerSubmission(state, random = Math.random) {
        validateTimerAvailability(state);
        const sample = Number(random());

        if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new Error('随机数必须位于 0 到 1 之间');
        const stepCount = Math.round(TIMER_MAX_ERROR_SECONDS / TIMER_ERROR_STEP_SECONDS) * 2 + 1;
        const step = Math.min(stepCount - 1, Math.floor(sample * stepCount));
        const errorInHundredths = step - Math.floor(stepCount / 2);
        return {actualTime: Number((AUTOMATIC_TIMER_SECONDS + errorInHundredths / 100).toFixed(2))};
    }

    function normalizeTimerSubmissionResult(raw, actualTime) {
        const submittedTime = Number(actualTime);
        const serverDiff = Number(raw?.diff);

        if (!Number.isFinite(submittedTime)) throw new Error('报时提交值无效');
        return {
            actualTime: Number(submittedTime.toFixed(2)),
            absoluteError: Number(Math.abs(submittedTime - AUTOMATIC_TIMER_SECONDS).toFixed(2)),
            isSuccess: raw?.isSuccess === true,
            diff: Number.isFinite(serverDiff) ? Number(Math.abs(serverDiff).toFixed(3)) : null,
            message: String(raw?.message || '').slice(0, 240)
        };
    }

    function validateGameClaim(state, type) {
        const normalizedType = String(type || '').toLowerCase();

        if (!CLAIM_TYPES.includes(normalizedType)) throw new Error('不支持的日常奖励类型');
        const task = state?.[normalizedType];
        if (!task || task.unclaimed < 1) throw new Error('当前没有可领取的小游戏奖励');
        return {type: normalizedType, endpoint: CLAIM_ENDPOINTS[normalizedType], unclaimed: task.unclaimed};
    }

    return Object.freeze({
        CLAIM_ENDPOINTS,
        CLAIM_TYPES,
        AUTOMATIC_TIMER_SECONDS,
        TIMER_MAX_ERROR_SECONDS,
        TIMER_ERROR_STEP_SECONDS,
        normalizeDailyQuest,
        validateReciteSubmission,
        createAutomaticReciteSubmission,
        validateClickCompletion,
        createAutomaticTimerSubmission,
        createRandomTimerSubmission,
        normalizeTimerSubmissionResult,
        validateGameClaim
    });
});
