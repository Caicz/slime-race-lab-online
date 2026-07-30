(function exposeBetting(root, factory) {
    const betting = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = betting;
    }

    root.SlimeBetting = betting;
})(typeof globalThis === 'object' ? globalThis : this, function createBetting() {
    'use strict';

    const RACER_IDS = Object.freeze(['melon', 'blueberry', 'dragonfruit', 'lemon']);
    const WINNER_ALIASES = Object.freeze({
        melon: 'melon',
        '哈密瓜': 'melon',
        '迷你哈密瓜': 'melon',
        blueberry: 'blueberry',
        '蓝莓': 'blueberry',
        '迷你蓝莓': 'blueberry',
        dragonfruit: 'dragonfruit',
        '火龙果': 'dragonfruit',
        '迷你火龙果': 'dragonfruit',
        lemon: 'lemon',
        '柠檬': 'lemon',
        '迷你柠檬': 'lemon'
    });

    function toNonNegativeNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : fallback;
    }

    function normalizeMap(values) {
        return Object.fromEntries(RACER_IDS.map(id => [id, toNonNegativeNumber(values?.[id])]));
    }

    function sumMap(values) {
        return RACER_IDS.reduce((total, id) => total + values[id], 0);
    }

    function normalizeProbabilities(values) {
        const probabilities = normalizeMap(values);
        const total = sumMap(probabilities);

        if (total <= 0) {
            return Object.fromEntries(RACER_IDS.map(id => [id, 0.25]));
        }

        return Object.fromEntries(RACER_IDS.map(id => [id, probabilities[id] / total]));
    }

    function parseWinnerInput(text) {
        const tokens = String(text || '').split(/[\s,，、;；|/]+/).map(token => token.trim()).filter(Boolean);
        const winnerIds = [];
        const invalidTokens = [];

        tokens.forEach(token => {
            const normalized = token.replace(/[。.!！?？:：]+$/g, '');
            const id = WINNER_ALIASES[normalized] || WINNER_ALIASES[normalized.toLowerCase()];

            if (id) {
                winnerIds.push(id);
            } else {
                invalidTokens.push(token);
            }
        });

        return {winnerIds, invalidTokens};
    }

    function mergeRealStats(profiles, importedWinnerIds) {
        const importedCounts = Object.fromEntries(RACER_IDS.map(id => [id, 0]));

        importedWinnerIds.forEach(id => {
            if (Object.hasOwn(importedCounts, id)) {
                importedCounts[id] += 1;
            }
        });

        const total = profiles.reduce((sum, profile) => sum + profile.observedWins, 0) + importedWinnerIds.length;
        const racers = profiles.map(profile => {
            const importedWins = importedCounts[profile.id] || 0;
            const wins = profile.observedWins + importedWins;
            return {...profile, importedWins, wins, rate: wins / total};
        });

        return {racers, total, importedTotal: importedWinnerIds.length};
    }

    function parsePoolInput(text) {
        const entries = String(text || '').split(/[\n,，;；]+/).map(entry => entry.trim()).filter(Boolean);
        const stakes = {};
        const invalidEntries = [];

        entries.forEach(entry => {
            const match = entry.match(/^(.+?)[\s:：=]+([0-9]+(?:\.[0-9]+)?)(?:\s*筹码)?$/);

            if (!match) {
                invalidEntries.push(entry);
                return;
            }

            const name = match[1].trim();
            const id = WINNER_ALIASES[name] || WINNER_ALIASES[name.toLowerCase()];

            if (!id) {
                invalidEntries.push(entry);
                return;
            }

            stakes[id] = toNonNegativeNumber(match[2]);
        });

        return {stakes, invalidEntries};
    }

    function analyzePool(probabilities, poolStakes) {
        const normalizedProbabilities = normalizeProbabilities(probabilities);
        const stakes = normalizeMap(poolStakes);
        const total = sumMap(stakes);
        const racers = Object.fromEntries(RACER_IDS.map(id => {
            const share = total > 0 ? stakes[id] / total : 0;
            const multiple = stakes[id] > 0 ? total / stakes[id] : null;
            return [id, {
                probability: normalizedProbabilities[id],
                stake: stakes[id],
                share,
                multiple,
                edge: normalizedProbabilities[id] - share
            }];
        }));

        return {stakes, total, racers};
    }

    function projectClosingPool(currentStakes, expectedTotal, probabilities, publicBias = 1.25) {
        const current = normalizeMap(currentStakes);
        const currentTotal = sumMap(current);
        const finalTotal = Math.max(currentTotal, toNonNegativeNumber(expectedTotal, currentTotal));
        const remaining = finalTotal - currentTotal;
        const normalizedProbabilities = normalizeProbabilities(probabilities);
        const bias = Math.max(0.1, toNonNegativeNumber(publicBias, 1.25));
        const weights = Object.fromEntries(RACER_IDS.map(id => [id, normalizedProbabilities[id] ** bias]));
        const weightTotal = sumMap(weights);
        const stakes = Object.fromEntries(RACER_IDS.map(id => [id, current[id] + remaining * weights[id] / weightTotal]));

        return {stakes, total: finalTotal, added: remaining};
    }

    function evaluateBet(probabilities, poolStakes, bets) {
        const normalizedProbabilities = normalizeProbabilities(probabilities);
        const outsideStakes = normalizeMap(poolStakes);
        const ownBets = normalizeMap(bets);
        const outsideTotal = sumMap(outsideStakes);
        const totalBet = sumMap(ownBets);
        const finalTotal = outsideTotal + totalBet;
        let expectedReturn = 0;
        let coverage = 0;

        const outcomes = Object.fromEntries(RACER_IDS.map(id => {
            const ownBet = ownBets[id];
            const grossReturn = ownBet > 0 ? ownBet / (outsideStakes[id] + ownBet) * finalTotal : 0;
            const profit = grossReturn - totalBet;

            expectedReturn += normalizedProbabilities[id] * grossReturn;
            if (ownBet > 0) coverage += normalizedProbabilities[id];

            return [id, {
                probability: normalizedProbabilities[id],
                grossReturn,
                profit,
                finalRacerStake: outsideStakes[id] + ownBet,
                multiple: ownBet > 0 ? finalTotal / (outsideStakes[id] + ownBet) : null
            }];
        }));
        const expectedProfit = expectedReturn - totalBet;
        const worstProfit = Math.min(...RACER_IDS.map(id => outcomes[id].profit));

        return {
            bets: ownBets,
            outsideTotal,
            finalTotal,
            totalBet,
            coverage,
            expectedReturn,
            expectedProfit,
            roi: totalBet > 0 ? expectedProfit / totalBet : 0,
            worstProfit,
            outcomes
        };
    }

    function getBetAmounts(maxBet, unit) {
        const amounts = [0];
        const steps = Math.floor(maxBet / unit + 1e-9);

        for (let step = 1; step <= steps; step += 1) {
            amounts.push(step * unit);
        }

        if (amounts[amounts.length - 1] < maxBet - 1e-9) {
            amounts.push(maxBet);
        }

        return amounts;
    }

    function isBetterCandidate(candidate, best) {
        if (candidate.expectedProfit > best.expectedProfit + 1e-9) return true;
        if (Math.abs(candidate.expectedProfit - best.expectedProfit) > 1e-9) return false;
        if (candidate.totalBet < best.totalBet - 1e-9) return true;
        if (Math.abs(candidate.totalBet - best.totalBet) > 1e-9) return false;
        return candidate.coverage > best.coverage;
    }

    function optimizeBets(probabilities, poolStakes, options = {}) {
        const maxBet = toNonNegativeNumber(options.maxBet);
        const requestedUnit = Math.max(1, toNonNegativeNumber(options.unit, 100));
        const maxSteps = Math.max(20, Math.round(toNonNegativeNumber(options.maxSteps, 240)));
        const unit = Math.max(requestedUnit, Math.ceil(maxBet / maxSteps / requestedUnit) * requestedUnit || requestedUnit);
        const amounts = getBetAmounts(maxBet, unit);
        let best = evaluateBet(probabilities, poolStakes, {});
        let evaluated = 1;

        RACER_IDS.forEach(id => {
            amounts.slice(1).forEach(amount => {
                const candidate = evaluateBet(probabilities, poolStakes, {[id]: amount});
                evaluated += 1;
                if (isBetterCandidate(candidate, best)) best = candidate;
            });
        });

        for (let leftIndex = 0; leftIndex < RACER_IDS.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < RACER_IDS.length; rightIndex += 1) {
                const leftId = RACER_IDS[leftIndex];
                const rightId = RACER_IDS[rightIndex];

                amounts.slice(1).forEach(leftAmount => {
                    amounts.slice(1).forEach(rightAmount => {
                        if (leftAmount + rightAmount > maxBet + 1e-9) return;
                        const candidate = evaluateBet(probabilities, poolStakes, {[leftId]: leftAmount, [rightId]: rightAmount});
                        evaluated += 1;
                        if (isBetterCandidate(candidate, best)) best = candidate;
                    });
                });
            }
        }

        return {...best, requestedUnit, searchUnit: unit, evaluated};
    }

    return Object.freeze({
        RACER_IDS,
        parseWinnerInput,
        parsePoolInput,
        mergeRealStats,
        analyzePool,
        projectClosingPool,
        evaluateBet,
        optimizeBets
    });
});
