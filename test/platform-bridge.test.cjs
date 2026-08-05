const test = require('node:test');
const assert = require('node:assert/strict');
const platformBridge = require('../app/scripts/platform-bridge.js');

test('resolves Android network plugins from the Capacitor registry', () => {
    const http = {request() {}};
    const cookies = {clearAllCookies() {}};
    const root = {
        Capacitor: {
            getPlatform: () => 'android',
            Plugins: {CapacitorHttp: http, CapacitorCookies: cookies}
        }
    };

    assert.deepEqual(platformBridge.getAndroidNetworkPlugins(root), {http, cookies});
});

test('supports standalone Capacitor plugin globals as a compatibility fallback', () => {
    const http = {request() {}};
    const cookies = {clearAllCookies() {}};
    const root = {
        Capacitor: {getPlatform: () => 'android'},
        CapacitorHttp: http,
        CapacitorCookies: cookies
    };

    assert.deepEqual(platformBridge.getAndroidNetworkPlugins(root), {http, cookies});
});

test('does not select the Android bridge on other platforms', () => {
    const root = {
        Capacitor: {
            getPlatform: () => 'web',
            Plugins: {CapacitorHttp: {request() {}}}
        }
    };

    assert.equal(platformBridge.getAndroidNetworkPlugins(root), null);
});

test('requires the Capacitor HTTP request method', () => {
    const root = {
        Capacitor: {
            getPlatform: () => 'android',
            Plugins: {CapacitorHttp: {}}
        }
    };

    assert.equal(platformBridge.getAndroidNetworkPlugins(root), null);
});

test('resolves Android background execution only when start and stop are available', () => {
    const backgroundExecution = {start() {}, stop() {}, delay() {}};
    const root = {
        Capacitor: {
            getPlatform: () => 'android',
            Plugins: {BackgroundExecution: backgroundExecution}
        }
    };

    assert.equal(platformBridge.isAndroidPlatform(root), true);
    assert.equal(platformBridge.getBackgroundExecutionPlugin(root), backgroundExecution);
    root.Capacitor.Plugins.BackgroundExecution = {start() {}};
    assert.equal(platformBridge.getBackgroundExecutionPlugin(root), null);
});
