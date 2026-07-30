(function startRemoteSync() {
    'use strict';

    const TARGET_ORIGIN = 'https://zouzou-princess-fan.replit.app';
    const remoteData = globalThis.SlimeRemoteData;
    const remoteActions = globalThis.SlimeRemoteActions;
    const endpointPaths = Object.freeze({
        current: '/api/slime-race/current',
        racers: '/api/slime-race/racers',
        bets: '/api/slime-race/bets',
        pendingRewards: '/api/slime-race/pending-rewards',
        account: '/api/auth/me',
        sessions: '/api/slime-race/sessions',
        myBets: '/api/slime-race/my-bets',
        myStats: '/api/slime-race/my-stats'
    });
    const liveEndpoints = Object.freeze(['current', 'racers', 'bets', 'pendingRewards', 'account']);
    const fullEndpoints = Object.freeze([...liveEndpoints, 'sessions', 'myBets', 'myStats']);
    const racerNames = Object.freeze({melon: '迷你哈密瓜', blueberry: '迷你蓝莓', dragonfruit: '迷你火龙果', lemon: '迷你柠檬'});
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
        account: document.querySelector('#remoteAccountStatus'),
        balance: document.querySelector('#remoteBalanceStatus'),
        reward: document.querySelector('#remoteRewardStatus'),
        actions: document.querySelector('#remoteActions'),
        betRacer: document.querySelector('#remoteBetRacer'),
        betAmount: document.querySelector('#remoteBetAmount'),
        betReview: document.querySelector('#remoteBetReviewButton'),
        betConfirm: document.querySelector('#remoteBetConfirm'),
        betConfirmText: document.querySelector('#remoteBetConfirmText'),
        betCancel: document.querySelector('#remoteBetCancelButton'),
        betSubmit: document.querySelector('#remoteBetSubmitButton'),
        betStatus: document.querySelector('#remoteBetStatus'),
        rewardSummary: document.querySelector('#remoteRewardSummary'),
        rewardList: document.querySelector('#remoteRewardList'),
        claimStatus: document.querySelector('#remoteClaimStatus')
    };
    let authenticated = false;
    let syncing = false;
    let mutating = false;
    let liveTicks = 0;
    let timer = null;
    let latestSnapshot = null;
    let pendingBet = null;

    function formatChips(value) {
        return Math.round(Number(value) || 0).toLocaleString('zh-CN');
    }

    function setStatus(element, message, type = '') {
        element.textContent = message;
        element.className = `form-status${type ? ` ${type}` : ''}`;
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
                headers: options.headers || {
                    Accept: 'application/json',
                    ...(options.data ? {'Content-Type': 'application/json'} : {})
                },
                data: options.data,
                connectTimeout: 10000,
                readTimeout: 10000
            });

            if (response.status < 200 || response.status >= 300) {
                const message = String(response.data?.message || response.data?.error || `请求失败，HTTP ${response.status}`).slice(0, 240);
                throw new Error(message);
            }
            return response.data;
        }

        async function fetchSnapshot(mode) {
            const normalizedMode = mode === 'live' ? 'live' : 'full';
            const endpoints = normalizedMode === 'live' ? liveEndpoints : fullEndpoints;
            const values = await Promise.all(endpoints.map(name => request(endpointPaths[name])));
            const raw = Object.fromEntries(endpoints.map((name, index) => [name, values[index]]));

            return remoteData.normalizeSnapshot({...raw, mode: normalizedMode});
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
            async placeBet(intent) {
                const preflight = await fetchSnapshot('live');
                const validated = remoteActions.validateBetIntent(preflight, intent);
                await request('/api/slime-race/bet', {method: 'POST', data: {slimeId: validated.slimeId, amount: validated.amount}});
                return fetchSnapshot('full');
            },
            async claimReward(rewardId) {
                const preflight = await fetchSnapshot('live');
                const reward = remoteActions.validateClaimIntent(preflight, rewardId);
                await request('/api/slime-race/claim-reward', {method: 'POST', data: {rewardId: reward.rewardId}});
                return fetchSnapshot('full');
            },
            async logout() {
                await cookies?.clearAllCookies?.();
            }
        };
    }

    function getAdapter() {
        return getElectronAdapter() || getAndroidAdapter();
    }

    function renderRewards(snapshot) {
        elements.rewardList.replaceChildren();
        elements.rewardSummary.textContent = snapshot.pendingRewards.length > 0
            ? `${snapshot.pendingRewards.length} 笔，共 ${formatChips(snapshot.pendingRewardTotal)} 碎片`
            : '暂无可领取碎片';

        if (snapshot.pendingRewards.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = '当前没有待领取的比赛奖励。';
            elements.rewardList.append(empty);
            return;
        }

        snapshot.pendingRewards.forEach(reward => {
            const row = document.createElement('div');
            const amount = document.createElement('strong');
            const button = document.createElement('button');
            amount.textContent = `✨ ${formatChips(reward.amount)} 魔法碎片`;
            button.type = 'button';
            button.className = 'secondary-button';
            button.textContent = '领取';
            button.disabled = mutating;
            button.addEventListener('click', () => claimReward(reward));
            row.append(amount, button);
            elements.rewardList.append(row);
        });
    }

    function updateSnapshot(snapshot) {
        latestSnapshot = snapshot;
        const raceStatus = snapshot.current?.status || '未知';
        const phaseText = snapshot.pool?.phase === 'unbound' ? '下一场开放池' : snapshot.pool?.phase === 'bound' ? `第 ${snapshot.pool.sessionId} 场` : '盘口';

        elements.race.textContent = snapshot.current ? `第 ${snapshot.current.sessionId} 场 · ${raceStatus}` : '未取得比赛状态';
        elements.pool.textContent = `${phaseText} · ${formatChips(snapshot.pool?.total)} 碎片`;
        elements.balance.textContent = snapshot.account ? `${formatChips(snapshot.account.magicFragments)} 碎片` : '账户信息不可用';
        elements.reward.textContent = snapshot.pendingRewards.length > 0
            ? `${snapshot.pendingRewards.length} 笔 · ${formatChips(snapshot.pendingRewardTotal)} 碎片`
            : '暂无待领取';
        renderRewards(snapshot);
        if (snapshot.mode === 'full') {
            elements.history.textContent = `最近 ${snapshot.sessions.length} 场已同步`;
            elements.account.textContent = snapshot.myStats
                ? `${snapshot.myStats.totalBets} 次下注 · 净收益 ${formatChips(snapshot.myStats.netProfit)}`
                : '个人统计不可用';
        }

        window.dispatchEvent(new CustomEvent('slime-race-remote-snapshot', {detail: snapshot}));
        setStatus(elements.status, `已同步 · ${new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN', {hour12: false})}`, 'success');
    }

    async function sync(mode = 'live') {
        if (!authenticated || syncing || mutating) return;
        const adapter = getAdapter();

        if (!adapter) return;
        syncing = true;
        elements.syncButton.disabled = true;

        try {
            updateSnapshot(await adapter.sync(mode));
        } catch (error) {
            setStatus(elements.status, String(error.message || error), 'error');
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

    function reviewBet() {
        try {
            pendingBet = remoteActions.validateBetIntent(latestSnapshot, {
                racerId: elements.betRacer.value,
                amount: elements.betAmount.value
            });
            elements.betConfirmText.textContent = `将向${racerNames[pendingBet.racerId]}下注 ${formatChips(pendingBet.amount)} 碎片。提交后不可撤回，是否确认？`;
            elements.betConfirm.hidden = false;
            setStatus(elements.betStatus, '请再次核对史莱姆和碎片数量。');
        } catch (error) {
            pendingBet = null;
            elements.betConfirm.hidden = true;
            setStatus(elements.betStatus, String(error.message || error), 'error');
        }
    }

    function cancelBetReview() {
        pendingBet = null;
        elements.betConfirm.hidden = true;
        setStatus(elements.betStatus, '已取消，未提交任何下注。');
    }

    async function submitBet() {
        if (!pendingBet || mutating) return;
        const adapter = getAdapter();
        if (!adapter) return;
        mutating = true;
        elements.betSubmit.disabled = true;
        elements.betReview.disabled = true;
        setStatus(elements.betStatus, '正在重新校验盘口并提交，请勿重复点击…');

        try {
            const submitted = {...pendingBet};
            updateSnapshot(await adapter.placeBet(submitted));
            pendingBet = null;
            elements.betConfirm.hidden = true;
            elements.betAmount.value = '1';
            setStatus(elements.betStatus, `下注成功：${racerNames[submitted.racerId]} +${formatChips(submitted.amount)} 碎片。`, 'success');
        } catch (error) {
            setStatus(elements.betStatus, String(error.message || error), 'error');
            pendingBet = null;
            elements.betConfirm.hidden = true;
            try {
                updateSnapshot(await adapter.sync('full'));
            } catch {
                // Preserve the original mutation error when reconciliation is unavailable.
            }
        } finally {
            mutating = false;
            elements.betSubmit.disabled = false;
            elements.betReview.disabled = false;
            if (latestSnapshot) renderRewards(latestSnapshot);
        }
    }

    async function claimReward(reward) {
        if (mutating || !window.confirm(`确认领取 ${formatChips(reward.amount)} 魔法碎片吗？`)) return;
        const adapter = getAdapter();
        if (!adapter) return;
        mutating = true;
        setStatus(elements.claimStatus, '正在重新核对并领取奖励…');
        renderRewards(latestSnapshot);

        try {
            updateSnapshot(await adapter.claimReward(reward.rewardId));
            setStatus(elements.claimStatus, `已领取 ${formatChips(reward.amount)} 魔法碎片。`, 'success');
        } catch (error) {
            setStatus(elements.claimStatus, String(error.message || error), 'error');
            try {
                updateSnapshot(await adapter.sync('full'));
            } catch {
                // Preserve the original mutation error when reconciliation is unavailable.
            }
        } finally {
            mutating = false;
            if (latestSnapshot) renderRewards(latestSnapshot);
        }
    }

    async function login(event) {
        event.preventDefault();
        const adapter = getAdapter();

        if (!adapter) {
            setStatus(elements.status, '当前预览环境不提供联网桥接，请在 macOS、Windows 或 Android App 中使用。', 'error');
            return;
        }

        const username = elements.username.value.trim();
        const password = elements.password.value;
        if (!username || !password) {
            setStatus(elements.status, '请输入账号和密码。', 'error');
            return;
        }

        elements.loginButton.disabled = true;
        setStatus(elements.status, '正在登录并同步账户、盘口和奖励…');

        try {
            const snapshot = await adapter.login({username, password});
            elements.password.value = '';
            authenticated = true;
            elements.actions.hidden = false;
            elements.syncButton.hidden = false;
            elements.logoutButton.hidden = false;
            elements.username.disabled = true;
            elements.password.disabled = true;
            updateSnapshot(snapshot);
            startPolling();
        } catch (error) {
            elements.password.value = '';
            setStatus(elements.status, String(error.message || error), 'error');
        } finally {
            elements.loginButton.disabled = false;
        }
    }

    async function logout() {
        clearInterval(timer);
        timer = null;
        authenticated = false;
        latestSnapshot = null;
        pendingBet = null;

        try {
            await getAdapter()?.logout();
        } finally {
            elements.username.disabled = false;
            elements.password.disabled = false;
            elements.syncButton.hidden = true;
            elements.logoutButton.hidden = true;
            elements.actions.hidden = true;
            elements.betConfirm.hidden = true;
            elements.race.textContent = '未连接';
            elements.pool.textContent = '等待登录';
            elements.balance.textContent = '等待登录';
            elements.reward.textContent = '等待登录';
            elements.history.textContent = '等待登录';
            elements.account.textContent = '会话未建立';
            setStatus(elements.status, '已退出并清除本机会话。', 'success');
            window.dispatchEvent(new CustomEvent('slime-race-remote-disconnected'));
        }
    }

    elements.form.addEventListener('submit', login);
    elements.syncButton.addEventListener('click', () => sync('full'));
    elements.logoutButton.addEventListener('click', logout);
    elements.betReview.addEventListener('click', reviewBet);
    elements.betCancel.addEventListener('click', cancelBetReview);
    elements.betSubmit.addEventListener('click', submitBet);
    [elements.betRacer, elements.betAmount].forEach(input => input.addEventListener('change', () => {
        pendingBet = null;
        elements.betConfirm.hidden = true;
    }));
    window.addEventListener('beforeunload', () => clearInterval(timer));
})();
