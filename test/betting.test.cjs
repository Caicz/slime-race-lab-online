const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../app/scripts/engine.js');
const betting = require('../app/scripts/betting.js');

const probabilities = {melon: 78, blueberry: 115, dragonfruit: 167, lemon: 99};

test('可以解析单场和多场中文实盘冠军', () => {
    const parsed = betting.parseWinnerInput('蓝莓，迷你火龙果\n柠檬 哈密瓜,未知');

    assert.deepEqual(parsed.winnerIds, ['blueberry', 'dragonfruit', 'lemon', 'melon']);
    assert.deepEqual(parsed.invalidTokens, ['未知']);
});

test('可以从带标签文本导入当前四项押注池', () => {
    const parsed = betting.parsePoolInput('哈密瓜: 5000，迷你蓝莓：9000\n火龙果=13000; 柠檬 4000');

    assert.deepEqual(parsed.stakes, {melon: 5000, blueberry: 9000, dragonfruit: 13000, lemon: 4000});
    assert.deepEqual(parsed.invalidEntries, []);
});

test('实盘新增记录会与 459 场基线合并', () => {
    const stats = betting.mergeRealStats(engine.RACERS, ['blueberry', 'blueberry', 'lemon']);
    const blueberry = stats.racers.find(racer => racer.id === 'blueberry');

    assert.equal(stats.total, 462);
    assert.equal(stats.importedTotal, 3);
    assert.equal(blueberry.wins, 117);
    assert.equal(blueberry.importedWins, 2);
});

test('奖池占比和无手续费毛返还倍数互为倒数', () => {
    const analysis = betting.analyzePool(probabilities, {melon: 5000, blueberry: 8000, dragonfruit: 12000, lemon: 5000});

    assert.equal(analysis.total, 30000);
    assert.equal(analysis.racers.dragonfruit.share, 0.4);
    assert.equal(analysis.racers.dragonfruit.multiple, 2.5);
});

test('自己的下注会增加总池并压低对应返还倍数', () => {
    const stakes = {melon: 5000, blueberry: 8000, dragonfruit: 12000, lemon: 5000};
    const first = betting.evaluateBet(probabilities, stakes, {melon: 100});
    const second = betting.evaluateBet(probabilities, stakes, {melon: 1000});

    assert.equal(first.finalTotal, 30100);
    assert.equal(second.finalTotal, 31000);
    assert.ok(second.outcomes.melon.multiple < first.outcomes.melon.multiple);
});

test('公众新增筹码按热门加权并保留当前实盘池', () => {
    const projected = betting.projectClosingPool(
        {melon: 1000, blueberry: 2000, dragonfruit: 3000, lemon: 1000},
        30000,
        probabilities,
        1.25
    );

    assert.equal(Math.round(projected.total), 30000);
    assert.equal(Math.round(Object.values(projected.stakes).reduce((sum, value) => sum + value, 0)), 30000);
    assert.ok(projected.stakes.dragonfruit > projected.stakes.blueberry);
    assert.ok(projected.stakes.blueberry > projected.stakes.melon);
    assert.ok(projected.stakes.melon >= 1000);
});

test('追高赔率公众策略会把更多新增筹码投向当前低占比项', () => {
    const projected = betting.projectClosingPool(
        {melon: 1000, blueberry: 4000, dragonfruit: 12000, lemon: 3000},
        40000,
        probabilities,
        {strategy: 'odds', bias: 1.25}
    );
    const melonAdded = projected.stakes.melon - 1000;
    const dragonfruitAdded = projected.stakes.dragonfruit - 12000;

    assert.equal(projected.strategy, 'odds');
    assert.ok(melonAdded > dragonfruitAdded);
});

test('混合公众策略的两端分别等于追热门和追高赔率预测', () => {
    const pool = {melon: 1000, blueberry: 4000, dragonfruit: 12000, lemon: 3000};
    const popular = betting.projectClosingPool(pool, 40000, probabilities, {strategy: 'popular', bias: 1.25});
    const odds = betting.projectClosingPool(pool, 40000, probabilities, {strategy: 'odds', bias: 1.25});
    const mixedPopular = betting.projectClosingPool(pool, 40000, probabilities, {strategy: 'mixed', bias: 1.25, oddsShare: 0});
    const mixedOdds = betting.projectClosingPool(pool, 40000, probabilities, {strategy: 'mixed', bias: 1.25, oddsShare: 1});

    betting.RACER_IDS.forEach(id => {
        assert.ok(Math.abs(mixedPopular.stakes[id] - popular.stakes[id]) < 1e-9);
        assert.ok(Math.abs(mixedOdds.stakes[id] - odds.stakes[id]) < 1e-9);
    });
});

test('优化结果最多押两只且不会超过投入上限', () => {
    const result = betting.optimizeBets(
        probabilities,
        {melon: 12000, blueberry: 9000, dragonfruit: 7000, lemon: 8000},
        {maxBet: 3000, unit: 100}
    );
    const selected = Object.values(result.bets).filter(value => value > 0);

    assert.ok(selected.length <= 2);
    assert.ok(result.totalBet <= 3000);
    assert.ok(result.searchUnit >= 100);
});

test('公平奖池没有正期望时推荐不下注', () => {
    const result = betting.optimizeBets(
        probabilities,
        {melon: 7800, blueberry: 11500, dragonfruit: 16700, lemon: 9900},
        {maxBet: 2000, unit: 100}
    );

    assert.equal(result.totalBet, 0);
    assert.equal(result.expectedProfit, 0);
});

test('热门被过度押注时能找到更有价值的冷门', () => {
    const result = betting.optimizeBets(
        probabilities,
        {melon: 1000, blueberry: 14000, dragonfruit: 18000, lemon: 3000},
        {maxBet: 2000, unit: 100}
    );

    assert.ok(result.bets.melon > 0 || result.bets.lemon > 0);
    assert.ok(result.expectedProfit > 0);
});

test('相同输入产生稳定的最优方案', () => {
    const stakes = {melon: 2000, blueberry: 9000, dragonfruit: 16000, lemon: 3000};
    const options = {maxBet: 1200, unit: 100};

    assert.deepEqual(
        betting.optimizeBets(probabilities, stakes, options),
        betting.optimizeBets(probabilities, stakes, options)
    );
});

test('本金保护策略把累计投入限制在设定的本金亏损预算内', () => {
    const bankroll = 10000;
    const maxLossRate = 0.05;
    const result = betting.optimizeBets(
        probabilities,
        {melon: 1000, blueberry: 14000, dragonfruit: 18000, lemon: 3000},
        {maxBet: 3000, bankroll, unit: 100, strategy: 'preserve', maxLossRate}
    );

    assert.ok(result.totalBet <= bankroll * maxLossRate);
    assert.ok(bankroll + result.worstProfit >= bankroll * (1 - maxLossRate));
    assert.ok(result.expectedProfit > 0);
});

test('均衡策略可牺牲部分期望收益来降低预期下行', () => {
    const pool = {melon: 2000, blueberry: 9000, dragonfruit: 16000, lemon: 3000};
    const maxEv = betting.optimizeBets(probabilities, pool, {maxBet: 2000, bankroll: 10000, unit: 100, strategy: 'max-ev'});
    const balanced = betting.optimizeBets(probabilities, pool, {maxBet: 2000, bankroll: 10000, unit: 100, strategy: 'balanced', riskAversion: 0.75});

    assert.ok(balanced.expectedDownside <= maxEv.expectedDownside + 1e-9);
    assert.ok(balanced.expectedProfit > 0);
    assert.ok(balanced.totalBet <= maxEv.totalBet);
});

test('高赔率价值策略只在正增量期望时下注并优先更高增量 ROI', () => {
    const pool = {melon: 1000, blueberry: 14000, dragonfruit: 18000, lemon: 3000};
    const maxEv = betting.optimizeBets(probabilities, pool, {maxBet: 2000, bankroll: 10000, unit: 100, strategy: 'max-ev'});
    const highOdds = betting.optimizeBets(probabilities, pool, {maxBet: 2000, bankroll: 10000, unit: 100, strategy: 'high-odds'});

    assert.ok(highOdds.expectedProfit > 0);
    assert.ok(highOdds.incrementalRoi >= maxEv.incrementalRoi);
    assert.ok(highOdds.totalBet <= maxEv.totalBet);
});

test('单场胜率策略只在正期望候选中提高本场盈利概率', () => {
    const pool = {melon: 1409, blueberry: 7151, dragonfruit: 14445, lemon: 10511};
    const maxEv = betting.optimizeBets(probabilities, pool, {maxBet: 2000, bankroll: 10000, unit: 100, strategy: 'max-ev'});
    const winRate = betting.optimizeBets(probabilities, pool, {maxBet: 2000, bankroll: 10000, unit: 100, strategy: 'win-rate'});

    assert.ok(winRate.expectedProfit > 0);
    assert.ok(winRate.profitProbability > maxEv.profitProbability);
    assert.ok(Object.values(winRate.bets).filter(amount => amount > 0).length <= 2);
});

test('既有下注已包含在当前奖池中，不会再次增加总池', () => {
    const currentPool = {melon: 1100, blueberry: 8000, dragonfruit: 12000, lemon: 5000};
    const result = betting.evaluatePosition(probabilities, currentPool, {melon: 100}, {});

    assert.equal(result.currentTotal, 26100);
    assert.equal(result.finalTotal, 26100);
    assert.equal(result.outcomes.melon.finalRacerStake, 1100);
    assert.equal(result.outcomes.melon.grossReturn, 100 / 1100 * 26100);
});

test('追加方案计算增量期望且不会在已有双押后选择第三只', () => {
    const currentPool = {melon: 3000, blueberry: 15000, dragonfruit: 17000, lemon: 2000};
    const existing = {melon: 100, blueberry: 100};
    const result = betting.optimizeAdditions(probabilities, currentPool, existing, {
        maxBet: 1000,
        bankroll: 10000,
        unit: 100,
        strategy: 'max-ev'
    });
    const selected = betting.RACER_IDS.filter(id => result.bets[id] > 0);

    assert.ok(selected.every(id => ['melon', 'blueberry'].includes(id)));
    assert.equal(result.deltaExpectedProfit, result.expectedProfit - result.baseline.expectedProfit);
    assert.ok(['add', 'stop'].includes(result.action));
});

test('累计投入上限已用完时停止追加', () => {
    const result = betting.optimizeAdditions(
        probabilities,
        {melon: 3000, blueberry: 9000, dragonfruit: 16000, lemon: 3000},
        {melon: 200},
        {maxBet: 200, bankroll: 10000, unit: 100, strategy: 'max-ev'}
    );

    assert.equal(result.additionalBet, 0);
    assert.equal(result.action, 'stop');
});

test('既有下注已超过本金保护预算时不会继续追加', () => {
    const result = betting.optimizeAdditions(
        probabilities,
        {melon: 600, blueberry: 9000, dragonfruit: 16000, lemon: 3000},
        {melon: 600},
        {maxBet: 2000, bankroll: 10000, unit: 100, strategy: 'preserve', maxLossRate: 0.05}
    );

    assert.equal(result.riskBudgetExceeded, true);
    assert.equal(result.additionalBet, 0);
    assert.equal(result.action, 'stop');
});

test('组合稳健性会同时评估追热门、混合和追高赔率三种封盘情景', () => {
    const analysis = betting.analyzePortfolioScenarios(
        probabilities,
        {melon: 2000, blueberry: 9000, dragonfruit: 16000, lemon: 3000},
        {},
        {
            expectedTotal: 45000,
            publicBias: 1.25,
            oddsShare: 0.4,
            maxBet: 2000,
            bankroll: 10000,
            unit: 100,
            strategy: 'max-ev'
        }
    );
    const selected = Object.values(analysis.robust.additions).filter(amount => amount > 0);

    assert.deepEqual(analysis.scenarios.map(item => item.id), ['popular', 'mixed', 'odds']);
    assert.ok(selected.length <= 2);
    if (analysis.robust.additionalBet > 0) {
        assert.equal(analysis.positiveScenarioCount, 3);
        assert.ok(analysis.robust.worstDeltaExpectedProfit > 0);
    }
});
