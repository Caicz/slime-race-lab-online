const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';
const defaultJavaHome = process.platform === 'darwin' ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : '';
const defaultAndroidHome = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Android', 'sdk')
    : path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const javaHome = [process.env.JAVA_HOME, defaultJavaHome].find(candidate => candidate && fs.existsSync(candidate));
const androidHome = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, defaultAndroidHome]
    .find(candidate => candidate && fs.existsSync(candidate));

if (!javaHome || !fs.existsSync(javaHome)) {
    throw new Error('找不到 JDK。请安装 JDK 21 并设置 JAVA_HOME。');
}

if (!androidHome || !fs.existsSync(androidHome)) {
    throw new Error('找不到 Android SDK。请安装 Android SDK 35 并设置 ANDROID_HOME。');
}

const result = spawnSync(isWindows ? 'gradlew.bat' : './gradlew', ['assembleDebug'], {
    cwd: path.join(projectRoot, 'android'),
    env: {...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome},
    stdio: 'inherit',
    shell: isWindows
});

if (result.error) {
    throw result.error;
}

process.exitCode = result.status || 0;
