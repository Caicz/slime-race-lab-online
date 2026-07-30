(function exposeRemoteData(root, factory) {
    const remoteData = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = remoteData;
    }

    root.SlimeRemoteData = remoteData;
})(typeof globalThis === 'object' ? globalThis : this, function createRemoteData() {
    'use strict';

    const RACER_IDS = Object.freeze(['melon', 'blueberry', 'dragonfruit', 'lemon']);
    const NAME_TO_ID = Object.freeze({
        '迷你哈密瓜': 'melon',
        '哈密瓜': 'melon',
        '迷你蓝莓': 'blueberry',
        '蓝莓': 'blueberry',
        '迷你火龙果': 'dragonfruit',
        '火龙果': 'dragonfruit',
        '迷你柠檬': 'lemon',
        '柠檬': 'lemon'
    });

    function toNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function getRacerId(name) {
        const normalized = String(name || '').trim();
        return NAME_TO_ID[normalized] || null;
    }

    function normalizeRacers(rawRacers) {
        const racers = Array.isArray(rawRacers) ? rawRacers : [];
        const normalized = racers.map(racer => ({
            id: getRacerId(racer?.name),
            sourceId: toNumber(racer?.id, -1),
            wins: Math.max(0, toNumber(racer?.wins))
        })).filter(racer => racer.id && racer.sourceId >= 0);
        const bySourceId = Object.fromEntries(normalized.map(racer => [racer.sourceId, racer.id]));
        const winsById = Object.fromEntries(normalized.map(racer => [racer.id, racer.wins]));

        return {
            racers: RACER_IDS.filter(id => Object.hasOwn(winsById, id)).map(id => {
                const racer = normalized.find(item => item.id === id);
                return {id, sourceId: racer.sourceId, wins: winsById[id]};
            }),
            bySourceId
        };
    }

    function aggregatePool(rawPool, bySourceId) {
        const stakes = Object.fromEntries(RACER_IDS.map(id => [id, 0]));
        const bets = Array.isArray(rawPool?.bets) ? rawPool.bets : [];
        const sessionIds = new Set();

        bets.forEach(bet => {
            const id = bySourceId[toNumber(bet?.slimeId, -1)];

            if (id) stakes[id] += Math.max(0, toNumber(bet?.amount));
            if (bet?.sessionId !== null && bet?.sessionId !== undefined) sessionIds.add(toNumber(bet.sessionId));
        });

        const total = RACER_IDS.reduce((sum, id) => sum + stakes[id], 0);
        const sessionId = sessionIds.size === 1 ? [...sessionIds][0] : null;
        const phase = bets.length === 0 ? 'empty' : sessionIds.size === 0 ? 'unbound' : sessionIds.size === 1 ? 'bound' : 'mixed';

        return {
            stakes,
            total,
            jackpot: Math.max(0, toNumber(rawPool?.jackpot)),
            witchBonus: Math.max(0, toNumber(rawPool?.witchBonus)),
            sessionId,
            phase
        };
    }

    function normalizeCurrent(rawCurrent, bySourceId) {
        if (!rawCurrent || typeof rawCurrent !== 'object') return null;

        return {
            sessionId: toNumber(rawCurrent.id, null),
            status: String(rawCurrent.status || 'unknown'),
            winnerId: bySourceId[toNumber(rawCurrent.winnerId, -1)] || null,
            startedAt: rawCurrent.startedAt || null,
            raceStartAt: rawCurrent.raceStartAt || null,
            totalDurationMs: Math.max(0, toNumber(rawCurrent.totalDurationMs))
        };
    }

    function normalizeSessions(rawSessions, bySourceId) {
        if (!Array.isArray(rawSessions)) return [];

        return rawSessions.map(session => ({
            sessionId: toNumber(session?.id, null),
            status: String(session?.status || 'unknown'),
            winnerId: bySourceId[toNumber(session?.winnerId, -1)] || null,
            startedAt: session?.startedAt || null,
            raceStartAt: session?.raceStartAt || null,
            totalDurationMs: Math.max(0, toNumber(session?.totalDurationMs))
        }));
    }

    function normalizeMyBets(rawBets, bySourceId) {
        if (!Array.isArray(rawBets)) return [];

        return rawBets.map(bet => ({
            racerId: bySourceId[toNumber(bet?.slimeId, -1)] || getRacerId(bet?.slimeName),
            amount: Math.max(0, toNumber(bet?.amount)),
            sessionId: toNumber(bet?.sessionId, null),
            sessionStatus: String(bet?.sessionStatus || 'unknown'),
            won: Boolean(bet?.won),
            rewardAmount: Math.max(0, toNumber(bet?.rewardAmount)),
            rewardClaimed: Boolean(bet?.rewardClaimed),
            createdAt: bet?.createdAt || null
        })).filter(bet => bet.racerId);
    }

    function normalizeMyStats(rawStats) {
        if (!rawStats || typeof rawStats !== 'object') return null;

        return {
            totalSpent: Math.max(0, toNumber(rawStats.totalSpent)),
            totalWon: Math.max(0, toNumber(rawStats.totalWon)),
            netProfit: toNumber(rawStats.netProfit),
            totalBets: Math.max(0, toNumber(rawStats.totalBets)),
            totalWins: Math.max(0, toNumber(rawStats.totalWins))
        };
    }

    function normalizeAccount(rawAccount) {
        if (!rawAccount || typeof rawAccount !== 'object') return null;

        return {
            magicFragments: Math.max(0, toNumber(rawAccount.magicFragments)),
            checkinEnabled: rawAccount.checkinEnabled === true
        };
    }

    function aggregateCurrentUserPool(rawPool, bySourceId, userId) {
        const stakes = Object.fromEntries(RACER_IDS.map(id => [id, 0]));
        const bets = Array.isArray(rawPool?.bets) ? rawPool.bets : [];

        if (userId === null) return {stakes, total: 0, selectedIds: []};
        bets.forEach(bet => {
            if (toNumber(bet?.userId, null) !== userId) return;
            const id = bySourceId[toNumber(bet?.slimeId, -1)];
            if (id) stakes[id] += Math.max(0, toNumber(bet?.amount));
        });

        return {
            stakes,
            total: RACER_IDS.reduce((sum, id) => sum + stakes[id], 0),
            selectedIds: RACER_IDS.filter(id => stakes[id] > 0)
        };
    }

    function normalizePendingRewards(rawRewards) {
        if (!Array.isArray(rawRewards)) return [];

        return rawRewards.map(reward => ({
            rewardId: toNumber(reward?.id, null),
            amount: Math.max(0, toNumber(reward?.amount))
        })).filter(reward => Number.isSafeInteger(reward.rewardId) && reward.rewardId > 0 && reward.amount > 0);
    }

    function normalizeSnapshot(raw = {}) {
        const {racers, bySourceId} = normalizeRacers(raw.racers);
        const sessions = normalizeSessions(raw.sessions, bySourceId);
        const accountId = toNumber(raw.account?.id, null);
        const pendingRewards = normalizePendingRewards(raw.pendingRewards);

        return {
            mode: raw.mode === 'live' ? 'live' : 'full',
            updatedAt: new Date().toISOString(),
            current: normalizeCurrent(raw.current, bySourceId),
            racers,
            pool: aggregatePool(raw.bets, bySourceId),
            currentUserPool: aggregateCurrentUserPool(raw.bets, bySourceId, accountId),
            sessions,
            recentWinnerIds: sessions.map(session => session.winnerId).filter(Boolean).slice(0, 12),
            myBets: normalizeMyBets(raw.myBets, bySourceId),
            myStats: normalizeMyStats(raw.myStats),
            account: normalizeAccount(raw.account),
            pendingRewards,
            pendingRewardTotal: pendingRewards.reduce((sum, reward) => sum + reward.amount, 0)
        };
    }

    return Object.freeze({RACER_IDS, normalizeSnapshot});
});
