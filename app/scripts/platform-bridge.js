(function initPlatformBridge(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SlimePlatformBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlatformBridge() {
    'use strict';

    function resolveCapacitorPlugin(root, name) {
        return root?.Capacitor?.Plugins?.[name] || root?.[name] || null;
    }

    function getAndroidNetworkPlugins(root) {
        if (root?.Capacitor?.getPlatform?.() !== 'android') return null;

        const http = resolveCapacitorPlugin(root, 'CapacitorHttp');
        if (typeof http?.request !== 'function') return null;

        return {
            http,
            cookies: resolveCapacitorPlugin(root, 'CapacitorCookies')
        };
    }

    return {resolveCapacitorPlugin, getAndroidNetworkPlugins};
});
