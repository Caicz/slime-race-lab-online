const fs = require('node:fs');

function parseEnv(text) {
    const values = {};
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z0-9_]+)\s*[:=]\s*(.*)$/);
        if (!match) continue;
        values[match[1].toUpperCase()] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
    return values;
}

function getCookie(response) {
    const values = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    return values.map(value => value.split(';', 1)[0]).join('; ');
}

function pickAccount(data) {
    return {
        level: data?.level,
        statPoints: data?.statPoints,
        hpBonus: data?.hpBonus,
        attackBonus: data?.attackBonus,
        defenseBonus: data?.defenseBonus,
        speedBonus: data?.speedBonus,
        equippedActiveSkill: data?.equippedActiveSkill,
        equippedRebornSkill: data?.equippedRebornSkill,
        rebornType: data?.rebornType,
        faithRoute: data?.faithRoute,
        faithType: data?.faithType,
        faithFaction: data?.faithFaction,
        rebornMode: data?.rebornMode,
        faithLevel: data?.faithLevel,
        faithExp: data?.faithExp
    };
}

function pickBattleStatus(data) {
    const result = {
        currentHp: data?.currentHp,
        maxHp: data?.maxHp,
        attack: data?.attack,
        defense: data?.defense,
        speed: data?.speed,
        baseAttack: data?.baseAttack,
        baseDefense: data?.baseDefense,
        baseSpeed: data?.baseSpeed,
        battleCount: data?.battleCount
    };
    for (const prefix of ['slime', 'hilichurl', 'ruinGuard', 'familiar', 'debtCollector', 'fireflyMage']) {
        result[prefix] = {
            level: data?.[`${prefix}Level`],
            currentHp: data?.[`${prefix}CurrentHp`],
            maxHp: data?.[`${prefix}MaxHp`],
            stats: data?.[`${prefix}Stats`]
        };
    }
    result.angryBush = {
        level: data?.angryBushLevel,
        currentHp: data?.angryBushCurrentHp,
        maxHp: data?.angryBushMaxHp,
        stats: data?.angryBushStats,
        expReward: data?.angryBushExpReward,
        sweepLevel: data?.angryBushSweepLevel,
        droppedLevelCount: Array.isArray(data?.angryBushDroppedLevels) ? data.angryBushDroppedLevels.length : undefined
    };
    return result;
}

function pickSkills(data) {
    const skills = Array.isArray(data) ? data : Array.isArray(data?.skills) ? data.skills : [];
    return skills.map(skill => ({
        skillKey: skill?.skillKey,
        route: skill?.route,
        faithRoute: skill?.faithRoute,
        routeLabel: skill?.routeLabel,
        level: skill?.level,
        name: skill?.name,
        description: skill?.description,
        effects: skill?.effects
    }));
}

function pickBattleMonsters(data) {
    const prefixes = Object.keys(data || {})
        .filter(key => key.endsWith('Stats') && data[key] && typeof data[key] === 'object')
        .map(key => key.slice(0, -'Stats'.length))
        .filter(prefix => prefix && !['equipment', 'reborn'].includes(prefix))
        .sort();
    return Object.fromEntries(prefixes.map(prefix => [prefix, {
        level: data?.[`${prefix}Level`],
        currentHp: data?.[`${prefix}CurrentHp`],
        maxHp: data?.[`${prefix}MaxHp`],
        stats: data?.[`${prefix}Stats`],
        expReward: data?.[`${prefix}ExpReward`],
        sweepLevel: data?.[`${prefix}SweepLevel`],
        droppedLevelCount: Array.isArray(data?.[`${prefix}DroppedLevels`])
            ? data[`${prefix}DroppedLevels`].length
            : undefined
    }]));
}

function pickSkillSchema(data) {
    const skills = Array.isArray(data) ? data : Array.isArray(data?.skills) ? data.skills : [];
    return skills.map(skill => Object.fromEntries(Object.entries(skill || {}).filter(([, value]) => {
        return value === null || ['string', 'number', 'boolean'].includes(typeof value)
            || Array.isArray(value)
            || (value && typeof value === 'object');
    })));
}

function getContexts(source, marker, radius = 260, maximum = 3, skip = 0) {
    const contexts = [];
    let skipped = 0;
    let index = source.indexOf(marker);
    while (index >= 0 && contexts.length < maximum) {
        if (skipped < skip) {
            skipped += 1;
        } else {
            contexts.push(source.slice(Math.max(0, index - radius), Math.min(source.length, index + marker.length + radius)));
        }
        index = source.indexOf(marker, index + marker.length);
    }
    return contexts;
}

async function main() {
    const arguments = process.argv.slice(2);
    const snapshotOnly = arguments.includes('--snapshot-only');
    const schema = arguments.includes('--schema');
    const validateModel = arguments.includes('--validate-model');
    const verifyCurrentRebornEquip = arguments.includes('--verify-current-reborn-equip');
    const radiusArgument = arguments.find(argument => argument.startsWith('--radius='));
    const contextRadius = Math.max(80, Math.min(5000, Number(radiusArgument?.slice('--radius='.length)) || 2600));
    const maximumArgument = arguments.find(argument => argument.startsWith('--maximum='));
    const contextMaximum = Math.max(1, Math.min(20, Number(maximumArgument?.slice('--maximum='.length)) || 4));
    const skipArgument = arguments.find(argument => argument.startsWith('--skip='));
    const contextSkip = Math.max(0, Number(skipArgument?.slice('--skip='.length)) || 0);
    const requestedMarkers = arguments.filter(argument => !argument.startsWith('--'));
    const env = parseEnv(fs.readFileSync(require('node:path').join(__dirname, '..', '.env.slime-race.local'), 'utf8'));
    const base = new URL(env.SLIME_RACE_URL || 'https://zouzou-princess-fan-2.replit.app').origin;
    const username = env.SLIME_RACE_USERNAME || env.USERNAME;
    const password = env.SLIME_RACE_PASSWORD || env.PASSWORD;
    if (!username || !password) throw new Error('credential file is missing username or password');
    const login = await fetch(new URL('/api/auth/login', base), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({username, password})
    });
    console.log(`login=${login.status}`);
    if (!login.ok) process.exit(2);
    const cookie = getCookie(login);
    if (!cookie) throw new Error('login response did not include a session cookie');

    const responses = {};
    for (const endpoint of ['/api/auth/me', '/api/hero/battle-status', '/api/hero/skills', '/api/hero/reborn-skills']) {
        const response = await fetch(new URL(endpoint, base), {headers: {Accept: 'application/json', Cookie: cookie}});
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = {nonJson: true}; }
        console.log(`${endpoint}=${response.status}`);
        responses[endpoint] = data;
    }
    if (verifyCurrentRebornEquip) {
        const currentSkillKey = responses['/api/auth/me']?.equippedRebornSkill;
        if (!currentSkillKey) throw new Error('account does not currently have a reborn skill to verify');
        const equipResponse = await fetch(new URL('/api/hero/reborn-skills/equip', base), {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Accept: 'application/json', Cookie: cookie},
            body: JSON.stringify({skillKey: currentSkillKey})
        });
        console.log(`/api/hero/reborn-skills/equip=${equipResponse.status}`);
        if (!equipResponse.ok) throw new Error(`current reborn skill verification failed with ${equipResponse.status}`);
        const accountResponse = await fetch(new URL('/api/auth/me', base), {headers: {Accept: 'application/json', Cookie: cookie}});
        const account = await accountResponse.json();
        console.log(`equipVerification=${JSON.stringify({
            rebornType: account?.rebornType,
            rebornMode: account?.rebornMode,
            submittedSkillKey: currentSkillKey,
            equippedRebornSkill: account?.equippedRebornSkill,
            unchanged: account?.equippedRebornSkill === currentSkillKey
        })}`);
        if (account?.equippedRebornSkill !== currentSkillKey) throw new Error('server did not retain the submitted current reborn skill');
    }
    if (requestedMarkers.length === 0) {
        console.log(`account=${JSON.stringify(pickAccount(responses['/api/auth/me']))}`);
        console.log(`battleStatus=${JSON.stringify(pickBattleStatus(responses['/api/hero/battle-status']))}`);
        console.log(`skills=${JSON.stringify(pickSkills(responses['/api/hero/skills']))}`);
        console.log(`rebornSkills=${JSON.stringify(pickSkills(responses['/api/hero/reborn-skills']))}`);
    }
    if (schema) {
        const account = responses['/api/auth/me'] || {};
        const battleStatus = responses['/api/hero/battle-status'] || {};
        console.log(`accountBattleSchema=${JSON.stringify(Object.fromEntries(Object.entries(account)
            .filter(([key]) => /skill|reborn|faith|mode|route/i.test(key))))}`);
        console.log(`battleStatusKeys=${JSON.stringify(Object.keys(battleStatus).sort())}`);
        console.log(`battleMonsters=${JSON.stringify(pickBattleMonsters(battleStatus))}`);
        console.log(`skillSchema=${JSON.stringify(pickSkillSchema(responses['/api/hero/skills']))}`);
        console.log(`rebornSkillSchema=${JSON.stringify(pickSkillSchema(responses['/api/hero/reborn-skills']))}`);
    }
    if (validateModel) {
        const heroAutomation = require('../app/scripts/hero-automation.js');
        const snapshot = heroAutomation.createSnapshot({
            account: responses['/api/auth/me'],
            battleStatus: responses['/api/hero/battle-status'],
            skills: responses['/api/hero/skills'],
            rebornSkills: responses['/api/hero/reborn-skills']
        });
        heroAutomation.validateFaithRouteConsistency(snapshot);
        const models = Object.fromEntries(heroAutomation.MONSTER_IDS.map(monsterId => {
            const monster = heroAutomation.getMonster(snapshot, monsterId);
            return [monsterId, {
                prefix: heroAutomation.MONSTERS[monsterId].prefix,
                level: monster.level,
                hp: monster.hp,
                maxHp: monster.maxHp,
                atk: monster.atk,
                def: monster.def,
                spd: monster.spd,
                clientLevelField: monster.clientLevelField
            }];
        }));
        console.log(`validatedLocalModels=${JSON.stringify(models)}`);
    }
    if (snapshotOnly) return;

    const pageResponse = await fetch(new URL('/', base), {headers: {Accept: 'text/html', Cookie: cookie}});
    const html = await pageResponse.text();
    const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(match => match[1]);
    console.log(`page=${pageResponse.status},scripts=${JSON.stringify(sources)}`);
    const defaultMarkers = [
        'N.monsterId==="slime"',
        'N.monsterId==="hilichurl"',
        'N.monsterId==="ruin_guard"',
        'N.monsterId==="familiar"',
        'N.monsterId==="debt_collector"',
        'N.monsterId==="firefly_mage"',
        'monsterReviveCount',
        'monsterStealthed',
        'magneticFieldUsed',
        'forcedHug',
        'playerPoisoned',
        'pleasureValue',
        'surrenderEquipment',
        'submitEquipment',
        'equipmentSubmission',
        'switch-mode',
        'holy_judgment',
        'mirror_shield',
        'star_curse',
        'blood_pact'
    ];
    const markers = requestedMarkers.length > 0 ? requestedMarkers : defaultMarkers;
    for (const sourcePath of sources) {
        const sourceResponse = await fetch(new URL(sourcePath, base), {headers: {Cookie: cookie}});
        const source = await sourceResponse.text();
        console.log(`script=${sourcePath},status=${sourceResponse.status},bytes=${source.length}`);
        const relevantEndpoints = [...new Set([...source.matchAll(/\/api\/[A-Za-z0-9_?=&/.-]+/g)]
            .map(match => match[0])
            .filter(endpoint => /hero|reborn|rebirth/i.test(endpoint)))].sort();
        console.log(`relevantEndpoints=${JSON.stringify(relevantEndpoints)}`);
        for (const marker of markers) {
            const contexts = getContexts(
                source,
                marker,
                requestedMarkers.length > 0 ? contextRadius : 1200,
                requestedMarkers.length > 0 ? contextMaximum : 2,
                requestedMarkers.length > 0 ? contextSkip : 0
            );
            if (contexts.length > 0) console.log(`marker=${marker},contexts=${JSON.stringify(contexts)}`);
        }
    }
}

main().catch(error => {
    console.error(error.message || String(error));
    process.exitCode = 1;
});
