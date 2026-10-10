(function exposeCombatWorkflow(root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./hero-automation.js') : root.SlimeHeroAutomation, typeof module === 'object' && module.exports ? require('./combat-content.js') : root.SlimeCombatContent);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SlimeCombatWorkflow = api;
})(typeof globalThis === 'object' ? globalThis : this, function createCombatWorkflow(hero, content) {
    'use strict';

    const BASES = Object.freeze({
        slime: [40, 18, 10, 20], hilichurl: [50, 20, 15, 15], ruin_guard: [60, 24, 16, 4],
        familiar: [60, 10, 8, 16], debt_collector: [40, 20, 10, 15], firefly_mage: [50, 20, 16, 18],
        witch_clone: [60, 18, 16, 16], angry_bush: [50, 20, 15, 15], automaton: [60, 22, 18, 16],
        stone_golem: [80, 40, 20, 12], golden_slime_dungeon: [10, 10, 10, 60]
    });
    const STAT_KEYS = ['hp', 'atk', 'def', 'spd'];
    const SKILL_KEYS = ['dodge', 'crit', 'shield', 'drain', 'weaken', 'speed'];

    function validateWitch(snapshot) {
        if (hero.getFaithRoute(snapshot) !== 'M') throw new Error('该战斗方案仅支持魔女 M 路线');
        hero.validateFaithRouteConsistency(snapshot);
        if (!Number.isFinite(Number(snapshot.battleStatus.currentHp)) || Number(snapshot.battleStatus.currentHp) <= 0) throw new Error('勇者 HP 已归零或未同步，请先恢复');
    }

    function getCurrentPlayer(snapshot) {
        return hero.getProjectedStats({...snapshot, account: {...snapshot.account, statPoints: 0}}, hero.getCurrentAllocation(snapshot.account));
    }

    function createMonster(id, level, options = {}) {
        const bases = BASES[id];
        if (!bases || !Number.isFinite(level) || level <= 0) throw new Error('副本或塔怪物等级无效');
        const definition = hero.MONSTERS[id] || {};
        const [hp, atk, def, spd] = bases.map(value => Math.max(1, Math.round(value * level)));
        return {id, name: definition.name || (id === 'witch_clone' ? '魔女分身' : '黄金史莱姆'), level, hp, maxHp: hp, atk, def, spd,
            minDamage: definition.minDamage || 0, dodgeChance: definition.dodgeChance || 0, critChance: definition.critChance || 0,
            poisonChance: definition.poisonChance || 0, resistNull: definition.resistNull || 0, resistLight: definition.resistLight || 0, resistDark: definition.resistDark || 0, ...options};
    }

    function seededShuffle(values, seed) {
        const shuffled = [...values];
        let state = seed;
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            state = state * 1664525 + 1013904223 & 0xffffffff;
            const target = Math.abs(state) % (index + 1);
            [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
        }
        return shuffled;
    }

    function getTowerMonsterSequence(floor, startFloor) {
        const offset = floor - startFloor;
        if (!Number.isSafeInteger(floor) || floor < 1 || !Number.isSafeInteger(startFloor) || startFloor < 1 || (startFloor - 1) % 5 !== 0 || offset < 0 || offset > 4) throw new Error('塔阶段必须连续挑战五层');
        const basic = seededShuffle(['slime', 'hilichurl', 'ruin_guard'], floor * 31);
        const advanced = seededShuffle(['familiar', 'debt_collector', 'firefly_mage'], floor * 97);
        const ids = offset === 0 ? basic : offset < 4 ? [...basic.slice(0, 2), ['familiar', 'debt_collector', 'firefly_mage'][offset - 1]] : [basic[0], advanced[0], 'witch_clone'];
        return ids.map(id => createMonster(id, floor * 10, id === 'slime' ? {dodgeChance: 0.1} : {}));
    }

    function createTowerPlan(progress, options = {}) {
        const maximum = Number(progress?.towerMaxFloor);
        const stages = Number(options.stages ?? 1);
        const startFloor = Number(options.startFloor ?? maximum + 1);
        if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum % 5 !== 0) throw new Error('服务器塔进度无效');
        if (!Number.isSafeInteger(stages) || stages < 1 || stages > 20) throw new Error('塔阶段数应为 1 至 20');
        if (!Number.isSafeInteger(startFloor) || startFloor < 1 || (startFloor - 1) % 5 !== 0 || startFloor > maximum + 1) throw new Error('起始阶段尚未解锁');
        return {startFloor, endFloor: startFloor + stages * 5 - 1, stages};
    }

    function getDungeonMonsterSequence(dungeonId, account, metadata = '') {
        const level = Number(dungeonId === 'forest' ? account.faithLevel : account.level);
        if (!Number.isFinite(level) || level <= 0) throw new Error('副本等级未同步');
        if (dungeonId === 'forest') return ['angry_bush', 'automaton', 'stone_golem'].map(id => createMonster(id, level));
        if (dungeonId === 'warehouse') return ['slime', 'hilichurl', 'ruin_guard'].map(id => createMonster(id, Math.round(level * 5) / 10));
        if (dungeonId !== 'golden_slime') throw new Error('副本类型无效');
        return [createMonster('slime', level / 2), createMonster('slime', level / 2), createMonster(['has_golden_slime', 'golden_slime_killed'].includes(metadata) ? 'golden_slime_dungeon' : 'slime', level / 2)];
    }

    function drawTowerBuffs(random = Math.random) {
        function shuffle(values) {
            const result = [...values];
            for (let index = result.length - 1; index > 0; index -= 1) {
                const target = Math.floor(random() * (index + 1));
                [result[index], result[target]] = [result[target], result[index]];
            }
            return result;
        }
        return {statOptions: shuffle(STAT_KEYS).slice(0, 3), skillOptions: shuffle(SKILL_KEYS).slice(0, 4)};
    }

    function applyTowerBuffs(player, stats, skills) {
        if (stats.length > 2 || skills.length > 2 || new Set(stats).size !== stats.length || new Set(skills).size !== skills.length) throw new Error('每层最多选择两个不同的属性和技能 Buff');
        const result = {...player, skills: {...player.skills}};
        for (const stat of stats) {
            if (!STAT_KEYS.includes(stat)) throw new Error('塔属性 Buff 无效');
            const value = stat === 'hp' ? Math.max(1000, Math.floor(result.maxHp * 0.1)) : Math.max(100, Math.floor(result[stat] * (stat === 'spd' ? 0.05 : 0.025)));
            if (stat === 'hp') { result.maxHp += value; result.hp += value; }
            else result[stat] += value;
        }
        for (const skill of skills) {
            if (!SKILL_KEYS.includes(skill)) throw new Error('塔技能 Buff 无效');
            result.skills[skill] = Math.min(15, (Number(result.skills[skill]) || 0) + 1);
        }
        result.dodgeRate = Math.min(1, (Number(result.skills.dodge) || 0) * 0.03);
        return result;
    }

    function selectBattleStrategy(snapshot, monster, player, options = {}) {
        const activeSkills = ['shield', 'drain', 'weaken', 'speed'].filter(key => player.skills[key] > 0);
        if (activeSkills.length === 0) activeSkills.push(null);
        const rebornSkills = (snapshot.heroMode || snapshot.account.rebornMode || 'base') === 'base' ? [null] : ['star_curse', 'blood_pact'].filter(key => player.rebornSkills[key] > 0);
        if (rebornSkills.length === 0) rebornSkills.push(null);
        let best = null;
        for (const activeSkillKey of activeSkills) {
            for (const equippedRebornSkill of rebornSkills) {
                const candidate = {...player, activeSkillKey, equippedRebornSkill, critRate: Math.min(1, (Number(player.skills.crit) || 0) * 0.03 + (Number(snapshot.battleStatus.critRateBonus) || 0))};
                const results = Array.from({length: options.samples || 8}, (_, index) => hero.simulateBattle(snapshot, monster.id, {player: candidate, monster, battleOptions: options.battleOptions, maximumTicks: options.maximumTicks, random: hero.createSeededRandom(7051 + index * 97)}));
                const wins = results.filter(result => result.victory || result.escaped).length;
                const hp = results.reduce((sum, result) => sum + result.currentHp / player.maxHp, 0) / results.length;
                const seconds = results.reduce((sum, result) => sum + result.elapsedSeconds, 0) / results.length;
                const score = wins / results.length * 100000 + hp * (options.goal === 'fastest' ? 100 : 1000) - seconds * (options.goal === 'minimum_loss' ? 0.01 : 1);
                if (!best || score > best.score) best = {player: candidate, score, winRate: wins / results.length, averageHpRatio: hp, seconds};
            }
        }
        return best;
    }

    function recommendTowerBuffs(snapshot, monsters, player, offered, options = {}) {
        function pairs(values) { return values.flatMap((value, index) => values.slice(index + 1).map(next => [value, next])); }
        let best = null;
        for (const stats of pairs(offered.statOptions)) {
            for (const skills of pairs(offered.skillOptions)) {
                const buffed = applyTowerBuffs(player, stats, skills);
                let victories = 0;
                let remaining = 0;
                let seconds = 0;
                const sampleCount = options.samples || 3;
                for (let sample = 0; sample < sampleCount; sample += 1) {
                    let current = {...buffed, hp: Math.min(buffed.maxHp, buffed.hp + Math.floor(buffed.maxHp * 0.5))};
                    let completed = true;
                    for (const monster of monsters) {
                        const battleOptions = {slimeRevive: false, witchWeakened: true, submitEquipment: false};
                        const strategy = selectBattleStrategy(snapshot, monster, current, {...options, samples: options.strategySamples || 2, battleOptions});
                        const result = hero.simulateBattle(snapshot, monster.id, {player: strategy.player, monster, battleOptions, maximumTicks: options.maximumTicks, random: hero.createSeededRandom(881 + sample * 37)});
                        current.hp = result.currentHp;
                        seconds += result.elapsedSeconds;
                        if (!result.victory) { completed = false; break; }
                    }
                    if (completed) victories += 1;
                    remaining += current.hp / buffed.maxHp;
                }
                const score = victories * 100000 + remaining * (options.goal === 'fastest' ? 100 : 1000) - seconds * (options.goal === 'minimum_loss' ? 0.01 : 1);
                if (!best || score > best.score) best = {score, stats, skills, buffed};
            }
        }
        if (!best) throw new Error('塔 Buff 候选未同步');
        return best;
    }

    function createChallengePlan(snapshot, challenge) {
        if (challenge.type === 'tower') {
            const startFloor = Number(challenge.startFloor);
            return {type: 'tower', startFloor, rounds: 1, groups: Array.from({length: 5}, (_, offset) => ({monsters: getTowerMonsterSequence(startFloor + offset, startFloor), tower: true}))};
        }
        if (challenge.type !== 'dungeon') throw new Error('挑战类型无效');
        const rounds = Number(challenge.rounds);
        const stage = Number(challenge.stage ?? 1);
        if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 100 || !Number.isInteger(stage) || stage < 1 || stage > 3) throw new Error('副本完整挑战范围无效');
        const golden = challenge.dungeonId === 'golden_slime';
        const groups = Array.from({length: rounds}, (_, index) => {
            const monsters = getDungeonMonsterSequence(challenge.dungeonId, snapshot.account, golden ? 'has_golden_slime' : '').slice(index === 0 ? stage - 1 : 0);
            for (const monster of monsters) if (monster.id === 'golden_slime_dungeon') monster.fleeProbability = index === 0 && challenge.noFlee ? 0 : 0.1;
            return {monsters, tower: false};
        });
        return {type: 'dungeon', dungeonId: challenge.dungeonId, rounds, stage, groups};
    }

    function evaluateChallengeAllocation(snapshot, plan, allocation, options = {}) {
        const samples = options.samples || 4;
        const maximumTicks = options.maximumTicks || 10000;
        const projected = hero.getProjectedStats(snapshot, allocation);
        let wins = 0;
        let completedBattles = 0;
        let hpLoss = 0;
        let remainingHp = 0;
        let elapsedSeconds = 0;
        let timedOut = 0;
        for (let sample = 0; sample < samples; sample += 1) {
            const random = hero.createSeededRandom((options.seed || 3017) + sample * 7919);
            let player = {...projected, hp: plan.type === 'tower' ? projected.maxHp : projected.hp, skills: {...projected.skills}};
            let completed = true;
            for (const group of plan.groups) {
                if (group.tower) {
                    const offered = drawTowerBuffs(random);
                    const buffs = recommendTowerBuffs(snapshot, group.monsters, player, offered, {goal: options.goal, samples: options.buffSamples || 1, strategySamples: options.strategySamples || 1, maximumTicks});
                    player = buffs.buffed;
                    player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.5));
                }
                for (const monster of group.monsters) {
                    const battleOptions = group.tower ? {slimeRevive: false, witchWeakened: true, submitEquipment: false} : {automatonSuppressed: false};
                    const strategy = selectBattleStrategy(snapshot, monster, player, {goal: options.goal, samples: options.strategySamples || 1, maximumTicks, battleOptions});
                    const result = hero.simulateBattle(snapshot, monster.id, {player: strategy.player, monster, battleOptions, maximumTicks, random});
                    hpLoss += Math.max(0, player.hp - result.currentHp) / player.maxHp;
                    elapsedSeconds += result.elapsedSeconds;
                    player.hp = result.currentHp;
                    if (result.timedOut) timedOut += 1;
                    if (!result.victory && !result.escaped) { completed = false; break; }
                    completedBattles += 1;
                }
                if (!completed) break;
            }
            if (completed) wins += 1;
            remainingHp += completed ? player.hp / player.maxHp : 0;
        }
        return {allocation, winRate: wins / samples, averageCompletedBattles: completedBattles / samples, averageHpLossRatio: hpLoss / samples, averageRemainingHpRatio: remainingHp / samples, averageSeconds: elapsedSeconds / samples, timedOut, samples};
    }

    function compareChallengePlans(left, right, goal = 'balanced') {
        const survival = right.winRate - left.winRate || right.averageCompletedBattles - left.averageCompletedBattles;
        if (survival) return survival;
        if (goal === 'fastest') return left.averageSeconds - right.averageSeconds || right.averageRemainingHpRatio - left.averageRemainingHpRatio;
        if (goal === 'minimum_loss') return left.averageHpLossRatio - right.averageHpLossRatio || right.averageRemainingHpRatio - left.averageRemainingHpRatio || left.averageSeconds - right.averageSeconds;
        return (right.averageRemainingHpRatio - left.averageRemainingHpRatio) * 1000 + (left.averageSeconds - right.averageSeconds);
    }

    async function optimizeChallengeAllocation(snapshot, challenge, options = {}) {
        validateWitch(snapshot);
        const plan = createChallengePlan(snapshot, challenge);
        const totalPoints = hero.getTotalPoints(snapshot.account);
        const current = hero.getCurrentAllocation(snapshot.account);
        const candidates = hero.getCandidateAllocations(totalPoints, current, options.divisions || 4);
        const evaluations = new Map();
        const evaluate = async allocation => {
            const key = hero.STAT_KEYS.map(stat => allocation[stat]).join(':');
            if (evaluations.has(key)) return evaluations.get(key);
            if (options.yield) await options.yield();
            const result = evaluateChallengeAllocation(snapshot, plan, allocation, {goal: options.goal, samples: options.coarseSamples || 2, maximumTicks: options.maximumTicks || 4000});
            evaluations.set(key, result);
            return result;
        };
        for (const allocation of candidates) await evaluate(allocation);
        let ranked = [...evaluations.values()].sort((left, right) => compareChallengePlans(left, right, options.goal));
        for (const divisor of [8, 32]) {
            const step = Math.max(1, Math.floor(totalPoints / divisor));
            for (const center of ranked.slice(0, 2)) {
                for (const from of hero.STAT_KEYS) {
                    for (const to of hero.STAT_KEYS) {
                        if (from === to || center.allocation[from] < step) continue;
                        await evaluate({...center.allocation, [from]: center.allocation[from] - step, [to]: center.allocation[to] + step});
                    }
                }
            }
            ranked = [...evaluations.values()].sort((left, right) => compareChallengePlans(left, right, options.goal));
        }
        const reviewed = [];
        for (const candidate of ranked.slice(0, 4)) {
            if (options.yield) await options.yield();
            reviewed.push(evaluateChallengeAllocation(snapshot, plan, candidate.allocation, {goal: options.goal, samples: options.finalSamples || 24, strategySamples: 4, maximumTicks: options.finalMaximumTicks || 200000, seed: 90773}));
        }
        reviewed.sort((left, right) => compareChallengePlans(left, right, options.goal));
        return {...reviewed[0], totalPoints, goal: options.goal || 'balanced', challenge: {type: plan.type, startFloor: plan.startFloor, dungeonId: plan.dungeonId, rounds: plan.rounds, stage: plan.stage}, battleCount: plan.groups.reduce((sum, group) => sum + group.monsters.length, 0), candidatesEvaluated: evaluations.size};
    }

    function createService({request, syncHero, delay = async () => {}, random = Math.random}) {
        let tower = null;
        let dungeonUncertain = false;
        let busy = false;
        let goldenRun = null;
        let dungeonPlan = null;
        let dungeonPlanContext = null;
        const post = (endpoint, data) => request(endpoint, {method: 'POST', data});

        function allocationFingerprint(snapshot) {
            return JSON.stringify([hero.getFaithRoute(snapshot), snapshot.heroMode, snapshot.account.rebornMode, hero.getTotalPoints(snapshot.account), hero.getCurrentAllocation(snapshot.account), snapshot.battleStatus, snapshot.skills, snapshot.rebornSkills]);
        }

        async function prepareAllocation(snapshot, challenge, options = {}) {
            const recommendation = await optimizeChallengeAllocation(snapshot, challenge, {...options, yield: () => delay(0)});
            if (options.minWinRate && recommendation.winRate < Number(options.minWinRate)) throw new Error(`整轮预测完成率 ${(recommendation.winRate * 100).toFixed(1)}% 低于停止线，未修改配点`);
            let current = await syncHero();
            if (allocationFingerprint(current) !== allocationFingerprint(snapshot)) throw new Error('优化期间勇者面板已变化，请重新开始挑战');
            const changes = hero.planAllocationChanges(current.account, recommendation.allocation);
            for (const [action, entries] of [['deallocate', changes.deallocate], ['allocate', changes.allocate]]) {
                for (const change of entries) {
                    await post(`/api/hero/${action}-stats`, change);
                    await delay(250);
                }
            }
            current = await syncHero();
            validateWitch(current);
            if (hero.getTotalPoints(current.account) !== recommendation.totalPoints || current.heroMode !== snapshot.heroMode || current.account.rebornMode !== snapshot.account.rebornMode || Number(current.account.statPoints) !== 0 || hero.STAT_KEYS.some(key => hero.getCurrentAllocation(current.account)[key] !== recommendation.allocation[key])) throw new Error('自动配点未由服务器确认，停止挑战；请重新同步');
            return {snapshot: current, recommendation};
        }

        async function prepareDungeon(status, snapshot, options = {}) {
            if (options.resetPlan) dungeonPlan = null;
            const run = status.activeRun;
            const dungeonId = run?.status === 'active' ? run.dungeonId : options.dungeonId;
            const daily = content.planDungeonRun(status, {dungeonId, includeActive: true});
            const context = JSON.stringify([new Date().toISOString().slice(0, 10), snapshot.heroMode, snapshot.account.rebornMode, snapshot.account.level, snapshot.account.faithLevel, snapshot.skills, snapshot.rebornSkills, snapshot.battleStatus.equipmentBonuses, snapshot.battleStatus.defenseBuffStacks, snapshot.battleStatus.prayerBuffActive, options.goal || 'balanced']);
            if (dungeonPlan && context === dungeonPlanContext && dungeonPlan.challenge.dungeonId === dungeonId && dungeonPlan.totalPoints === hero.getTotalPoints(snapshot.account) && hero.STAT_KEYS.every(key => dungeonPlan.allocation[key] === hero.getCurrentAllocation(snapshot.account)[key])) return {snapshot, recommendation: dungeonPlan};
            const prepared = await prepareAllocation(snapshot, {type: 'dungeon', dungeonId, rounds: daily.remaining, stage: run?.status === 'active' ? Number(run.stage) : 1, noFlee: run?.noFleeEnabled === true}, options);
            dungeonPlan = prepared.recommendation;
            dungeonPlanContext = context;
            return prepared;
        }

        async function exclusive(action) {
            if (busy) throw new Error('战斗资源操作正在执行');
            busy = true;
            try { return await action(); } finally { busy = false; }
        }

        async function sync() {
            const inventory = await request('/api/inventory');
            await delay(250);
            const accessoryItems = await request('/api/accessory/items');
            await delay(250);
            const towerProgress = await request('/api/tower/progress');
            await delay(250);
            const dungeonStatus = await request('/api/dungeon/status');
            return {inventory, accessoryItems, towerProgress, dungeonStatus};
        }

        async function equip(intent) {
            return exclusive(async () => {
                const snapshot = await syncHero();
                validateWitch(snapshot);
                const inventory = await request('/api/inventory');
                const entry = inventory.find(item => Number(item.id) === Number(intent.inventoryId));
                if (!entry || entry.locked || !entry.item?.equipSlot || entry.item.category !== 'equipment') throw new Error('装备不存在、已锁定或不可装备');
                const action = intent.type === 'unequip' ? 'unequip' : 'equip';
                if (action === 'equip' && entry.item.routeType && entry.item.routeType !== 'M') throw new Error('装备不属于魔女路线');
                if (action === 'equip' && inventory.some(item => item.equipped && item.locked && item.item?.equipSlot === entry.item.equipSlot && item.id !== entry.id)) throw new Error('该槽位已有锁定装备');
                if (Boolean(entry.equipped) === (action === 'equip')) return sync();
                await post(`/api/inventory/${action}`, {inventoryId: entry.id});
                const updated = await sync();
                const changed = updated.inventory.find(item => item.id === entry.id);
                if (!changed || Boolean(changed.equipped) !== (action === 'equip')) throw new Error('装备提交后状态未确认，请刷新核对');
                if (action === 'equip' && updated.inventory.filter(item => item.equipped && item.item?.equipSlot === entry.item.equipSlot).length !== 1) throw new Error('装备槽状态异常，停止后续装备');
                return updated;
            });
        }

        async function enhance(intent) {
            return exclusive(async () => {
                const snapshot = await syncHero();
                validateWitch(snapshot);
                const current = await sync();
                const plan = content.recommendAccessoryEnhancement(current.accessoryItems, {stats: snapshot.battleStatus, goal: intent.goal}).plans.find(item => Number(item.keepId) === Number(intent.keepId) && Number(item.consumeId) === Number(intent.consumeId));
                if (!plan) throw new Error('饰品推荐已变化，请刷新后重新确认');
                if (!Number.isFinite(Number(snapshot.account.magicFragments)) || Number(snapshot.account.magicFragments) < 1) throw new Error('魔法碎片不足或余额未同步');
                if (intent.useGuardianCharm && !current.inventory.some(item => Number(item.itemId) === 64 && Number(item.quantity) > 0)) throw new Error('强化守护符不足');
                const result = await post('/api/accessory/enhance', {keepId: plan.keepId, consumeId: plan.consumeId, useGuardianCharm: intent.useGuardianCharm === true});
                return {result, content: await sync()};
            });
        }

        async function startTower(options = {}) {
            return exclusive(async () => {
                if (tower) throw new Error('已有塔阶段，请先停止');
                let snapshot = await syncHero();
                validateWitch(snapshot);
                const progress = await request('/api/tower/progress');
                const plan = createTowerPlan(progress, options);
                const prepared = await prepareAllocation(snapshot, {type: 'tower', startFloor: plan.startFloor}, options);
                snapshot = prepared.snapshot;
                const player = getCurrentPlayer(snapshot);
                tower = {...plan, floor: plan.startFloor, index: 0, snapshot, player: {...player, hp: player.maxHp}, needsBuff: true, goal: options.goal, minWinRate: Number(options.minWinRate) || 0.95};
                return {floor: tower.floor, endFloor: tower.endFloor, recommendation: prepared.recommendation};
            });
        }

        async function stepTower() {
            return exclusive(async () => {
                if (!tower) throw new Error('请先开始塔阶段');
                const run = tower;
                try {
                    const monsters = getTowerMonsterSequence(run.floor, run.startFloor);
                    let buffs = null;
                    if (run.needsBuff) {
                        const offered = drawTowerBuffs(random);
                        buffs = recommendTowerBuffs(run.snapshot, monsters, run.player, offered, {goal: run.goal});
                        run.player = buffs.buffed;
                        run.player.hp = Math.min(run.player.maxHp, run.player.hp + Math.floor(run.player.maxHp * 0.5));
                        run.needsBuff = false;
                    }
                    const monster = monsters[run.index];
                    const battleOptions = {slimeRevive: false, witchWeakened: true, submitEquipment: false};
                    const strategy = selectBattleStrategy(run.snapshot, monster, run.player, {goal: run.goal, battleOptions});
                    if (strategy.winRate < run.minWinRate) throw new Error('塔预测胜率低于停止线，未保存当前阶段');
                    const result = hero.simulateBattle(run.snapshot, monster.id, {player: strategy.player, monster, battleOptions, random});
                    const event = {floor: run.floor, index: run.index, monsterName: monster.name, result, buffs: buffs ? {stats: buffs.stats, skills: buffs.skills} : null};
                    if (result.timedOut) throw new Error('塔战斗超过模拟上限，未保存阶段');
                    if (!result.victory) { tower = null; return {...event, done: true, defeated: true}; }
                    run.player.hp = result.currentHp;
                    run.index += 1;
                    if (run.index < 3) return {...event, done: false};
                    run.index = 0;
                    run.needsBuff = true;
                    if (run.floor === run.startFloor + 4) {
                        await post('/api/tower/save', {floor: run.floor});
                        const progress = await request('/api/tower/progress');
                        if (Number(progress.towerMaxFloor) < run.floor) throw new Error('塔保存尚未确认，禁止重复保存');
                        event.savedFloor = run.floor;
                        if (run.floor === run.endFloor) { tower = null; return {...event, done: true}; }
                        run.startFloor = run.floor + 1;
                        run.snapshot = await syncHero();
                        validateWitch(run.snapshot);
                        const prepared = await prepareAllocation(run.snapshot, {type: 'tower', startFloor: run.startFloor}, {goal: run.goal});
                        run.snapshot = prepared.snapshot;
                        event.recommendation = prepared.recommendation;
                        run.player = getCurrentPlayer(run.snapshot);
                        run.player.hp = run.player.maxHp;
                    }
                    run.floor += 1;
                    return {...event, done: false};
                } catch (error) { tower = null; throw error; }
            });
        }

        async function dungeonAction(intent) {
            return exclusive(async () => {
                const action = intent?.action;
                if (!['start', 'advance', 'update-metadata', 'fail', 'abandon', 'chest'].includes(action)) throw new Error('副本操作无效');
                if (['advance', 'update-metadata', 'fail'].includes(action)) throw new Error('副本推进仅由已核对的战斗流程执行');
                if (dungeonUncertain && action !== 'abandon') throw new Error('副本上次提交结果不确定，请在官方页面核对或明确放弃');
                const status = await request('/api/dungeon/status');
                const run = status.activeRun;
                let data = {};
                if (action === 'start') {
                    const snapshot = await syncHero();
                    validateWitch(snapshot);
                    if (run?.status === 'active') throw new Error('已有副本，请继续或放弃当前副本');
                    data = {dungeonId: content.planDungeonRun(status, intent).dungeonId};
                    await prepareDungeon(status, snapshot, intent);
                    const verified = await request('/api/dungeon/status');
                    if (verified.activeRun?.status === 'active' || content.planDungeonRun(verified, intent).remaining !== content.planDungeonRun(status, intent).remaining) throw new Error('配点期间副本次数或阶段变化，请重新开始');
                }
                if (action === 'chest') {
                    if (run?.status !== 'active' || Number(run.stage) !== 4) throw new Error('副本尚未通关，不能领取宝箱');
                    if (!Number.isInteger(intent.chestIndex) || intent.chestIndex < 0 || intent.chestIndex > 2) throw new Error('宝箱选择无效');
                    data = {chestIndex: intent.chestIndex};
                }
                if (action === 'abandon' && run?.status !== 'active') throw new Error('没有可放弃的副本');
                try {
                    const result = await post(`/api/dungeon/${action}`, data);
                    const updated = await sync();
                    if (action === 'start' && (updated.dungeonStatus.activeRun?.dungeonId !== data.dungeonId || Number(updated.dungeonStatus.activeRun?.stage) !== 1)) throw new Error('副本启动状态尚未确认');
                    if (action === 'start' && data.dungeonId === 'golden_slime') goldenRun = {id: updated.dungeonStatus.activeRun.id, noFlee: result.noFleeEnabled === true, hasGoldenSlime: result.hasGoldenSlime === true};
                    if (action === 'abandon' || action === 'chest') {
                        if (updated.dungeonStatus.activeRun?.status === 'active') throw new Error('副本结束状态尚未确认');
                        dungeonUncertain = false;
                        if (action === 'abandon') dungeonPlan = null;
                    }
                    return {result, content: updated, recommendation: action === 'start' ? dungeonPlan : null};
                } catch (error) { dungeonUncertain = true; throw error; }
            });
        }

        async function battleDungeon(options = {}) {
            return exclusive(async () => {
                if (dungeonUncertain) throw new Error('副本上次提交结果不确定，停止自动流程，请核对官方状态');
                const status = await request('/api/dungeon/status');
                const run = status.activeRun;
                if (run?.status !== 'active') throw new Error('没有进行中的副本');
                if (Number(run.stage) === 4) return {done: true, chestReady: true, content: await sync()};
                const stage = Number(run.stage);
                if (!Number.isInteger(stage) || stage < 1 || stage > 3) throw new Error('副本阶段无效');
                if (run.id === undefined || run.id === null) throw new Error('副本运行编号未同步');
                let snapshot = await syncHero();
                validateWitch(snapshot);
                const prepared = await prepareDungeon(status, snapshot, options);
                snapshot = prepared.snapshot;
                const goldenState = goldenRun?.id === run.id ? goldenRun : null;
                const monsters = getDungeonMonsterSequence(run.dungeonId, snapshot.account, goldenState?.hasGoldenSlime ? 'has_golden_slime' : run.metadata || '');
                const monster = monsters[stage - 1];
                if (monster.id === 'golden_slime_dungeon') monster.fleeProbability = goldenState?.noFlee || run.noFleeEnabled === true ? 0 : 0.1;
                const battleOptions = {automatonSuppressed: false};
                const player = getCurrentPlayer(snapshot);
                const strategy = selectBattleStrategy(snapshot, monster, player, {...options, battleOptions});
                if (strategy.winRate < (Number(options.minWinRate) || 0.9)) throw new Error('副本预测胜率低于停止线，保留当前阶段');
                try {
                    if (strategy.player.activeSkillKey !== null && snapshot.account.equippedActiveSkill !== strategy.player.activeSkillKey) await post('/api/hero/skills/equip', {skillKey: strategy.player.activeSkillKey});
                    const rebornActive = (snapshot.heroMode || snapshot.account.rebornMode || 'base') !== 'base';
                    if (rebornActive && strategy.player.equippedRebornSkill !== null && snapshot.account.equippedRebornSkill !== strategy.player.equippedRebornSkill) await post('/api/hero/reborn-skills/equip', {skillKey: strategy.player.equippedRebornSkill});
                    snapshot = await syncHero();
                    if ((snapshot.account.equippedActiveSkill || null) !== strategy.player.activeSkillKey || rebornActive && (snapshot.account.equippedRebornSkill || null) !== strategy.player.equippedRebornSkill) throw new Error('副本技能装备未确认');
                    const beforeBattle = await request('/api/dungeon/status');
                    if (beforeBattle.activeRun?.id !== run.id || Number(beforeBattle.activeRun?.stage) !== stage || beforeBattle.activeRun?.status !== 'active') throw new Error('副本阶段已在其他窗口变化');
                    const result = hero.simulateBattle(snapshot, monster.id, {player: getCurrentPlayer(snapshot), monster, battleOptions, random});
                    if (result.timedOut) throw new Error('副本战斗超过模拟上限，不提交结果');
                    await delay(600);
                    await post('/api/hero/battle-result', {victory: result.victory || result.escaped, currentHp: result.victory || result.escaped ? result.currentHp : 0, monsterType: monster.id === 'golden_slime_dungeon' ? 'golden_slime' : monster.id, expReturn: 0, isDungeon: true});
                    if (!result.victory && !result.escaped) {
                        await post('/api/dungeon/fail', {});
                        const updated = await sync();
                        if (updated.dungeonStatus.activeRun?.status === 'active') throw new Error('战败状态尚未确认');
                        return {result, defeated: true, done: true, stage, monsterName: monster.name, content: updated};
                    }
                    if (monster.id === 'golden_slime_dungeon' && result.victory) await post('/api/dungeon/update-metadata', {metadata: 'golden_slime_killed'});
                    await post('/api/dungeon/advance', {});
                    const updated = await sync();
                    if (Number(updated.dungeonStatus.activeRun?.stage) !== stage + 1 || updated.dungeonStatus.activeRun?.id !== run.id) throw new Error('副本推进结果尚未确认，禁止重复提交');
                    return {result, stage, monsterName: monster.name, done: stage === 3, chestReady: stage === 3, content: updated, recommendation: prepared.recommendation};
                } catch (error) { dungeonUncertain = true; throw error; }
            });
        }

        return Object.freeze({sync, equip, enhance, startTower, stepTower, stopTower: () => exclusive(async () => { tower = null; }), dungeonAction, battleDungeon, reset: () => { tower = null; dungeonPlan = null; dungeonUncertain = false; goldenRun = null; }});
    }

    return Object.freeze({createMonster, getCurrentPlayer, createTowerPlan, getTowerMonsterSequence, getDungeonMonsterSequence, drawTowerBuffs, applyTowerBuffs, selectBattleStrategy, recommendTowerBuffs, createChallengePlan, evaluateChallengeAllocation, compareChallengePlans, optimizeChallengeAllocation, createService});
});
