const fs = require('node:fs');
const path = require('node:path');
const raceArchive = require('../electron/race-archive.cjs');

const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env.slime-race.local');
const archiveDirectory = path.join(projectRoot, '.local-data', 'race-archive');
const targetOrigin = 'https://zouzou-princess-fan-2.replit.app';

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

function readCredentials() {
    const stat = fs.statSync(envPath);
    if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) throw new Error('本地凭据文件权限必须为 600');
    const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
    if (!env.SLIME_RACE_USERNAME || !env.SLIME_RACE_PASSWORD) throw new Error('本地凭据文件缺少账号或密码');

    let configuredOrigin;
    try {
        configuredOrigin = new URL(env.SLIME_RACE_URL || '').origin;
    } catch {
        throw new Error('本地凭据文件中的 SLIME_RACE_URL 无效');
    }
    if (configuredOrigin !== targetOrigin) throw new Error('本地凭据文件必须使用固定目标站点');
    return {username: env.SLIME_RACE_USERNAME, password: env.SLIME_RACE_PASSWORD};
}

function getSessionCookie(response) {
    const values = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    return values.map(value => value.split(';', 1)[0]).join('; ');
}

async function requestJson(endpoint, cookie) {
    const response = await fetch(new URL(endpoint, targetOrigin), {
        method: 'GET',
        headers: {Accept: 'application/json', Cookie: cookie},
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`${endpoint} 读取失败，HTTP ${response.status}`);
    return response.json();
}

async function main() {
    const credentials = readCredentials();
    const loginResponse = await fetch(new URL('/api/auth/login', targetOrigin), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify(credentials),
        signal: AbortSignal.timeout(10000)
    });
    if (!loginResponse.ok) throw new Error(`登录失败，HTTP ${loginResponse.status}`);
    const cookie = getSessionCookie(loginResponse);
    if (!cookie) throw new Error('登录成功但没有取得会话');

    const [sessions, racers] = await Promise.all([
        requestJson('/api/slime-race/sessions', cookie),
        requestJson('/api/slime-race/racers', cookie)
    ]);
    const result = await raceArchive.updateArchive(archiveDirectory, sessions, racers);
    console.log(`本地比赛档案已更新：新增 ${result.added} 场，刷新 ${result.refreshed} 场，累计 ${result.total} 场`);
    console.log(`重放校验：冠军 ${result.winnerMismatches} 场不一致，首圈最后一名 ${result.lap1LastMismatches} 场不一致，总时长 ${result.durationMismatches} 场不一致，未完成 ${result.incompleteReplays} 场`);
    console.log(`档案目录：${result.directory}`);
}

main().catch(error => {
    console.error(String(error.message || error));
    process.exitCode = 1;
});
