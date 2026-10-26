const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const hero = require('../app/scripts/hero-automation.js');

function createRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let result = value;
        result = Math.imul(result ^ result >>> 15, result | 1);
        result ^= result + Math.imul(result ^ result >>> 7, result | 61);
        return ((result ^ result >>> 14) >>> 0) / 4294967296;
    };
}

function loadOfficialEngine(source) {
    const helpersStart = source.indexOf('const Gv={drainHpPercentPerLevel:') >= 0
        ? source.indexOf('const Gv={drainHpPercentPerLevel:')
        : source.indexOf('const wy={drainHpPercentPerLevel:');
    const engineStart = source.indexOf('function m5e({fps:') >= 0
        ? source.indexOf('function m5e({fps:')
        : source.indexOf('function sCe({fps:');
    const engineEnd = source.indexOf('const f5e=', engineStart) >= 0
        ? source.indexOf('const f5e=', engineStart)
        : source.indexOf('const aCe=', engineStart);
    if (helpersStart < 0 || engineStart < helpersStart || engineEnd < engineStart) throw new Error('官方引擎结构发生变化，请重新核对提取边界');
    const engine = source.slice(helpersStart, engineEnd).replace('return{battle:r,startBattle:m', 'return{getBattle:()=>s.current,tickBattle:c,battle:r,startBattle:m');
    const context = vm.createContext({
        u: {useState: () => [null, () => {}], useRef: value => ({current: value}), useCallback: callback => callback, useEffect: () => {}},
        d: {useState: () => [null, () => {}], useRef: value => ({current: value}), useCallback: callback => callback, useEffect: () => {}},
        setInterval: () => 0,
        clearInterval: () => {},
        random: Math.random
    });
    const engineName = engineStartName(source);
    vm.runInContext(`Math.random = () => random(); ${engine}; globalThis.createBattle = ${engineName};`, context, {timeout: 1000});
    return {context, createBattle: context.createBattle};
}

function engineStartName(source) {
    return source.indexOf('function m5e({fps:') >= 0 ? 'm5e' : 'sCe';
}

function replayOfficial(engine, snapshot, monsterId, random, battleOptions, overrides = {}) {
    engine.context.random = random;
    const player = overrides.player || hero.getProjectedStats(snapshot, hero.getCurrentAllocation(snapshot.account));
    const battle = engine.createBattle();
    battle.startBattle({
        ...player,
        critRateBonus: snapshot.battleStatus.critRateBonus,
        critDmgBonus: snapshot.battleStatus.critDmgBonus,
        skills: {...player.skills, preemptiveAttack: player.skills.preemptive_attack, defenseBreak: player.skills.defense_break},
        rebornSkillLevels: player.rebornSkills
    }, overrides.monster || hero.getMonster(snapshot, monsterId), battleOptions.skipTheft, battleOptions.witchWeakened, battleOptions.skipSuppress);
    let ticks = 0;
    for (let steps = 0; steps < 1000000; steps += 1) {
        const state = battle.getBattle();
        if (state.phase === 'victory' || state.phase === 'defeat' || state.phase === 'escaped') return {victory: state.phase === 'victory', currentHp: state.playerHp, monsterRemainingHp: state.monsterHp, elapsedSeconds: ticks / 10, ...(overrides.monster ? {escaped: state.phase === 'escaped'} : {})};
        if (state.phase === 'suppress_prompt') {
            if (battleOptions.automatonSuppressed) battle.suppressAccept();
            else battle.suppressRefuse();
        } else if (state.phase === 'fighting') {
            if (ticks >= 200000) return {victory: false, currentHp: state.playerHp, monsterRemainingHp: state.monsterHp, elapsedSeconds: ticks / 10};
            ticks += 1;
            battle.tickBattle();
        } else if (state.phase === 'player_turn') {
            if (battleOptions.useActiveSkill !== false && !state.activeSkillUsed && state.activeSkillKey) battle.useActiveSkill();
            else if (monsterId === 'witch_clone' && (state.attackDisabledTurns > 0 || state.confusionTurns > 0 || state.breathHoldCharges === 0 && state.breathSealedTurns === 0 && state.playerHp < state.playerMaxHp * 0.35)) battle.playerBreathHold();
            else battle.playerAttack();
        } else if (state.phase === 'monster_acted') battle.continueBattle();
        else if (state.phase === 'theft_prompt') battle.refuseTheft();
        else if (state.phase === 'climax_prompt') battle.climaxAccept();
        else if (state.phase === 'climax_result') battle.climaxContinue();
        else throw new Error(`未识别的官方状态：${state.phase}`);
    }
    throw new Error('官方引擎超过审计步数限制');
}

function createSnapshot(monsterId, rebornSkillKey, activeSkillKey, level) {
    const catalog = hero.FOREST_MONSTER_CATALOG.find(monster => monster.id === monsterId);
    const definition = hero.MONSTERS[monsterId];
    const stats = Object.fromEntries(['hp', 'atk', 'def', 'spd'].map(key => [key, Math.round(catalog[key] * level)]));
    return hero.createSnapshot({
        account: {statPoints: 0, hpBonus: 0, attackBonus: 0, defenseBonus: 0, speedBonus: 0, rebornType: 'M', rebornMode: 'faith', faithLevel: 500, equippedActiveSkill: activeSkillKey, equippedRebornSkill: rebornSkillKey},
        battleStatus: {
            currentHp: 10000, maxHp: 10000, attack: 5000, defense: 3000, speed: 2000, critRateBonus: 0.1, critDmgBonus: 0.5, battleCount: 0,
            [`${definition.prefix}Level`]: level, [`${definition.prefix}Stats`]: stats, [`${definition.prefix}CurrentHp`]: stats.hp, [`${definition.prefix}MaxHp`]: stats.hp
        },
        skills: ['dodge', 'crit', 'shield', 'drain', 'weaken', 'speed', 'preemptive_attack', 'defense_break'].map(skillKey => ({skillKey, level: 10})),
        rebornSkills: {skills: [{skillKey: 'star_curse', level: 9}, {skillKey: 'blood_pact', level: 7}]}
    });
}

function main() {
    const sourcePath = process.argv[2];
    if (!sourcePath) throw new Error('用法：node scripts/audit-forest-model.cjs <官方前端 JS 文件>');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const engine = loadOfficialEngine(source);
    const mismatches = [];
    let cases = 0;
    for (const monsterId of hero.MONSTER_REGIONS.forest.monsterIds) {
        for (const rebornSkillKey of ['star_curse', 'blood_pact']) {
            for (const activeSkillKey of Object.keys(hero.ACTIVE_SKILLS)) {
                for (const level of [20, 100, 300]) {
                    for (const suppressed of monsterId === 'automaton' ? [false, true] : [false]) {
                        for (let seed = 1; seed <= 8; seed += 1) {
                            const snapshot = createSnapshot(monsterId, rebornSkillKey, activeSkillKey, level);
                            const battleOptions = {automatonSuppressed: suppressed};
                            const official = replayOfficial(engine, snapshot, monsterId, createRandom(seed), battleOptions);
                            const result = hero.simulateBattle(snapshot, monsterId, {random: createRandom(seed), battleOptions});
                            cases += 1;
                            if (Object.entries(official).some(([key, value]) => Math.abs(Number(result[key]) - Number(value)) > 1e-7)) {
                                mismatches.push({monsterId, rebornSkillKey, activeSkillKey, level, suppressed, seed, official, local: Object.fromEntries(Object.keys(official).map(key => [key, result[key]]))});
                            }
                        }
                    }
                }
            }
        }
    }
    console.log(JSON.stringify({sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), cases, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 12)}, null, 2));
    if (mismatches.length > 0) process.exitCode = 1;
}

if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {loadOfficialEngine, replayOfficial, createRandom, createSnapshot};
