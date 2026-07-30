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
