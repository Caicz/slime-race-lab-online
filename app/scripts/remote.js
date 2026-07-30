(function startRemoteSync() {
    'use strict';

    const TARGET_ORIGIN = 'https://zouzou-princess-fan.replit.app';
    const remoteData = globalThis.SlimeRemoteData;
    const elements = {
        form: document.querySelector('#remoteLoginForm'),
        username: document.querySelector('#remoteUsername'),
        password: document.querySelector('#remotePassword'),
        loginButton: document.querySelector('#remoteLoginButton'),
        syncButton: document.querySelector('#remoteSyncButton'),
        logoutButton: document.querySelector('#remoteLogoutButton'),
        status: document.querySelector('#remoteStatus'),
        race: document.querySelector('#remoteRaceStatus'),
        pool: document.querySelector('#remotePoolStatus'),
        history: document.querySelector('#remoteHistoryStatus'),
        account: document.querySelector('#remoteAccountStatus')
    };
    let authenticated = false;
    let syncing = false;
    let liveTicks = 0;
    let timer = null;

    function formatChips(value) {
        return Math.round(Number(value) || 0).toLocaleString('zh-CN');
    }

    function setStatus(message, type = '') {
        elements.status.textContent = message;
        elements.status.className = `form-status${type ? ` ${type}` : ''}`;
    }

    function getElectronAdapter() {
        return globalThis.slimeRaceRemote || null;
    }

    function getAndroidAdapter() {
        const http = globalThis.CapacitorHttp;
        const cookies = globalThis.CapacitorCookies;

        if (!http || globalThis.Capacitor?.getPlatform?.() !== 'android') return null;

        async function request(endpoint, options = {}) {
            const response = await http.request({
                url: new URL(endpoint, TARGET_ORIGIN).href,
                method: options.method || 'GET',
                headers: options.headers || {Accept: 'application/json'},
                data: options.data,
                connectTimeout: 10000,
                readTimeout: 10000
            });

            if (response.status < 200 || response.status >= 300) throw new Error(`请求失败，HTTP ${response.status}`);
            return response.data;
        }

        async function fetchSnapshot(mode) {
            const endpoints = mode === 'live'
                ? ['current', 'racers', 'bets']
                : ['current', 'racers', 'bets', 'sessions', 'my-bets', 'my-stats'];
            const values = await Promise.all(endpoints.map(name => request(`/api/slime-race/${name}`)));
            const raw = Object.fromEntries(endpoints.map((name, index) => [name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), values[index]]));

            return remoteData.normalizeSnapshot({...raw, mode});
        }

        return {
            async login(credentials) {
                await cookies?.clearAllCookies?.();
                await request('/api/auth/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
                    data: credentials
                });
                return fetchSnapshot('full');
            },
            sync: fetchSnapshot,
            async logout() {
                await cookies?.clearAllCookies?.();
            }
        };
    }

    function getAdapter() {
        return getElectronAdapter() || getAndroidAdapter();
    }

    function updateSnapshot(snapshot) {
        const raceStatus = snapshot.current?.status || '未知';
        const phaseText = snapshot.pool?.phase === 'unbound' ? '下一场开放池' : snapshot.pool?.phase === 'bound' ? `第 ${snapshot.pool.sessionId} 场` : '盘口';

        elements.race.textContent = snapshot.current ? `第 ${snapshot.current.sessionId} 场 · ${raceStatus}` : '未取得比赛状态';
        elements.pool.textContent = `${phaseText} · ${formatChips(snapshot.pool?.total)} 筹码`;
        if (snapshot.mode === 'full') {
            elements.history.textContent = `最近 ${snapshot.sessions.length} 场已同步`;
            elements.account.textContent = snapshot.myStats
                ? `${snapshot.myStats.totalBets} 次下注 · 净收益 ${formatChips(snapshot.myStats.netProfit)}`
                : '个人统计不可用';
        }

        window.dispatchEvent(new CustomEvent('slime-race-remote-snapshot', {detail: snapshot}));
        setStatus(`已同步 · ${new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN', {hour12: false})}`, 'success');
    }

    async function sync(mode = 'live') {
        if (!authenticated || syncing) return;
        const adapter = getAdapter();

        if (!adapter) return;
        syncing = true;
        elements.syncButton.disabled = true;

        try {
            updateSnapshot(await adapter.sync(mode));
        } catch (error) {
            setStatus(String(error.message || error), 'error');
        } finally {
            syncing = false;
            elements.syncButton.disabled = false;
        }
    }

    function startPolling() {
        clearInterval(timer);
        liveTicks = 0;
        timer = setInterval(() => {
            if (document.hidden) return;
            liveTicks += 1;
            sync(liveTicks % 10 === 0 ? 'full' : 'live');
        }, 3000);
    }

    async function login(event) {
        event.preventDefault();
        const adapter = getAdapter();

        if (!adapter) {
            setStatus('当前预览环境不提供联网桥接，请在 macOS、Windows 或 Android App 中使用。', 'error');
            return;
        }

        const username = elements.username.value.trim();
        const password = elements.password.value;
        if (!username || !password) {
            setStatus('请输入账号和密码。', 'error');
            return;
        }

        elements.loginButton.disabled = true;
        setStatus('正在登录并读取只读数据…');

        try {
            const snapshot = await adapter.login({username, password});
            elements.password.value = '';
            authenticated = true;
            elements.syncButton.hidden = false;
            elements.logoutButton.hidden = false;
            elements.username.disabled = true;
            elements.password.disabled = true;
            updateSnapshot(snapshot);
            startPolling();
        } catch (error) {
            elements.password.value = '';
            setStatus(String(error.message || error), 'error');
        } finally {
            elements.loginButton.disabled = false;
        }
    }

    async function logout() {
        clearInterval(timer);
        timer = null;
        authenticated = false;

        try {
            await getAdapter()?.logout();
        } finally {
            elements.username.disabled = false;
            elements.password.disabled = false;
            elements.syncButton.hidden = true;
            elements.logoutButton.hidden = true;
            elements.race.textContent = '未连接';
            elements.pool.textContent = '等待登录';
            elements.history.textContent = '等待登录';
            elements.account.textContent = '会话未建立';
            setStatus('已退出并清除本机会话。', 'success');
            window.dispatchEvent(new CustomEvent('slime-race-remote-disconnected'));
        }
    }

    elements.form.addEventListener('submit', login);
    elements.syncButton.addEventListener('click', () => sync('full'));
    elements.logoutButton.addEventListener('click', logout);
    window.addEventListener('beforeunload', () => clearInterval(timer));
})();
