const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const envName = '.env.slime-race.local';
const envPath = path.join(projectRoot, envName);
const expectedPrivateRemote = 'https://github.com/Caicz/slime-race-lab-online.git';
const expectedPackagedFiles = ['app/**/*', 'electron/**/*', 'package.json'];
const networkFiles = ['electron/main.cjs', 'electron/preload.cjs', 'app/scripts/remote-actions.js', 'app/scripts/daily-quest.js', 'app/scripts/remote.js', 'scripts/run-timer-error-check.cjs'];

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function checkPrivateRemote(violations) {
    if (!fs.existsSync(path.join(projectRoot, '.git'))) return;

    try {
        const remotes = execFileSync('git', ['remote'], {cwd: projectRoot, encoding: 'utf8'}).trim().split(/\s+/).filter(Boolean);

        remotes.forEach(remote => {
            const urls = execFileSync('git', ['remote', 'get-url', '--all', remote], {cwd: projectRoot, encoding: 'utf8'})
                .trim().split(/\r?\n/).filter(Boolean);
            if (remote !== 'origin' || urls.some(url => url !== expectedPrivateRemote)) {
                violations.push(`联网版只允许指定私有远程：${remote}`);
            }
        });
    } catch (error) {
        violations.push(`无法检查 Git 远程：${String(error.message || error)}`);
    }
}

function checkNetworkCode(violations) {
    const content = networkFiles.map(relativePath => read(relativePath)).join('\n');
    const index = read('app/index.html');
    const renderer = read('app/scripts/remote.js');
    const preload = read('electron/preload.cjs');
    const forbiddenMutations = /\/api\/slime-race\/(?:claim(?!-reward)|reset|admin|start|witch-bonus)(?:[/'"`-]|$)/i;
    const sensitiveLogging = /console\.(?:log|info|warn|error)\([^\n]*(?:password|cookie|token)/i;

    if (forbiddenMutations.test(content)) violations.push('联网代码禁止包含自动领奖、开赛、奖金注入、重置或管理接口');
    if (!content.includes('/api/slime-race/bet')) violations.push('联网版必须只通过固定赌马下注接口提交用户确认的下注');
    if (!content.includes('/api/slime-race/claim-reward')) violations.push('联网版必须只通过固定赌马奖励接口领取用户确认的奖励');
    if (!content.includes("syncRemote('bet')") || !content.includes('getSnapshotEndpointNames') || !content.includes('MAX_RECOMMENDATION_AGE_MS')) violations.push('一键下注必须使用可复用的轻量快照，并继续在提交前重新校验');
    if (!index.includes('确认远程下注')) violations.push('远程下注必须保留第二次确认界面');
    if (!content.includes('/api/quest/submit') || !content.includes('/api/quest/click-complete')) violations.push('日常自动化必须通过固定任务接口提交');
    if (!content.includes('autoSubmitDailyRecite')) violations.push('自动复述必须在远程层读取并提交同一份最新题目');
    if (!content.includes('/api/timer-game/submit')) violations.push('自动报时必须通过固定报时接口提交');
    if (!content.includes('createRandomTimerSubmission') || !content.includes('slime-remote:daily-timer-error-test') || !index.includes('随机误差测试（±0.20 秒）')) violations.push('报时必须提供显式的正负 0.20 秒随机误差测试');
    if (content.includes('/api/dodge-game/submit')) violations.push('本版本禁止修改或自动提交躲避游戏成绩');
    if (!content.includes('/api/dodge-game/claim') || !content.includes('/api/timer-game/claim')) violations.push('日常助手必须只通过固定小游戏接口领取已完成奖励');
    if (!index.includes('自动复述一次') || !index.includes('自动完成 100 次') || !index.includes('自动报时 60.00 秒')) violations.push('日常助手必须提供三项显式的单次自动化操作');
    if (!index.includes('remoteAutoSyncToggle') || !content.includes('isAutoSyncPaused')) violations.push('实时数据必须提供开关，并在日常任务或下注操作期间暂停自动更新');
    if (!content.includes('readLocalCredentials') || !content.includes('slime-remote:auto-login')) violations.push('本地 Electron 版必须通过主进程环境文件自动登录');
    if (!preload.includes('autoLogin') || !index.includes('退出当前账号')) violations.push('自动登录必须保留显式登出入口');
    if (/SLIME_RACE_(?:USERNAME|PASSWORD)/.test(renderer + preload)) violations.push('账号密码环境变量禁止暴露给渲染层或 preload');
    if (!index.includes('每次领取前都会再次读取进度并要求确认')) violations.push('小游戏奖励必须保留领取确认提示');
    if (sensitiveLogging.test(content)) violations.push('联网代码禁止记录密码、Cookie 或 Token');
    if (!content.includes('https://zouzou-princess-fan.replit.app')) violations.push('联网代码必须固定允许的目标站点');
    if (!read('app/index.html').includes("connect-src 'none'")) violations.push('渲染层 CSP 必须继续禁止直接网络连接');
}

function checkBoundary() {
    const violations = [];
    const packageJson = JSON.parse(read('package.json'));
    const capacitorConfig = JSON.parse(read('capacitor.config.json'));
    const gitignore = read('.gitignore').split(/\r?\n/);
    const gradle = read('android/app/build.gradle');
    const manifest = read('android/app/src/main/AndroidManifest.xml');

    if (packageJson.name !== 'slime-race-lab-online') violations.push('package.json: npm 名称必须使用联网版标识');
    if (packageJson.build?.appId !== 'com.marisa.slimeracelab.online') violations.push('package.json: Electron appId 必须使用 .online');
    if (capacitorConfig.appId !== 'com.marisa.slimeracelab.online') violations.push('capacitor.config.json: Capacitor appId 必须使用 .online');
    if (!gradle.includes('applicationId "com.marisa.slimeracelab.online"')) violations.push('Android applicationId 必须使用 .online');
    if (!manifest.includes('android.permission.INTERNET')) violations.push('联网版 Android 清单必须声明 INTERNET 权限');
    if (!gitignore.includes(envName)) violations.push(`${envName} 必须加入 .gitignore`);
    if (JSON.stringify(packageJson.build?.files || []) !== JSON.stringify(expectedPackagedFiles)) {
        violations.push('package.json: 打包白名单不得包含脚本、环境文件或开发配置');
    }

    if (fs.existsSync(envPath) && process.platform !== 'win32') {
        const mode = fs.statSync(envPath).mode & 0o777;
        if (mode !== 0o600) violations.push(`${envName} 权限必须为 600，当前为 ${mode.toString(8)}`);
    }

    if (fs.existsSync(path.join(projectRoot, '.git'))) {
        const trackedEnv = execFileSync('git', ['ls-files', envName], {cwd: projectRoot, encoding: 'utf8'}).trim();
        if (trackedEnv) violations.push(`${envName} 禁止被 Git 跟踪`);
    }

    checkNetworkCode(violations);
    checkPrivateRemote(violations);

    if (violations.length > 0) {
        console.error(`联网版边界检查失败：\n${violations.map(item => `- ${item}`).join('\n')}`);
        process.exitCode = 1;
        return;
    }

    console.log('联网版边界检查通过：所有者日常自动化使用固定接口，躲避成绩未自动提交，凭据未打包，Git 远程仅允许指定私有仓库。');
}

checkBoundary();
