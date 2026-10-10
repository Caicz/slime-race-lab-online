(function exposeCombatContent(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SlimeCombatContent = api;
})(typeof globalThis === 'object' ? globalThis : this, function createCombatContent() {
    'use strict';

    const WITCH_ACCESSORY_PRIORITY = Object.freeze({
        weapon: 1.25,
        headpiece: 1.1,
        earring: 1.05,
        necklace: 1,
        ring: 0.95,
        armor: 0.85,
        cloak: 0.8,
        shoes: 0.75
    });
    const DUNGEON_PLANS = Object.freeze({
        warehouse: Object.freeze({name: '仓库副本', dailyLimit: 5, chestPolicy: 'balanced', autoRerun: false}),
        forest: Object.freeze({name: '恐怖之森副本', dailyLimit: 10, chestPolicy: 'combat', autoRerun: true}),
        golden_slime: Object.freeze({name: '黄金史莱姆副本', dailyLimit: 3, chestPolicy: 'combat', autoRerun: false})
    });

    function number(value) {
        const result = Number(value);
        return Number.isFinite(result) ? result : 0;
    }

    function getEquipmentBonuses(entry) {
        const accessory = Number(entry.itemId) >= 40 && Number(entry.itemId) <= 47;
        const keys = ['hpBonus', 'attackBonus', 'defenseBonus', 'speedBonus', 'hpPercent', 'attackPercent', 'defensePercent', 'speedPercent', 'critRate', 'critDamage'];
        const bonuses = Object.fromEntries(keys.map(key => [key, accessory ? number(entry[key]) + number(entry.item?.[key]) : number(entry[key] ?? entry.item?.[key])]));
        const enhancement = number(entry.enhanceValue);
        const secondary = number(entry.enhanceValue2);
        if (Number(entry.itemId) === 8) bonuses.speedBonus += enhancement;
        if (Number(entry.itemId) === 9) bonuses.defenseBonus += enhancement;
        if (Number(entry.itemId) === 12) bonuses.attackPercent += enhancement / 10;
        if ([28, 29].includes(Number(entry.itemId))) {
            bonuses.hpPercent += enhancement / 10;
            bonuses[Number(entry.itemId) === 28 ? 'hpBonus' : 'defenseBonus'] += secondary;
        }
        if (Number(entry.itemId) === 65) { bonuses.defensePercent += enhancement / 10; bonuses.hpPercent += secondary / 10; }
        return bonuses;
    }

    function accessoryScore(entry, goal = 'balanced', route = 'M', stats = {}) {
        const item = entry?.item || {};
        if (item.category !== 'equipment' || item.routeType && item.routeType !== route) return Number.NEGATIVE_INFINITY;
        const bonuses = getEquipmentBonuses(entry);
        const attack = bonuses.attackBonus + bonuses.attackPercent * (number(stats.attack) || 2000) / 100;
        const defense = bonuses.defenseBonus + bonuses.defensePercent * (number(stats.defense) || 1000) / 100;
        const speed = bonuses.speedBonus + bonuses.speedPercent * (number(stats.speed) || 1000) / 100;
        const hp = bonuses.hpBonus + bonuses.hpPercent * (number(stats.maxHp) || 3000) / 100;
        const crit = bonuses.critRate / 100 * (number(stats.attack) || 2000) * 0.5 + bonuses.critDamage / 100 * (number(stats.attack) || 2000) * 0.3;
        const survival = hp * 0.4 + defense * 0.7;
        const offense = attack * 1.2 + speed * 0.8 + crit;
        const goalWeight = goal === 'minimum_loss' ? {offense: 0.6, survival: 1.5} : goal === 'fastest' ? {offense: 1.5, survival: 0.5} : {offense: 1, survival: 1};
        return (offense * goalWeight.offense + survival * goalWeight.survival) * (WITCH_ACCESSORY_PRIORITY[item.equipSlot] || 0.7);
    }

    function recommendEquipment(inventory, options = {}) {
        const route = options.route || 'M';
        const goal = options.goal || 'balanced';
        const entries = (Array.isArray(inventory) ? inventory : []).filter(entry => Number(entry.quantity ?? 1) > 0 && (!entry.locked || entry.equipped));
        const selected = new Map();
        const equipped = entries.filter(entry => entry.equipped);
        if (new Set(equipped.map(entry => entry.item?.equipSlot)).size !== equipped.length) throw new Error('服务器装备槽重复，请先核对背包');
        for (const entry of entries) {
            const slot = entry.item?.equipSlot;
            if (!slot) continue;
            const protectedItem = equipped.find(item => item.item?.equipSlot === slot && item.locked);
            if (protectedItem && protectedItem !== entry) continue;
            const score = accessoryScore(entry, goal, route, options.stats);
            const current = selected.get(slot);
            if (Number.isFinite(score) && (!current || score > current.score || score === current.score && entry.equipped)) selected.set(slot, {inventoryId: entry.id || entry._id, itemId: entry.itemId, name: entry.item?.name || `物品${entry.itemId}`, score, equipped: Boolean(entry.equipped)});
        }
        const actions = equipped.filter(entry => !entry.locked && entry.item?.routeType && entry.item.routeType !== route).map(entry => ({type: 'unequip', inventoryId: entry.id || entry._id, name: entry.item.name}));
        actions.push(...[...selected.values()].filter(item => !item.equipped).map(item => ({type: 'equip', inventoryId: item.inventoryId, name: item.name})));
        return {route, goal, slots: Object.fromEntries(selected), actions};
    }

    function recommendAccessoryEnhancement(items, options = {}) {
        const route = options.route || 'M';
        const goal = options.goal || 'balanced';
        const candidates = (Array.isArray(items) ? items : []).filter(entry => Number(entry.itemId) >= 40 && Number(entry.itemId) <= 47 && number(entry.quantity ?? 1) > 0 && entry.item?.category === 'equipment' && entry.item?.equipSlot && (!entry.item.routeType || entry.item.routeType === route));
        const bySlot = new Map();
        for (const item of candidates) {
            const score = accessoryScore(item, goal, route, options.stats);
            const current = bySlot.get(item.itemId);
            if (!current || score > current.score || score === current.score && number(item.accessoryEnhanceLevel) > number(current.accessoryEnhanceLevel)) bySlot.set(item.itemId, {...item, score});
        }
        const plans = [];
        for (const keep of bySlot.values()) {
            if (number(keep.accessoryEnhanceLevel) >= 5 || keep.locked) continue;
            const consumers = candidates.filter(item => item.itemId === keep.itemId && (item.id || item._id) !== (keep.id || keep._id) && !item.locked && !item.equipped).sort((left, right) => accessoryScore(left, goal, route, options.stats) - accessoryScore(right, goal, route, options.stats) || number(left.accessoryEnhanceLevel) - number(right.accessoryEnhanceLevel));
            if (consumers.length > 0) plans.push({keepId: keep.id || keep._id, consumeId: consumers[0].id || consumers[0]._id, useGuardianCharm: options.useGuardianCharm === true && number(options.guardianCharms) > 0, reason: `${keep.item.name}保留最高战斗评分，强化 +${number(keep.accessoryEnhanceLevel)} → +${number(keep.accessoryEnhanceLevel) + 1}`});
        }
        return {route, goal, plans};
    }

    function recommendTowerBuffs(options = {}) {
        const monsterId = options.monsterId || 'automaton';
        const stats = options.stats || {};
        const statOptions = ['hp', 'atk', 'def', 'spd'];
        const statWeights = monsterId === 'automaton' ? {hp: 1.4, atk: 1.2, def: 0.8, spd: 1.5} : monsterId === 'stone_golem' ? {hp: 1, atk: 1.6, def: 0.9, spd: 0.8} : {hp: 1, atk: 1.4, def: 0.8, spd: 1.3};
        const rankedStats = statOptions.sort((left, right) => (number(stats[right]) + 1) * statWeights[right] - (number(stats[left]) + 1) * statWeights[left]);
        const skillOptions = ['drain', 'speed', 'weaken', 'crit', 'dodge', 'shield'];
        const rankedSkills = skillOptions.sort((left, right) => ({drain: 1.5, speed: 1.4, weaken: 1.3, crit: 1.2, dodge: 1, shield: 0.9}[right] - ({drain: 1.5, speed: 1.4, weaken: 1.3, crit: 1.2, dodge: 1, shield: 0.9}[left])));
        return {statOptions: rankedStats.slice(0, 3), skillOptions: rankedSkills.slice(0, 4), reason: monsterId === 'automaton' ? '先速度和生命，默认闪避开场压制' : '先攻击和速度，缩短再生或幼虫阶段'};
    }

    function normalizeDungeonId(value) {
        const id = String(value || '').trim().toLowerCase();
        return id === 'golden_slime_dungeon' ? 'golden_slime' : id;
    }

    function planDungeonRun(status, options = {}) {
        const dungeonId = normalizeDungeonId(options.dungeonId || 'forest');
        const plan = DUNGEON_PLANS[dungeonId];
        if (!plan) throw new Error('副本类型无效');
        if (!status || !Object.keys(status).length) throw new Error('请先同步副本次数');
        const prefix = dungeonId === 'warehouse' ? '' : dungeonId === 'golden_slime' ? 'goldenSlime' : 'forest';
        const current = number(status[prefix ? `${prefix}TodayCount` : 'todayCount']);
        const limitValue = status[prefix ? `${prefix}MaxDaily` : 'maxDaily'];
        const limit = limitValue === undefined ? plan.dailyLimit : number(limitValue);
        const active = options.includeActive && status.activeRun?.status === 'active' && status.activeRun.dungeonId === dungeonId;
        const remaining = Math.max(0, limit - current) + (active ? 1 : 0);
        if (!remaining) throw new Error(`${plan.name}今日次数已用尽`);
        return {dungeonId, name: plan.name, remaining, chestPolicy: plan.chestPolicy, autoRerun: options.autoRerun === undefined ? plan.autoRerun : options.autoRerun === true};
    }

    return Object.freeze({WITCH_ACCESSORY_PRIORITY, DUNGEON_PLANS, getEquipmentBonuses, accessoryScore, recommendEquipment, recommendAccessoryEnhancement, recommendTowerBuffs, normalizeDungeonId, planDungeonRun});
});
