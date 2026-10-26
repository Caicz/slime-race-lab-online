(function exposeHeroAutomation(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SlimeHeroAutomation = api;
})(typeof globalThis === 'object' ? globalThis : this, function createHeroAutomation() {
    'use strict';

    const STAT_KEYS = Object.freeze(['hp', 'attack', 'defense', 'speed']);
    const STAT_RULES = Object.freeze({
        hp: {base: 500, perPoint: 50},
        attack: {base: 100, perPoint: 10},
        defense: {base: 50, perPoint: 10},
        speed: {base: 50, perPoint: 5}
    });
    const ACTIVE_SKILLS = Object.freeze({
        shield: '护盾',
        drain: '吸血',
        weaken: '虚弱',
        speed: '速度激发'
    });
    const OPTIMIZATION_MODES = Object.freeze({
        minimum_loss: '最少掉血',
        fastest: '最快速度',
        balanced: '均衡'
    });
    const HEALING_POTIONS = Object.freeze({
        3: {name: 'HP回复药水 (2%)', ratio: 0.02},
        4: {name: 'HP回复药水 (20%)', ratio: 0.2},
        5: {name: 'HP回复药水 (100%)', ratio: 1}
    });
    const FAMILIAR_MECHANIC = Object.freeze({
        pleasureStep: 10,
        pleasureLimit: 100,
        promptDelaySeconds: 1.2,
        climaxExperienceLoss: 0,
        dropRecordLevelLimit: 3000
    });
    const MONSTERS = Object.freeze({
        slime: {name: '史莱姆', prefix: 'slime', region: 'novice', minDamage: 5, dodgeChance: 0.25, clientLevelField: 'clientSlimeLevel'},
        hilichurl: {name: '野生咕隆', prefix: 'hilichurl', region: 'novice', minDamage: 10, critChance: 0.2, poisonChance: 0.15, clientLevelField: 'clientHilichurlLevel'},
        ruin_guard: {name: '重磁护卫', prefix: 'ruinGuard', region: 'novice', minDamage: 20, clientLevelField: 'clientRuinGuardLevel'},
        familiar: {name: '奏咪使魔', prefix: 'familiar', region: 'novice', minDamage: 30, clientLevelField: 'clientFamiliarLevel'},
        debt_collector: {name: '极乐盗贼', prefix: 'debtCollector', region: 'novice', minDamage: 40, clientLevelField: 'clientDebtCollectorLevel'},
        firefly_mage: {name: '大雷精灵', prefix: 'fireflyMage', region: 'novice', minDamage: 50, clientLevelField: 'clientFireflyMageLevel'},
        angry_bush: {name: '愤怒灌木', prefix: 'angryBush', region: 'forest', minDamage: 10, resistNull: 0.8, resistLight: 0.1, resistDark: 0.1, clientLevelField: 'clientAngryBushLevel'},
        automaton: {name: '自行人偶', prefix: 'automaton', region: 'forest', minDamage: 20, resistNull: 0.95, resistLight: 0.2, resistDark: 0.2, clientLevelField: 'clientAutomatonLevel'},
        stone_golem: {name: '自然石像', prefix: 'stoneGolem', region: 'forest', minDamage: 30, resistNull: 0.98, resistLight: 0.3, resistDark: 0.3, clientLevelField: 'clientStoneGolemLevel'},
        mushroom_maiden: {name: '魅惑菇娘', prefix: 'mushroomMaiden', region: 'forest', minDamage: 10, resistNull: 0.99, resistLight: 0.2, resistDark: 0.2, clientLevelField: 'clientMushroomMaidenLevel'},
        meteor_swarm: {name: '陨星虫群', prefix: 'meteorSwarm', region: 'forest', minDamage: 50, resistNull: 0.99, resistLight: 0.2, resistDark: 0.2, clientLevelField: 'clientMeteorSwarmLevel'},
        forest_wolf: {name: '巨型森林狼', prefix: 'forestWolf', region: 'forest', minDamage: 200, resistNull: 0.99, resistLight: 0.3, resistDark: 0.3, clientLevelField: 'clientForestWolfLevel'}
    });
    const MONSTER_IDS = Object.freeze(Object.keys(MONSTERS));
    const FOREST_MONSTER_IDS = Object.freeze(['angry_bush', 'automaton', 'stone_golem', 'mushroom_maiden', 'meteor_swarm', 'forest_wolf']);
    const MONSTER_REGIONS = Object.freeze({
        novice: Object.freeze({key: 'novice', name: '海罗格姆村', monsterIds: Object.freeze(['slime', 'hilichurl', 'ruin_guard', 'familiar', 'debt_collector', 'firefly_mage'])}),
        forest: Object.freeze({key: 'forest', name: '恐怖之森', monsterIds: FOREST_MONSTER_IDS})
    });
    const FOREST_MONSTER_CATALOG = Object.freeze([
        Object.freeze({id: 'angry_bush', name: '愤怒灌木', available: true, hp: 50, atk: 20, def: 15, spd: 15, faithExp: 4}),
        Object.freeze({id: 'automaton', name: '自行人偶', available: true, hp: 60, atk: 22, def: 18, spd: 16, faithExp: 5}),
        Object.freeze({id: 'stone_golem', name: '自然石像', available: true, hp: 80, atk: 40, def: 20, spd: 12, faithExp: 5}),
        Object.freeze({id: 'mushroom_maiden', name: '魅惑菇娘', available: true, hp: 75, atk: 5, def: 25, spd: 15, faithExp: 6}),
        Object.freeze({id: 'meteor_swarm', name: '陨星虫群', available: true, hp: 60, atk: 23, def: 22, spd: 20, faithExp: 6}),
        Object.freeze({id: 'forest_wolf', name: '巨型森林狼', available: true, hp: 80, atk: 30, def: 25, spd: 20, faithExp: 8})
    ]);
    const MONSTER_BATTLE_DEFAULTS = Object.freeze({
        slime: Object.freeze({}),
        hilichurl: Object.freeze({}),
        ruin_guard: Object.freeze({}),
        familiar: Object.freeze({pleasureResist: true}),
        // The official route does not hand equipment to this monster by default.
        debt_collector: Object.freeze({submitEquipment: false, surrenderEquipment: false, equipmentSubmission: false}),
        firefly_mage: Object.freeze({}),
        angry_bush: Object.freeze({}),
        automaton: Object.freeze({automatonSuppressed: false}),
        stone_golem: Object.freeze({}),
        mushroom_maiden: Object.freeze({}),
        meteor_swarm: Object.freeze({}),
        forest_wolf: Object.freeze({})
    });
    const HERO_MODES = Object.freeze({
        base: '基础模式',
        reborn: '转生信仰模式'
    });
    const REBORN_SKILLS = Object.freeze({
        holy_judgment: Object.freeze({element: 'light', kind: 'attack'}),
        mirror_shield: Object.freeze({element: 'light', kind: 'mirror'}),
        star_curse: Object.freeze({element: 'dark', kind: 'attack'}),
        blood_pact: Object.freeze({element: 'dark', kind: 'blood_pact'})
    });
    const FAITH_ROUTES = Object.freeze({goddess: 'N', witch: 'M'});
    const FAITH_ROUTE_LABELS = Object.freeze({N: '女神', M: '魔女'});
    const REBORN_SKILL_ROUTES = Object.freeze({
        holy_judgment: 'N',
        mirror_shield: 'N',
        star_curse: 'M',
        blood_pact: 'M'
    });

    function toFiniteNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function toNonNegativeInteger(value, label) {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label}必须是非负整数`);
        return number;
    }

    function getCurrentAllocation(account) {
        return {
            hp: toNonNegativeInteger(account?.hpBonus, 'HP 点数'),
            attack: toNonNegativeInteger(account?.attackBonus, 'ATK 点数'),
            defense: toNonNegativeInteger(account?.defenseBonus, 'DEF 点数'),
            speed: toNonNegativeInteger(account?.speedBonus, 'SPD 点数')
        };
    }

    function getTotalPoints(account) {
        const allocation = getCurrentAllocation(account);
        return STAT_KEYS.reduce((sum, key) => sum + allocation[key], toNonNegativeInteger(account?.statPoints, '可分配点数'));
    }

    function validateAllocation(allocation, totalPoints) {
        const normalized = Object.fromEntries(STAT_KEYS.map(key => [key, toNonNegativeInteger(allocation?.[key], `${key} 点数`)]));
        const used = STAT_KEYS.reduce((sum, key) => sum + normalized[key], 0);
        if (used !== totalPoints) throw new Error(`能力值方案必须恰好使用 ${totalPoints} 点，当前为 ${used} 点`);
        return normalized;
    }

    function getSkillLevels(rawSkills) {
        return Object.fromEntries((Array.isArray(rawSkills) ? rawSkills : []).map(skill => [String(skill?.skillKey || ''), Math.max(0, toFiniteNumber(skill?.level))]));
    }

    function getRebornSkillLevels(rawRebornSkills) {
        return Object.fromEntries(getRebornSkillOptions(rawRebornSkills).map(skill => [skill.key, skill.level]));
    }

    function getRebornSkillOptions(rawRebornSkills) {
        const skills = Array.isArray(rawRebornSkills?.skills)
            ? rawRebornSkills.skills
            : Array.isArray(rawRebornSkills) ? rawRebornSkills : [];
        return skills.map(skill => {
            const key = String(skill?.skillKey ?? skill?.key ?? skill?.id ?? '').trim();
            if (!key) return null;
            const effects = skill?.effects && typeof skill.effects === 'object'
                ? skill.effects
                : skill?.effect && typeof skill.effect === 'object' ? skill.effect : {};
            return {
                key,
                name: String(skill?.name || skill?.title || key),
                description: String(skill?.description || skill?.desc || ''),
                level: Math.max(0, toFiniteNumber(skill?.level)),
                faithCost: Math.max(0, toFiniteNumber(skill?.faithCost ?? skill?.cost)),
                faithRequired: Math.max(0, toFiniteNumber(skill?.faithRequired ?? skill?.requiredFaith)),
                equipped: skill?.equipped === true,
                unlocked: skill?.unlocked !== false && toFiniteNumber(skill?.level) > 0,
                supported: Boolean(REBORN_SKILLS[key]) || skill?.supported === true || skill?.noCombatEffect === true || Object.keys(effects).length > 0,
                faithRoute: normalizeFaithRoute(firstDefined(skill?.faithRoute, skill?.faithType, skill?.faction, skill?.route, REBORN_SKILL_ROUTES[key])),
                effects
            };
        }).filter(Boolean);
    }

    function normalizeFaithRoute(value) {
        if (value && typeof value === 'object') {
            return normalizeFaithRoute(firstDefined(value.code, value.key, value.route, value.type, value.name, value.label));
        }
        const text = String(value ?? '').trim();
        if (!text) return null;
        const normalized = text.toUpperCase().replace(/[ _-]/g, '');
        if (['M', 'W', 'WITCH', '魔女', '魔女路线', '魔女信仰'].includes(normalized) || text.includes('魔女')) return FAITH_ROUTES.witch;
        if (['N', 'G', 'GODDESS', 'GOD', '女神', '女神路线', '女神信仰'].includes(normalized) || text.includes('女神')) return FAITH_ROUTES.goddess;
        return null;
    }

    function getFaithRoute(snapshot) {
        return normalizeFaithRoute(firstDefined(
            snapshot?.faithRoute,
            snapshot?.account?.faithRoute,
            snapshot?.account?.faithType,
            snapshot?.account?.rebornType,
            snapshot?.account?.reborn?.faithRoute,
            snapshot?.rebornSkills?.faithRoute,
            snapshot?.rebornSkills?.faithType,
            snapshot?.rebornSkills?.rebornType,
            snapshot?.battleStatus?.faithRoute,
            snapshot?.battleStatus?.faithType,
            snapshot?.battleStatus?.rebornType
        ));
    }

    function getFaithRouteLabel(route) {
        const normalized = normalizeFaithRoute(route);
        return normalized ? FAITH_ROUTE_LABELS[normalized] : '未知';
    }

    function getSkillFaithRoute(skill) {
        if (!skill) return null;
        return normalizeFaithRoute(firstDefined(skill.faithRoute, skill.faithType, skill.faction, skill.route, REBORN_SKILL_ROUTES[skill.key || skill.skillKey]));
    }

    function isRebornSkillAllowedForFaithRoute(snapshot, skill) {
        const route = getFaithRoute(snapshot);
        if (!route) return true;
        return getSkillFaithRoute(skill) === route;
    }

    function validateFaithRouteConsistency(snapshot) {
        const route = getFaithRoute(snapshot);
        const equippedKey = snapshot?.account?.equippedRebornSkill || null;
        const equipped = equippedKey && (snapshot?.rebornSkillOptions || []).find(skill => skill.key === equippedKey);
        if (route && equippedKey && (!equipped || getSkillFaithRoute(equipped) !== route)) {
            throw new Error(`服务器返回的转生技能与信仰路线不一致：当前路线为“${getFaithRouteLabel(route)}”，已装备“${equipped?.name || equippedKey}”不属于该路线`);
        }
        return {route, equippedSkillKey: equippedKey, compatible: true};
    }

    function validateAppliedRebornSkill(snapshot, expectedSkillKey, heroMode = snapshot?.heroMode) {
        const actualSkillKey = snapshot?.account?.equippedRebornSkill || null;
        if (normalizeHeroMode(heroMode) !== 'reborn' || expectedSkillKey === null || expectedSkillKey === undefined) {
            return {checked: false, expectedSkillKey: expectedSkillKey ?? null, actualSkillKey};
        }
        const expected = validateRebornSkillSelection(snapshot, expectedSkillKey);
        if (actualSkillKey !== expected) {
            throw new Error(`服务器未应用推荐的转生技能：期望“${expected}”，实际“${actualSkillKey || '未装备'}”；信仰路线未发生变化`);
        }
        return {checked: true, expectedSkillKey: expected, actualSkillKey};
    }

    function normalizeRouteValue(value) {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) return parsed;
            } catch {
                // Accept the common comma/arrow separated route format.
            }
            return value.split(/[>,，、\s]+/).map(item => item.trim()).filter(Boolean);
        }
        return [];
    }

    function normalizeMonsterId(value) {
        const text = String(value || '').trim();
        if (MONSTERS[text]) return text;
        const normalized = text.toLowerCase().replace(/[ -]/g, '_');
        if (MONSTERS[normalized]) return normalized;
        return MONSTER_IDS.find(id => MONSTERS[id].name === text) || null;
    }

    function getDefaultRoute(snapshot) {
        const account = snapshot?.account || {};
        const status = snapshot?.battleStatus || {};
        const candidates = [
            account.defaultMonsterRoute,
            account.monsterRoute,
            account.heroRoute,
            account.defaultRoute,
            account.preferredMonsters,
            status.defaultMonsterRoute,
            status.defaultRoute
        ];
        const explicit = candidates.flatMap(normalizeRouteValue).map(normalizeMonsterId).filter(Boolean);
        const unique = [...new Set(explicit)];
        return unique.length > 0 ? unique : [...MONSTER_IDS];
    }

    function getDefaultRebornSkill(snapshot) {
        const account = snapshot?.account || {};
        const options = Array.isArray(snapshot?.rebornSkillOptions) ? snapshot.rebornSkillOptions : [];
        const equipped = options.find(skill => skill.key === account.equippedRebornSkill);
        if (getFaithRoute(snapshot) && account.equippedRebornSkill && (!equipped || !isRebornSkillAllowedForFaithRoute(snapshot, equipped))) return null;
        const requested = [account.defaultRebornSkill, account.defaultRebornSkillKey]
            .map(value => String(value ?? '').trim())
            .filter(value => options.some(skill => skill.key === value));
        const candidates = [
            ...requested,
            account.equippedRebornSkill,
            options.find(skill => skill.equipped)?.key,
            options.find(skill => skill.unlocked && isRebornSkillAllowedForFaithRoute(snapshot, skill))?.key
        ]
            .filter(Boolean)
            .map(key => options.find(skill => skill.key === key))
            .filter(skill => skill && skill.unlocked && isRebornSkillAllowedForFaithRoute(snapshot, skill));
        return candidates[0]?.key || null;
    }

    function getDefaultBattleOptions(monsterId, options = {}) {
        if (!MONSTERS[monsterId]) throw new Error('璇烽€夋嫨鏈夋晥鐨勫父瑙勬€墿');
        return {...(MONSTER_BATTLE_DEFAULTS[monsterId] || {}), ...(options || {})};
    }

    function getForestWolfSkill(state) {
        if (state.playerShieldBonus > 0 || state.playerDef >= state.playerHp && state.playerDef >= state.playerAtk) return 'crush';
        if (state.playerDrainHp > 0 || state.playerHp >= state.playerAtk) return 'bloodlust';
        return 'roar';
    }

    function getDefaultRoutePlan(snapshot) {
        const monsterIds = getDefaultRoute(snapshot);
        return {
            monsterIds,
            rebornSkillKey: getDefaultRebornSkill(snapshot),
            battleOptions: Object.fromEntries(MONSTER_IDS.map(id => [id, getDefaultBattleOptions(id)])),
            source: 'account-or-fallback'
        };
    }

    function validateRebornSkillSelection(snapshot, skillKey, options = {}) {
        validateFaithRouteConsistency(snapshot);
        const key = skillKey === null || skillKey === undefined || skillKey === '' ? null : String(skillKey);
        if (!key) {
            if (options.allowNone === false) throw new Error('必须选择一个转生技能');
            return null;
        }
        const candidate = (snapshot?.rebornSkillOptions || []).find(skill => skill.key === key);
        const route = getFaithRoute(snapshot);
        if (route && candidate && !isRebornSkillAllowedForFaithRoute(snapshot, candidate)) {
            throw new Error(`当前信仰路线为“${getFaithRouteLabel(route)}”，不能使用“${getFaithRouteLabel(getSkillFaithRoute(candidate))}”路线转生技能`);
        }
        if (!candidate || !candidate.unlocked || candidate.level <= 0) throw new Error('转生技能尚未解锁或无效');
        if (candidate.faithRequired > Math.max(0, toFiniteNumber(snapshot?.faith))) throw new Error('当前信仰不足，无法选择该转生技能');
        return key;
    }

    function getRebornSkill(snapshot, skillKey) {
        const key = validateRebornSkillSelection(snapshot, skillKey);
        return key ? snapshot.rebornSkillOptions.find(skill => skill.key === key) : null;
    }

    function getRebornModifiers(snapshot, skillKey) {
        const skill = getRebornSkill(snapshot, skillKey);
        if (!skill) return {};
        if (!skill.supported) throw new Error('当前转生技能的信仰效果尚未纳入精确模拟');
        const official = REBORN_SKILLS[skill.key];
        if (official) return {...official, skillKey: skill.key, level: skill.level};
        const effects = skill.effects || {};
        const aliases = {
            hp: ['hp', 'hpBonus', 'maxHpBonus'],
            hpPercent: ['hpPercent', 'maxHpPercent'],
            attack: ['attack', 'attackBonus', 'atkBonus'],
            attackPercent: ['attackPercent', 'atkPercent'],
            defense: ['defense', 'defenseBonus', 'defBonus'],
            defensePercent: ['defensePercent', 'defPercent'],
            speed: ['speed', 'speedBonus', 'spdBonus'],
            speedPercent: ['speedPercent', 'spdPercent'],
            dodgeRate: ['dodgeRate', 'dodge'],
            critRate: ['critRate', 'crit'],
            damagePercent: ['damagePercent', 'damage'],
            damageReduction: ['damageReduction', 'damageTakenReduction'],
            drainPercent: ['drainPercent', 'lifesteal']
        };
        return Object.fromEntries(Object.entries(aliases).map(([key, names]) => [
            key,
            names.reduce((value, name) => value || toFiniteNumber(effects[name]), 0)
        ]).filter(([, value]) => value !== 0));
    }

    function firstDefined(...values) {
        return values.find(value => value !== undefined && value !== null);
    }

    function normalizeHeroMode(mode) {
        return mode === 'faith' || mode === 'reborn' ? 'reborn' : 'base';
    }

    function getServerHeroMode(mode) {
        return normalizeHeroMode(mode) === 'reborn' ? 'faith' : 'base';
    }

    function createRebornModeData(raw, account, status) {
        const reborn = raw?.rebornSkills || {};
        const sourceAccount = reborn.account || reborn.hero || account.reborn || account.rebornStats || {};
        const sourceStatus = reborn.battleStatus || reborn.status || status.reborn || status.rebornStatus || {};
        const accountFields = {
            statPoints: firstDefined(sourceAccount.statPoints, sourceAccount.availableStatPoints, account.rebornStatPoints),
            hpBonus: firstDefined(sourceAccount.hpBonus, sourceAccount.hp, account.rebornHpBonus),
            attackBonus: firstDefined(sourceAccount.attackBonus, sourceAccount.attack, sourceAccount.atk, account.rebornAttackBonus),
            defenseBonus: firstDefined(sourceAccount.defenseBonus, sourceAccount.defense, sourceAccount.def, account.rebornDefenseBonus),
            speedBonus: firstDefined(sourceAccount.speedBonus, sourceAccount.speed, sourceAccount.spd, account.rebornSpeedBonus)
        };
        const hasAllocation = Object.values(accountFields).every(value => value !== undefined && value !== null);
        if (!hasAllocation) return null;
        const modeAccount = {
            ...account,
            ...sourceAccount,
            ...Object.fromEntries(Object.entries(accountFields).map(([key, value]) => [key, Math.max(0, toFiniteNumber(value))])),
            equippedActiveSkill: firstDefined(sourceAccount.equippedActiveSkill, account.rebornEquippedActiveSkill, account.equippedActiveSkill),
            equippedRebornSkill: firstDefined(sourceAccount.equippedRebornSkill, account.equippedRebornSkill, null)
        };
        const heroFields = {
            currentHp: firstDefined(sourceStatus.currentHp, status.rebornCurrentHp),
            maxHp: firstDefined(sourceStatus.maxHp, status.rebornMaxHp),
            attack: firstDefined(sourceStatus.attack, sourceStatus.atk, status.rebornAttack),
            defense: firstDefined(sourceStatus.defense, sourceStatus.def, status.rebornDefense),
            speed: firstDefined(sourceStatus.speed, sourceStatus.spd, status.rebornSpeed),
            baseAttack: firstDefined(sourceStatus.baseAttack, sourceStatus.baseAtk, status.rebornBaseAttack),
            baseDefense: firstDefined(sourceStatus.baseDefense, sourceStatus.baseDef, status.rebornBaseDefense),
            baseSpeed: firstDefined(sourceStatus.baseSpeed, sourceStatus.baseSpd, status.rebornBaseSpeed)
        };
        const requiredPanel = ['currentHp', 'maxHp', 'attack', 'defense', 'speed'];
        if (!requiredPanel.every(key => heroFields[key] !== undefined && heroFields[key] !== null)) return null;
        return {
            account: modeAccount,
            battleStatus: {
                ...status,
                ...sourceStatus,
                ...Object.fromEntries(Object.entries(heroFields).filter(([, value]) => value !== undefined && value !== null)),
                equipmentBonuses: sourceStatus.equipmentBonuses || reborn.equipmentBonuses || {}
            },
            level: Math.max(0, toFiniteNumber(firstDefined(sourceStatus.level, sourceAccount.level, reborn.level, account.rebornLevel)))
        };
    }

    function getHeroModeSnapshot(snapshot, mode = 'base') {
        const normalized = normalizeHeroMode(mode);
        const modeData = snapshot?.heroModes?.[normalized];
        if (!modeData) throw new Error(`${HERO_MODES[normalized]}的独立等级或加点面板尚未同步`);
        return {...snapshot, account: modeData.account, battleStatus: modeData.battleStatus, heroMode: normalized};
    }

    function combineHeroModeSnapshots(baseSnapshot, rebornSnapshot, activeMode = 'base') {
        const base = getHeroModeSnapshot(baseSnapshot, 'base');
        const reborn = getHeroModeSnapshot(rebornSnapshot, 'reborn');
        const normalized = normalizeHeroMode(activeMode);
        const active = normalized === 'reborn' ? reborn : base;
        const baseFaithRoute = getFaithRoute(baseSnapshot);
        const rebornFaithRoute = getFaithRoute(rebornSnapshot);
        if (baseFaithRoute && rebornFaithRoute && baseFaithRoute !== rebornFaithRoute) {
            throw new Error('基础模式与转生信仰模式返回了不同的信仰路线，自动刷怪已停止');
        }
        return {
            ...active,
            heroMode: normalized,
            faithRoute: rebornFaithRoute || baseFaithRoute || getFaithRoute(active),
            faithRouteLocked: Boolean(rebornFaithRoute || baseFaithRoute || getFaithRoute(active)),
            heroModes: {
                base: {
                    account: base.account,
                    battleStatus: base.battleStatus,
                    level: Math.max(0, toFiniteNumber(base.account.level))
                },
                reborn: {
                    account: reborn.account,
                    battleStatus: reborn.battleStatus,
                    level: Math.max(0, toFiniteNumber(reborn.account.faithLevel))
                }
            }
        };
    }
    function createSnapshot(raw) {
        const account = raw?.account;
        const status = raw?.battleStatus;
        if (!account || !status) throw new Error('勇者账户或战斗面板尚未同步');

        const heroMode = normalizeHeroMode(account.rebornMode);
        const snapshot = {
            account,
            battleStatus: status,
            heroMode,
            faithRoute: getFaithRoute({
                account,
                battleStatus: status,
                rebornSkills: raw?.rebornSkills
            }),
            faithRouteLocked: Boolean(getFaithRoute({account, battleStatus: status, rebornSkills: raw?.rebornSkills})),
            skills: getSkillLevels(raw.skills),
            rebornSkills: getRebornSkillLevels(raw.rebornSkills),
            rebornSkillOptions: getRebornSkillOptions(raw.rebornSkills),
            faith: Math.max(0, toFiniteNumber(raw.rebornSkills?.faith ?? raw.rebornSkills?.currentFaith ?? account.faithLevel ?? account.faith)),
            soulFragments: Math.max(0, toFiniteNumber(raw.rebornSkills?.soulFragments)),
            defaultRoute: getDefaultRoute({account, battleStatus: status}),
            monsterProgress: Object.fromEntries(Object.entries(MONSTERS).map(([monsterId, definition]) => {
                const level = Math.max(0, toFiniteNumber(status[`${definition.prefix}Level`]));
                const eligibleDropLevels = Math.min(Math.floor(level), FAMILIAR_MECHANIC.dropRecordLevelLimit);
                const recordedDropLevels = new Set((Array.isArray(status[`${definition.prefix}DroppedLevels`])
                    ? status[`${definition.prefix}DroppedLevels`]
                    : []).map(Number).filter(value => Number.isSafeInteger(value) && value >= 1 && value <= eligibleDropLevels));
                const sweepLevel = toFiniteNumber(status[`${definition.prefix}SweepLevel`], -1);
                return [monsterId, {
                    expReward: Math.max(0, Math.round(toFiniteNumber(status[`${definition.prefix}ExpReward`]))),
                    sweepLevel: sweepLevel > 0 ? sweepLevel : null,
                    eligibleDropLevels,
                    recordedDropLevels: recordedDropLevels.size
                }];
            })),
            updatedAt: new Date().toISOString()
        };
        snapshot.heroModes = {
            [heroMode]: {
                account,
                battleStatus: status,
                level: Math.max(0, toFiniteNumber(heroMode === 'reborn' ? account.faithLevel : account.level))
            }
        };
        return snapshot;
    }

    function getMonster(snapshot, monsterId) {
        const definition = MONSTERS[monsterId];
        if (!definition) throw new Error('请选择有效的常规怪物');
        const status = snapshot?.battleStatus;
        const level = toFiniteNumber(status?.[`${definition.prefix}Level`], -1);
        const stats = status?.[`${definition.prefix}Stats`];
        if (level <= 0 || !stats) throw new Error(`${definition.name}面板尚未同步`);
        const progress = snapshot?.monsterProgress?.[monsterId] || {};

        return {
            id: monsterId,
            name: definition.name,
            region: definition.region,
            level,
            hp: Math.max(1, toFiniteNumber(status?.[`${definition.prefix}CurrentHp`], stats.hp)),
            maxHp: Math.max(1, toFiniteNumber(status?.[`${definition.prefix}MaxHp`], stats.hp)),
            atk: Math.max(1, toFiniteNumber(stats.atk)),
            def: Math.max(1, toFiniteNumber(stats.def)),
            spd: Math.max(1, toFiniteNumber(stats.spd)),
            minDamage: definition.minDamage,
            dodgeChance: definition.dodgeChance || 0,
            critChance: definition.critChance || 0,
            poisonChance: definition.poisonChance || 0,
            resistNull: definition.resistNull || 0,
            resistLight: definition.resistLight || 0,
            resistDark: definition.resistDark || 0,
            clientLevelField: definition.clientLevelField,
            expReward: Math.max(0, toFiniteNumber(progress.expReward)),
            sweepLevel: progress.sweepLevel || null,
            eligibleDropLevels: Math.max(0, toFiniteNumber(progress.eligibleDropLevels)),
            recordedDropLevels: Math.max(0, toFiniteNumber(progress.recordedDropLevels))
        };
    }

    function getMonsterPanel(monster) {
        return Object.fromEntries(['level', 'hp', 'maxHp', 'atk', 'def', 'spd'].map(key => [key, monster[key]]));
    }

    function getHeroPanel(snapshot) {
        const status = snapshot.battleStatus;
        return {
            currentHp: toFiniteNumber(status.currentHp),
            maxHp: toFiniteNumber(status.maxHp),
            attack: toFiniteNumber(status.attack),
            defense: toFiniteNumber(status.defense),
            speed: toFiniteNumber(status.speed),
            activeSkill: snapshot.account.equippedActiveSkill || null,
            rebornSkill: snapshot.account.equippedRebornSkill || null
        };
    }

    function getBattleCount(snapshot) {
        const battleCount = toNonNegativeInteger(snapshot?.battleStatus?.battleCount, '今日战斗次数');
        if (battleCount > 60) throw new Error('今日战斗次数超过服务器上限');
        return battleCount;
    }

    function planHealingConsumables(snapshot, inventory, options = {}) {
        const currentHp = Math.max(0, toFiniteNumber(snapshot?.battleStatus?.currentHp));
        const maxHp = Math.max(1, toFiniteNumber(snapshot?.battleStatus?.maxHp));
        const triggerRatio = Math.max(0, Math.min(1, toFiniteNumber(options.triggerRatio, 0.2)));
        const targetRatio = Math.max(triggerRatio, Math.min(1, toFiniteNumber(options.targetRatio, 0.95)));
        const targetHp = Math.ceil(maxHp * targetRatio);
        const currentRatio = currentHp / maxHp;
        if (currentRatio >= triggerRatio) return {needed: false, currentRatio, targetRatio, uses: [], healingRatio: 0};

        const entries = (Array.isArray(inventory) ? inventory : []).filter(entry => {
            return HEALING_POTIONS[Number(entry?.itemId)] && Number(entry.quantity) > 0 && (entry.id || entry._id);
        });
        const available = Object.fromEntries(Object.keys(HEALING_POTIONS).map(itemId => [itemId, entries
            .filter(entry => Number(entry.itemId) === Number(itemId))
            .reduce((sum, entry) => sum + toNonNegativeInteger(entry.quantity, '恢复药水数量'), 0)]));
        let best = null;

        const maximums = {
            3: Math.min(available[3], Math.ceil((targetRatio - currentRatio) / HEALING_POTIONS[3].ratio) + 1),
            4: Math.min(available[4], 5),
            5: Math.min(available[5], 1)
        };
        for (let full = 0; full <= maximums[5]; full += 1) {
            for (let medium = 0; medium <= maximums[4]; medium += 1) {
                for (let small = 0; small <= maximums[3]; small += 1) {
                    const quantities = {3: small, 4: medium, 5: full};
                    const healingHp = Object.entries(quantities).reduce((sum, [itemId, quantity]) => {
                        return sum + Math.floor(maxHp * HEALING_POTIONS[itemId].ratio) * quantity;
                    }, 0);
                    if (currentHp + healingHp < targetHp) continue;
                    const healingRatio = healingHp / maxHp;
                    const itemCount = small + medium + full;
                    if (!best || healingRatio < best.healingRatio || (healingRatio === best.healingRatio && itemCount < best.itemCount)) {
                        best = {quantities, healingRatio, itemCount};
                    }
                }
            }
        }
        if (!best) throw new Error('恢复药水不足，无法把 HP 补到 95%');

        const uses = [];
        for (const itemId of Object.keys(HEALING_POTIONS)) {
            let remaining = best.quantities[itemId];
            for (const entry of entries.filter(item => Number(item.itemId) === Number(itemId))) {
                if (remaining === 0) break;
                const quantity = Math.min(remaining, Number(entry.quantity));
                uses.push({inventoryEntryId: entry.id || entry._id, itemId: Number(itemId), quantity});
                remaining -= quantity;
            }
        }
        return {needed: true, currentRatio, targetRatio, uses, healingRatio: best.healingRatio};
    }

    function createBattleGuard(snapshot, monsterId, options = {}) {
        const heroMode = normalizeHeroMode(options.heroMode || snapshot.heroMode || snapshot.account?.rebornMode);
        const modeSnapshot = getHeroModeSnapshot(snapshot, heroMode);
        const monster = getMonster(modeSnapshot, monsterId);
        const battleOptions = getDefaultBattleOptions(monsterId, {
            ...(options.battleOptions || {}),
            ...(options.pleasureResist === undefined ? {} : {pleasureResist: options.pleasureResist})
        });
        return {
            monsterId,
            heroMode,
            expectedFaithRoute: getFaithRoute(modeSnapshot),
            expectedMonster: getMonsterPanel(monster),
            expectedBattleCount: getBattleCount(modeSnapshot),
            requireDefensePotions: options.requireDefensePotions === true,
            pleasureResist: battleOptions.pleasureResist !== false,
            battleOptions,
            expectedRebornSkill: options.rebornSkillKey === undefined
                ? heroMode === 'reborn' ? modeSnapshot.account.equippedRebornSkill || null : null
                : validateRebornSkillSelection(modeSnapshot, options.rebornSkillKey),
            ...(options.lockHeroPanel === true ? {expectedHero: getHeroPanel(modeSnapshot)} : {})
        };
    }

    function validateBattleGuard(snapshot, guard, options = {}) {
        const modeSnapshot = getHeroModeSnapshot(snapshot, guard?.heroMode || snapshot.heroMode);
        const monster = getMonster(modeSnapshot, guard?.monsterId);
        const expectedMonster = guard?.expectedMonster;
        if (!expectedMonster || JSON.stringify(getMonsterPanel(monster)) !== JSON.stringify(expectedMonster)) {
            throw new Error(`${monster.name}面板已经变化，请重新计算配点`);
        }

        const battleCount = getBattleCount(modeSnapshot);
        if (battleCount !== toNonNegativeInteger(guard?.expectedBattleCount, '预期战斗次数')) {
            throw new Error(`今日战斗次数已经变化：预期 ${guard.expectedBattleCount}，当前为 ${battleCount}`);
        }
        const minimumBattleHp = Math.round(Math.max(1, toFiniteNumber(modeSnapshot.battleStatus.maxHp)) * 0.02);
        if (toFiniteNumber(modeSnapshot.battleStatus.currentHp) < minimumBattleHp) {
            throw new Error(`勇者当前 HP 不足，至少需要 ${minimumBattleHp} HP 才能挑战`);
        }
        if (guard.expectedHero && JSON.stringify(getHeroPanel(modeSnapshot)) !== JSON.stringify(guard.expectedHero)) {
            throw new Error('勇者面板已经变化，请重新计算配点');
        }

        const effectiveRebornSkill = modeSnapshot.heroMode === 'reborn' ? modeSnapshot.account.equippedRebornSkill || null : null;
        const currentFaithRoute = getFaithRoute(modeSnapshot);
        if (guard.expectedFaithRoute !== undefined && currentFaithRoute !== guard.expectedFaithRoute) {
            throw new Error('信仰路线已经变化，自动刷怪已停止');
        }
        validateFaithRouteConsistency(modeSnapshot);
        if (guard.expectedRebornSkill !== undefined && effectiveRebornSkill !== guard.expectedRebornSkill) {
            throw new Error('转生技能或信仰路线已经变化，请重新计算方案');
        }
        if (guard.requireDefensePotions) {
            const stacks = toNonNegativeInteger(modeSnapshot.battleStatus.defenseBuffStacks, '防御药水层数');
            const expiry = Date.parse(modeSnapshot.battleStatus.defenseBuffExpiry || '');
            const now = toFiniteNumber(options.now, Date.now());
            if (stacks !== 30 || !Number.isFinite(expiry) || expiry <= now) {
                throw new Error('30层防御药水已经失效，本轮按约定停止，不会再次消耗药水');
            }
        }

        if (guard.expectedAllocation) {
            const totalPoints = getTotalPoints(modeSnapshot.account);
            const expected = validateAllocation(guard.expectedAllocation, totalPoints);
            const current = getCurrentAllocation(modeSnapshot.account);
            if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('当前能力值方案与本轮推荐不一致，自动刷怪已停止');
        }
        return monster;
    }

    function getBaseStat(key, points) {
        return STAT_RULES[key].base + STAT_RULES[key].perPoint * points;
    }

    function getProjectedStats(snapshot, allocation, options = {}) {
        const status = snapshot.battleStatus;
        const account = snapshot.account;
        const current = getCurrentAllocation(account);
        const totalPoints = getTotalPoints(account);
        const target = validateAllocation(allocation, totalPoints);
        const equipment = status.equipmentBonuses || {};
        const currentBuffStacks = Math.max(0, Math.min(30, toFiniteNumber(status.defenseBuffStacks)));
        const targetBuffStacks = options.defensePotionStacks === undefined
            ? currentBuffStacks
            : Math.max(0, Math.min(30, toFiniteNumber(options.defensePotionStacks)));

        function project(key, currentFinal) {
            const base = getBaseStat(key, target[key]);
            const currentBase = getBaseStat(key, current[key]);
            const percent = toFiniteNumber(equipment[`${key}Percent`]);
            const flat = toFiniteNumber(equipment[`${key}Bonus`]);
            const prayerField = {attack: 'atk', defense: 'def', speed: 'spd'}[key];
            const prayer = status.prayerBuffActive && prayerField && status.prayerBuffStat === prayerField
                ? toFiniteNumber(status.prayerBuffBonus)
                : 0;
            const currentExpected = Math.round(currentBase * (1 + percent / 100)) + flat + prayer;
            let external = toFiniteNumber(currentFinal) - currentExpected;
            if (key === 'defense') external += (targetBuffStacks - currentBuffStacks) * 100;
            return Math.max(1, Math.round(base * (1 + percent / 100)) + flat + prayer + external);
        }

        const maxHp = project('hp', status.maxHp);
        const actualHpRatio = Math.max(0, Math.min(1, toFiniteNumber(status.currentHp) / Math.max(1, toFiniteNumber(status.maxHp, 1))));
        const minimumHpRatio = Math.max(0, Math.min(1, toFiniteNumber(options.minimumHpRatio)));
        const currentHpRatio = Math.max(actualHpRatio, minimumHpRatio);
        const activeSkillKey = options.activeSkillKey === undefined ? account.equippedActiveSkill || null : options.activeSkillKey;
        if (activeSkillKey && !ACTIVE_SKILLS[activeSkillKey]) throw new Error('主动技能方案无效');
        if (activeSkillKey && toFiniteNumber(snapshot.skills[activeSkillKey]) <= 0) throw new Error(`${ACTIVE_SKILLS[activeSkillKey]}尚未解锁`);
        const rebornModeActive = (snapshot.heroMode || account.rebornMode || 'base') !== 'base';
        const rebornSkillKey = rebornModeActive
            ? options.rebornSkillKey === undefined
                ? account.equippedRebornSkill || null
                : validateRebornSkillSelection(snapshot, options.rebornSkillKey)
            : null;
        const reborn = getRebornModifiers(snapshot, rebornSkillKey);
        const withReborn = (value, key) => Math.max(1, Math.round(value * (1 + toFiniteNumber(reborn[`${key}Percent`]) / 100)) + toFiniteNumber(reborn[key]));
        const adjustedMaxHp = withReborn(maxHp, 'hp');
        return {
            hp: Math.max(1, Math.min(adjustedMaxHp, Math.round(adjustedMaxHp * currentHpRatio))),
            maxHp: adjustedMaxHp,
            atk: withReborn(project('attack', status.attack), 'attack'),
            def: withReborn(project('defense', status.defense), 'defense'),
            spd: withReborn(project('speed', status.speed), 'speed'),
            baseAtk: getBaseStat('attack', target.attack),
            baseDef: getBaseStat('defense', target.defense),
            baseSpd: getBaseStat('speed', target.speed),
            dodgeRate: Math.min(1, toFiniteNumber(snapshot.skills.dodge) * 0.03 + toFiniteNumber(reborn.dodgeRate)),
            critRate: Math.min(1, toFiniteNumber(snapshot.skills.crit) * 0.03 + toFiniteNumber(status.critRateBonus) + toFiniteNumber(reborn.critRate)),
            critDamageMultiplier: 1.5 + toFiniteNumber(status.critDmgBonus),
            activeSkillKey,
            equippedRebornSkill: rebornSkillKey,
            rebornModifiers: reborn,
            skills: snapshot.skills,
            rebornSkills: snapshot.rebornSkills
        };
    }

    function createSeededRandom(seed) {
        let value = seed >>> 0;
        return function random() {
            value += 0x6D2B79F5;
            let result = value;
            result = Math.imul(result ^ result >>> 15, result | 1);
            result ^= result + Math.imul(result ^ result >>> 7, result | 61);
            return ((result ^ result >>> 14) >>> 0) / 4294967296;
        };
    }

    function hashText(text) {
        let hash = 2166136261;
        for (const character of String(text)) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function simulateBattle(snapshot, monsterId, options = {}) {
        const allocation = options.allocation || getCurrentAllocation(snapshot.account);
        const player = options.player || getProjectedStats(snapshot, allocation, options);
        const monster = options.monster || getMonster(snapshot, monsterId);
        if (monster.id !== monsterId || ![monster.hp, monster.maxHp, monster.atk, monster.def, monster.spd, monster.level].every(value => Number.isFinite(value) && value > 0)) throw new Error('战斗怪物面板无效');
        const random = typeof options.random === 'function' ? options.random : Math.random;
        const activeLevel = Math.max(0, toFiniteNumber(player.skills[player.activeSkillKey]));
        const rebornLevel = Math.max(0, toFiniteNumber(player.rebornSkills[player.equippedRebornSkill]));
        const rebornSkill = rebornLevel > 0 ? REBORN_SKILLS[player.equippedRebornSkill] || null : null;
        const requestedBattleOptions = {
            ...(options.battleOptions || {}),
            ...(options.pleasureResist === undefined ? {} : {pleasureResist: options.pleasureResist})
        };
        const battleOptions = MONSTERS[monsterId] ? getDefaultBattleOptions(monsterId, requestedBattleOptions) : requestedBattleOptions;
        const pleasureResist = battleOptions.pleasureResist !== false;
        const equipmentSubmitted = monsterId === 'debt_collector' && battleOptions.submitEquipment === true;
        const automatonSuppressed = monsterId === 'automaton' && battleOptions.automatonSuppressed !== false;
        const playerDodgeRate = automatonSuppressed ? 0 : player.dodgeRate;
        let playerCritRate = automatonSuppressed ? 0 : player.critRate;
        const preemptiveAtb = Math.min(10, Math.max(0, Math.floor(toFiniteNumber(player.skills.preemptive_attack)))) * 2;
        const defenseBreakRate = Math.min(10, Math.max(0, Math.floor(toFiniteNumber(player.skills.defense_break)))) * 0.02;

        const state = {
            playerHp: player.hp,
            playerMaxHp: player.maxHp,
            playerAtk: equipmentSubmitted ? player.baseAtk : player.atk,
            playerDef: equipmentSubmitted ? player.baseDef : player.def,
            playerSpd: equipmentSubmitted ? player.baseSpd : player.spd,
            originalPlayerSpd: player.spd,
            playerAtb: 0,
            playerShieldBonus: 0,
            playerDrainActive: false,
            playerDrainHp: 0,
            playerPoisoned: false,
            activeSkillUsed: false,
            weakenModeActive: false,
            weakenStacks: 0,
            speedBoostTurns: 0,
            monsterHp: monster.hp,
            monsterMaxHp: monster.maxHp,
            monsterAtk: monster.atk,
            monsterDef: monster.def,
            monsterSpd: monster.spd,
            monsterAtb: 0,
            monsterPreemptiveGatePassed: monsterId === 'stone_golem' || preemptiveAtb === 0,
            monsterMinDamage: monster.minDamage,
            monsterResistLight: monster.resistLight,
            monsterResistDark: monster.resistDark,
            monsterActionCount: 0,
            monsterReviveCount: 0,
            pleasureValue: 0,
            pleasureClimaxes: 0,
            monsterStealthed: false,
            magneticFieldUsed: false,
            shieldActive: false,
            mirrorShieldCharged: false,
            bloodPactCharged: false,
            bloodPactCost: 0,
            monsterShieldBonus: monsterId === 'stone_golem' ? Math.round(monster.def * 0.5) : 0,
            paralysisTimer: 0,
            monsterDodges: 0,
            monsterCriticalHits: 0,
            poisonApplications: 0,
            poisonTicks: 0,
            shieldActivations: 0,
            shieldReflections: 0,
            familiarStolenAttack: 0,
            familiarHealing: 0,
            debtStealthToggles: 0,
            debtDebuffStacks: 0,
            forcedHugs: 0,
            paralysisApplications: 0,
            mirrorReflections: 0,
            bloodPactExplosions: 0,
            angryBushRageStacks: 0,
            angryBushRegenerations: 0,
            angryBushRegeneratedHp: 0,
            automatonSuppressed,
            automatonClimaxes: 0,
            stoneGolemAsleep: monsterId === 'stone_golem',
            stoneGolemHitCount: 0,
            stoneGolemAwakenings: 0,
            stoneGolemRegenerations: 0,
            stoneGolemRegeneratedHp: 0,
            mushroomMaidenOpeningUsed: false,
            neuroDisorderLevel: 0,
            mushroomSelfHits: 0,
            mushroomParasiticDamage: 0,
            swarmPhase: monsterId === 'meteor_swarm' ? 'hidden' : 'revealed',
            swarmLarvaeRemaining: 0,
            swarmLarvaeKilled: 0,
            swarmEvolutionMultiplier: 1,
            forestWolfSkillUses: 0,
            forestWolfLastSkill: null,
            ticks: 0,
            actions: 0,
            phase: 'fighting'
        };
        const witchClone = monsterId === 'witch_clone';
        const aromaRate = battleOptions.witchWeakened ? 0.035 : 0.05;
        Object.assign(state, {confusionTurns: 0, attackDisabledTurns: 0, breathSealedTurns: 0, breathHoldCharges: 0, lastPlayerDamage: 0});

        function applyCloneAroma() {
            if (state.breathHoldCharges > 0) { state.breathHoldCharges -= 1; return; }
            state.playerHp = Math.max(0, state.playerHp - Math.max(1, Math.floor(state.playerMaxHp * aromaRate)));
            state.playerAtk = Math.max(1, state.playerAtk - Math.max(1, Math.floor(state.playerAtk * aromaRate)));
            state.playerDef = Math.max(1, state.playerDef - Math.max(1, Math.floor(state.playerDef * aromaRate)));
            if (state.playerHp <= 0) state.phase = 'defeat';
        }

        function finishCloneTurn() {
            state.confusionTurns = Math.max(0, state.confusionTurns - 1);
            state.attackDisabledTurns = Math.max(0, state.attackDisabledTurns - 1);
            state.breathSealedTurns = Math.max(0, state.breathSealedTurns - 1);
            applyCloneAroma();
            state.playerAtb = 0;
        }

        if (witchClone) applyCloneAroma();

        function absorbDamage(damage) {
            let remaining = Math.max(0, damage);
            if (state.playerDrainActive && state.playerDrainHp > 0) {
                const absorbed = Math.min(state.playerDrainHp, remaining);
                state.playerDrainHp -= absorbed;
                remaining -= absorbed;
            }
            state.playerHp = Math.max(0, state.playerHp - remaining);
        }

        function addDrain(damage) {
            if (!state.playerDrainActive) return;
            const maximum = Math.floor(state.playerMaxHp * toFiniteNumber(player.skills.drain) * 0.02);
            const amount = Math.floor(damage * (toFiniteNumber(player.skills.drain) + toFiniteNumber(player.rebornModifiers?.drainPercent)) * 0.01);
            state.playerDrainHp = Math.min(maximum, state.playerDrainHp + Math.max(0, amount));
        }

        function getMonsterResistance(element) {
            if (element === 'light') return state.monsterResistLight;
            if (element === 'dark') return state.monsterResistDark;
            return monster.resistNull;
        }

        function applyMonsterResistance(damage, element) {
            const resisted = Math.max(1, Math.round(damage * (1 - getMonsterResistance(element))));
            return Math.max(1, Math.round(resisted * (1 - state.pleasureValue / 100)));
        }

        function rollPlayerCritical() {
            return playerCritRate > 0 && random() < playerCritRate;
        }

        function addAngryBushRage() {
            if (monsterId !== 'angry_bush') return;
            state.angryBushRageStacks += 1;
            state.monsterAtk = Math.floor(state.monsterAtk * 1.05);
            state.monsterDef = Math.floor(state.monsterDef * 1.05);
        }

        function regenerateAngryBush() {
            if (monsterId !== 'angry_bush' || state.monsterHp <= 0 || state.monsterHp >= state.monsterMaxHp) return;
            const healed = Math.min(Math.floor(state.monsterMaxHp * 0.05), state.monsterMaxHp - state.monsterHp);
            state.monsterHp += healed;
            state.angryBushRegenerations += 1;
            state.angryBushRegeneratedHp += healed;
        }

        function regenerateStoneGolem() {
            if (monsterId !== 'stone_golem' || state.stoneGolemAsleep || state.monsterHp <= 0 || state.monsterHp >= state.monsterMaxHp) return;
            const healed = Math.min(Math.floor(state.monsterMaxHp * 0.05), state.monsterMaxHp - state.monsterHp);
            state.monsterHp += healed;
            state.stoneGolemRegenerations += 1;
            state.stoneGolemRegeneratedHp += healed;
        }

        function useForestWolfSkill(nextMonsterAtb) {
            if (monsterId !== 'forest_wolf' || state.monsterAtb >= 50 || nextMonsterAtb < 50) return false;
            let skill;
            skill = getForestWolfSkill(state);
            if (skill === 'crush') {
                if (state.playerShieldBonus > 0) state.playerShieldBonus = 0;
                else state.playerDef = Math.max(1, Math.floor(state.playerDef * 0.9));
            } else if (skill === 'bloodlust') {
                if (state.playerDrainHp > 0) state.playerDrainHp = 0;
                else state.playerHp = Math.max(1, Math.floor(state.playerHp * 0.95));
            } else {
                state.playerAtk = Math.max(1, Math.floor(state.playerAtk * 0.9));
            }
            state.forestWolfSkillUses += 1;
            state.forestWolfLastSkill = skill;
            state.monsterAtb = Math.min(nextMonsterAtb, 100);
            if (state.playerHp <= 0) state.phase = 'defeat';
            return true;
        }

        function applyStoneGolemHit(damage, critical) {
            if (monsterId !== 'stone_golem' || !state.stoneGolemAsleep || damage <= 0) return;
            state.stoneGolemHitCount += 1;
            if (state.stoneGolemHitCount < 4 && (damage <= state.monsterMaxHp * 0.2 || critical)) return;
            state.stoneGolemAsleep = false;
            state.monsterShieldBonus = 0;
            state.monsterAtk = monster.atk;
            state.monsterDef = monster.def;
            state.stoneGolemAwakenings += 1;
        }

        function applyAutomatonPleasure() {
            if (monsterId !== 'automaton') return;
            state.pleasureValue = Math.min(100, state.pleasureValue + (state.automatonSuppressed ? 20 : 10));
            if (state.pleasureValue < 100) return;
            state.playerHp = Math.max(1, Math.floor(state.playerHp * 0.8));
            state.playerAtk = Math.max(1, Math.floor(state.playerAtk * 0.8));
            state.playerDef = Math.max(1, Math.floor(state.playerDef * 0.8));
            state.playerSpd = Math.max(1, Math.floor(state.playerSpd * 0.8));
            state.pleasureValue = 0;
            state.pleasureClimaxes += 1;
            state.automatonClimaxes += 1;
        }

        function reflectMirrorShield() {
            if (!state.mirrorShieldCharged) return;
            state.mirrorShieldCharged = false;
            if (state.monsterStealthed) return;
            const ratio = 0.3 + rebornLevel * 0.02;
            const baseDamage = Math.max(Math.round((state.playerDef + state.playerShieldBonus) * ratio) - state.monsterDef - state.monsterShieldBonus, 1);
            const rawDamage = rollPlayerCritical() ? Math.round(baseDamage * player.critDamageMultiplier) : baseDamage;
            const damage = applyMonsterResistance(rawDamage, 'light');
            state.monsterHp = Math.max(0, state.monsterHp - damage);
            state.mirrorReflections += 1;
            addAngryBushRage();
            addDrain(damage);
        }

        function explodeBloodPact() {
            if (!state.bloodPactCharged) return;
            state.bloodPactCharged = false;
            if (state.monsterStealthed) {
                state.bloodPactCost = 0;
                return;
            }
            if (consumeSwarmTarget()) {
                state.bloodPactCost = 0;
                return;
            }
            const critical = rollPlayerCritical();
            const multiplier = 10 + (state.playerDrainActive ? toFiniteNumber(player.skills.drain) * 0.2 : 0);
            const effectiveDefense = state.monsterDef * (1 - (critical ? defenseBreakRate : 0)) + state.monsterShieldBonus;
            const baseDamage = Math.max(Math.round(state.bloodPactCost * multiplier) - effectiveDefense, 1);
            const rawDamage = critical ? Math.round(baseDamage * player.critDamageMultiplier) : baseDamage;
            const resistedDamage = applyMonsterResistance(rawDamage, 'dark');
            const damage = state.stoneGolemAsleep
                ? Math.min(resistedDamage, Math.floor(state.monsterMaxHp * 0.4))
                : resistedDamage;
            state.monsterHp = Math.max(0, state.monsterHp - damage);
            if (witchClone) state.lastPlayerDamage = damage;
            state.bloodPactCost = 0;
            state.bloodPactExplosions += 1;
            addAngryBushRage();
            addDrain(damage);
            applyStoneGolemHit(damage, critical);
            if (state.monsterHp <= 0) state.phase = 'victory';
        }

        function consumeSwarmTarget() {
            if (monsterId !== 'meteor_swarm' || state.swarmPhase === 'revealed') return false;
            if (state.swarmPhase === 'larvae' && state.swarmLarvaeRemaining > 0) {
                state.swarmLarvaeRemaining -= 1;
                state.swarmLarvaeKilled += 1;
                state.monsterAtb = Math.max(0, state.monsterAtb - 5);
            }
            return true;
        }

        function playerAttack() {
            if (witchClone && (state.attackDisabledTurns > 0 || state.confusionTurns > 0 || state.breathHoldCharges === 0 && state.breathSealedTurns === 0 && state.playerHp < state.playerMaxHp * 0.35)) {
                if (state.breathSealedTurns === 0) state.breathHoldCharges = 2;
                finishCloneTurn();
                return;
            }
            if (monsterId === 'mushroom_maiden' && state.neuroDisorderLevel > 0 && random() < state.neuroDisorderLevel * 0.15) {
                absorbDamage(Math.max(1, Math.floor(monster.level / 2)));
                state.neuroDisorderLevel = Math.max(0, state.neuroDisorderLevel - 2);
                state.mushroomSelfHits += 1;
                state.playerAtb = 0;
                state.phase = state.playerHp <= 0 ? 'defeat' : 'fighting';
                return;
            }
            if (rebornSkill?.kind === 'mirror') {
                state.mirrorShieldCharged = true;
                state.playerAtb = 0;
                state.phase = 'fighting';
                return;
            }
            if (rebornSkill?.kind === 'blood_pact') {
                const cost = Math.min(Math.floor(state.playerMaxHp * (0.02 + rebornLevel * 0.001)), state.playerHp - 1);
                if (witchClone) state.playerHp -= Math.max(0, cost);
                else absorbDamage(Math.max(0, cost));
                state.bloodPactCharged = true;
                state.bloodPactCost = Math.max(0, cost);
                state.playerAtb = 0;
                state.phase = 'fighting';
                if (witchClone) finishCloneTurn();
                return;
            }

            if (state.monsterStealthed) {
                state.playerAtb = 0;
                state.phase = 'fighting';
                return;
            }
            if (monster.dodgeChance > 0 && random() < monster.dodgeChance) {
                state.monsterDodges += 1;
                state.playerAtb = 0;
                state.phase = 'fighting';
                return;
            }

            if (consumeSwarmTarget()) {
                state.playerAtb = 0;
                state.phase = 'fighting';
                return;
            }

            const attackMultiplier = rebornSkill?.kind === 'attack' ? 1 + rebornLevel * 0.05 : 1;
            const effectiveAttack = rebornSkill?.kind === 'attack'
                ? Math.round(state.playerAtk * attackMultiplier)
                : state.playerAtk;
            const critical = rollPlayerCritical();
            const effectiveDefense = state.monsterDef * (1 - (critical ? defenseBreakRate : 0)) + state.monsterShieldBonus;
            const baseDamage = Math.max(effectiveAttack - effectiveDefense, 1);
            const rawDamage = critical ? Math.round(baseDamage * player.critDamageMultiplier) : baseDamage;
            const resistedDamage = player.equippedRebornSkill === 'star_curse' && rebornLevel > 0 && state.weakenModeActive
                ? Math.max(1, Math.round(rawDamage))
                : applyMonsterResistance(rawDamage, rebornSkill?.element);
            const damage = state.stoneGolemAsleep
                ? Math.min(resistedDamage, Math.floor(state.monsterMaxHp * 0.4))
                : resistedDamage;
            state.monsterHp = Math.max(0, state.monsterHp - damage);
            if (witchClone) state.lastPlayerDamage = damage;
            else addDrain(damage);

            if (state.weakenModeActive && !witchClone) {
                const rate = toFiniteNumber(player.skills.weaken) * 0.005;
                state.monsterAtk = Math.max(1, state.monsterAtk - Math.max(1, Math.floor(state.monsterAtk * rate)));
                state.monsterDef = Math.max(1, state.monsterDef - Math.max(1, Math.floor(state.monsterDef * rate)));
                state.weakenStacks += 1;
            }
            addAngryBushRage();
            applyStoneGolemHit(damage, critical);
            if (monsterId === 'firefly_mage') {
                state.paralysisTimer = Math.min(2, state.paralysisTimer + 0.5);
                state.paralysisApplications += 1;
            }
            if (monsterId === 'ruin_guard' && state.shieldActive && effectiveAttack < state.monsterDef + state.monsterShieldBonus) {
                absorbDamage(Math.min(state.monsterDef + state.monsterShieldBonus - effectiveAttack, 100));
                state.shieldReflections += 1;
                if (state.playerHp <= 0) {
                    state.phase = 'defeat';
                    return;
                }
            }

            if (state.monsterHp <= 0) {
                if (monsterId === 'slime' && battleOptions.slimeRevive !== false && state.monsterReviveCount < 5 && random() < 0.2) {
                    state.monsterReviveCount += 1;
                    state.monsterHp = Math.round(state.monsterMaxHp * Math.pow(0.5, state.monsterReviveCount));
                } else {
                    state.phase = 'victory';
                    return;
                }
            }
            if (state.playerPoisoned) {
                absorbDamage(Math.min(Math.floor(state.playerMaxHp * 0.05), 100));
                state.poisonTicks += 1;
                if (state.playerHp <= 0) {
                    state.phase = 'defeat';
                    return;
                }
            }
            state.playerAtb = 0;
            state.phase = 'fighting';
            if (witchClone) finishCloneTurn();
        }

        function takePlayerTurn() {
            state.actions += 1;
            if (battleOptions.useActiveSkill !== false && !state.activeSkillUsed && player.activeSkillKey && activeLevel > 0) {
                state.activeSkillUsed = true;
                if (player.activeSkillKey === 'shield') state.playerShieldBonus = Math.floor(state.playerDef * activeLevel * 0.1);
                if (player.activeSkillKey === 'drain') {
                    state.playerDrainActive = true;
                    if (player.equippedRebornSkill === 'blood_pact' && rebornLevel > 0) {
                        state.playerDrainHp = Math.min(Math.floor(state.playerMaxHp * 0.05), Math.floor(state.playerMaxHp * activeLevel * 0.02));
                    }
                }
                if (player.activeSkillKey === 'weaken') {
                    state.weakenModeActive = true;
                    playerAttack();
                    return;
                }
                if (player.activeSkillKey === 'speed') {
                    state.playerSpd += Math.floor(state.playerSpd * 0.02 * activeLevel);
                    state.speedBoostTurns = 2;
                }
                state.playerAtb = 0;
                state.phase = 'fighting';
                return;
            }
            playerAttack();
        }

        function monsterAttack(wasParalyzed) {
            state.actions += 1;
            if (monsterId === 'golden_slime_dungeon' && random() < toFiniteNumber(monster.fleeProbability, 0.1)) {
                state.phase = 'escaped';
                return;
            }
            if (witchClone) {
                const choices = [];
                if (state.confusionTurns === 0 && state.attackDisabledTurns === 0) choices.push('confusion');
                if (state.lastPlayerDamage > 0) choices.push('drain');
                if (state.confusionTurns === 0 && state.attackDisabledTurns === 0) choices.push('seal');
                if (state.breathSealedTurns === 0) choices.push('breath');
                const choice = choices.length ? choices[Math.floor(random() * choices.length)] : 'breath';
                if (choice === 'confusion') state.confusionTurns = 2;
                if (choice === 'seal') state.attackDisabledTurns = 2;
                if (choice === 'breath') { state.breathSealedTurns = 2; state.breathHoldCharges = 0; }
                if (choice === 'drain') {
                    const damage = Math.floor(state.lastPlayerDamage * (battleOptions.witchWeakened ? 0.35 : 0.5));
                    state.playerHp = Math.max(0, state.playerHp - damage);
                    state.monsterHp = Math.min(state.monsterMaxHp - 1, state.monsterHp + damage);
                }
                reflectMirrorShield();
                state.monsterActionCount += 1;
                state.monsterAtb = 0;
                state.phase = state.playerHp <= 0 ? 'defeat' : state.monsterHp <= 0 ? 'victory' : 'fighting';
                return;
            }
            if (monsterId === 'meteor_swarm' && state.swarmPhase !== 'revealed') {
                if (state.swarmPhase === 'hidden') {
                    state.swarmPhase = 'larvae';
                    state.swarmLarvaeRemaining = 4;
                } else {
                    const multiplier = 1 + state.swarmLarvaeRemaining * 0.5;
                    const hpRatio = state.monsterHp / state.monsterMaxHp;
                    state.monsterMaxHp = Math.floor(state.monsterMaxHp * multiplier);
                    state.monsterHp = Math.floor(state.monsterMaxHp * hpRatio);
                    state.monsterAtk = Math.floor(monster.atk * multiplier);
                    state.monsterDef = Math.floor(monster.def * multiplier);
                    state.monsterSpd = Math.floor(monster.spd * multiplier);
                    state.monsterMinDamage = Math.floor(state.monsterMinDamage * multiplier);
                    state.monsterResistLight *= multiplier;
                    state.monsterResistDark *= multiplier;
                    if (state.swarmLarvaeRemaining === 0) playerCritRate = 1;
                    state.swarmEvolutionMultiplier = multiplier;
                    state.swarmLarvaeRemaining = 0;
                    state.swarmPhase = 'revealed';
                }
                state.monsterActionCount += 1;
                state.monsterAtb = 0;
                return;
            }
            if (monsterId === 'familiar' && state.monsterActionCount === 0) {
                const stolen = Math.floor(state.playerAtk / 2);
                state.playerAtk -= stolen;
                state.monsterAtk += stolen;
                state.familiarStolenAttack += stolen;
                state.monsterActionCount += 1;
                state.monsterAtb = 0;
                state.phase = 'fighting';
                return;
            }

            const forcedHug = monsterId === 'firefly_mage' && (state.monsterActionCount + 1) % 3 === 0;
            if (playerDodgeRate > 0 && !wasParalyzed && random() < playerDodgeRate) {
                if (monsterId === 'angry_bush') addAngryBushRage();
                if (forcedHug) {
                    state.paralysisTimer = Math.min(2, state.paralysisTimer + 1);
                    state.forcedHugs += 1;
                    state.paralysisApplications += 1;
                }
                reflectMirrorShield();
                state.monsterActionCount += 1;
                state.monsterAtb = 0;
                state.phase = state.monsterHp <= 0 ? 'victory' : 'fighting';
                return;
            }

            const critical = monster.critChance > 0 && random() < monster.critChance;
            if (critical) state.monsterCriticalHits += 1;
            const incomingDamage = critical
                ? Math.min(state.monsterAtk, Math.min(200, Math.floor(state.playerMaxHp * 0.1)))
                : Math.max(state.monsterAtk - state.playerDef - state.playerShieldBonus, state.monsterMinDamage);
            const damage = Math.max(monster.minDamage === 0 ? 0 : 1, Math.round(incomingDamage * (1 - Math.min(0.95, toFiniteNumber(player.rebornModifiers?.damageReduction) / 100))));
            const hpBefore = state.playerHp;
            const drainBefore = state.playerDrainHp;
            absorbDamage(damage);
            if (monsterId === 'familiar' && state.monsterActionCount > 0 && damage > 0) {
                const healed = Math.min(damage, state.monsterMaxHp - state.monsterHp);
                state.monsterHp += healed;
                state.familiarHealing += healed;
            }
            if (monsterId === 'debt_collector' && (state.playerHp < hpBefore || state.playerDrainHp < drainBefore)) {
                state.playerAtk = Math.max(1, state.playerAtk - Math.max(1, Math.floor(state.playerAtk * 0.05)));
                state.playerDef = Math.max(1, state.playerDef - Math.max(1, Math.floor(state.playerDef * 0.05)));
                state.debtDebuffStacks += 1;
            }
            if (!state.playerPoisoned && monster.poisonChance > 0 && random() < monster.poisonChance) {
                state.playerPoisoned = true;
                state.poisonApplications += 1;
            }
            if (monsterId === 'firefly_mage' && (state.playerHp < hpBefore || state.playerDrainHp < drainBefore)) {
                state.paralysisTimer = Math.min(2, state.paralysisTimer + 0.5);
                state.paralysisApplications += 1;
            }
            if (forcedHug) {
                state.paralysisTimer = Math.min(2, state.paralysisTimer + 1);
                state.forcedHugs += 1;
                state.paralysisApplications += 1;
            }
            if (state.playerHp <= 0) {
                state.monsterActionCount += 1;
                state.monsterAtb = 0;
                state.phase = 'defeat';
                return;
            }
            reflectMirrorShield();
            if (state.monsterHp <= 0) {
                state.monsterActionCount += 1;
                state.monsterAtb = 0;
                state.phase = 'victory';
                return;
            }
            applyAutomatonPleasure();
            if (monsterId === 'familiar' && !pleasureResist && state.playerHp > 0) {
                state.pleasureValue = Math.min(FAMILIAR_MECHANIC.pleasureLimit, state.pleasureValue + FAMILIAR_MECHANIC.pleasureStep);
                if (state.pleasureValue >= FAMILIAR_MECHANIC.pleasureLimit) {
                    state.pleasureClimaxes += 1;
                    state.pleasureValue = 0;
                }
            }
            state.monsterActionCount += 1;
            state.monsterAtb = 0;
            state.phase = state.playerHp <= 0 ? 'defeat' : 'fighting';
        }

        const maximumTicks = Math.max(20, Math.min(200000, Math.floor(toFiniteNumber(options.maximumTicks, 200000))));
        while (state.phase === 'fighting' && state.ticks < maximumTicks) {
            state.ticks += 1;
            const previousPlayerAtb = state.playerAtb;
            const speedLevel = toFiniteNumber(player.skills.speed);
            const speedFactor = state.speedBoostTurns > 0 ? 100 / (100 - (50 + 3 * speedLevel)) : 1;
            const wasParalyzed = state.paralysisTimer > 0;
            state.paralysisTimer = state.paralysisTimer > 0 ? Math.max(0, state.paralysisTimer - 0.1) : 0;
            const nextPlayerAtb = wasParalyzed ? state.playerAtb : state.playerAtb + 5 * speedFactor;
            if (!state.monsterPreemptiveGatePassed && previousPlayerAtb < preemptiveAtb && nextPlayerAtb >= preemptiveAtb) state.monsterPreemptiveGatePassed = true;
            const nextMonsterAtb = state.stoneGolemAsleep || !state.monsterPreemptiveGatePassed
                ? state.monsterAtb
                : state.monsterAtb + 5 * (state.monsterSpd / Math.max(state.playerSpd, 1));

            if (useForestWolfSkill(nextMonsterAtb)) continue;

            if ((monsterId === 'angry_bush' || monsterId === 'stone_golem' && !state.stoneGolemAsleep) && previousPlayerAtb < 50 && nextPlayerAtb >= 50) {
                regenerateAngryBush();
                regenerateStoneGolem();
                state.playerAtb = nextPlayerAtb;
                state.monsterAtb = Math.min(nextMonsterAtb, 100);
                continue;
            }
            if (monsterId === 'mushroom_maiden') {
                if (previousPlayerAtb < 50 && nextPlayerAtb >= 50) {
                    if (!state.mushroomMaidenOpeningUsed) {
                        state.mushroomMaidenOpeningUsed = true;
                        state.pleasureValue = 50;
                    } else {
                        const damage = Math.max(1, Math.floor(monster.level / 5));
                        absorbDamage(damage);
                        state.monsterHp = Math.min(state.monsterMaxHp, state.monsterHp + damage);
                        state.mushroomParasiticDamage += damage;
                    }
                    state.playerAtb = nextPlayerAtb;
                    state.monsterAtb = Math.min(nextMonsterAtb, 100);
                    if (state.playerHp <= 0) state.phase = 'defeat';
                    continue;
                }
                if (state.monsterAtb < 30 && nextMonsterAtb >= 30 || state.monsterAtb < 80 && nextMonsterAtb >= 80) {
                    state.neuroDisorderLevel = Math.min(6, state.neuroDisorderLevel + 1);
                    state.playerAtb = nextPlayerAtb;
                    state.monsterAtb = Math.min(nextMonsterAtb, 100);
                    continue;
                }
            }

            if (monsterId === 'debt_collector' && previousPlayerAtb < 50 && nextPlayerAtb >= 50) {
                state.monsterStealthed = !state.monsterStealthed;
                state.debtStealthToggles += 1;
                state.playerAtb = nextPlayerAtb;
                state.monsterAtb = Math.min(nextMonsterAtb, 100);
                continue;
            }
            if (monsterId === 'ruin_guard' && previousPlayerAtb < 50 && nextPlayerAtb >= 50) {
                if (state.shieldActive) {
                    state.shieldActive = false;
                    state.monsterShieldBonus = 0;
                } else if (state.magneticFieldUsed) {
                    if (random() < 0.5) {
                        state.shieldActive = true;
                        state.monsterShieldBonus = state.monsterDef;
                        state.shieldActivations += 1;
                    }
                } else {
                    state.magneticFieldUsed = true;
                    state.playerSpd = Math.max(1, state.playerSpd - state.monsterSpd);
                }
                state.playerAtb = nextPlayerAtb;
                state.monsterAtb = Math.min(nextMonsterAtb, 100);
                continue;
            }
            if (state.bloodPactCharged && previousPlayerAtb < 30 && nextPlayerAtb >= 30) {
                state.playerAtb = nextPlayerAtb;
                state.monsterAtb = Math.min(nextMonsterAtb, 100);
                explodeBloodPact();
                continue;
            }

            state.playerAtb = nextPlayerAtb;
            state.monsterAtb = nextMonsterAtb;
            if (state.playerAtb >= 100) {
                state.playerAtb = 100;
                state.monsterAtb = Math.min(state.monsterAtb, 100);
                state.speedBoostTurns = Math.max(0, state.speedBoostTurns - 1);
                takePlayerTurn();
            } else if (state.monsterAtb >= 100) {
                state.monsterAtb = 100;
                monsterAttack(wasParalyzed);
            }
        }

        const timedOut = state.phase === 'fighting';
        if (timedOut) state.phase = 'defeat';
        const elapsedSeconds = Number((state.ticks / 10).toFixed(1));
        return {
            victory: state.phase === 'victory',
            escaped: state.phase === 'escaped',
            timedOut,
            currentHp: Math.max(0, Math.round(state.playerHp)),
            hpLost: Math.max(0, Math.round(player.hp - state.playerHp)),
            hpLossRatio: Math.max(0, (player.hp - state.playerHp) / Math.max(1, player.hp)),
            remainingHpRatio: Math.max(0, state.playerHp / Math.max(1, state.playerMaxHp)),
            elapsedSeconds,
            wallClockSeconds: Number((elapsedSeconds + state.pleasureClimaxes * FAMILIAR_MECHANIC.promptDelaySeconds).toFixed(1)),
            pleasureResist,
            pleasureValue: state.pleasureValue,
            pleasureClimaxes: state.pleasureClimaxes,
            climaxExperienceLost: state.pleasureClimaxes * FAMILIAR_MECHANIC.climaxExperienceLoss,
            actions: state.actions,
            monsterRemainingHp: Math.max(0, Math.round(state.monsterHp)),
            monsterLevel: monster.level,
            monsterId,
            rebornSkillKey: player.equippedRebornSkill || null,
            rebornSkillLevel: rebornLevel,
            battleOptions,
            equipmentSubmitted,
            finalPlayerAtk: state.playerAtk,
            finalPlayerDef: state.playerDef,
            finalPlayerSpd: state.playerSpd,
            mechanics: {
                monsterDodges: state.monsterDodges,
                monsterCriticalHits: state.monsterCriticalHits,
                monsterReviveCount: state.monsterReviveCount,
                poisonApplications: state.poisonApplications,
                poisonTicks: state.poisonTicks,
                magneticFieldUsed: state.magneticFieldUsed,
                shieldActivations: state.shieldActivations,
                shieldReflections: state.shieldReflections,
                familiarStolenAttack: state.familiarStolenAttack,
                familiarHealing: state.familiarHealing,
                debtStealthToggles: state.debtStealthToggles,
                debtDebuffStacks: state.debtDebuffStacks,
                forcedHugs: state.forcedHugs,
                paralysisApplications: state.paralysisApplications,
                mirrorReflections: state.mirrorReflections,
                bloodPactExplosions: state.bloodPactExplosions,
                angryBushRageStacks: state.angryBushRageStacks,
                angryBushRegenerations: state.angryBushRegenerations,
                angryBushRegeneratedHp: state.angryBushRegeneratedHp,
                automatonSuppressed: state.automatonSuppressed,
                automatonClimaxes: state.automatonClimaxes,
                stoneGolemAsleep: state.stoneGolemAsleep,
                stoneGolemHitCount: state.stoneGolemHitCount,
                stoneGolemAwakenings: state.stoneGolemAwakenings,
                stoneGolemRegenerations: state.stoneGolemRegenerations,
                stoneGolemRegeneratedHp: state.stoneGolemRegeneratedHp,
                mushroomSelfHits: state.mushroomSelfHits,
                mushroomParasiticDamage: state.mushroomParasiticDamage,
                neuroDisorderLevel: state.neuroDisorderLevel,
                swarmLarvaeKilled: state.swarmLarvaeKilled,
                swarmEvolutionMultiplier: state.swarmEvolutionMultiplier,
                forestWolfSkillUses: state.forestWolfSkillUses,
                forestWolfLastSkill: state.forestWolfLastSkill
            }
        };
    }

    function getAllocationKey(allocation) {
        return STAT_KEYS.map(key => allocation[key]).join(':');
    }

    function getCandidateAllocations(totalPoints, currentAllocation, divisions = 20) {
        const candidates = new Map();
        const add = allocation => {
            const normalized = validateAllocation(allocation, totalPoints);
            candidates.set(getAllocationKey(normalized), normalized);
        };
        const allocatedPoints = STAT_KEYS.reduce((sum, key) => sum + toNonNegativeInteger(currentAllocation?.[key], `${key} 点数`), 0);
        if (allocatedPoints > totalPoints) throw new Error(`当前已分配能力点 ${allocatedPoints} 超过总能力点 ${totalPoints}`);
        const unallocatedPoints = totalPoints - allocatedPoints;
        if (unallocatedPoints === 0) {
            add(currentAllocation);
        } else {
            for (const key of STAT_KEYS) add({...currentAllocation, [key]: currentAllocation[key] + unallocatedPoints});
        }

        for (let hp = 0; hp <= divisions; hp += 1) {
            for (let attack = 0; attack <= divisions - hp; attack += 1) {
                for (let defense = 0; defense <= divisions - hp - attack; defense += 1) {
                    const speed = divisions - hp - attack - defense;
                    const allocation = {
                        hp: Math.floor(totalPoints * hp / divisions),
                        attack: Math.floor(totalPoints * attack / divisions),
                        defense: Math.floor(totalPoints * defense / divisions),
                        speed: Math.floor(totalPoints * speed / divisions)
                    };
                    allocation.attack += totalPoints - STAT_KEYS.reduce((sum, key) => sum + allocation[key], 0);
                    add(allocation);
                }
            }
        }
        return [...candidates.values()];
    }

    function getSearchProfile(options, totalPoints) {
        const profile = options.searchProfile || (options.fast ? 'battle' : 'full');
        if (!['full', 'battle'].includes(profile)) throw new Error('配点搜索模式无效');
        if (profile === 'battle') {
            return {
                divisions: Math.max(4, Math.min(10, toNonNegativeInteger(options.divisions ?? (totalPoints > 1000 ? 8 : 6), '搜索精度'))),
                coarseSamples: Math.max(2, Math.min(8, toNonNegativeInteger(options.coarseSamples ?? 3, '初筛次数'))),
                finalSamples: Math.max(4, Math.min(32, toNonNegativeInteger(options.finalSamples ?? 16, '复核次数'))),
                maximumTicks: Math.max(2000, Math.min(30000, toNonNegativeInteger(options.maximumTicks ?? 12000, '模拟步数'))),
                refineAllocation: options.refineAllocation === true
            };
        }
        return {
            divisions: Math.max(4, Math.min(24, toNonNegativeInteger(options.divisions ?? 20, '搜索精度'))),
            coarseSamples: Math.max(2, Math.min(64, toNonNegativeInteger(options.coarseSamples ?? 8, '初筛次数'))),
            finalSamples: Math.max(8, Math.min(512, toNonNegativeInteger(options.finalSamples ?? 96, '复核次数'))),
            maximumTicks: Math.max(2000, Math.min(200000, toNonNegativeInteger(options.maximumTicks ?? 200000, '模拟步数'))),
            refineAllocation: options.refineAllocation !== false
        };
    }

    function getBattleRecommendationContext(snapshot, monsterId, options = {}) {
        const monster = getMonster(snapshot, monsterId);
        const account = snapshot.account || {};
        const status = snapshot.battleStatus || {};
        return JSON.stringify({
            heroMode: normalizeHeroMode(snapshot.heroMode || account.rebornMode),
            faithRoute: getFaithRoute(snapshot),
            totalPoints: getTotalPoints(account),
            skills: snapshot.skills,
            rebornSkills: snapshot.rebornSkills,
            equippedActiveSkill: account.equippedActiveSkill || null,
            equippedRebornSkill: account.equippedRebornSkill || null,
            equipmentBonuses: status.equipmentBonuses || {},
            defensePotionStacks: options.defensePotionStacks ?? status.defenseBuffStacks ?? 0,
            autoHealing: options.autoHealing === true,
            healingTargetRatio: options.healingTargetRatio ?? null,
            pleasureResist: options.pleasureResist !== false,
            optimizationMode: options.optimizationMode || 'balanced',
            battleOptions: getDefaultBattleOptions(monsterId, options.battleOptions),
            monster: {id: monster.id, level: monster.level, hp: monster.hp, maxHp: monster.maxHp, atk: monster.atk, def: monster.def, spd: monster.spd}
        });
    }

    function evaluateAllocation(snapshot, monsterId, allocation, sampleCount, options = {}) {
        const monster = getMonster(snapshot, monsterId);
        let victories = 0;
        let hpLost = 0;
        let hpLossRatio = 0;
        let remainingHp = 0;
        let elapsedSeconds = 0;
        let wallClockSeconds = 0;
        let victoryActiveSeconds = 0;
        let victorySeconds = 0;
        let victoryPleasureClimaxes = 0;
        const baseSeed = hashText(`${monsterId}:${monster.level}`);

        for (let index = 0; index < sampleCount; index += 1) {
            const result = simulateBattle(snapshot, monsterId, {
                ...options,
                allocation,
                random: createSeededRandom(baseSeed + Math.imul(index + 1, 2654435761))
            });
            if (result.victory) {
                victories += 1;
                victoryActiveSeconds += result.elapsedSeconds;
                victorySeconds += result.wallClockSeconds;
                victoryPleasureClimaxes += result.pleasureClimaxes;
            }
            hpLost += result.hpLost;
            hpLossRatio += result.hpLossRatio;
            remainingHp += result.remainingHpRatio;
            elapsedSeconds += result.elapsedSeconds;
            wallClockSeconds += result.wallClockSeconds;
        }

        const winRate = victories / sampleCount;
        const averageHpLost = hpLost / sampleCount;
        const averageHpLossRatio = hpLossRatio / sampleCount;
        const averageRemainingHpRatio = remainingHp / sampleCount;
        const averageSeconds = elapsedSeconds / sampleCount;
        const averageWallClockSeconds = wallClockSeconds / sampleCount;
        const averageActiveVictorySeconds = victories > 0 ? victoryActiveSeconds / victories : Number.POSITIVE_INFINITY;
        const averageVictorySeconds = victories > 0 ? victorySeconds / victories : Number.POSITIVE_INFINITY;
        const averageVictoryPleasureClimaxes = victories > 0 ? victoryPleasureClimaxes / victories : 0;
        return {
            allocation,
            activeSkillKey: options.activeSkillKey ?? snapshot.account.equippedActiveSkill ?? null,
            rebornSkillKey: options.rebornSkillKey === undefined ? snapshot.account.equippedRebornSkill ?? null : options.rebornSkillKey,
            winRate,
            averageHpLost,
            averageHpLossRatio,
            averageRemainingHpRatio,
            averageSeconds,
            averageWallClockSeconds,
            averageActiveVictorySeconds,
            averageVictorySeconds,
            averageVictoryPleasureClimaxes,
            pleasureResist: options.pleasureResist !== false,
            battleOptions: getDefaultBattleOptions(monsterId, options.battleOptions)
        };
    }

    function getOptimizationMode(value) {
        const mode = value || 'balanced';
        if (!OPTIMIZATION_MODES[mode]) throw new Error('请选择有效的配点目标');
        return mode;
    }

    function getActiveSkillCandidates(snapshot, optimizeActiveSkill) {
        if (optimizeActiveSkill === false) return [snapshot.account.equippedActiveSkill || null];
        const candidates = Object.keys(ACTIVE_SKILLS).filter(key => toFiniteNumber(snapshot.skills[key]) > 0);
        return candidates.length > 0 ? candidates : [null];
    }

    function getRebornSkillCandidates(snapshot, options = {}) {
        if (normalizeHeroMode(snapshot.heroMode || snapshot.account?.rebornMode) !== 'reborn') return [null];
        if (options.rebornSkillKey !== undefined) return [validateRebornSkillSelection(snapshot, options.rebornSkillKey)];
        if (options.optimizeRebornSkill === false) return [getDefaultRebornSkill(snapshot)];
        validateFaithRouteConsistency(snapshot);
        const candidates = (snapshot.rebornSkillOptions || [])
            .filter(skill => skill.unlocked && skill.supported !== false)
            .filter(skill => isRebornSkillAllowedForFaithRoute(snapshot, skill))
            .filter(skill => skill.faithRequired <= Math.max(0, toFiniteNumber(snapshot.faith)))
            .map(skill => skill.key);
        return candidates.length > 0 ? [...new Set(candidates)] : [null];
    }

    function sortEvaluations(evaluations, optimizationMode) {
        const remainingValues = evaluations.map(item => item.averageRemainingHpRatio);
        const finiteVictorySeconds = evaluations.map(item => item.averageVictorySeconds).filter(Number.isFinite);
        const remainingMin = Math.min(...remainingValues);
        const remainingRange = Math.max(...remainingValues) - remainingMin;
        const secondsMin = finiteVictorySeconds.length > 0 ? Math.min(...finiteVictorySeconds) : 0;
        const secondsRange = finiteVictorySeconds.length > 0 ? Math.max(...finiteVictorySeconds) - secondsMin : 0;
        const balancedScore = item => {
            const survival = remainingRange > 0 ? (item.averageRemainingHpRatio - remainingMin) / remainingRange : 1;
            const speed = secondsRange > 0 && Number.isFinite(item.averageVictorySeconds)
                ? 1 - (item.averageVictorySeconds - secondsMin) / secondsRange
                : Number.isFinite(item.averageVictorySeconds) ? 1 : 0;
            return survival * 0.5 + speed * 0.5;
        };

        evaluations.sort((left, right) => {
            if (right.winRate !== left.winRate) return right.winRate - left.winRate;
            if (optimizationMode === 'minimum_loss') {
                return left.averageHpLossRatio - right.averageHpLossRatio
                    || right.averageRemainingHpRatio - left.averageRemainingHpRatio
                    || left.averageVictorySeconds - right.averageVictorySeconds;
            }
            if (optimizationMode === 'fastest') {
                return left.averageVictorySeconds - right.averageVictorySeconds || right.averageRemainingHpRatio - left.averageRemainingHpRatio;
            }
            return balancedScore(right) - balancedScore(left)
                || right.averageRemainingHpRatio - left.averageRemainingHpRatio
                || left.averageVictorySeconds - right.averageVictorySeconds;
        });
        return evaluations;
    }

    function findOptimalAllocation(snapshot, monsterId, options = {}) {
        const totalPoints = getTotalPoints(snapshot.account);
        const current = getCurrentAllocation(snapshot.account);
        const optimizationMode = getOptimizationMode(options.optimizationMode);
        const profile = getSearchProfile(options, totalPoints);
        const divisions = profile.divisions;
        const coarseSamples = profile.coarseSamples;
        const finalSamples = Math.max(coarseSamples, profile.finalSamples);
        const candidates = getCandidateAllocations(totalPoints, current, divisions);
        const activeSkills = getActiveSkillCandidates(snapshot, options.optimizeActiveSkill);
        const rebornSkills = getRebornSkillCandidates(snapshot, options);
        const coarse = candidates.flatMap(allocation => activeSkills.flatMap(activeSkillKey => rebornSkills.map(rebornSkillKey => evaluateAllocation(
            snapshot,
            monsterId,
            allocation,
            coarseSamples,
            {...options, maximumTicks: profile.maximumTicks, activeSkillKey, rebornSkillKey}
        ))));
        const optimizeWitchForest = getFaithRoute(snapshot) === 'M' && MONSTERS[monsterId]?.region === 'forest';
        if (optimizeWitchForest && options.optimizeActiveSkill !== false && options.battleOptions?.useActiveSkill === undefined) {
            coarse.push(...candidates.flatMap(allocation => rebornSkills.map(rebornSkillKey => evaluateAllocation(snapshot, monsterId, allocation, coarseSamples, {
                ...options, maximumTicks: profile.maximumTicks, activeSkillKey: snapshot.account.equippedActiveSkill || null, rebornSkillKey,
                battleOptions: {...options.battleOptions, useActiveSkill: false}
            }))));
        }
        sortEvaluations(coarse, optimizationMode);
        const finalists = coarse.slice(0, Math.min(12, coarse.length));
        let refinedCandidates = 0;
        if (optimizeWitchForest && profile.refineAllocation) {
            let centers = [...finalists.slice(0, 4)];
            for (let step = Math.max(1, Math.floor(totalPoints / divisions / 2)); step >= 1; step = step === 1 ? 0 : Math.max(1, Math.floor(step / 4))) {
                const neighbors = new Map();
                for (const candidate of centers) {
                    for (const from of STAT_KEYS) {
                        for (const to of STAT_KEYS) {
                            if (from === to || candidate.allocation[from] < step) continue;
                            const allocation = {...candidate.allocation, [from]: candidate.allocation[from] - step, [to]: candidate.allocation[to] + step};
                            const key = `${getAllocationKey(allocation)}:${candidate.activeSkillKey}:${candidate.rebornSkillKey}:${candidate.battleOptions.useActiveSkill !== false}`;
                            if (neighbors.has(key)) continue;
                            neighbors.set(key, evaluateAllocation(snapshot, monsterId, allocation, coarseSamples, {...options, maximumTicks: profile.maximumTicks, activeSkillKey: candidate.activeSkillKey, rebornSkillKey: candidate.rebornSkillKey, battleOptions: candidate.battleOptions}));
                        }
                    }
                }
                refinedCandidates += neighbors.size;
                centers = sortEvaluations([...centers, ...neighbors.values()], optimizationMode).slice(0, 4);
                finalists.push(...centers);
            }
        }
        const reviewed = finalists.map(candidate => evaluateAllocation(
            snapshot,
            monsterId,
            candidate.allocation,
            finalSamples,
            {...options, maximumTicks: profile.maximumTicks, activeSkillKey: candidate.activeSkillKey, rebornSkillKey: candidate.rebornSkillKey, battleOptions: candidate.battleOptions}
        ));
        sortEvaluations(reviewed, optimizationMode);
        return {
            ...reviewed[0],
            monster: getMonster(snapshot, monsterId),
            totalPoints,
            candidatesEvaluated: coarse.length,
            refinedCandidates,
            optimizationMode,
            searchProfile: options.searchProfile || (options.fast ? 'battle' : 'full'),
            maximumTicks: profile.maximumTicks,
            recommendationContext: getBattleRecommendationContext(snapshot, monsterId, options)
        };
    }

    function revalidateBattleRecommendation(snapshot, monsterId, recommendation, options = {}) {
        if (!recommendation?.allocation || !recommendation.heroMode) throw new Error('待复用的战斗方案无效');
        const modeSnapshot = getHeroModeSnapshot(snapshot, recommendation.heroMode);
        const totalPoints = getTotalPoints(modeSnapshot.account);
        if (totalPoints !== recommendation.totalPoints) throw new Error('勇者能力点已变化，需要重新计算配点');
        const contextOptions = {...options, battleOptions: recommendation.battleOptions};
        if (recommendation.recommendationContext && recommendation.recommendationContext !== getBattleRecommendationContext(modeSnapshot, monsterId, contextOptions)) throw new Error('战斗面板或装备已变化，需要重新计算配点');
        const hpRatio = toFiniteNumber(modeSnapshot.battleStatus.currentHp)
            / Math.max(1, toFiniteNumber(modeSnapshot.battleStatus.maxHp, 1));
        const minimumHpRatio = options.autoHealing === true && hpRatio < 0.2
            ? Math.max(0.2, Math.min(1, toFiniteNumber(options.healingTargetRatio, 0.95)))
            : options.minimumHpRatio;
        const result = evaluateAllocation(modeSnapshot, monsterId, recommendation.allocation, options.samples || 4, {
            ...options,
            minimumHpRatio,
            maximumTicks: options.maximumTicks || 12000,
            activeSkillKey: recommendation.activeSkillKey,
            rebornSkillKey: recommendation.rebornSkillKey,
            battleOptions: recommendation.battleOptions
        });
        return {
            ...recommendation,
            ...result,
            monster: getMonster(modeSnapshot, monsterId),
            heroMode: recommendation.heroMode,
            modeName: recommendation.modeName || HERO_MODES[recommendation.heroMode],
            totalPoints,
            candidatesEvaluated: 0,
            refinedCandidates: 0,
            quickValidation: true,
            searchProfile: 'battle',
            recommendationContext: getBattleRecommendationContext(modeSnapshot, monsterId, contextOptions)
        };
    }

    function findOptimalBattleMode(snapshot, monsterId, options = {}) {
        const optimizationMode = getOptimizationMode(options.optimizationMode);
        const candidates = [];
        const getModeOptions = modeSnapshot => {
            const hpRatio = toFiniteNumber(modeSnapshot.battleStatus.currentHp)
                / Math.max(1, toFiniteNumber(modeSnapshot.battleStatus.maxHp, 1));
            const minimumHpRatio = options.autoHealing === true && hpRatio < 0.2
                ? Math.max(0.2, Math.min(1, toFiniteNumber(options.healingTargetRatio, 0.95)))
                : options.minimumHpRatio;
            return {...options, minimumHpRatio};
        };
        const baseData = snapshot?.heroModes?.base;
        if (baseData) {
            const baseSnapshot = getHeroModeSnapshot(snapshot, 'base');
            candidates.push({
                ...findOptimalAllocation(baseSnapshot, monsterId, {...getModeOptions(baseSnapshot), rebornSkillKey: null}),
                heroMode: 'base',
                modeName: HERO_MODES.base
            });
        }
        const rebornData = snapshot?.heroModes?.reborn;
        if (rebornData) {
            const rebornSnapshot = getHeroModeSnapshot(snapshot, 'reborn');
            candidates.push({
                ...findOptimalAllocation(rebornSnapshot, monsterId, getModeOptions(rebornSnapshot)),
                heroMode: 'reborn',
                modeName: HERO_MODES.reborn
            });
        }
        if (candidates.length === 0) throw new Error('基础模式和转生信仰模式面板均未同步');
        sortEvaluations(candidates, optimizationMode);
        const comparisons = Object.fromEntries(candidates.map(candidate => [candidate.heroMode, {
            modeName: candidate.modeName,
            winRate: candidate.winRate,
            averageHpLossRatio: candidate.averageHpLossRatio,
            averageRemainingHpRatio: candidate.averageRemainingHpRatio,
            averageVictorySeconds: candidate.averageVictorySeconds,
            totalPoints: candidate.totalPoints,
            allocation: candidate.allocation,
            activeSkillKey: candidate.activeSkillKey,
            rebornSkillKey: candidate.rebornSkillKey || null
        }]));
        return {...candidates[0], modeComparisons: comparisons};
    }

    function verifyMonsterModels(snapshot, options = {}) {
        const results = {};
        for (const monsterId of MONSTER_IDS) {
            try {
                const recommendation = findOptimalAllocation(snapshot, monsterId, options);
                results[monsterId] = {
                    status: 'ok',
                    monster: recommendation.monster,
                    allocation: recommendation.allocation,
                    activeSkillKey: recommendation.activeSkillKey,
                    rebornSkillKey: recommendation.rebornSkillKey || null,
                    winRate: recommendation.winRate,
                    battleOptions: getDefaultBattleOptions(monsterId, options.battleOptions)
                };
            } catch (error) {
                results[monsterId] = {status: 'error', error: String(error?.message || error)};
            }
        }
        return results;
    }

    function planAllocationChanges(account, targetAllocation) {
        const totalPoints = getTotalPoints(account);
        const current = getCurrentAllocation(account);
        const target = validateAllocation(targetAllocation, totalPoints);
        const deallocate = [];
        const allocate = [];

        for (const key of STAT_KEYS) {
            const difference = target[key] - current[key];
            if (difference < 0) deallocate.push({stat: key, points: Math.abs(difference)});
            if (difference > 0) allocate.push({stat: key, points: difference});
        }
        return {current, target, deallocate, allocate, changed: deallocate.length + allocate.length > 0};
    }

    function createBattleResultPayload(monsterId, result) {
        const definition = MONSTERS[monsterId];
        if (!definition) throw new Error('请选择有效的常规怪物');
        if (!result || result.monsterId !== monsterId || result.monsterLevel <= 0) throw new Error('本地战斗结果无效');
        return {
            victory: result.victory === true,
            currentHp: Math.max(0, Math.round(toFiniteNumber(result.currentHp))),
            monsterType: monsterId,
            ...(result.victory ? {} : {monsterRemainingHp: Math.max(0, Math.round(toFiniteNumber(result.monsterRemainingHp)))}),
            [definition.clientLevelField]: result.monsterLevel
        };
    }

    function validateLevelTransition(monsterId, previousLevel, nextSnapshot, victory) {
        const nextLevel = getMonster(nextSnapshot, monsterId).level;
        const expected = victory ? previousLevel + 0.5 : previousLevel;
        if (Math.abs(nextLevel - expected) > 1e-9) throw new Error(`怪物等级变化异常：预期 Lv.${expected}，服务器返回 Lv.${nextLevel}`);
        return nextLevel;
    }

    function validateBattleCountTransition(previousCount, nextSnapshot) {
        const expected = toNonNegativeInteger(previousCount, '提交前战斗次数') + 1;
        const actual = getBattleCount(nextSnapshot);
        if (actual !== expected) throw new Error(`战斗次数变化异常：预期 ${expected}，服务器返回 ${actual}`);
        return actual;
    }

    function reconcileBattleAttempt(attempt, snapshot) {
        const monsterId = attempt?.monsterId;
        const previousCount = toNonNegativeInteger(attempt?.battleCount, '提交前战斗次数');
        const previousLevel = toFiniteNumber(attempt?.monsterLevel, -1);
        if (!MONSTERS[monsterId] || previousLevel <= 0) throw new Error('待对账战斗信息无效');

        const currentCount = getBattleCount(snapshot);
        const currentLevel = getMonster(snapshot, monsterId).level;
        const countChange = currentCount - previousCount;
        const levelChange = currentLevel - previousLevel;
        if (countChange === 0 && Math.abs(levelChange) <= 1e-9) return {status: 'pending', currentCount, currentLevel};
        if (countChange === 1 && Math.abs(levelChange - 0.5) <= 1e-9) return {status: 'victory', currentCount, currentLevel};
        if (countChange === 1 && Math.abs(levelChange) <= 1e-9) return {status: 'defeat', currentCount, currentLevel};
        return {status: 'invalid', currentCount, currentLevel};
    }

    function isRetryableHeroError(error) {
        const message = String(error?.message || error);
        const nonRetryable = [
            '低于停止线',
            '达到 60 次',
            '超过服务器上限',
            '药水不足',
            '已经失效',
            '禁止立即重复使用',
            '转生技能',
            '请选择有效',
            '必须是',
            '尚未解锁或无效',
            '主动技能方案无效',
            'HP 不足',
            '本地战斗结果无效',
            '对账异常',
            '请先登录'
        ];
        return !nonRetryable.some(pattern => message.includes(pattern));
    }

    function getHeroRetryDelayMilliseconds(retryNumber) {
        const normalized = toNonNegativeInteger(retryNumber, '重试次数');
        if (normalized < 1 || normalized > 3) throw new Error('重试次数必须是 1–3');
        return normalized * 5000;
    }

    return Object.freeze({
        STAT_KEYS,
        STAT_RULES,
        ACTIVE_SKILLS,
        OPTIMIZATION_MODES,
        HEALING_POTIONS,
        FAMILIAR_MECHANIC,
        HERO_MODES,
        REBORN_SKILLS,
        FAITH_ROUTES,
        FAITH_ROUTE_LABELS,
        MONSTERS,
        MONSTER_IDS,
        MONSTER_REGIONS,
        FOREST_MONSTER_CATALOG,
        FOREST_MONSTER_IDS,
        MONSTER_BATTLE_DEFAULTS,
        createSnapshot,
        normalizeHeroMode,
        getServerHeroMode,
        getHeroModeSnapshot,
        combineHeroModeSnapshots,
        getRebornSkillOptions,
        normalizeFaithRoute,
        getFaithRoute,
        getFaithRouteLabel,
        getSkillFaithRoute,
        isRebornSkillAllowedForFaithRoute,
        validateFaithRouteConsistency,
        validateAppliedRebornSkill,
        getRebornSkill,
        getRebornModifiers,
        validateRebornSkillSelection,
        getDefaultRebornSkill,
        getDefaultRoute,
        getDefaultMonsterRoute: getDefaultRoute,
        getDefaultBattleOptions,
        getDefaultRoutePlan,
        getCurrentAllocation,
        getTotalPoints,
        getCandidateAllocations,
        validateAllocation,
        getMonster,
        getForestWolfSkill,
        getBattleCount,
        planHealingConsumables,
        createBattleGuard,
        validateBattleGuard,
        getProjectedStats,
        simulateBattle,
        createSeededRandom,
        sortEvaluations,
        findOptimalAllocation,
        revalidateBattleRecommendation,
        findOptimalBattleMode,
        verifyMonsterModels,
        planAllocationChanges,
        createBattleResultPayload,
        validateLevelTransition,
        validateBattleCountTransition,
        reconcileBattleAttempt,
        isRetryableHeroError,
        getHeroRetryDelayMilliseconds
    });
});
