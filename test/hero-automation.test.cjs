const test = require('node:test');
const assert = require('node:assert/strict');
const heroAutomation = require('../app/scripts/hero-automation.js');

function createRawSnapshot() {
    return {
        account: {
            statPoints: 0,
            hpBonus: 10,
            attackBonus: 40,
            defenseBonus: 30,
            speedBonus: 20,
            equippedActiveSkill: 'drain',
            equippedRebornSkill: null
        },
        battleStatus: {
            currentHp: 1120,
            maxHp: 1120,
            attack: 610,
            defense: 365,
            speed: 165,
            baseAttack: 500,
            baseDefense: 350,
            baseSpeed: 150,
            critRateBonus: 0,
            critDmgBonus: 0,
            equipmentBonuses: {
                hpBonus: 20,
                hpPercent: 10,
                attackBonus: 10,
                attackPercent: 20,
                defenseBonus: 15,
                defensePercent: 0,
                speedBonus: 15,
                speedPercent: 0
            },
            defenseBuffStacks: 0,
            battleCount: 0,
            slimeLevel: 5,
            slimeCurrentHp: 200,
            slimeMaxHp: 200,
            slimeStats: {hp: 200, atk: 90, def: 50, spd: 100},
            hilichurlLevel: 4,
            hilichurlCurrentHp: 400,
            hilichurlMaxHp: 400,
            hilichurlStats: {hp: 400, atk: 160, def: 120, spd: 120},
            ruinGuardLevel: 3,
            ruinGuardCurrentHp: 180,
            ruinGuardMaxHp: 180,
            ruinGuardStats: {hp: 180, atk: 72, def: 48, spd: 12},
            familiarLevel: 2,
            familiarCurrentHp: 120,
            familiarMaxHp: 120,
            familiarStats: {hp: 120, atk: 20, def: 16, spd: 32},
            debtCollectorLevel: 2,
            debtCollectorCurrentHp: 80,
            debtCollectorMaxHp: 80,
            debtCollectorStats: {hp: 80, atk: 40, def: 20, spd: 30},
            fireflyMageLevel: 2,
            fireflyMageCurrentHp: 100,
            fireflyMageMaxHp: 100,
            fireflyMageStats: {hp: 100, atk: 36, def: 32, spd: 36}
        },
        skills: [
            {skillKey: 'drain', level: 2},
            {skillKey: 'crit', level: 2},
            {skillKey: 'dodge', level: 2}
        ],
        rebornSkills: {skills: []}
    };
}

test('当前配点可以还原勇者面板最终属性并选择30层防御药水', () => {
    const snapshot = heroAutomation.createSnapshot(createRawSnapshot());
    const allocation = heroAutomation.getCurrentAllocation(snapshot.account);
    const current = heroAutomation.getProjectedStats(snapshot, allocation);
    const withPotions = heroAutomation.getProjectedStats(snapshot, allocation, {defensePotionStacks: 30});

    assert.deepEqual(allocation, {hp: 10, attack: 40, defense: 30, speed: 20});
    assert.equal(current.maxHp, 1120);
    assert.equal(current.atk, 610);
    assert.equal(current.def, 365);
    assert.equal(current.spd, 165);
    assert.equal(withPotions.def, 3365);
});

test('六只常规怪物都从当前半级面板读取并生成正确结算字段', () => {
    const snapshot = heroAutomation.createSnapshot(createRawSnapshot());

    for (const monsterId of Object.keys(heroAutomation.MONSTERS)) {
        const monster = heroAutomation.getMonster(snapshot, monsterId);
        const result = heroAutomation.simulateBattle(snapshot, monsterId, {random: () => 0.99});
        const payload = heroAutomation.createBattleResultPayload(monsterId, result);
        assert.equal(monster.id, monsterId);
        assert.equal(payload.monsterType, monsterId);
        assert.equal(payload[monster.clientLevelField], monster.level);
        assert.equal(typeof result.victory, 'boolean');
        assert.ok(result.elapsedSeconds > 0);
    }
});

test('最优配点完整使用能力点并产生稳定的胜率优先方案', () => {
    const snapshot = heroAutomation.createSnapshot(createRawSnapshot());
    const options = {divisions: 4, coarseSamples: 2, finalSamples: 4};
    const first = heroAutomation.findOptimalAllocation(snapshot, 'hilichurl', options);
    const second = heroAutomation.findOptimalAllocation(snapshot, 'hilichurl', options);

    assert.equal(Object.values(first.allocation).reduce((sum, value) => sum + value, 0), 100);
    assert.deepEqual(first, second);
    assert.ok(first.winRate >= 0 && first.winRate <= 1);
});

test('升级后的未分配能力点会并入完整推荐并由配点计划自动分配', () => {
    const raw = createRawSnapshot();
    raw.account.statPoints = 3;
    const snapshot = heroAutomation.createSnapshot(raw);
    const result = heroAutomation.findOptimalAllocation(snapshot, 'hilichurl', {
        divisions: 4,
        coarseSamples: 2,
        finalSamples: 4
    });
    const plan = heroAutomation.planAllocationChanges(snapshot.account, result.allocation);

    assert.equal(result.totalPoints, 103);
    assert.equal(Object.values(result.allocation).reduce((sum, value) => sum + value, 0), 103);
    assert.equal(plan.allocate.reduce((sum, change) => sum + change.points, 0) - plan.deallocate.reduce((sum, change) => sum + change.points, 0), 3);
});

test('最少掉血策略按掉血百分比而非具体血量排序', () => {
    const evaluations = [
        {winRate: 1, averageHpLost: 100, averageHpLossRatio: 0.1, averageRemainingHpRatio: 0.9, averageVictorySeconds: 10},
        {winRate: 1, averageHpLost: 80, averageHpLossRatio: 0.2, averageRemainingHpRatio: 0.8, averageVictorySeconds: 8}
    ];

    heroAutomation.sortEvaluations(evaluations, 'minimum_loss');
    assert.equal(evaluations[0].averageHpLost, 100);

    const snapshot = heroAutomation.createSnapshot(createRawSnapshot());
    const result = heroAutomation.simulateBattle(snapshot, 'hilichurl', {random: () => 0.99});
    assert.equal(result.hpLossRatio, result.hpLost / 1120);
});

test('三种优化目标都可选择且会把已解锁主动技能纳入候选', () => {
    const raw = createRawSnapshot();
    raw.skills.push({skillKey: 'shield', level: 3}, {skillKey: 'speed', level: 4}, {skillKey: 'weaken', level: 2});
    const snapshot = heroAutomation.createSnapshot(raw);

    for (const optimizationMode of Object.keys(heroAutomation.OPTIMIZATION_MODES)) {
        const result = heroAutomation.findOptimalAllocation(snapshot, 'hilichurl', {
            optimizationMode,
            optimizeActiveSkill: true,
            divisions: 4,
            coarseSamples: 2,
            finalSamples: 4
        });
        assert.equal(result.optimizationMode, optimizationMode);
        assert.ok(heroAutomation.ACTIVE_SKILLS[result.activeSkillKey]);
        assert.ok(result.candidatesEvaluated >= 140);
        assert.equal(result.candidatesEvaluated % 4, 0);
    }
});

test('恢复药水仅在HP低于20%时规划并以至少95%为目标', () => {
    const raw = createRawSnapshot();
    raw.battleStatus.currentHp = 190;
    raw.battleStatus.maxHp = 1000;
    const snapshot = heroAutomation.createSnapshot(raw);
    const inventory = [
        {id: 31, itemId: 3, quantity: 50},
        {id: 41, itemId: 4, quantity: 5},
        {id: 51, itemId: 5, quantity: 1}
    ];
    const plan = heroAutomation.planHealingConsumables(snapshot, inventory);

    assert.equal(plan.needed, true);
    assert.deepEqual(plan.uses, [
        {inventoryEntryId: 31, itemId: 3, quantity: 8},
        {inventoryEntryId: 41, itemId: 4, quantity: 3}
    ]);
    raw.battleStatus.currentHp = 200;
    assert.equal(heroAutomation.planHealingConsumables(heroAutomation.createSnapshot(raw), inventory).needed, false);
    raw.battleStatus.currentHp = 10;
    assert.throws(() => heroAutomation.planHealingConsumables(heroAutomation.createSnapshot(raw), []), /恢复药水不足/);
});

test('配点变更先回收多余点数再分配且胜利必须精确增加0.5级', () => {
    const raw = createRawSnapshot();
    const snapshot = heroAutomation.createSnapshot(raw);
    const plan = heroAutomation.planAllocationChanges(snapshot.account, {hp: 20, attack: 30, defense: 30, speed: 20});

    assert.deepEqual(plan.deallocate, [{stat: 'attack', points: 10}]);
    assert.deepEqual(plan.allocate, [{stat: 'hp', points: 10}]);
    raw.battleStatus.slimeLevel = 5.5;
    assert.equal(heroAutomation.validateLevelTransition('slime', 5, heroAutomation.createSnapshot(raw), true), 5.5);
    raw.battleStatus.slimeLevel = 6;
    assert.throws(
        () => heroAutomation.validateLevelTransition('slime', 5, heroAutomation.createSnapshot(raw), true),
        /等级变化异常/
    );
});

test('战斗守卫会锁定完整怪物面板、配点、今日次数和药水有效期', () => {
    const raw = createRawSnapshot();
    raw.battleStatus.defenseBuffStacks = 30;
    raw.battleStatus.defenseBuffExpiry = '2030-01-01T00:00:00.000Z';
    const snapshot = heroAutomation.createSnapshot(raw);
    const guard = heroAutomation.createBattleGuard(snapshot, 'slime', {requireDefensePotions: true, lockHeroPanel: true});
    guard.expectedAllocation = heroAutomation.getCurrentAllocation(snapshot.account);

    assert.equal(heroAutomation.validateBattleGuard(snapshot, guard, {now: Date.parse('2029-01-01T00:00:00.000Z')}).id, 'slime');

    raw.battleStatus.slimeStats.atk += 1;
    assert.throws(
        () => heroAutomation.validateBattleGuard(heroAutomation.createSnapshot(raw), guard, {now: Date.parse('2029-01-01T00:00:00.000Z')}),
        /面板已经变化/
    );
    raw.battleStatus.slimeStats.atk -= 1;
    raw.account.hpBonus += 1;
    raw.account.speedBonus -= 1;
    assert.throws(
        () => heroAutomation.validateBattleGuard(heroAutomation.createSnapshot(raw), guard, {now: Date.parse('2029-01-01T00:00:00.000Z')}),
        /能力值方案/
    );
    raw.account.hpBonus -= 1;
    raw.account.speedBonus += 1;
    raw.battleStatus.attack += 1;
    assert.throws(
        () => heroAutomation.validateBattleGuard(heroAutomation.createSnapshot(raw), guard, {now: Date.parse('2029-01-01T00:00:00.000Z')}),
        /勇者面板已经变化/
    );
    raw.battleStatus.attack -= 1;
    raw.battleStatus.battleCount = 1;
    assert.throws(
        () => heroAutomation.validateBattleGuard(heroAutomation.createSnapshot(raw), guard, {now: Date.parse('2029-01-01T00:00:00.000Z')}),
        /战斗次数已经变化/
    );
    raw.battleStatus.battleCount = 0;
    raw.battleStatus.defenseBuffExpiry = '2028-01-01T00:00:00.000Z';
    assert.throws(
        () => heroAutomation.validateBattleGuard(heroAutomation.createSnapshot(raw), guard, {now: Date.parse('2029-01-01T00:00:00.000Z')}),
        /防御药水已经失效/
    );
});

test('战斗提交后今日次数必须精确增加一次且零血禁止挑战', () => {
    const raw = createRawSnapshot();
    const snapshot = heroAutomation.createSnapshot(raw);
    const guard = heroAutomation.createBattleGuard(snapshot, 'slime');

    raw.battleStatus.currentHp = 0;
    assert.throws(() => heroAutomation.validateBattleGuard(heroAutomation.createSnapshot(raw), guard), /HP 不足/);

    raw.battleStatus.currentHp = 1120;
    raw.battleStatus.battleCount = 1;
    assert.equal(heroAutomation.validateBattleCountTransition(0, heroAutomation.createSnapshot(raw)), 1);
    raw.battleStatus.battleCount = 2;
    assert.throws(
        () => heroAutomation.validateBattleCountTransition(0, heroAutomation.createSnapshot(raw)),
        /战斗次数变化异常/
    );
});

test('异常恢复会根据战斗次数和怪物半级变化安全对账', () => {
    const raw = createRawSnapshot();
    const attempt = {monsterId: 'slime', monsterLevel: 5, battleCount: 0};

    assert.equal(heroAutomation.reconcileBattleAttempt(attempt, heroAutomation.createSnapshot(raw)).status, 'pending');
    raw.battleStatus.battleCount = 1;
    raw.battleStatus.slimeLevel = 5.5;
    assert.equal(heroAutomation.reconcileBattleAttempt(attempt, heroAutomation.createSnapshot(raw)).status, 'victory');
    raw.battleStatus.slimeLevel = 5;
    assert.equal(heroAutomation.reconcileBattleAttempt(attempt, heroAutomation.createSnapshot(raw)).status, 'defeat');
    raw.battleStatus.battleCount = 2;
    assert.equal(heroAutomation.reconcileBattleAttempt(attempt, heroAutomation.createSnapshot(raw)).status, 'invalid');
});

test('异常重试仅跳过明确业务停机', () => {
    assert.deepEqual([1, 2, 3].map(heroAutomation.getHeroRetryDelayMilliseconds), [5000, 10000, 15000]);
    assert.throws(() => heroAutomation.getHeroRetryDelayMilliseconds(4), /重试次数必须是 1–3/);
    assert.equal(heroAutomation.isRetryableHeroError(new Error('远程请求超时')), true);
    assert.equal(heroAutomation.isRetryableHeroError(new Error('史莱姆面板已经变化，请重新计算配点')), true);
    assert.equal(heroAutomation.isRetryableHeroError(new Error('预测胜率低于停止线')), false);
    assert.equal(heroAutomation.isRetryableHeroError(new Error('恢复药水不足')), false);
    assert.equal(heroAutomation.isRetryableHeroError(new Error('战斗对账异常')), false);
});
