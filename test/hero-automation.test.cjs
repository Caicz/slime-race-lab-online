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
            familiarDroppedLevels: [1, 2, 2, 5, 4000],
            familiarExpReward: 20,
            familiarSweepLevel: 2,
            debtCollectorLevel: 2,
            debtCollectorCurrentHp: 80,
            debtCollectorMaxHp: 80,
            debtCollectorStats: {hp: 80, atk: 40, def: 20, spd: 30},
            fireflyMageLevel: 2,
            fireflyMageCurrentHp: 100,
            fireflyMageMaxHp: 100,
            fireflyMageStats: {hp: 100, atk: 36, def: 32, spd: 36},
            angryBushLevel: 2,
            angryBushCurrentHp: 200,
            angryBushMaxHp: 200,
            angryBushStats: {hp: 200, atk: 36, def: 32, spd: 36},
            angryBushExpReward: 80,
            angryBushSweepLevel: 2,
            angryBushDroppedLevels: [1],
            automatonLevel: 2,
            automatonCurrentHp: 120,
            automatonMaxHp: 120,
            automatonStats: {hp: 120, atk: 44, def: 36, spd: 32},
            automatonSweepLevel: 2,
            automatonDroppedLevels: [],
            stoneGolemLevel: 4,
            stoneGolemCurrentHp: 320,
            stoneGolemMaxHp: 320,
            stoneGolemStats: {hp: 320, atk: 160, def: 80, spd: 48},
            stoneGolemSweepLevel: null,
            stoneGolemDroppedLevels: []
        },
        skills: [
            {skillKey: 'drain', level: 2},
            {skillKey: 'crit', level: 2},
            {skillKey: 'dodge', level: 2}
        ],
        rebornSkills: {skills: []}
    };
}

function createSequenceRandom(values, fallback = 0.99) {
    let index = 0;
    return () => index < values.length ? values[index++] : fallback;
}

function disableHeroSkills(raw) {
    raw.account.equippedActiveSkill = null;
    raw.account.equippedRebornSkill = null;
    raw.skills = [];
    raw.rebornSkills = {skills: []};
    return raw;
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

test('九只常规怪物都从当前半级面板读取并生成正确结算字段', () => {
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

    const familiar = heroAutomation.getMonster(snapshot, 'familiar');
    assert.equal(familiar.expReward, 20);
    assert.equal(familiar.sweepLevel, 2);
    assert.equal(familiar.eligibleDropLevels, 2);
    assert.equal(familiar.recordedDropLevels, 2);
});

test('祈祷增益按服务端指定属性作为固定值参与重新配点投影', () => {
    const raw = createRawSnapshot();
    Object.assign(raw.battleStatus, {
        prayerBuffActive: true,
        prayerBuffStat: 'atk',
        prayerBuffBonus: 75,
        attack: 685
    });
    const snapshot = heroAutomation.createSnapshot(raw);
    const current = heroAutomation.getProjectedStats(snapshot, heroAutomation.getCurrentAllocation(snapshot.account));
    const changed = heroAutomation.getProjectedStats(snapshot, {hp: 20, attack: 30, defense: 30, speed: 20});

    assert.equal(current.atk, 685);
    assert.equal(changed.atk, 565);
});

test('恐怖之森愤怒灌木模型包含官方抗性、愤怒叠层和再生机制', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {
        currentHp: 1000,
        maxHp: 1000,
        attack: 500,
        defense: 1000,
        speed: 500,
        angryBushCurrentHp: 200,
        angryBushMaxHp: 200,
        angryBushStats: {hp: 200, atk: 50, def: 20, spd: 20}
    });
    const snapshot = heroAutomation.createSnapshot(raw);
    const monster = heroAutomation.getMonster(snapshot, 'angry_bush');
    assert.equal(monster.region, 'forest');
    assert.equal(monster.minDamage, 10);
    assert.equal(monster.resistNull, 0.8);
    assert.equal(monster.resistLight, 0.1);
    assert.equal(monster.resistDark, 0.1);
    assert.equal(heroAutomation.MONSTER_REGIONS.forest.monsterIds[0], 'angry_bush');

    const result = heroAutomation.simulateBattle(snapshot, 'angry_bush', {random: () => 0.99});
    assert.ok(result.mechanics.angryBushRageStacks > 0);
    assert.ok(result.mechanics.angryBushRegenerations > 0);
    assert.ok(result.mechanics.angryBushRegeneratedHp > 0);
});

test('恐怖之森分页包含三只已开放怪物并使用各自服务端字段前缀', () => {
    const snapshot = heroAutomation.createSnapshot(createRawSnapshot());

    assert.deepEqual(heroAutomation.MONSTER_REGIONS.forest.monsterIds, ['angry_bush', 'automaton', 'stone_golem']);
    assert.ok(heroAutomation.FOREST_MONSTER_CATALOG.every(monster => monster.available));
    assert.equal(heroAutomation.getMonster(snapshot, 'automaton').level, 2);
    assert.equal(heroAutomation.getMonster(snapshot, 'stone_golem').level, 4);
    assert.equal(heroAutomation.MONSTERS.stone_golem.prefix, 'stoneGolem');
    assert.equal(heroAutomation.MONSTERS.stone_golem.clientLevelField, 'clientStoneGolemLevel');
});

test('自行人偶默认接受压制并按五次攻击触发全属性与当前HP衰减', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {currentHp: 10000, maxHp: 10000, attack: 1, defense: 1000, speed: 100});
    Object.assign(raw.battleStatus, {
        automatonCurrentHp: 100000,
        automatonMaxHp: 100000,
        automatonStats: {hp: 100000, atk: 1, def: 1000, spd: 100}
    });
    const result = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'automaton', {random: () => 0.99});

    assert.equal(result.battleOptions.automatonSuppressed, true);
    assert.equal(result.mechanics.automatonSuppressed, true);
    assert.ok(result.mechanics.automatonClimaxes > 0);
    assert.ok(result.finalPlayerDef < 1000);
    assert.ok(result.finalPlayerSpd < 100);
});

test('自然石像沉睡时具有额外护盾和伤害上限，四次命中后苏醒并开始再生', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {currentHp: 100000, maxHp: 100000, attack: 6000, defense: 1000, speed: 200});
    Object.assign(raw.battleStatus, {
        stoneGolemCurrentHp: 1000,
        stoneGolemMaxHp: 1000,
        stoneGolemStats: {hp: 1000, atk: 100, def: 100, spd: 50}
    });
    const result = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'stone_golem', {random: () => 0.99});

    assert.equal(result.victory, true);
    assert.equal(result.mechanics.stoneGolemHitCount, 4);
    assert.equal(result.mechanics.stoneGolemAwakenings, 1);
    assert.equal(result.mechanics.stoneGolemAsleep, false);
    assert.ok(result.mechanics.stoneGolemRegenerations > 0);
});

test('奏咪使魔快感抗性默认开启且关闭后每十次有效攻击完成一次循环', () => {
    const raw = createRawSnapshot();
    raw.account.equippedActiveSkill = null;
    Object.assign(raw.battleStatus, {
        currentHp: 1000,
        maxHp: 1000,
        attack: 100,
        defense: 100,
        speed: 100,
        familiarCurrentHp: 1000000,
        familiarMaxHp: 1000000,
        familiarStats: {hp: 1000000, atk: 100, def: 1000000, spd: 100}
    });
    const snapshot = heroAutomation.createSnapshot(raw);
    const resisted = heroAutomation.simulateBattle(snapshot, 'familiar', {random: () => 0.99});
    const unresisted = heroAutomation.simulateBattle(snapshot, 'familiar', {pleasureResist: false, random: () => 0.99});

    assert.equal(resisted.pleasureResist, true);
    assert.equal(resisted.pleasureClimaxes, 0);
    assert.equal(resisted.wallClockSeconds, resisted.elapsedSeconds);
    assert.equal(unresisted.pleasureResist, false);
    assert.equal(unresisted.pleasureClimaxes, 1);
    assert.equal(unresisted.pleasureValue, 90);
    assert.equal(unresisted.climaxExperienceLost, 0);
    assert.ok(Math.abs(unresisted.wallClockSeconds - unresisted.elapsedSeconds - 1.2) < 1e-9);
    assert.equal(unresisted.currentHp, resisted.currentHp);
    assert.equal(unresisted.monsterRemainingHp, resisted.monsterRemainingHp);
});

test('战斗守卫保留奏咪使魔快感抗性选择供桌面与 Android 执行器使用', () => {
    const snapshot = heroAutomation.createSnapshot(createRawSnapshot());

    assert.equal(heroAutomation.createBattleGuard(snapshot, 'familiar').pleasureResist, true);
    assert.equal(heroAutomation.createBattleGuard(snapshot, 'familiar', {pleasureResist: false}).pleasureResist, false);
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

test('史莱姆按官方概率分支闪避并最多连续复活五次', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {currentHp: 5000, maxHp: 5000, attack: 1000, defense: 500, speed: 1000});
    Object.assign(raw.battleStatus, {
        slimeCurrentHp: 100,
        slimeMaxHp: 100,
        slimeStats: {hp: 100, atk: 1, def: 1, spd: 1}
    });
    const random = createSequenceRandom([
        0,
        0.99, 0.99, 0,
        0.99, 0.99, 0,
        0.99, 0.99, 0,
        0.99, 0.99, 0,
        0.99, 0.99, 0,
        0.99, 0.99
    ]);
    const result = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'slime', {random});

    assert.equal(result.victory, true);
    assert.equal(result.mechanics.monsterDodges, 1);
    assert.equal(result.mechanics.monsterReviveCount, 5);
});

test('野生咕隆暴击无视防御并在命中后施加持续中毒', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {currentHp: 1000, maxHp: 1000, attack: 100, defense: 1, speed: 100});
    Object.assign(raw.battleStatus, {
        hilichurlCurrentHp: 100000,
        hilichurlMaxHp: 100000,
        hilichurlStats: {hp: 100000, atk: 500, def: 1000, spd: 200}
    });
    const result = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'hilichurl', {
        random: createSequenceRandom([0, 0])
    });

    assert.equal(result.mechanics.monsterCriticalHits, 1);
    assert.equal(result.mechanics.poisonApplications, 1);
    assert.ok(result.mechanics.poisonTicks >= 1);
});

test('重磁护卫先释放磁场再生成护盾并在无法破盾时反伤', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {currentHp: 1000, maxHp: 1000, attack: 100, defense: 500, speed: 100});
    Object.assign(raw.battleStatus, {
        ruinGuardCurrentHp: 10000,
        ruinGuardMaxHp: 10000,
        ruinGuardStats: {hp: 10000, atk: 1, def: 80, spd: 1}
    });
    const result = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'ruin_guard', {
        random: createSequenceRandom([0.99, 0, 0.99])
    });

    assert.equal(result.mechanics.magneticFieldUsed, true);
    assert.equal(result.mechanics.shieldActivations, 1);
    assert.equal(result.mechanics.shieldReflections, 1);
});

test('奏咪使魔首次行动偷取一半攻击且后续按攻击伤害回血', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {currentHp: 40, maxHp: 40, attack: 200, defense: 100, speed: 100});
    Object.assign(raw.battleStatus, {
        familiarCurrentHp: 1000,
        familiarMaxHp: 1000,
        familiarStats: {hp: 1000, atk: 50, def: 100, spd: 200}
    });
    const result = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'familiar', {random: () => 0.99});

    assert.equal(result.mechanics.familiarStolenAttack, 100);
    assert.equal(result.mechanics.familiarHealing, 1);
    assert.equal(result.currentHp, 0);
});

test('极乐盗贼默认拒绝装备并按行动条50切换隐身', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.battleStatus, {
        debtCollectorCurrentHp: 100,
        debtCollectorMaxHp: 100,
        debtCollectorStats: {hp: 100, atk: 1, def: 20, spd: 1}
    });
    const snapshot = heroAutomation.createSnapshot(raw);
    const refused = heroAutomation.simulateBattle(snapshot, 'debt_collector', {random: () => 0.99});
    const submitted = heroAutomation.simulateBattle(snapshot, 'debt_collector', {
        battleOptions: {submitEquipment: true},
        random: () => 0.99
    });

    assert.equal(refused.equipmentSubmitted, false);
    assert.equal(refused.finalPlayerAtk, 610);
    assert.equal(refused.finalPlayerDef, 365);
    assert.equal(refused.finalPlayerSpd, 165);
    assert.equal(refused.mechanics.debtStealthToggles, 2);
    assert.equal(submitted.equipmentSubmitted, true);
    assert.equal(submitted.finalPlayerAtk, 500);
    assert.equal(submitted.finalPlayerDef, 350);
    assert.equal(submitted.finalPlayerSpd, 150);
});

test('大雷精灵每第三次行动强制拥抱且闪避后仍追加麻痹', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    raw.skills = [{skillKey: 'dodge', level: 34}];
    Object.assign(raw.battleStatus, {currentHp: 1000, maxHp: 1000, attack: 1, defense: 1000, speed: 1});
    Object.assign(raw.battleStatus, {
        fireflyMageCurrentHp: 10000,
        fireflyMageMaxHp: 10000,
        fireflyMageStats: {hp: 10000, atk: 1, def: 10000, spd: 100}
    });
    const result = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'firefly_mage', {random: () => 0});

    assert.ok(result.mechanics.forcedHugs >= 1);
    assert.ok(result.mechanics.paralysisApplications >= result.mechanics.forcedHugs);
});

test('account route and monster battle defaults are normalized', () => {
    const raw = createRawSnapshot();
    raw.account.defaultMonsterRoute = ['debt_collector', 'slime', 'debt_collector', 'unknown'];
    const snapshot = heroAutomation.createSnapshot(raw);

    assert.deepEqual(heroAutomation.getDefaultRoute(snapshot), ['debt_collector', 'slime']);
    assert.deepEqual(snapshot.defaultRoute, ['debt_collector', 'slime']);
    assert.equal(heroAutomation.getDefaultBattleOptions('debt_collector').submitEquipment, false);
    assert.equal(heroAutomation.getDefaultBattleOptions('debt_collector').surrenderEquipment, false);
    assert.equal(heroAutomation.getDefaultBattleOptions('familiar').pleasureResist, true);
    const result = heroAutomation.simulateBattle(snapshot, 'debt_collector', {random: () => 0.99});
    assert.equal(result.equipmentSubmitted, false);
    assert.equal(Object.hasOwn(heroAutomation.createBattleResultPayload('debt_collector', result), 'submitEquipment'), false);
});

test('official reborn skills are recognized without fabricated generic stat effects', () => {
    const raw = createRawSnapshot();
    raw.account.equippedRebornSkill = 'star_curse';
    raw.account.rebornMode = 'reborn';
    raw.account.faithLevel = 28;
    raw.rebornSkills = {
        soulFragments: 12,
        skills: [
            {skillKey: 'holy_judgment', level: 0},
            {skillKey: 'mirror_shield', level: 0},
            {skillKey: 'star_curse', level: 2},
            {skillKey: 'blood_pact', level: 0}
        ]
    };
    const snapshot = heroAutomation.createSnapshot(raw);
    const projected = heroAutomation.getProjectedStats(snapshot, heroAutomation.getCurrentAllocation(snapshot.account), {
        rebornSkillKey: 'star_curse'
    });

    assert.equal(heroAutomation.getDefaultRebornSkill(snapshot), 'star_curse');
    assert.equal(projected.atk, 610);
    assert.equal(projected.equippedRebornSkill, 'star_curse');
    assert.deepEqual(projected.rebornModifiers, {
        element: 'dark', kind: 'attack', skillKey: 'star_curse', level: 2
    });
    assert.equal(snapshot.soulFragments, 12);
});

test('server rebornType locks the faith route and filters skills', () => {
    const raw = createRawSnapshot();
    raw.account.rebornMode = 'reborn';
    raw.account.rebornType = 'M';
    raw.account.equippedRebornSkill = 'star_curse';
    raw.rebornSkills = {
        skills: [
            {skillKey: 'holy_judgment', level: 2},
            {skillKey: 'mirror_shield', level: 2},
            {skillKey: 'star_curse', level: 2},
            {skillKey: 'blood_pact', level: 1}
        ]
    };
    const snapshot = heroAutomation.createSnapshot(raw);

    assert.equal(snapshot.faithRoute, 'M');
    assert.equal(heroAutomation.getFaithRouteLabel(snapshot.faithRoute), '魔女');
    assert.equal(heroAutomation.getDefaultRebornSkill(snapshot), 'star_curse');
    assert.equal(heroAutomation.isRebornSkillAllowedForFaithRoute(snapshot, snapshot.rebornSkillOptions.find(skill => skill.key === 'holy_judgment')), false);
    assert.throws(
        () => heroAutomation.validateRebornSkillSelection(snapshot, 'holy_judgment'),
        /当前信仰路线为“魔女”/
    );
});

test('incompatible server equipped skill is reported instead of auto-repaired', () => {
    const raw = createRawSnapshot();
    raw.account.rebornType = 'N';
    raw.account.equippedRebornSkill = 'star_curse';
    raw.rebornSkills = {skills: [{skillKey: 'star_curse', level: 2}]};
    const snapshot = heroAutomation.createSnapshot(raw);

    assert.throws(
        () => heroAutomation.validateFaithRouteConsistency(snapshot),
        /服务器返回的转生技能与信仰路线不一致/
    );
    assert.equal(heroAutomation.getDefaultRebornSkill(snapshot), null);
});

test('base mode keeps the server stored reborn skill without treating null as a faith conflict', () => {
    const raw = createRawSnapshot();
    raw.account.rebornType = 'M';
    raw.account.rebornMode = 'base';
    raw.account.equippedRebornSkill = 'star_curse';
    raw.rebornSkills = {skills: [
        {skillKey: 'star_curse', level: 4},
        {skillKey: 'blood_pact', level: 1}
    ]};
    const snapshot = heroAutomation.createSnapshot(raw);

    assert.deepEqual(heroAutomation.validateAppliedRebornSkill(snapshot, null, 'base'), {
        checked: false,
        expectedSkillKey: null,
        actualSkillKey: 'star_curse'
    });
    assert.throws(
        () => heroAutomation.validateAppliedRebornSkill(snapshot, 'blood_pact', 'reborn'),
        /服务器未应用推荐的转生技能：期望“blood_pact”，实际“star_curse”/
    );
});

test('base mode disables stored reborn skill while reborn mode applies the official attack multiplier', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    raw.account.equippedRebornSkill = 'star_curse';
    raw.rebornSkills = {skills: [{skillKey: 'star_curse', level: 2}]};
    Object.assign(raw.battleStatus, {currentHp: 100, maxHp: 100, attack: 610, defense: 100, speed: 100});
    Object.assign(raw.battleStatus, {
        hilichurlCurrentHp: 2000,
        hilichurlMaxHp: 2000,
        hilichurlStats: {hp: 2000, atk: 10000, def: 120, spd: 100}
    });

    raw.account.rebornMode = 'base';
    const base = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'hilichurl', {random: () => 0.99});
    raw.account.rebornMode = 'reborn';
    const reborn = heroAutomation.simulateBattle(heroAutomation.createSnapshot(raw), 'hilichurl', {random: () => 0.99});

    assert.equal(base.rebornSkillKey, null);
    assert.equal(base.monsterRemainingHp, 1510);
    assert.equal(reborn.rebornSkillKey, 'star_curse');
    assert.equal(reborn.monsterRemainingHp, 1449);
    assert.equal(heroAutomation.REBORN_SKILLS.holy_judgment.element, 'light');
    assert.equal(heroAutomation.REBORN_SKILLS.star_curse.element, 'dark');
});

test('mirror shield and blood pact follow the official charge and delayed damage formulas', () => {
    const mirrorRaw = disableHeroSkills(createRawSnapshot());
    mirrorRaw.account.rebornMode = 'reborn';
    mirrorRaw.account.equippedRebornSkill = 'mirror_shield';
    mirrorRaw.rebornSkills = {skills: [{skillKey: 'mirror_shield', level: 2}]};
    Object.assign(mirrorRaw.battleStatus, {currentHp: 100, maxHp: 100, attack: 100, defense: 500, speed: 100});
    Object.assign(mirrorRaw.battleStatus, {
        hilichurlCurrentHp: 1,
        hilichurlMaxHp: 1,
        hilichurlStats: {hp: 1, atk: 100, def: 1000, spd: 100}
    });
    const mirror = heroAutomation.simulateBattle(heroAutomation.createSnapshot(mirrorRaw), 'hilichurl', {random: () => 0.99});

    const bloodRaw = disableHeroSkills(createRawSnapshot());
    bloodRaw.account.rebornMode = 'reborn';
    bloodRaw.account.equippedRebornSkill = 'blood_pact';
    bloodRaw.rebornSkills = {skills: [{skillKey: 'blood_pact', level: 1}]};
    Object.assign(bloodRaw.battleStatus, {currentHp: 1000, maxHp: 1000, attack: 100, defense: 500, speed: 100});
    Object.assign(bloodRaw.battleStatus, {
        hilichurlCurrentHp: 100,
        hilichurlMaxHp: 100,
        hilichurlStats: {hp: 100, atk: 1, def: 100, spd: 1}
    });
    const blood = heroAutomation.simulateBattle(heroAutomation.createSnapshot(bloodRaw), 'hilichurl', {random: () => 0.99});

    assert.equal(mirror.victory, true);
    assert.equal(mirror.mechanics.mirrorReflections, 1);
    assert.equal(blood.victory, true);
    assert.equal(blood.currentHp, 979);
    assert.equal(blood.mechanics.bloodPactExplosions, 1);
});

test('base and faith modes keep independent levels and point pools and choose the stronger mode', () => {
    const baseRaw = disableHeroSkills(createRawSnapshot());
    baseRaw.account.rebornMode = 'base';
    baseRaw.account.level = 50;
    Object.assign(baseRaw.battleStatus, {
        hilichurlCurrentHp: 5000,
        hilichurlMaxHp: 5000,
        hilichurlStats: {hp: 5000, atk: 1000, def: 1000, spd: 100}
    });
    const faithRaw = structuredClone(baseRaw);
    Object.assign(faithRaw.account, {
        rebornMode: 'faith',
        faithLevel: 20,
        hpBonus: 0,
        attackBonus: 500,
        defenseBonus: 0,
        speedBonus: 0
    });
    Object.assign(faithRaw.battleStatus, {
        currentHp: 500,
        maxHp: 500,
        attack: 5100,
        defense: 50,
        speed: 50,
        baseAttack: 5100,
        baseDefense: 50,
        baseSpeed: 50
    });
    const snapshot = heroAutomation.combineHeroModeSnapshots(
        heroAutomation.createSnapshot(baseRaw),
        heroAutomation.createSnapshot(faithRaw),
        'base'
    );
    const recommendation = heroAutomation.findOptimalBattleMode(snapshot, 'hilichurl', {
        divisions: 4,
        coarseSamples: 2,
        finalSamples: 4,
        optimizeActiveSkill: false
    });

    assert.equal(snapshot.heroModes.base.level, 50);
    assert.equal(snapshot.heroModes.reborn.level, 20);
    assert.equal(heroAutomation.getTotalPoints(heroAutomation.getHeroModeSnapshot(snapshot, 'base').account), 100);
    assert.equal(heroAutomation.getTotalPoints(heroAutomation.getHeroModeSnapshot(snapshot, 'reborn').account), 500);
    assert.equal(recommendation.heroMode, 'reborn');
    assert.equal(recommendation.totalPoints, 500);
    assert.ok(recommendation.modeComparisons.reborn.winRate > recommendation.modeComparisons.base.winRate);
});

test('faith optimization evaluates every unlocked skill on the locked route and selects the better result', () => {
    const raw = disableHeroSkills(createRawSnapshot());
    Object.assign(raw.account, {
        rebornMode: 'reborn',
        rebornType: 'M',
        faithLevel: 89,
        equippedRebornSkill: 'blood_pact'
    });
    raw.rebornSkills = {skills: [
        {skillKey: 'star_curse', level: 4},
        {skillKey: 'blood_pact', level: 1},
        {skillKey: 'holy_judgment', level: 10}
    ]};
    Object.assign(raw.battleStatus, {
        hilichurlCurrentHp: 1000,
        hilichurlMaxHp: 1000,
        hilichurlStats: {hp: 1000, atk: 1, def: 100, spd: 1}
    });
    const snapshot = heroAutomation.createSnapshot(raw);
    const fixed = heroAutomation.findOptimalAllocation(snapshot, 'hilichurl', {
        rebornSkillKey: 'star_curse',
        optimizeActiveSkill: false,
        divisions: 4,
        coarseSamples: 2,
        finalSamples: 4
    });
    const optimized = heroAutomation.findOptimalAllocation(snapshot, 'hilichurl', {
        optimizeActiveSkill: false,
        divisions: 4,
        coarseSamples: 2,
        finalSamples: 4
    });

    assert.equal(optimized.rebornSkillKey, 'star_curse');
    assert.equal(optimized.candidatesEvaluated, fixed.candidatesEvaluated * 2);
});

test('combined mode snapshots preserve each refresh response monster panel independently', () => {
    const baseRaw = createRawSnapshot();
    baseRaw.account.rebornMode = 'base';
    const faithRaw = createRawSnapshot();
    faithRaw.account.rebornMode = 'faith';
    faithRaw.account.rebornType = 'M';
    faithRaw.account.faithLevel = 20;
    faithRaw.account.equippedRebornSkill = 'star_curse';
    faithRaw.rebornSkills = {skills: [{skillKey: 'star_curse', level: 1}]};
    faithRaw.battleStatus.automatonLevel = 2.5;
    faithRaw.battleStatus.automatonStats = {hp: 150, atk: 55, def: 45, spd: 40};
    faithRaw.battleStatus.automatonCurrentHp = 150;
    faithRaw.battleStatus.automatonMaxHp = 150;

    const combined = heroAutomation.combineHeroModeSnapshots(
        heroAutomation.createSnapshot(baseRaw),
        heroAutomation.createSnapshot(faithRaw),
        'base'
    );

    assert.equal(heroAutomation.getMonster(heroAutomation.getHeroModeSnapshot(combined, 'base'), 'automaton').level, 2);
    assert.equal(heroAutomation.getMonster(heroAutomation.getHeroModeSnapshot(combined, 'reborn'), 'automaton').level, 2.5);
});

test('all nine monster models can be verified with one call', () => {
    const snapshot = heroAutomation.createSnapshot(createRawSnapshot());
    const results = heroAutomation.verifyMonsterModels(snapshot, {
        divisions: 4,
        coarseSamples: 2,
        finalSamples: 4
    });

    assert.deepEqual(Object.keys(results), Object.keys(heroAutomation.MONSTERS));
    assert.ok(Object.values(results).every(result => result.status === 'ok'));
    assert.equal(results.debt_collector.battleOptions.submitEquipment, false);
});
