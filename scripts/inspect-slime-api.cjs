const fs = require('node:fs');
const path = require('node:path');
const remoteData = require('../app/scripts/remote-data.js');
const dailyQuest = require('../app/scripts/daily-quest.js');

const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env.slime-race.local');
const outputPath = '/tmp/slime-race-api-inspection.json';
const endpoints = [
    {name: 'current', path: '/api/slime-race/current'},
    {name: 'racers', path: '/api/slime-race/racers'},
    {name: 'bets', path: '/api/slime-race/bets'},
    {name: 'pendingRewards', path: '/api/slime-race/pending-rewards'},
    {name: 'account', path: '/api/auth/me'},
    {name: 'sessions', path: '/api/slime-race/sessions'},
    {name: 'myBets', path: '/api/slime-race/my-bets'},
    {name: 'myStats', path: '/api/slime-race/my-stats'},
    {name: 'questProgress', path: '/api/quest/progress'},
    {name: 'questText', path: '/api/quest/text'}
];

function parseEnv(text) {
    const values = {};

    text.split(/\r?\n/).forEach(line => {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

        if (!match) return;
        let value = match[2].trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        values[match[1]] = value;
    });

    return values;
}

function describe(value, depth = 0) {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
        return {type: 'array', length: value.length, item: value.length > 0 && depth < 3 ? describe(value[0], depth + 1) : undefined};
    }
    if (typeof value !== 'object') return typeof value;
    if (depth >= 3) return {type: 'object', keys: Object.keys(value).sort()};

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, describe(item, depth + 1)]));
}

function getSessionCookie(response) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    return setCookies.map(value => value.split(';', 1)[0]).join('; ');
}

async function requestJson(baseUrl, endpoint, cookie) {
    const response = await fetch(new URL(endpoint, baseUrl), {
        method: 'GET',
        headers: {Accept: 'application/json', Cookie: cookie}
    });

    if (!response.ok) {
        return {status: response.status, data: null};
    }

    return {status: response.status, data: await response.json()};
}

async function main() {
    const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
    const required = ['SLIME_RACE_URL', 'SLIME_RACE_USERNAME', 'SLIME_RACE_PASSWORD'];

    if (required.some(key => !env[key])) {
        throw new Error('本地凭据文件缺少必需字段');
    }

    const baseUrl = new URL(env.SLIME_RACE_URL).origin;
    const loginResponse = await fetch(new URL('/api/auth/login', baseUrl), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({username: env.SLIME_RACE_USERNAME, password: env.SLIME_RACE_PASSWORD})
    });

    console.log(`login=${loginResponse.status}`);
    if (!loginResponse.ok) {
        throw new Error(`登录失败，HTTP ${loginResponse.status}`);
    }

    const cookie = getSessionCookie(loginResponse);
    if (!cookie) {
        throw new Error('登录成功但响应中没有会话 Cookie');
    }

    const snapshot = {};
    const raw = {};

    for (const endpoint of endpoints) {
        const result = await requestJson(baseUrl, endpoint.path, cookie);
        snapshot[endpoint.path] = {status: result.status, schema: result.data === null ? null : describe(result.data)};
        raw[endpoint.name] = result.data;
        console.log(`${endpoint.path}=${result.status}`);
        if (result.data !== null) console.log(JSON.stringify(describe(result.data)));
    }

    const normalized = remoteData.normalizeSnapshot({...raw, mode: 'full'});
    const normalizedDaily = dailyQuest.normalizeDailyQuest({progress: raw.questProgress, text: raw.questText});
    const normalizedText = JSON.stringify(normalized);
    if (/userId|betId/.test(normalizedText)) throw new Error('聚合结果意外保留了逐笔用户标识');
    console.log(`normalized=racers:${normalized.racers.length},pool:${normalized.pool.total},sessions:${normalized.sessions.length},myBets:${normalized.myBets.length}`);
    console.log(`daily=recite:${normalizedDaily.recite.completionCount},click:${normalizedDaily.click.completionCount},dodge-pending:${normalizedDaily.dodge.unclaimed},timer-pending:${normalizedDaily.timer.unclaimed}`);

    fs.writeFileSync(outputPath, JSON.stringify(snapshot), {encoding: 'utf8', mode: 0o600});
    fs.chmodSync(outputPath, 0o600);
    console.log(`snapshot=${outputPath}`);
}

main().catch(error => {
    console.error(String(error.message || error));
    process.exitCode = 1;
});
