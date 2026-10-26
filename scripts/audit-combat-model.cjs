const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const hero = require('../app/scripts/hero-automation.js');
const workflow = require('../app/scripts/combat-workflow.js');
const {loadOfficialEngine, replayOfficial, createRandom, createSnapshot} = require('./audit-forest-model.cjs');

function main() {
    const sourcePath = process.argv[2];
    if (!sourcePath) throw new Error('用法：node scripts/audit-combat-model.cjs <官方前端 JS 文件>');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const engine = loadOfficialEngine(source);
    const sequenceStart = source.indexOf('function dh(t,r)');
    const sequenceEnd = source.indexOf('function MPe()', sequenceStart);
    if (sequenceStart < 0 || sequenceEnd < sequenceStart) throw new Error('官方塔序列结构发生变化');
    const context = vm.createContext({Op: ['slime', 'hilichurl', 'ruin_guard'], EPe: ['familiar', 'debt_collector', 'firefly_mage'], mu: {familiar: 'familiar', debt_collector: 'debt_collector', firefly_mage: 'firefly_mage', witch_clone: 'witch_clone'}});
    vm.runInContext(`${source.slice(sequenceStart, sequenceEnd)}; globalThis.sequence = FC;`, context, {timeout: 1000});
    for (let start = 1; start <= 96; start += 5) {
        for (let floor = start; floor < start + 5; floor += 1) {
            const expected = [...context.sequence(floor, start)];
            const actual = workflow.getTowerMonsterSequence(floor, start).map(monster => monster.id);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`塔 ${floor} 层怪物序列不一致`);
        }
    }
    const mismatches = [];
    let cases = 0;
    for (const id of ['slime', 'hilichurl', 'ruin_guard', 'familiar', 'debt_collector', 'firefly_mage', 'witch_clone', 'angry_bush', 'automaton', 'stone_golem', 'mushroom_maiden', 'meteor_swarm', 'golden_slime_dungeon']) {
        for (const skill of ['star_curse', 'blood_pact']) {
            for (const activeSkill of [null, 'shield', 'drain', 'weaken', 'speed']) {
                for (const level of [10, 100, 300]) {
                    for (let seed = 1; seed <= 8; seed += 1) {
                        const snapshot = createSnapshot('automaton', skill, activeSkill, 1);
                        const player = hero.getProjectedStats(snapshot, hero.getCurrentAllocation(snapshot.account));
                        const monster = workflow.createMonster(id, level, {fleeProbability: 0.1, ...(id === 'slime' ? {dodgeChance: 0.1} : {})});
                        const battleOptions = {slimeRevive: false, skipTheft: true, witchWeakened: true, skipSuppress: true, automatonSuppressed: false};
                        const officialMonster = {...monster, id: id === 'slime' ? 'slime_tower' : id};
                        const official = replayOfficial(engine, snapshot, id, createRandom(seed), battleOptions, {player, monster: officialMonster});
                        const result = hero.simulateBattle(snapshot, id, {player, monster, random: createRandom(seed), battleOptions});
                        cases += 1;
                        if (Object.entries(official).some(([key, value]) => Math.abs(Number(result[key]) - Number(value)) > 1e-7)) mismatches.push({id, skill, activeSkill, level, seed, official, local: Object.fromEntries(Object.keys(official).map(key => [key, result[key]]))});
                    }
                }
            }
        }
    }
    const byMonster = Object.fromEntries([...new Set(mismatches.map(item => item.id))].map(id => [id, mismatches.filter(item => item.id === id).length]));
    console.log(JSON.stringify({sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), towerSequenceCases: 100, cases, mismatchCount: mismatches.length, byMonster, mismatches: [...new Set(mismatches.map(item => item.id))].flatMap(id => mismatches.filter(item => item.id === id).slice(0, 2))}, null, 2));
    if (mismatches.length) process.exitCode = 1;
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
