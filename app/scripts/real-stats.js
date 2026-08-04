(function exposeRealStats(root, factory) {
    const realStats = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = realStats;
    }

    root.SlimeRealStats = realStats;
})(typeof globalThis === 'object' ? globalThis : this, function createRealStatsModule() {
    'use strict';

    const SCHEMA_VERSION = 1;
    const RACER_IDS = Object.freeze(['melon', 'blueberry', 'dragonfruit', 'lemon']);
    const MAX_RECENT_WINNERS = 12;

    function normalizeTimestamp(value) {
        const milliseconds = Date.parse(String(value || ''));
        return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
    }

    function normalizeWins(values) {
        if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
        const entries = RACER_IDS.map(id => [id, Number(values[id])]);
        if (entries.some(([, wins]) => !Number.isSafeInteger(wins) || wins < 0)) return null;
        return Object.fromEntries(entries);
    }

    function normalizeRecentWinners(values) {
        if (!Array.isArray(values)) return [];
        return values.filter(id => RACER_IDS.includes(id)).slice(0, MAX_RECENT_WINNERS);
    }

    function normalizeStoredSnapshot(value) {
        if (value?.schemaVersion !== SCHEMA_VERSION) return null;
        const wins = normalizeWins(value.wins);
        if (!wins) return null;

        const lastSessionId = Number(value.lastSessionId);
        return {
            schemaVersion: SCHEMA_VERSION,
            updatedAt: normalizeTimestamp(value.updatedAt),
            historyUpdatedAt: normalizeTimestamp(value.historyUpdatedAt),
            lastSessionId: Number.isSafeInteger(lastSessionId) && lastSessionId > 0 ? lastSessionId : null,
            wins,
            recentWinnerIds: normalizeRecentWinners(value.recentWinnerIds)
        };
    }

    function getRemoteWins(rawRacers) {
        if (!Array.isArray(rawRacers) || rawRacers.length !== RACER_IDS.length) return null;
        const values = Object.fromEntries(rawRacers.map(racer => [racer?.id, racer?.wins]));
        if (Object.keys(values).some(id => !RACER_IDS.includes(id))) return null;
        return normalizeWins(values);
    }

    function mergeRemoteSnapshot(existing, remoteSnapshot) {
        const wins = getRemoteWins(remoteSnapshot?.racers);
        if (!wins) return null;
        const previous = normalizeStoredSnapshot(existing);
        const isFull = remoteSnapshot?.mode === 'full';
        const updatedAt = normalizeTimestamp(remoteSnapshot?.updatedAt) || previous?.updatedAt || null;
        const sessionIds = isFull && Array.isArray(remoteSnapshot?.sessions)
            ? remoteSnapshot.sessions.map(session => Number(session?.sessionId)).filter(sessionId => Number.isSafeInteger(sessionId) && sessionId > 0)
            : [];

        return {
            schemaVersion: SCHEMA_VERSION,
            updatedAt,
            historyUpdatedAt: isFull ? updatedAt : previous?.historyUpdatedAt || null,
            lastSessionId: isFull && sessionIds.length > 0 ? Math.max(...sessionIds) : previous?.lastSessionId || null,
            wins,
            recentWinnerIds: isFull
                ? normalizeRecentWinners(remoteSnapshot.recentWinnerIds)
                : previous?.recentWinnerIds || []
        };
    }

    function calculateStats(profiles, snapshot) {
        const normalized = normalizeStoredSnapshot(snapshot);
        const wins = normalized?.wins || Object.fromEntries(RACER_IDS.map(id => [id, 0]));
        const total = RACER_IDS.reduce((sum, id) => sum + wins[id], 0);
        const racers = profiles.map(profile => ({
            ...profile,
            wins: wins[profile.id] || 0,
            rate: total > 0 ? (wins[profile.id] || 0) / total : 0
        }));

        return {racers, total};
    }

    return Object.freeze({
        SCHEMA_VERSION,
        RACER_IDS,
        MAX_RECENT_WINNERS,
        normalizeStoredSnapshot,
        mergeRemoteSnapshot,
        calculateStats
    });
});
