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
            racers: RACER_IDS.filter(id => Object.hasOwn(winsById, id)).map(id => ({id, wins: winsById[id]})),
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

    function normalizeSnapshot(raw = {}) {
        const {racers, bySourceId} = normalizeRacers(raw.racers);
        const sessions = normalizeSessions(raw.sessions, bySourceId);

        return {
            mode: raw.mode === 'live' ? 'live' : 'full',
            updatedAt: new Date().toISOString(),
            current: normalizeCurrent(raw.current, bySourceId),
            racers,
            pool: aggregatePool(raw.bets, bySourceId),
            sessions,
            recentWinnerIds: sessions.map(session => session.winnerId).filter(Boolean).slice(0, 12),
            myBets: normalizeMyBets(raw.myBets, bySourceId),
            myStats: normalizeMyStats(raw.myStats)
        };
    }

    return Object.freeze({RACER_IDS, normalizeSnapshot});
});
