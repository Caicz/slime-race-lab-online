(function exposeNavigation(root) {
    'use strict';

    const STORAGE_KEY = 'slime-race-lab.app-view.v1';
    const aliases = Object.freeze({bet: 'betting', analysis: 'betting', simulator: 'simulator', daily: 'daily', hero: 'hero'});
    const views = new Set(['betting', 'daily', 'simulator', 'hero']);

    function normalize(value) {
        const key = String(value || '').replace(/^#/, '').trim().toLowerCase();
        const view = aliases[key] || key;
        return views.has(view) ? view : 'simulator';
    }

    function readInitialView() {
        const hash = root?.location?.hash;
        if (hash && views.has(normalize(hash))) return normalize(hash);
        try {
            return normalize(root?.localStorage?.getItem(STORAGE_KEY));
        } catch {
            return 'simulator';
        }
    }

    function setView(view, options = {}) {
        const selected = normalize(view);
        document.documentElement.dataset.appView = selected;
        document.querySelectorAll('[data-app-view-button]').forEach(button => {
            const active = normalize(button.dataset.appViewButton) === selected;
            button.toggleAttribute('aria-current', active);
            button.classList.toggle('active', active);
        });
        document.querySelectorAll('[data-app-view]').forEach(section => {
            if (section.dataset.appView === 'shared') return;
            section.hidden = section.dataset.appView !== selected;
        });
        try {
            root.localStorage.setItem(STORAGE_KEY, selected);
        } catch {
            // Local storage is optional in private or restricted browser contexts.
        }
        if (options.updateHash !== false && root.location.hash !== `#${selected}`) {
            root.history.replaceState(null, '', `#${selected}`);
        }
        root.dispatchEvent(new CustomEvent('slime-race:view-change', {detail: {view: selected}}));
        return selected;
    }

    function init() {
        document.querySelectorAll('[data-app-view-button]').forEach(button => {
            button.addEventListener('click', () => setView(button.dataset.appViewButton));
        });
        root.addEventListener('hashchange', () => setView(root.location.hash, {updateHash: false}));
        setView(readInitialView());
    }

    const api = Object.freeze({normalize, setView, init});
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SlimeRaceNavigation = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
        else init();
    }
})(typeof globalThis === 'object' ? globalThis : this);
