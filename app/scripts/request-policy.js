(function createRequestPolicy(root, factory) {
    'use strict';

    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SlimeRequestPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function requestPolicyFactory() {
    'use strict';

    const defaultRetryDelay = 1500;
    const minimumRetryDelay = 500;
    const maximumRetryDelay = 5000;

    function delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    function getHeaderValue(headers, name) {
        if (!headers) return '';
        if (typeof headers.get === 'function') return String(headers.get(name) || '');

        const expected = String(name).toLowerCase();
        const matched = Object.entries(headers).find(([key]) => key.toLowerCase() === expected);
        return matched ? String(matched[1] || '') : '';
    }

    function getRetryDelayMilliseconds(value, now = Date.now()) {
        const normalized = String(value || '').trim();
        let milliseconds = defaultRetryDelay;

        if (/^\d+(?:\.\d+)?$/.test(normalized)) {
            milliseconds = Number(normalized) * 1000;
        } else if (normalized) {
            const retryAt = Date.parse(normalized);
            if (Number.isFinite(retryAt)) milliseconds = retryAt - now;
        }

        if (!Number.isFinite(milliseconds)) milliseconds = defaultRetryDelay;
        return Math.min(maximumRetryDelay, Math.max(minimumRetryDelay, Math.round(milliseconds)));
    }

    async function mapSequential(items, mapper, interval = 200) {
        const values = [];

        for (let index = 0; index < items.length; index += 1) {
            if (index > 0) await delay(interval);
            values.push(await mapper(items[index], index));
        }
        return values;
    }

    return Object.freeze({delay, getHeaderValue, getRetryDelayMilliseconds, mapSequential});
});
