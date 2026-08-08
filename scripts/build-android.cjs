const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';
const defaultJavaHome = process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
    : '';
const defaultAndroidHome = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Android', 'sdk')
    : path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const javaHome = [process.env.JAVA_HOME, defaultJavaHome].find(candidate => candidate && fs.existsSync(candidate));
const androidHome = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, defaultAndroidHome]
    .find(candidate => candidate && fs.existsSync(candidate));

if (!javaHome || !fs.existsSync(javaHome)) throw new Error('找不到 JDK。请安装 JDK 21 并设置 JAVA_HOME。');
if (!androidHome || !fs.existsSync(androidHome)) throw new Error('找不到 Android SDK。请设置 ANDROID_HOME 或 ANDROID_SDK_ROOT。');

const signingDirectory = path.join(projectRoot, '.local-android-sdk', 'signing');
const keystorePath = path.join(signingDirectory, 'slime-race-signing.jks');
const passwordPath = path.join(signingDirectory, 'password.txt');
const keyAlias = 'slime-race-lab';
fs.mkdirSync(signingDirectory, {recursive: true});

let password;
if (fs.existsSync(keystorePath) && fs.existsSync(passwordPath)) {
    password = fs.readFileSync(passwordPath, 'utf8').trim();
    if (!password) throw new Error('项目签名密码文件为空，无法复用现有 keystore。');
} else if (!fs.existsSync(keystorePath)) {
    password = fs.existsSync(passwordPath) ? fs.readFileSync(passwordPath, 'utf8').trim() : crypto.randomBytes(24).toString('base64url');
    if (!password) throw new Error('项目签名密码文件为空，无法生成 keystore。');
    fs.writeFileSync(passwordPath, `${password}\n`, {encoding: 'ascii', mode: 0o600});
    const keytool = path.join(javaHome, 'bin', isWindows ? 'keytool.exe' : 'keytool');
    const generated = spawnSync(keytool, [
        '-genkeypair', '-noprompt', '-storetype', 'JKS',
        '-keystore', keystorePath, '-storepass', password, '-keypass', password,
        '-alias', keyAlias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
        '-dname', 'CN=Slime Race Lab, OU=Online, O=Marisa, L=Shanghai, ST=Shanghai, C=CN'
    ], {stdio: 'inherit'});
    if (generated.status !== 0) throw new Error(`生成 Android 签名 keystore 失败：${generated.status}`);
} else {
    throw new Error('Android 签名 keystore 与密码文件不完整，请恢复 .local-android-sdk/signing 后重试。');
}

const gradle = isWindows ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradle, ['assembleRelease'], {
    cwd: path.join(projectRoot, 'android'),
    env: {
        ...process.env,
        JAVA_HOME: javaHome,
        ANDROID_HOME: androidHome,
        ANDROID_SDK_ROOT: androidHome,
        SLIME_RACE_SIGNING_STORE_FILE: keystorePath,
        SLIME_RACE_SIGNING_STORE_PASSWORD: password,
        SLIME_RACE_SIGNING_KEY_ALIAS: keyAlias,
        SLIME_RACE_SIGNING_KEY_PASSWORD: password
    },
    stdio: 'inherit',
    shell: isWindows
});
if (result.error) throw result.error;
if (result.status === 0) {
    const version = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;
    const source = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    const releaseDirectory = path.join(projectRoot, 'release');
    const destination = path.join(releaseDirectory, `slime-race-lab-online-${version}-android-release.apk`);
    fs.mkdirSync(releaseDirectory, {recursive: true});
    fs.copyFileSync(source, destination);
    console.log(`APK: ${destination}`);
}
process.exitCode = result.status || 0;
