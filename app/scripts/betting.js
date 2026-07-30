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

    function normalizeWeights(weights) {
        const total = sumMap(weights);

        if (total <= 0) {
            return Object.fromEntries(RACER_IDS.map(id => [id, 0.25]));
        }

        return Object.fromEntries(RACER_IDS.map(id => [id, weights[id] / total]));
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function getProjectionOptions(options) {
        if (typeof options === 'number') {
            return {strategy: 'popular', bias: Math.max(0.1, options), oddsShare: 0};
        }

        const strategy = ['popular', 'odds', 'mixed', 'uniform'].includes(options?.strategy) ? options.strategy : 'mixed';
        const bias = Math.max(0.1, toNonNegativeNumber(options?.bias, 1.25));
        const oddsShare = clamp(toNonNegativeNumber(options?.oddsShare, 0.4), 0, 1);

        return {strategy, bias, oddsShare};
    }

    function getPublicWeights(stakes, probabilities, strategy, bias, oddsShare) {
        const total = sumMap(stakes);
        const popularWeights = normalizeWeights(Object.fromEntries(RACER_IDS.map(id => [id, probabilities[id] ** bias])));
        const smoothingStake = Math.max(1, total * 0.02);
        const smoothedTotal = total + smoothingStake * RACER_IDS.length;
        const oddsWeights = normalizeWeights(Object.fromEntries(RACER_IDS.map(id => {
            const smoothedShare = (stakes[id] + smoothingStake) / smoothedTotal;
            return [id, smoothedShare ** -bias];
        })));

        if (strategy === 'popular') return popularWeights;
        if (strategy === 'odds') return oddsWeights;
        if (strategy === 'uniform') return Object.fromEntries(RACER_IDS.map(id => [id, 0.25]));
        return Object.fromEntries(RACER_IDS.map(id => [
            id,
            popularWeights[id] * (1 - oddsShare) + oddsWeights[id] * oddsShare
        ]));
    }

    function projectClosingPool(currentStakes, expectedTotal, probabilities, options = {}) {
        const current = normalizeMap(currentStakes);
        const currentTotal = sumMap(current);
        const finalTotal = Math.max(currentTotal, toNonNegativeNumber(expectedTotal, currentTotal));
        const remaining = finalTotal - currentTotal;
        const normalizedProbabilities = normalizeProbabilities(probabilities);
        const {strategy, bias, oddsShare} = getProjectionOptions(options);
        const stakes = {...current};
        const addedById = Object.fromEntries(RACER_IDS.map(id => [id, 0]));
        const batches = remaining > 0 ? 48 : 0;
        const batchAmount = batches > 0 ? remaining / batches : 0;

        for (let batch = 0; batch < batches; batch += 1) {
            const weights = getPublicWeights(stakes, normalizedProbabilities, strategy, bias, oddsShare);
            RACER_IDS.forEach(id => {
                const amount = batchAmount * weights[id];
                stakes[id] += amount;
                addedById[id] += amount;
            });
        }

        const weights = remaining > 0
            ? Object.fromEntries(RACER_IDS.map(id => [id, addedById[id] / remaining]))
            : getPublicWeights(stakes, normalizedProbabilities, strategy, bias, oddsShare);

        return {stakes, total: finalTotal, added: remaining, strategy, bias, oddsShare, weights};
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
        let expectedDownside = 0;
        let profitProbability = 0;

        const outcomes = Object.fromEntries(RACER_IDS.map(id => {
            const ownBet = ownBets[id];
            const grossReturn = ownBet > 0 ? ownBet / (outsideStakes[id] + ownBet) * finalTotal : 0;
            const profit = grossReturn - totalBet;

            expectedReturn += normalizedProbabilities[id] * grossReturn;
            expectedDownside += normalizedProbabilities[id] * Math.max(0, -profit);
            if (profit > 1e-9) profitProbability += normalizedProbabilities[id];
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
            expectedDownside,
            profitProbability,
            worstProfit,
            outcomes
        };
    }

    function evaluatePosition(probabilities, currentPool, existingBets, additions = {}) {
        const normalizedProbabilities = normalizeProbabilities(probabilities);
        const pool = normalizeMap(currentPool);
        const existing = normalizeMap(existingBets);
        const added = normalizeMap(additions);
        const bets = Object.fromEntries(RACER_IDS.map(id => [id, existing[id] + added[id]]));
        const currentTotal = sumMap(pool);
        const existingTotal = sumMap(existing);
        const additionalBet = sumMap(added);
        const totalBet = existingTotal + additionalBet;
        const finalTotal = currentTotal + additionalBet;
        let expectedReturn = 0;
        let expectedDownside = 0;
        let coverage = 0;
        let profitProbability = 0;

        const outcomes = Object.fromEntries(RACER_IDS.map(id => {
            const finalRacerStake = pool[id] + added[id];
            const grossReturn = bets[id] > 0 && finalRacerStake > 0 ? bets[id] / finalRacerStake * finalTotal : 0;
            const profit = grossReturn - totalBet;

            expectedReturn += normalizedProbabilities[id] * grossReturn;
            expectedDownside += normalizedProbabilities[id] * Math.max(0, -profit);
            if (bets[id] > 0) coverage += normalizedProbabilities[id];
            if (profit > 1e-9) profitProbability += normalizedProbabilities[id];

            return [id, {
                probability: normalizedProbabilities[id],
                grossReturn,
                profit,
                finalRacerStake,
                multiple: bets[id] > 0 && finalRacerStake > 0 ? finalTotal / finalRacerStake : null
            }];
        }));
        const expectedProfit = expectedReturn - totalBet;
        const selectedIds = RACER_IDS.filter(id => bets[id] > 0);
        const averageSelectedMultiple = selectedIds.length > 0
            ? selectedIds.reduce((sum, id) => sum + outcomes[id].multiple * bets[id], 0) / totalBet
            : 0;

        return {
            bets,
            existingBets: existing,
            additions: added,
            currentTotal,
            finalTotal,
            existingTotal,
            additionalBet,
            totalBet,
            coverage,
            expectedReturn,
            expectedProfit,
            roi: totalBet > 0 ? expectedProfit / totalBet : 0,
            expectedDownside,
            profitProbability,
            worstProfit: Math.min(...RACER_IDS.map(id => outcomes[id].profit)),
            averageSelectedMultiple,
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

    function scoreCandidate(candidate, strategy, riskAversion) {
        if (candidate.additionalBet <= 0) return 0;
        if (candidate.deltaExpectedProfit <= 1e-9) return Number.NEGATIVE_INFINITY;
        if (strategy === 'balanced') return candidate.deltaExpectedProfit - riskAversion * candidate.deltaExpectedDownside;
        if (strategy === 'high-odds') return candidate.incrementalRoi;
        return candidate.deltaExpectedProfit;
    }

    function isBetterCandidate(candidate, best, strategy, riskAversion) {
        const candidateScore = scoreCandidate(candidate, strategy, riskAversion);
        const bestScore = scoreCandidate(best, strategy, riskAversion);

        if (candidateScore > bestScore + 1e-9) return true;
        if (Math.abs(candidateScore - bestScore) > 1e-9) return false;
        if (strategy === 'high-odds' && candidate.averageSelectedMultiple > best.averageSelectedMultiple + 1e-9) return true;
        if (strategy === 'high-odds' && Math.abs(candidate.averageSelectedMultiple - best.averageSelectedMultiple) > 1e-9) return false;
        if (candidate.deltaExpectedProfit > best.deltaExpectedProfit + 1e-9) return true;
        if (Math.abs(candidate.deltaExpectedProfit - best.deltaExpectedProfit) > 1e-9) return false;
        if (candidate.additionalBet < best.additionalBet - 1e-9) return true;
        if (Math.abs(candidate.additionalBet - best.additionalBet) > 1e-9) return false;
        return candidate.coverage > best.coverage;
    }

    function optimizeAdditions(probabilities, currentPool, existingBets = {}, options = {}) {
        const strategy = ['max-ev', 'balanced', 'preserve', 'high-odds'].includes(options.strategy) ? options.strategy : 'max-ev';
        const bankroll = toNonNegativeNumber(options.bankroll, Number.POSITIVE_INFINITY);
        const requestedMaxBet = toNonNegativeNumber(options.maxBet);
        const maxLossRate = clamp(toNonNegativeNumber(options.maxLossRate, 0.05), 0, 1);
        const riskAversion = toNonNegativeNumber(options.riskAversion, 0.75);
        const riskBudget = strategy === 'preserve' ? bankroll * maxLossRate : Number.POSITIVE_INFINITY;
        const totalBetLimit = Math.min(requestedMaxBet, bankroll, riskBudget);
        const normalizedExisting = normalizeMap(existingBets);
        const existingTotal = sumMap(normalizedExisting);
        const riskBudgetExceeded = strategy === 'preserve' && existingTotal > riskBudget + 1e-9;
        const maxAddition = Math.max(0, totalBetLimit - existingTotal);
        const requestedUnit = Math.max(1, toNonNegativeNumber(options.unit, 100));
        const maxSteps = Math.max(20, Math.round(toNonNegativeNumber(options.maxSteps, 240)));
        const unit = Math.max(requestedUnit, Math.ceil(maxAddition / maxSteps / requestedUnit) * requestedUnit || requestedUnit);
        const amounts = getBetAmounts(maxAddition, unit);
        const existingIds = RACER_IDS.filter(id => normalizedExisting[id] > 0);
        const baseline = evaluatePosition(probabilities, currentPool, normalizedExisting, {});

        function compare(additions) {
            const candidate = evaluatePosition(probabilities, currentPool, normalizedExisting, additions);
            candidate.deltaExpectedProfit = candidate.expectedProfit - baseline.expectedProfit;
            candidate.deltaExpectedDownside = candidate.expectedDownside - baseline.expectedDownside;
            candidate.incrementalRoi = candidate.additionalBet > 0 ? candidate.deltaExpectedProfit / candidate.additionalBet : 0;
            candidate.score = scoreCandidate(candidate, strategy, riskAversion);
            return candidate;
        }

        let best = compare({});
        let evaluated = 1;

        if (existingIds.length > 2) {
            return {
                ...best,
                baseline,
                strategy,
                bankroll,
                riskBudget,
                maxLossRate,
                riskAversion,
                riskBudgetExceeded,
                requestedMaxBet,
                effectiveMaxBet: totalBetLimit,
                requestedUnit,
                searchUnit: unit,
                evaluated,
                invalidExistingSelection: true,
                action: 'stop'
            };
        }

        RACER_IDS.forEach(id => {
            amounts.slice(1).forEach(amount => {
                const selectedIds = new Set([...existingIds, id]);
                if (selectedIds.size > 2) return;
                const candidate = compare({[id]: amount});
                evaluated += 1;
                if (isBetterCandidate(candidate, best, strategy, riskAversion)) best = candidate;
            });
        });

        for (let leftIndex = 0; leftIndex < RACER_IDS.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < RACER_IDS.length; rightIndex += 1) {
                const leftId = RACER_IDS[leftIndex];
                const rightId = RACER_IDS[rightIndex];
                const selectedIds = new Set([...existingIds, leftId, rightId]);

                if (selectedIds.size > 2) continue;

                amounts.slice(1).forEach(leftAmount => {
                    amounts.slice(1).forEach(rightAmount => {
                        if (leftAmount + rightAmount > maxAddition + 1e-9) return;
                        const candidate = compare({[leftId]: leftAmount, [rightId]: rightAmount});
                        evaluated += 1;
                        if (isBetterCandidate(candidate, best, strategy, riskAversion)) best = candidate;
                    });
                });
            }
        }

        const action = best.additionalBet > 0 ? (existingTotal > 0 ? 'add' : 'bet') : (existingTotal > 0 ? 'stop' : 'wait');

        return {
            ...best,
            baseline,
            strategy,
            bankroll,
            riskBudget,
            maxLossRate,
            riskAversion,
            riskBudgetExceeded,
            requestedMaxBet,
            effectiveMaxBet: totalBetLimit,
            requestedUnit,
            searchUnit: unit,
            evaluated,
            invalidExistingSelection: false,
            action
        };
    }

    function optimizeBets(probabilities, poolStakes, options = {}) {
        const maxBet = toNonNegativeNumber(options.maxBet);
        const bankroll = Number.isFinite(Number(options.bankroll)) ? toNonNegativeNumber(options.bankroll) : maxBet;

        return optimizeAdditions(probabilities, poolStakes, {}, {...options, maxBet, bankroll});
    }

    return Object.freeze({
        RACER_IDS,
        parseWinnerInput,
        parsePoolInput,
        mergeRealStats,
        analyzePool,
        projectClosingPool,
        evaluateBet,
        evaluatePosition,
        optimizeAdditions,
        optimizeBets
    });
});
