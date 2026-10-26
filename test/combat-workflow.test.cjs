const test = require('node:test');
const assert = require('node:assert/strict');
const content = require('../app/scripts/combat-content.js');
const workflow = require('../app/scripts/combat-workflow.js');
const hero = require('../app/scripts/hero-automation.js');

function equipment(id, fields = {}) {
    return {id, itemId: 40, quantity: 1, equipped: false, locked: false, item: {name: '测试饰品', category: 'equipment', equipSlot: 'ring', routeType: 'M'}, ...fields};
}

function createSnapshot() {
    return hero.createSnapshot({
        account: {rebornType: 'M', rebornMode: 'base', level: 10, faithLevel: 2, magicFragments: 5, statPoints: 0, hpBonus: 0, attackBonus: 0, defenseBonus: 0, speedBonus: 0, equippedActiveSkill: null, equippedRebornSkill: null},
        battleStatus: {currentHp: 100000, maxHp: 100000, attack: 100000, defense: 100000, speed: 100000, critRateBonus: 0, critDmgBonus: 0},
        skills: [], rebornSkills: []
    });
}

function createMock(options = {}) {
    const snapshot = createSnapshot();
    const inventory = options.inventory || [];
    const accessoryItems = options.accessoryItems || inventory;
    const towerProgress = {towerMaxFloor: 0};
    const status = {todayCount: 0, maxDaily: 5, forestTodayCount: 0, forestMaxDaily: 10, goldenSlimeTodayCount: 0, goldenSlimeMaxDaily: 3, activeRun: null};
    const posts = [];
    let uncertain = false;
    const service = workflow.createService({
        syncHero: async () => structuredClone(snapshot),
        random: () => 0.9,
        request: async (endpoint, request = {}) => {
            if (request.method !== 'POST') {
                const data = {'/api/inventory': inventory, '/api/accessory/items': accessoryItems, '/api/tower/progress': towerProgress, '/api/dungeon/status': status}[endpoint];
                if (!data) throw new Error(`Unexpected GET ${endpoint}`);
                return structuredClone(data);
            }
            posts.push({endpoint, data: request.data});
            if (options.failAt === endpoint) { uncertain = true; throw new Error('timeout'); }
            if (uncertain) throw new Error('unexpected retry');
            if (endpoint === '/api/tower/save' && !options.ignoreSave) towerProgress.towerMaxFloor = Math.max(towerProgress.towerMaxFloor, request.data.floor);
            if (endpoint === '/api/dungeon/start') {
                const field = request.data.dungeonId === 'forest' ? 'forestTodayCount' : request.data.dungeonId === 'golden_slime' ? 'goldenSlimeTodayCount' : 'todayCount';
                status[field] += 1;
                status.activeRun = {id: 1, dungeonId: request.data.dungeonId, status: 'active', stage: 1, metadata: options.golden ? 'has_golden_slime' : ''};
                return {hasGoldenSlime: Boolean(options.golden), noFleeEnabled: Boolean(options.golden)};
            }
            if (endpoint === '/api/dungeon/advance' && !options.ignoreAdvance) status.activeRun.stage += 1;
            if (endpoint === '/api/dungeon/update-metadata') status.activeRun.metadata = request.data.metadata;
            if (['/api/dungeon/fail', '/api/dungeon/abandon', '/api/dungeon/chest'].includes(endpoint)) status.activeRun = null;
            if (endpoint === '/api/inventory/equip') inventory.find(item => item.id === request.data.inventoryId).equipped = true;
            if (endpoint === '/api/inventory/unequip') inventory.find(item => item.id === request.data.inventoryId).equipped = false;
            if (endpoint === '/api/accessory/enhance') accessoryItems.splice(accessoryItems.findIndex(item => item.id === request.data.consumeId), 1);
            if (['/api/hero/deallocate-stats', '/api/hero/allocate-stats'].includes(endpoint) && !options.ignoreAllocation) {
                const fields = {hp: 'hpBonus', attack: 'attackBonus', defense: 'defenseBonus', speed: 'speedBonus'};
                const difference = request.data.points * (endpoint.includes('deallocate') ? -1 : 1);
                const panel = {hp: 'maxHp', attack: 'attack', defense: 'defense', speed: 'speed'};
                snapshot.battleStatus[panel[request.data.stat]] += difference * hero.STAT_RULES[request.data.stat].perPoint;
                if (request.data.stat === 'hp') snapshot.battleStatus.currentHp = Math.min(snapshot.battleStatus.currentHp, snapshot.battleStatus.maxHp);
                snapshot.account[fields[request.data.stat]] += difference;
                snapshot.account.statPoints -= difference;
            }
            return {success: true};
        }
    });
    return {service, snapshot, inventory, status, posts, towerProgress};
}

test('魔女装备按评分择优而非背包顺序，保留锁定槽位并卸下错误路线', () => {
    const inventory = [equipment(1, {attackBonus: 1}), equipment(2, {attackBonus: 100}), equipment(3, {item: {name: '女神鞋', category: 'equipment', equipSlot: 'shoes', routeType: 'N'}, equipped: true})];
    const plan = content.recommendEquipment(inventory);
    assert.equal(plan.slots.ring.inventoryId, 2);
    assert.deepEqual(plan.actions.map(action => action.type), ['unequip', 'equip']);
    inventory[0].equipped = true;
    inventory[0].locked = true;
    assert.equal(content.recommendEquipment(inventory).slots.ring.inventoryId, 1);
    inventory[1].equipped = true;
    assert.throws(() => content.recommendEquipment(inventory), /装备槽重复/);
});

test('评分计入固定词条和官方强化单位，不自动装备未装备的锁定物品', () => {
    const accessory = equipment(1, {attackPercent: 3, item: {category: 'equipment', equipSlot: 'earring', routeType: 'M', attackPercent: 10}});
    assert.equal(content.getEquipmentBonuses(accessory).attackPercent, 13);
    assert.equal(content.getEquipmentBonuses(equipment(2, {itemId: 12, attackPercent: 15, enhanceValue: 267})).attackPercent, 41.7);
    assert.equal(content.getEquipmentBonuses(equipment(3, {itemId: 65, defensePercent: 9, hpPercent: 4, enhanceValue: 4, enhanceValue2: 1})).defensePercent, 9.4);
    assert.equal(content.recommendEquipment([equipment(4, {locked: true, attackBonus: 100}), equipment(5, {attackBonus: 1})]).slots.ring.inventoryId, 5);
});

test('未分配能力点不阻止塔和副本带入当前装备面板', () => {
    const snapshot = createSnapshot();
    snapshot.account.statPoints = 50;
    const player = workflow.getCurrentPlayer(snapshot);
    assert.equal(player.atk, snapshot.battleStatus.attack);
    assert.equal(player.hp, snapshot.battleStatus.currentHp);
    assert.equal(snapshot.account.statPoints, 50);
});

test('强化同类最高评分，平分保留强化更高者并禁止锁定或装备材料', () => {
    const items = [equipment(1, {attackBonus: 50, accessoryEnhanceLevel: 1}), equipment(2, {attackBonus: 50, accessoryEnhanceLevel: 2}), equipment(3, {attackBonus: 1, locked: true}), equipment(4, {attackBonus: 2, equipped: true}), equipment(5, {attackBonus: 3})];
    const plan = content.recommendAccessoryEnhancement(items).plans[0];
    assert.equal(plan.keepId, 2);
    assert.equal(plan.consumeId, 5);
    items[1].accessoryEnhanceLevel = 5;
    assert.equal(content.recommendAccessoryEnhancement(items).plans.length, 0);
    assert.equal(content.recommendAccessoryEnhancement([equipment(7, {itemId: 20}), equipment(8, {itemId: 20})]).plans.length, 0);
});

test('副本使用服务器每日上限，仓库字段没有 warehouse 前缀', () => {
    assert.equal(content.planDungeonRun({todayCount: 2, maxDaily: 5}, {dungeonId: 'warehouse'}).remaining, 3);
    assert.throws(() => content.planDungeonRun({forestTodayCount: 0, forestMaxDaily: 0}), /次数已用尽/);
    assert.throws(() => content.planDungeonRun(null), /先同步/);
    assert.throws(() => workflow.createTowerPlan({towerMaxFloor: 5}, {startFloor: 11}), /尚未解锁/);
    assert.throws(() => workflow.createTowerPlan({towerMaxFloor: 5}, {startFloor: 5}), /尚未解锁/);
});

test('整轮副本保留跨场血量，完成率优先于单场最快方案', () => {
    const snapshot = createSnapshot();
    snapshot.account.statPoints = 10;
    Object.assign(snapshot.battleStatus, {currentHp: 500, maxHp: 500, attack: 100, defense: 50, speed: 50});
    const attack = {hp: 0, attack: 10, defense: 0, speed: 0};
    const sustained = {hp: 0, attack: 5, defense: 5, speed: 0};
    const plan = rounds => ({type: 'dungeon', groups: Array.from({length: rounds}, () => ({monsters: [workflow.createMonster('hilichurl', 5)]}))});
    const firstAttack = workflow.evaluateChallengeAllocation(snapshot, plan(1), attack, {samples: 8});
    const firstSustained = workflow.evaluateChallengeAllocation(snapshot, plan(1), sustained, {samples: 8});
    assert.equal(firstAttack.winRate, 1);
    assert.ok(firstAttack.averageSeconds < firstSustained.averageSeconds);
    const wholeAttack = workflow.evaluateChallengeAllocation(snapshot, plan(5), attack, {samples: 8});
    const wholeSustained = workflow.evaluateChallengeAllocation(snapshot, plan(5), sustained, {samples: 8});
    assert.equal(wholeAttack.winRate, 0);
    assert.ok(wholeSustained.winRate > wholeAttack.winRate);
    assert.ok(workflow.compareChallengePlans(wholeSustained, wholeAttack, 'fastest') < 0);
});

test('挑战范围覆盖塔十五场和副本所有剩余轮次，续跑只截取当前未完成场次', () => {
    const snapshot = createSnapshot();
    const tower = workflow.createChallengePlan(snapshot, {type: 'tower', startFloor: 6});
    assert.equal(tower.groups.length, 5);
    assert.equal(tower.groups.flatMap(group => group.monsters).length, 15);
    const daily = content.planDungeonRun({forestTodayCount: 8, forestMaxDaily: 10, activeRun: {status: 'active', dungeonId: 'forest', stage: 2}}, {dungeonId: 'forest', includeActive: true});
    assert.equal(daily.remaining, 3);
    const dungeon = workflow.createChallengePlan(snapshot, {type: 'dungeon', dungeonId: 'forest', rounds: daily.remaining, stage: 2});
    assert.equal(dungeon.groups.flatMap(group => group.monsters).length, 8);
    assert.equal(content.planDungeonRun({forestTodayCount: 10, forestMaxDaily: 10, activeRun: {status: 'active', dungeonId: 'forest'}}, {dungeonId: 'forest', includeActive: true}).remaining, 1);
});

test('自动配点包含未分配点，服务器确认后才开始当天副本', async () => {
    const mock = createMock();
    mock.snapshot.account.statPoints = 20;
    mock.snapshot.account.attackBonus = 10;
    Object.assign(mock.snapshot.battleStatus, {currentHp: 500, maxHp: 500, attack: 200, defense: 50, speed: 50});
    const event = await mock.service.dungeonAction({action: 'start', dungeonId: 'warehouse'});
    assert.equal(event.recommendation.totalPoints, 30);
    assert.equal(event.recommendation.battleCount, 15);
    assert.equal(mock.snapshot.account.statPoints, 0);
    assert.deepEqual(hero.getCurrentAllocation(mock.snapshot.account), event.recommendation.allocation);
    assert.equal(mock.posts.at(-1).endpoint, '/api/dungeon/start');
    const mutations = mock.posts.slice(0, -1);
    assert.ok(mutations.some(post => post.endpoint === '/api/hero/allocate-stats'));
    const firstAllocate = mutations.findIndex(post => post.endpoint === '/api/hero/allocate-stats');
    assert.ok(mutations.slice(firstAllocate).every(post => post.endpoint === '/api/hero/allocate-stats'));
});

test('配点未确认或超时均不启动副本，不自动重复配点请求', async () => {
    for (const options of [{ignoreAllocation: true}, {failAt: '/api/hero/allocate-stats'}]) {
        const mock = createMock(options);
        mock.snapshot.account.statPoints = 10;
        await assert.rejects(mock.service.dungeonAction({action: 'start', dungeonId: 'forest'}), /未由服务器确认|timeout/);
        assert.equal(mock.posts.filter(post => post.endpoint === '/api/dungeon/start').length, 0);
        assert.equal(mock.posts.filter(post => post.endpoint === '/api/hero/allocate-stats').length, 1);
    }
});

test('整轮完成率低于停止线时不修改配点和次数', async () => {
    const mock = createMock();
    mock.snapshot.account.statPoints = 1;
    Object.assign(mock.snapshot.battleStatus, {currentHp: 1, maxHp: 1, attack: 1, defense: 1, speed: 1});
    await assert.rejects(mock.service.dungeonAction({action: 'start', dungeonId: 'forest', minWinRate: 0.95}), /整轮预测完成率/);
    assert.equal(mock.posts.length, 0);
    assert.equal(mock.status.forestTodayCount, 0);
});

test('同一副本批次开箱续轮沿用配点，手动恢复重新规划所有剩余次数', async () => {
    const mock = createMock();
    mock.status.forestTodayCount = 8;
    const first = await mock.service.dungeonAction({action: 'start', dungeonId: 'forest', resetPlan: true});
    assert.equal(first.recommendation.challenge.rounds, 2);
    for (let stage = 1; stage <= 3; stage += 1) await mock.service.battleDungeon();
    await mock.service.dungeonAction({action: 'chest', chestIndex: 0});
    const next = await mock.service.dungeonAction({action: 'start', dungeonId: 'forest'});
    assert.equal(next.recommendation.challenge.rounds, 2);
    assert.equal(mock.status.forestTodayCount, 10);
    const resumed = await mock.service.battleDungeon({resetPlan: true});
    assert.equal(resumed.recommendation.challenge.rounds, 1);
    assert.equal(resumed.recommendation.battleCount, 3);
});

test('塔怪物序列与官方五层布局一致，森林副本只有前三只且使用信仰等级', () => {
    assert.deepEqual(workflow.getTowerMonsterSequence(1, 1).map(monster => monster.id), ['ruin_guard', 'hilichurl', 'slime']);
    assert.equal(workflow.getTowerMonsterSequence(2, 1)[2].id, 'familiar');
    assert.equal(workflow.getTowerMonsterSequence(3, 1)[2].id, 'debt_collector');
    assert.equal(workflow.getTowerMonsterSequence(4, 1)[2].id, 'firefly_mage');
    assert.equal(workflow.getTowerMonsterSequence(5, 1)[2].id, 'witch_clone');
    const forest = workflow.getDungeonMonsterSequence('forest', {faithLevel: 10, level: 200});
    assert.deepEqual(forest.map(monster => monster.id), ['angry_bush', 'automaton', 'stone_golem']);
    assert.equal(forest[0].hp, 500);
        assert.deepEqual(workflow.getForestMonsterSequence({faithLevel: 10}).map(monster => monster.id), ['angry_bush', 'automaton', 'stone_golem', 'mushroom_maiden', 'meteor_swarm', 'forest_wolf']);
    assert.equal(workflow.getDungeonMonsterSequence('warehouse', {level: 5})[0].level, 2.5);
});

test('塔 Buff 遵循增量与等级15上限，每项最多选一次', () => {
    const player = {hp: 500, maxHp: 5000, atk: 10000, def: 1000, spd: 1000, skills: {drain: 15, speed: 5}};
    const buffed = workflow.applyTowerBuffs(player, ['hp', 'atk'], ['drain', 'speed']);
    assert.equal(buffed.hp, 1500);
    assert.equal(buffed.maxHp, 6000);
    assert.equal(buffed.atk, 10250);
    assert.equal(buffed.skills.drain, 15);
    assert.equal(buffed.skills.speed, 6);
    assert.equal(player.maxHp, 5000);
    assert.throws(() => workflow.applyTowerBuffs(player, ['hp', 'hp'], []), /不同/);
});

test('塔每五层十五场才保存一次，不提交普通刷怪结果或领取奖励', async () => {
    const mock = createMock();
    await mock.service.startTower({stages: 2});
    for (let index = 0; index < 30; index += 1) {
        const event = await mock.service.stepTower();
        assert.equal(event.done, index === 29);
        assert.equal(mock.posts.length, Math.floor((index + 1) / 15));
    }
    assert.deepEqual(mock.posts, [{endpoint: '/api/tower/save', data: {floor: 5}}, {endpoint: '/api/tower/save', data: {floor: 10}}]);
});

test('塔保存结果不明确时销毁本地阶段，不重复保存', async () => {
    const mock = createMock({ignoreSave: true});
    await mock.service.startTower();
    for (let index = 0; index < 14; index += 1) await mock.service.stepTower();
    await assert.rejects(mock.service.stepTower(), /保存尚未确认/);
    await assert.rejects(mock.service.stepTower(), /先开始/);
    assert.equal(mock.posts.length, 1);
});

test('停止塔清空当前阶段，战败也不保存', async () => {
    const mock = createMock();
    await mock.service.startTower();
    await mock.service.stepTower();
    await mock.service.stopTower();
    await assert.rejects(mock.service.stepTower(), /先开始/);
    assert.equal(mock.posts.length, 0);
    mock.snapshot.battleStatus.attack = 1;
    mock.snapshot.battleStatus.defense = 1;
    mock.snapshot.battleStatus.speed = 1;
    mock.snapshot.battleStatus.maxHp = 1;
    mock.snapshot.battleStatus.currentHp = 1;
    await mock.service.startTower();
    await assert.rejects(mock.service.stepTower(), /胜率低于/);
    assert.equal(mock.posts.length, 0);
});

test('副本串行提交三个 isDungeon 战斗并推进，通关等待用户领取', async () => {
    const mock = createMock();
    await mock.service.dungeonAction({action: 'start', dungeonId: 'forest'});
    for (let stage = 1; stage <= 3; stage += 1) {
        const event = await mock.service.battleDungeon();
        assert.equal(event.stage, stage);
        assert.equal(event.chestReady, stage === 3);
    }
    assert.deepEqual(mock.posts.map(post => post.endpoint), ['/api/dungeon/start', ...Array.from({length: 3}, () => ['/api/hero/battle-result', '/api/dungeon/advance']).flat()]);
    assert.ok(mock.posts.filter(post => post.endpoint === '/api/hero/battle-result').every(post => post.data.isDungeon && post.data.expReturn === 0));
    assert.equal(mock.status.activeRun.stage, 4);
    await mock.service.dungeonAction({action: 'chest', chestIndex: 2});
    assert.equal(mock.status.activeRun, null);
});

test('副本 POST 超时不会重新结算或推进，显式放弃后才解除阻断', async () => {
    const mock = createMock({failAt: '/api/hero/battle-result'});
    await mock.service.dungeonAction({action: 'start', dungeonId: 'forest'});
    await assert.rejects(mock.service.battleDungeon(), /timeout/);
    await assert.rejects(mock.service.battleDungeon(), /不确定/);
    assert.equal(mock.posts.filter(post => post.endpoint === '/api/hero/battle-result').length, 1);
    assert.equal(mock.posts.filter(post => post.endpoint === '/api/dungeon/advance').length, 0);
});

test('副本阶段未推进时停止并禁止重复 advance', async () => {
    const mock = createMock({ignoreAdvance: true});
    await mock.service.dungeonAction({action: 'start', dungeonId: 'warehouse'});
    await assert.rejects(mock.service.battleDungeon(), /推进结果尚未确认/);
    await assert.rejects(mock.service.battleDungeon(), /不确定/);
    assert.equal(mock.posts.filter(post => post.endpoint === '/api/dungeon/advance').length, 1);
});

test('黄金史莱姆按启动返回锁定免逃跑状态，击杀先更新 metadata 再推进', async () => {
    const mock = createMock({golden: true});
    await mock.service.dungeonAction({action: 'start', dungeonId: 'golden_slime'});
    for (let stage = 1; stage <= 3; stage += 1) await mock.service.battleDungeon();
    assert.deepEqual(mock.posts.slice(-3).map(post => post.endpoint), ['/api/hero/battle-result', '/api/dungeon/update-metadata', '/api/dungeon/advance']);
    assert.equal(mock.status.activeRun.metadata, 'golden_slime_killed');
});

test('强化提交前重新同步，保护已装备或锁定材料与不足余额', async () => {
    const mock = createMock({accessoryItems: [equipment(1, {attackBonus: 100}), equipment(2, {attackBonus: 1})]});
    mock.snapshot.account.magicFragments = 0;
    await assert.rejects(mock.service.enhance({keepId: 1, consumeId: 2}), /碎片不足/);
    assert.equal(mock.posts.length, 0);
    mock.snapshot.account.magicFragments = 5;
    const result = await mock.service.enhance({keepId: 1, consumeId: 2});
    assert.equal(result.content.accessoryItems.length, 1);
    await assert.rejects(mock.service.enhance({keepId: 1, consumeId: 2}), /推荐已变化/);
    assert.equal(mock.posts.length, 1);
});

test('装备与卸下返回服务器确认状态，拒绝锁定槽位和女神路线', async () => {
    const mock = createMock({inventory: [equipment(1, {equipped: true, locked: true}), equipment(2)]});
    await assert.rejects(mock.service.equip({inventoryId: 2}), /锁定装备/);
    await assert.rejects(mock.service.equip({type: 'unequip', inventoryId: 1}), /已锁定/);
    mock.inventory[0].locked = false;
    await mock.service.equip({type: 'unequip', inventoryId: 1});
    await mock.service.equip({type: 'equip', inventoryId: 2});
    assert.equal(mock.inventory[1].equipped, true);
});

test('拒绝并发资源提交以及绕过战斗直接推进或提前开箱', async () => {
    const mock = createMock();
    const first = mock.service.startTower();
    await assert.rejects(mock.service.startTower(), /正在执行/);
    await first;
    await assert.rejects(mock.service.dungeonAction({action: 'advance'}), /已核对/);
    await assert.rejects(mock.service.dungeonAction({action: 'chest', chestIndex: 0}), /尚未通关/);
    assert.equal(mock.posts.length, 0);
});
