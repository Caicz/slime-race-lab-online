const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const envName = '.env.slime-race.local';
const envPath = path.join(projectRoot, envName);
const expectedPackagedFiles = ['app/**/*', 'electron/**/*', 'package.json'];
const networkFiles = ['electron/main.cjs', 'electron/preload.cjs', 'app/scripts/remote.js'];

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function checkNoRemote(violations) {
    if (!fs.existsSync(path.join(projectRoot, '.git'))) return;

    try {
        const remotes = execFileSync('git', ['remote'], {cwd: projectRoot, encoding: 'utf8'}).trim();
        if (remotes) violations.push(`联网版禁止配置 Git 远程：${remotes}`);
    } catch (error) {
        violations.push(`无法检查 Git 远程：${String(error.message || error)}`);
    }
}

function checkNetworkCode(violations) {
    const content = networkFiles.map(relativePath => read(relativePath)).join('\n');
    const forbiddenMutations = /\/api\/slime-race\/(?:bet|claim|reset|admin)(?:[/'"`]|$)/i;
    const sensitiveLogging = /console\.(?:log|info|warn|error)\([^\n]*(?:password|cookie|token)/i;

    if (forbiddenMutations.test(content)) violations.push('联网代码禁止包含下注、领奖、重置或管理接口');
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
    checkNoRemote(violations);

    if (violations.length > 0) {
        console.error(`联网版边界检查失败：\n${violations.map(item => `- ${item}`).join('\n')}`);
        process.exitCode = 1;
        return;
    }

    console.log('联网版边界检查通过：应用标识独立，凭据未打包，Android 网络权限存在，Git 无远程。');
}

checkBoundary();
