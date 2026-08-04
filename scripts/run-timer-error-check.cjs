const fs = require('node:fs');
const path = require('node:path');
const dailyQuest = require('../app/scripts/daily-quest.js');

const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env.slime-race.local');
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
    const username = String(env.SLIME_RACE_USERNAME || '').trim();
    const password = String(env.SLIME_RACE_PASSWORD || '');
    let configuredOrigin;

    try {
        configuredOrigin = new URL(env.SLIME_RACE_URL || '').origin;
    } catch {
        throw new Error('本地凭据文件中的 SLIME_RACE_URL 无效');
    }

    if (configuredOrigin !== targetOrigin) throw new Error('本地凭据文件必须使用固定目标站点');
    if (!username || !password) throw new Error('本地凭据文件缺少账号或密码');
    return {username, password};
}

function getSessionCookie(response) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    return setCookies.map(value => value.split(';', 1)[0]).join('; ');
}

async function readJson(response) {
    const text = await response.text();

    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

async function main() {
    const credentials = readCredentials();
    const loginResponse = await fetch(new URL('/api/auth/login', targetOrigin), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify(credentials),
        signal: AbortSignal.timeout(10000)
    });
    const loginData = await readJson(loginResponse);

    if (!loginResponse.ok) throw new Error(String(loginData?.message || loginData?.error || `登录失败，HTTP ${loginResponse.status}`).slice(0, 240));
    const cookie = getSessionCookie(loginResponse);
    if (!cookie) throw new Error('登录成功但没有取得会话');

    const progressResponse = await fetch(new URL('/api/quest/progress', targetOrigin), {
        headers: {Accept: 'application/json', Cookie: cookie},
        signal: AbortSignal.timeout(10000)
    });
    const progress = await readJson(progressResponse);
    if (!progressResponse.ok) throw new Error(String(progress?.message || progress?.error || `读取进度失败，HTTP ${progressResponse.status}`).slice(0, 240));

    const state = dailyQuest.normalizeDailyQuest({progress});
    const payload = dailyQuest.createRandomTimerSubmission(state);
    const timerResponse = await fetch(new URL('/api/timer-game/submit', targetOrigin), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json', Cookie: cookie},
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
    });
    const timerData = await readJson(timerResponse);

    if (!timerResponse.ok) throw new Error(String(timerData?.message || timerData?.error || `报时测试失败，HTTP ${timerResponse.status}`).slice(0, 240));
    const result = dailyQuest.normalizeTimerSubmissionResult(timerData, payload.actualTime);
    console.log(`HTTP 状态：${timerResponse.status}`);
    console.log(`提交报时：${result.actualTime.toFixed(2)} 秒`);
    console.log(`绝对误差：${result.absoluteError.toFixed(2)} 秒`);
    console.log(`服务端判定：${result.isSuccess ? '通过' : '未通过'}`);
    console.log(`服务端误差：${result.diff === null ? '未返回' : `${result.diff.toFixed(3)} 秒`}`);
    if (result.message) console.log(`服务端消息：${result.message}`);
}

main().catch(error => {
    console.error(String(error.message || error));
    process.exitCode = 1;
});
