(function exposeRemoteActions(root, factory) {
    const remoteActions = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = remoteActions;
    }

    root.SlimeRemoteActions = remoteActions;
})(typeof globalThis === 'object' ? globalThis : this, function createRemoteActions() {
    'use strict';

    const RACER_IDS = Object.freeze(['melon', 'blueberry', 'dragonfruit', 'lemon']);
    const LOCKED_STATUSES = new Set(['countdown', 'racing']);

    function toPositiveInteger(value, label) {
        const number = Number(value);

        if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label}必须是大于等于 1 的整数`);
        return number;
    }

    function validateBetIntent(snapshot, intent) {
        if (!snapshot?.account) throw new Error('请先登录并同步账户信息');
        if (snapshot.account.checkinEnabled !== true) throw new Error('当前账户未开通签到，网站不允许下注');

        const racerId = String(intent?.racerId || '');
        if (!RACER_IDS.includes(racerId)) throw new Error('请选择有效的史莱姆');
        const racer = snapshot.racers?.find(item => item.id === racerId);
        if (!racer || !Number.isSafeInteger(racer.sourceId)) throw new Error('实盘史莱姆编号尚未同步');

        const amount = toPositiveInteger(intent?.amount, '下注数量');
        if (amount > snapshot.account.magicFragments) throw new Error('持有碎片不足，无法提交这笔下注');

        const status = String(snapshot.current?.status || '').toLowerCase();
        if (LOCKED_STATUSES.has(status)) throw new Error('当前比赛已经封盘，不能继续下注');

        const existingStakes = snapshot.currentUserPool?.stakes || {};
        const selected = new Set(RACER_IDS.filter(id => Number(existingStakes[id]) > 0));
        selected.add(racerId);
        if (selected.size > 2) throw new Error('整场最多选择两只史莱姆，不能改投第三只');

        return {racerId, slimeId: racer.sourceId, amount};
    }

    function validateBetBatch(snapshot, intents) {
        if (!Array.isArray(intents) || intents.length < 1 || intents.length > 2) throw new Error('一键下注必须包含一至两笔建议');

        const virtualSnapshot = {
            ...snapshot,
            account: snapshot?.account ? {...snapshot.account} : null,
            currentUserPool: {
                ...snapshot?.currentUserPool,
                stakes: {...snapshot?.currentUserPool?.stakes}
            }
        };
        const seen = new Set();

        return intents.map(intent => {
            const validated = validateBetIntent(virtualSnapshot, intent);
            if (seen.has(validated.racerId)) throw new Error('一键下注建议不能重复包含同一只史莱姆');
            seen.add(validated.racerId);
            virtualSnapshot.account.magicFragments -= validated.amount;
            virtualSnapshot.currentUserPool.stakes[validated.racerId] =
                (Number(virtualSnapshot.currentUserPool.stakes[validated.racerId]) || 0) + validated.amount;
            return validated;
        });
    }

    function validateClaimIntent(snapshot, rewardId) {
        if (!snapshot?.account) throw new Error('请先登录并同步账户信息');
        const normalizedRewardId = toPositiveInteger(rewardId, '奖励编号');
        const reward = snapshot.pendingRewards?.find(item => item.rewardId === normalizedRewardId);

        if (!reward) throw new Error('这笔奖励已领取或已失效，请重新同步');
        return reward;
    }

    return Object.freeze({RACER_IDS, validateBetIntent, validateBetBatch, validateClaimIntent});
});
