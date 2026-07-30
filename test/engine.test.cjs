const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../app/scripts/engine.js');

test('一场比赛会完成两圈并产生四名完赛者', () => {
    const race = engine.runRace({}, 'finish-order');

    assert.equal(race.finishOrder.length, 4);
    assert.equal(race.winner, race.finishOrder[0]);
    assert.ok(race.finishOrder.every(racer => racer.progress >= 2));
    assert.ok(race.finishOrder[0].finishTime < race.finishOrder[3].finishTime);
});

test('相同种子产生相同结果', () => {
    const first = engine.runRace({}, 'repeatable');
    const second = engine.runRace({}, 'repeatable');

    assert.deepEqual(
        first.finishOrder.map(racer => [racer.profile.id, racer.finishTime]),
        second.finishOrder.map(racer => [racer.profile.id, racer.finishTime])
    );
});

test('默认完赛时间落在合理范围', () => {
    const races = Array.from({length: 100}, (_, index) => engine.runRace({}, `timing-${index}`));
    const firstAverage = races.reduce((sum, race) => sum + race.finishOrder[0].finishTime, 0) / races.length;
    const lastAverage = races.reduce((sum, race) => sum + race.finishOrder[3].finishTime, 0) / races.length;

    assert.ok(firstAverage >= 38 && firstAverage <= 47, `第一名平均 ${firstAverage.toFixed(2)}s`);
    assert.ok(lastAverage >= 43 && lastAverage <= 53, `末名平均 ${lastAverage.toFixed(2)}s`);
});

test('事件概率接近 15% / 15% / 70%', () => {
    const random = engine.createRandom('event-probability');
    const counts = {stumble: 0, burst: 0, normal: 0};

    for (let index = 0; index < 100000; index += 1) {
        const roll = random();
        const event = roll < 0.15 ? 'stumble' : roll < 0.3 ? 'burst' : 'normal';
        counts[event] += 1;
    }

    assert.ok(Math.abs(counts.stumble / 100000 - 0.15) < 0.005);
    assert.ok(Math.abs(counts.burst / 100000 - 0.15) < 0.005);
    assert.ok(Math.abs(counts.normal / 100000 - 0.7) < 0.005);
});
