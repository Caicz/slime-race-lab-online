(function exposeMarketMonitor(root, factory) {
    const monitor = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = monitor;
    }

    root.SlimeMarketMonitor = monitor;
})(typeof globalThis === 'object' ? globalThis : this, function createMarketMonitor() {
    'use strict';

    const RACER_IDS = Object.freeze(['melon', 'blueberry', 'dragonfruit', 'lemon']);
    const MAX_ROUNDS = 50;
    const MAX_POINTS = 240;

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function normalizeMap(values) {
        return Object.fromEntries(RACER_IDS.map(id => [id, Math.max(0, toNumber(values?.[id]))]));
    }

    function sumMap(values) {
        return RACER_IDS.reduce((sum, id) => sum + values[id], 0);
    }

    function normalizeWeights(values) {
        const total = sumMap(values);
        return total > 0
            ? Object.fromEntries(RACER_IDS.map(id => [id, values[id] / total]))
            : Object.fromEntries(RACER_IDS.map(id => [id, 0.25]));
    }

    function getPopularWeights(probabilities) {
        const normalized = normalizeWeights(normalizeMap(probabilities));
        return normalizeWeights(Object.fromEntries(RACER_IDS.map(id => [id, normalized[id] ** 1.25])));
    }

    function getOddsWeights(stakes) {
        const total = sumMap(stakes);
        const smoothing = Math.max(1, total * 0.02);
        const smoothedTotal = total + smoothing * RACER_IDS.length;
        return normalizeWeights(Object.fromEntries(RACER_IDS.map(id => {
            const share = (stakes[id] + smoothing) / smoothedTotal;
            return [id, share ** -1.25];
        })));
    }

    function fitOddsShare(points, probabilities) {
        if (!Array.isArray(points) || points.length < 2) return null;
        const popularWeights = getPopularWeights(probabilities);
        let best = null;

        for (let oddsShare = 0; oddsShare <= 1.0001; oddsShare += 0.05) {
            let weightedError = 0;
            let observedTotal = 0;

            for (let index = 1; index < points.length; index += 1) {
                const previous = points[index - 1];
                const current = points[index];
                const previousOwn = normalizeMap(previous.ownStakes);
                const currentOwn = normalizeMap(current.ownStakes);
                const deltas = Object.fromEntries(RACER_IDS.map(id => {
                    const totalIncrease = toNumber(current.stakes?.[id]) - toNumber(previous.stakes?.[id]);
                    const ownIncrease = Math.max(0, currentOwn[id] - previousOwn[id]);
                    return [id, Math.max(0, totalIncrease - ownIncrease)];
                }));
                const deltaTotal = sumMap(deltas);
                if (deltaTotal <= 0) continue;
                const observed = normalizeWeights(deltas);
                const oddsWeights = getOddsWeights(previous.stakes);
                const error = RACER_IDS.reduce((sum, id) => {
                    const predicted = popularWeights[id] * (1 - oddsShare) + oddsWeights[id] * oddsShare;
                    return sum + (observed[id] - predicted) ** 2;
                }, 0);
                weightedError += error * deltaTotal;
                observedTotal += deltaTotal;
            }

            if (observedTotal <= 0) return null;
            const meanError = weightedError / observedTotal;
            if (!best || meanError < best.error) best = {oddsShare: Math.min(1, oddsShare), error: meanError};
        }

        return best;
    }

    function createPoint(snapshot, now) {
        return {
            at: now,
            total: Math.max(0, toNumber(snapshot.pool?.total)),
            stakes: normalizeMap(snapshot.pool?.stakes),
            ownStakes: normalizeMap(snapshot.currentUserPool?.stakes),
            ownTotal: Math.max(0, toNumber(snapshot.currentUserPool?.total)),
            balance: Math.max(0, toNumber(snapshot.account?.magicFragments)),
            status: String(snapshot.current?.status || 'unknown'),
            sessionId: snapshot.pool?.sessionId ?? null
        };
    }

    function createRound(point, sequence) {
        return {
            localId: `round-${sequence}`,
            sessionId: point.sessionId,
            startedAt: point.at,
            winnerId: null,
            points: [point]
        };
    }

    function shouldStartNewRound(active, point) {
        if (!active || active.points.length === 0) return false;
        const previous = active.points[active.points.length - 1];
        if (active.sessionId !== null && point.sessionId !== null && active.sessionId !== point.sessionId) return true;
        if (active.sessionId !== null && point.sessionId === null) return true;
        if (previous.total > 0 && point.total < previous.total * 0.9) return true;
        if (previous.ownTotal > 0 && point.ownTotal < previous.ownTotal * 0.25) return true;
        return false;
    }

    function summarizeRound(round, probabilities) {
        const first = round.points[0];
        const last = round.points[round.points.length - 1];
        const fitted = fitOddsShare(round.points, probabilities);

        return {
            localId: round.localId,
            sessionId: round.sessionId,
            startedAt: round.startedAt,
            endedAt: last.at,
            samples: round.points.length,
            openingTotal: first.total,
            closingTotal: last.total,
            closingStakes: last.stakes,
            ownTotal: last.ownTotal,
            winnerId: round.winnerId,
            fittedOddsShare: fitted?.oddsShare ?? null
        };
    }

    function normalizeState(state) {
        return {
            version: 1,
            sequence: Math.max(0, Math.floor(toNumber(state?.sequence))),
            active: state?.active && Array.isArray(state.active.points) ? state.active : null,
            rounds: Array.isArray(state?.rounds) ? state.rounds.slice(0, MAX_ROUNDS) : []
        };
    }

    function recordSnapshot(state, snapshot, probabilities, now = Date.now()) {
        const next = normalizeState(state);
        const point = createPoint(snapshot, now);

        if (!next.active) {
            next.sequence += 1;
            next.active = createRound(point, next.sequence);
        } else if (shouldStartNewRound(next.active, point)) {
            next.rounds.unshift(summarizeRound(next.active, probabilities));
            next.rounds = next.rounds.slice(0, MAX_ROUNDS);
            next.sequence += 1;
            next.active = createRound(point, next.sequence);
        } else {
            if (next.active.sessionId === null && point.sessionId !== null) next.active.sessionId = point.sessionId;
            next.active.points.push(point);
            next.active.points = next.active.points.slice(-MAX_POINTS);
        }

        const currentSessionId = snapshot.current?.sessionId ?? null;
        if (snapshot.current?.winnerId && next.active.sessionId !== null && next.active.sessionId === currentSessionId) {
            next.active.winnerId = snapshot.current.winnerId;
        }

        return next;
    }

    function analyze(state, probabilities) {
        const normalized = normalizeState(state);
        const points = normalized.active?.points || [];
        const first = points[0] || null;
        const last = points[points.length - 1] || null;
        const fitted = fitOddsShare(points, probabilities);
        const completed = normalized.rounds.filter(round => round.closingTotal > 0);
        const recent = completed.slice(0, 10);
        const averageClosingTotal = recent.length > 0
            ? recent.reduce((sum, round) => sum + round.closingTotal, 0) / recent.length
            : 0;
        const historicalFits = recent.map(round => round.fittedOddsShare).filter(value => Number.isFinite(value));
        const historicalOddsShare = historicalFits.length > 0
            ? historicalFits.reduce((sum, value) => sum + value, 0) / historicalFits.length
            : null;
        const estimatedOddsShare = fitted?.oddsShare ?? historicalOddsShare;
        const recommendedPublicStrategy = estimatedOddsShare === null
            ? 'mixed'
            : estimatedOddsShare < 0.25 ? 'popular' : estimatedOddsShare > 0.75 ? 'odds' : 'mixed';

        return {
            samples: points.length,
            currentTotal: last?.total || 0,
            currentGrowth: first && last ? last.total - first.total : 0,
            completedRounds: completed.length,
            averageClosingTotal,
            estimatedOddsShare,
            recommendedPublicStrategy
        };
    }

    return Object.freeze({RACER_IDS, recordSnapshot, analyze, fitOddsShare});
});
