const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

test('战斗面板在未登录时正确接线，Android 适配器初始化不会发起请求', async () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'app/styles.css'), 'utf8');
    const activity = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/marisa/slimeracelab/online/MainActivity.java'), 'utf8');
    const capacitorConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
    assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.combat-content-grid \{\s*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(activity, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), true\)/);
    assert.equal(capacitorConfig.android.adjustMarginsForEdgeToEdge, 'auto');
    const nodes = new Map();
    function createElement() {
        return {children: [], listeners: new Map(), value: '', checked: false, textContent: '', disabled: false, classList: {add() {}, remove() {}},
            get options() { return this.children.flatMap(child => child.children.length ? child.children : [child]); },
            addEventListener(name, listener) { this.listeners.set(name, listener); },
            append(...children) { this.children.push(...children); },
            replaceChildren(...children) { this.children = children; },
            setAttribute() {}, querySelectorAll() { return []; }};
    }
    for (const match of html.matchAll(/\sid="([^"]+)"/g)) {
        assert.ok(!nodes.has(match[1]), `Duplicate element ID ${match[1]}`);
        nodes.set(match[1], createElement());
    }
    const storage = new Map();
    let requests = 0;
    const context = vm.createContext({
        document: {activeElement: null, createElement, querySelector(selector) { const node = nodes.get(selector.slice(1)); assert.ok(node, `Missing element ${selector}`); return node; }},
        localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
        setTimeout, clearTimeout,
        SlimePlatformBridge: {getAndroidNetworkPlugins: () => ({http: {request() { requests += 1; throw new Error('Unexpected network request'); }}, cookies: {}})}
    });
    context.window = context;
    context.addEventListener = () => {};
    for (const script of ['remote-data', 'remote-actions', 'daily-quest', 'hero-automation', 'combat-content', 'combat-workflow', 'bet-ledger', 'request-policy', 'remote']) {
        assert.ok(html.indexOf(`scripts/${script}.js`) >= 0);
        vm.runInContext(fs.readFileSync(path.join(root, `app/scripts/${script}.js`), 'utf8'), context, {filename: script, timeout: 2000});
    }
    assert.ok(html.indexOf('scripts/hero-automation.js') < html.indexOf('scripts/combat-workflow.js'));
    assert.ok(html.indexOf('scripts/combat-workflow.js') < html.indexOf('scripts/remote.js'));
    await nodes.get('heroMonsterSelect').listeners.get('change')();
    for (const id of ['combatContentRefreshButton', 'combatEquipmentApplyButton', 'combatAccessoryEnhanceButton', 'combatTowerStartButton', 'combatDungeonStartButton', 'combatDungeonChestButton', 'combatDungeonAbandonButton', 'combatStopButton']) {
        assert.equal(typeof nodes.get(id).listeners.get('click'), 'function', id);
        await nodes.get(id).listeners.get('click')();
    }
    assert.equal(requests, 0);
});
