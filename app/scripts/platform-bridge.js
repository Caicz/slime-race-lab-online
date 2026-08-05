(function initPlatformBridge(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SlimePlatformBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlatformBridge() {
    'use strict';

    function resolveCapacitorPlugin(root, name) {
        return root?.Capacitor?.Plugins?.[name] || root?.[name] || null;
    }

    function isAndroidPlatform(root) {
        return root?.Capacitor?.getPlatform?.() === 'android';
    }

    function getAndroidNetworkPlugins(root) {
        if (!isAndroidPlatform(root)) return null;

        const http = resolveCapacitorPlugin(root, 'CapacitorHttp');
        if (typeof http?.request !== 'function') return null;

        return {
            http,
            cookies: resolveCapacitorPlugin(root, 'CapacitorCookies')
        };
    }

    function getBackgroundExecutionPlugin(root) {
        if (!isAndroidPlatform(root)) return null;
        const plugin = resolveCapacitorPlugin(root, 'BackgroundExecution');
        return typeof plugin?.start === 'function' && typeof plugin?.stop === 'function' ? plugin : null;
    }

    return {resolveCapacitorPlugin, isAndroidPlatform, getAndroidNetworkPlugins, getBackgroundExecutionPlugin};
});
