(function startRemoteSync() {
    'use strict';

    const TARGET_ORIGIN = 'https://zouzou-princess-fan.replit.app';
    const remoteData = globalThis.SlimeRemoteData;
    const remoteActions = globalThis.SlimeRemoteActions;
    const dailyQuest = globalThis.SlimeDailyQuest;
    const requestPolicy = globalThis.SlimeRequestPolicy;
    const platformBridge = globalThis.SlimePlatformBridge;
    const MAX_RECOMMENDATION_AGE_MS = 5000;
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
    const racerNames = Object.freeze({melon: '迷你哈密瓜', blueberry: '迷你蓝莓', dragonfruit: '迷你火龙果', lemon: '迷你柠檬'});
    const elements = {
        form: document.querySelector('#remoteLoginForm'),
        username: document.querySelector('#remoteUsername'),
        password: document.querySelector('#remotePassword'),
        loginButton: document.querySelector('#remoteLoginButton'),
        syncButton: document.querySelector('#remoteSyncButton'),
        logoutButton: document.querySelector('#remoteLogoutButton'),
        autoSync: document.querySelector('#remoteAutoSyncToggle'),
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
        optimalBet: document.querySelector('#remoteOptimalBetButton'),
        betConfirm: document.querySelector('#remoteBetConfirm'),
        betConfirmText: document.querySelector('#remoteBetConfirmText'),
        betCancel: document.querySelector('#remoteBetCancelButton'),
        betSubmit: document.querySelector('#remoteBetSubmitButton'),
        betStatus: document.querySelector('#remoteBetStatus'),
        rewardSummary: document.querySelector('#remoteRewardSummary'),
        rewardList: document.querySelector('#remoteRewardList'),
        claimStatus: document.querySelector('#remoteClaimStatus'),
        dailyRefresh: document.querySelector('#dailyQuestRefreshButton'),
        dailyOpen: document.querySelector('#dailyQuestOpenButton'),
        dailyReciteProgress: document.querySelector('#dailyReciteProgress'),
        dailyClickProgress: document.querySelector('#dailyClickProgress'),
        dailyDodgeProgress: document.querySelector('#dailyDodgeProgress'),
        dailyTimerProgress: document.querySelector('#dailyTimerProgress'),
        dailyText: document.querySelector('#dailyQuestText'),
        dailyReciteInput: document.querySelector('#dailyReciteInput'),
        dailyReciteSubmit: document.querySelector('#dailyReciteSubmitButton'),
        dailyAutoRecite: document.querySelector('#dailyAutoReciteButton'),
        dailyClickButton: document.querySelector('#dailyClickButton'),
        dailyClickCount: document.querySelector('#dailyClickCount'),
        dailyClickBar: document.querySelector('#dailyClickBar'),
        dailyClickReset: document.querySelector('#dailyClickResetButton'),
        dailyAutoClick: document.querySelector('#dailyAutoClickButton'),
        dailyAutoTimer: document.querySelector('#dailyAutoTimerButton'),
        dailyTimerErrorTest: document.querySelector('#dailyTimerErrorTestButton'),
        dailyDodgeClaim: document.querySelector('#dailyDodgeClaimButton'),
        dailyTimerClaim: document.querySelector('#dailyTimerClaimButton'),
        dailyStatus: document.querySelector('#dailyQuestStatus')
    };
    let authenticated = false;
    let syncing = false;
    let mutating = false;
    let liveTicks = 0;
    let timer = null;
    let latestSnapshot = null;
    let latestRecommendation = null;
    let pendingBets = [];
    let dailyState = null;
    let dailyBusy = false;
    let dailyClickCount = 0;
    let dailyClickResetTimer = null;

    function formatChips(value) {
        return Math.round(Number(value) || 0).toLocaleString('zh-CN');
    }

    function setStatus(element, message, type = '') {
        element.textContent = message;
        element.className = `form-status${type ? ` ${type}` : ''}`;
    }

    function getPoolKey(snapshot) {
        return `${snapshot?.current?.sessionId ?? 'none'}:${snapshot?.pool?.phase || 'unknown'}:${snapshot?.pool?.sessionId ?? 'open'}`;
    }

    function hasCurrentRecommendation() {
        return Boolean(
            latestRecommendation
            && !latestRecommendation.invalid
            && latestRecommendation.bets.length > 0
            && latestRecommendation.poolKey === getPoolKey(latestSnapshot)
        );
    }

    function hasFreshRecommendation() {
        const updatedAt = Date.parse(latestSnapshot?.updatedAt || '');
        return hasCurrentRecommendation() && Number.isFinite(updatedAt) && Date.now() - updatedAt <= MAX_RECOMMENDATION_AGE_MS;
    }

    function updateBetControls() {
        const busy = syncing || mutating;
        elements.betReview.disabled = busy || !authenticated;
        elements.optimalBet.disabled = busy || !authenticated || !hasCurrentRecommendation();
        elements.betSubmit.disabled = busy || pendingBets.length === 0;
        updateDailyControls();
    }

    function showBetConfirmation(bets, label) {
        pendingBets = bets.map(({racerId, amount}) => ({racerId, amount}));
        const details = pendingBets.map(bet => `${racerNames[bet.racerId]} ${formatChips(bet.amount)}`).join('，');
        const total = pendingBets.reduce((sum, bet) => sum + bet.amount, 0);
        elements.betConfirmText.textContent = `${label}：${details}，合计 ${formatChips(total)} 碎片。将按顺序提交，提交后不可撤回，是否确认？`;
        elements.betConfirm.hidden = false;
        updateBetControls();
    }

    function getElectronAdapter() {
        return globalThis.slimeRaceRemote || null;
    }

    function getAndroidAdapter() {
        const plugins = platformBridge?.getAndroidNetworkPlugins(globalThis);
        if (!plugins) return null;

        const {http, cookies} = plugins;
        let cachedRemoteRacers = null;

        async function request(endpoint, options = {}, attempt = 0) {
            const method = String(options.method || 'GET').toUpperCase();
            const response = await http.request({
                url: new URL(endpoint, TARGET_ORIGIN).href,
                method,
                headers: options.headers || {
                    Accept: 'application/json',
                    ...(options.data ? {'Content-Type': 'application/json'} : {})
                },
                data: options.data,
                connectTimeout: 10000,
                readTimeout: 10000
            });

            if (response.status === 429 && method === 'GET' && attempt === 0) {
                const retryAfter = requestPolicy.getHeaderValue(response.headers, 'retry-after');
                await requestPolicy.delay(requestPolicy.getRetryDelayMilliseconds(retryAfter));
                return request(endpoint, options, attempt + 1);
            }
            if (response.status < 200 || response.status >= 300) {
                if (response.status === 429 && method === 'POST') {
                    if (endpoint === '/api/auth/login') {
                        throw new Error('登录请求过于频繁，请等待站点限流恢复后再试；软件不会自动重试登录');
                    }
                    throw new Error('站点请求过于频繁，本次提交不会自动重试；请先同步核对结果');
                }
                if (response.status === 429) throw new Error('站点请求过于频繁，请等待几秒后再同步');
                const message = String(response.data?.message || response.data?.error || `请求失败，HTTP ${response.status}`).slice(0, 240);
                throw new Error(message);
            }
            return response.data;
        }

        async function fetchSnapshot(mode) {
            const normalizedMode = mode === 'bet' ? 'bet' : mode === 'live' ? 'live' : 'full';
            const endpoints = remoteData.getSnapshotEndpointNames(normalizedMode, Boolean(cachedRemoteRacers));
            const fetchEndpoint = name => request(endpointPaths[name]);
            const values = normalizedMode === 'bet'
                ? await Promise.all(endpoints.map(fetchEndpoint))
                : await requestPolicy.mapSequential(endpoints, fetchEndpoint);
            const raw = Object.fromEntries(endpoints.map((name, index) => [name, values[index]]));

            if (raw.racers) cachedRemoteRacers = raw.racers;
            else raw.racers = cachedRemoteRacers;
            return remoteData.normalizeSnapshot({...raw, mode: normalizedMode});
        }

        async function fetchDailyQuest() {
            const names = ['progress', 'text'];
            const endpoints = {progress: '/api/quest/progress', text: '/api/quest/text'};
            const values = await requestPolicy.mapSequential(names, name => request(endpoints[name]), 400);
            return dailyQuest.normalizeDailyQuest(Object.fromEntries(names.map((name, index) => [name, values[index]])));
        }

        return {
            async login(credentials) {
                await cookies?.clearAllCookies?.();
                cachedRemoteRacers = null;
                await request('/api/auth/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
                    data: credentials
                });
                return fetchSnapshot('full');
            },
            sync: fetchSnapshot,
            syncDailyQuest: fetchDailyQuest,
            async placeBets(intents) {
                await requestPolicy.delay(800);
                let snapshot = await fetchSnapshot('bet');
                const planned = remoteActions.validateBetBatch(snapshot, intents);
                let completed = 0;

                try {
                    for (let index = 0; index < planned.length; index += 1) {
                        if (index > 0) {
                            await requestPolicy.delay(2000);
                            snapshot = await fetchSnapshot('bet');
                        }

                        const validated = remoteActions.validateBetIntent(snapshot, planned[index]);
                        await requestPolicy.delay(400);
                        await request('/api/slime-race/bet', {method: 'POST', data: {slimeId: validated.slimeId, amount: validated.amount}});
                        completed += 1;
                    }

                    await requestPolicy.delay(600);
                    return await fetchSnapshot('bet');
                } catch (error) {
                    const message = String(error?.message || error);
                    if (completed === planned.length) throw new Error(`${completed} 笔下注已经提交，但结果同步失败：${message}`);
                    if (completed > 0) throw new Error(`已完成 ${completed}/${planned.length} 笔下注，剩余操作已停止：${message}`);
                    throw error;
                }
            },
            async claimReward(rewardId) {
                const preflight = await fetchSnapshot('live');
                const reward = remoteActions.validateClaimIntent(preflight, rewardId);
                await request('/api/slime-race/claim-reward', {method: 'POST', data: {rewardId: reward.rewardId}});
                return fetchSnapshot('full');
            },
            async submitDailyRecite(intent) {
                const state = await fetchDailyQuest();
                const payload = dailyQuest.validateReciteSubmission(state, intent);
                await requestPolicy.delay(500);
                await request('/api/quest/submit', {method: 'POST', data: payload});
                await requestPolicy.delay(600);
                return fetchDailyQuest();
            },
            async autoSubmitDailyRecite() {
                const state = await fetchDailyQuest();
                const payload = dailyQuest.createAutomaticReciteSubmission(state);
                await requestPolicy.delay(500);
                await request('/api/quest/submit', {method: 'POST', data: payload});
                await requestPolicy.delay(600);
                return fetchDailyQuest();
            },
            async completeDailyClick(clickCount) {
                const state = await fetchDailyQuest();
                dailyQuest.validateClickCompletion(state, clickCount);
                await requestPolicy.delay(500);
                await request('/api/quest/click-complete', {method: 'POST'});
                await requestPolicy.delay(600);
                return fetchDailyQuest();
            },
            async completeDailyTimer() {
                const state = await fetchDailyQuest();
                const payload = dailyQuest.createAutomaticTimerSubmission(state);
                await requestPolicy.delay(500);
                await request('/api/timer-game/submit', {method: 'POST', data: payload});
                await requestPolicy.delay(600);
                return fetchDailyQuest();
            },
            async testDailyTimerError() {
                const state = await fetchDailyQuest();
                const payload = dailyQuest.createRandomTimerSubmission(state);
                await requestPolicy.delay(500);
                const submission = await request('/api/timer-game/submit', {method: 'POST', data: payload});
                const result = dailyQuest.normalizeTimerSubmissionResult(submission, payload.actualTime);
                await requestPolicy.delay(600);
                return {state: await fetchDailyQuest(), result};
            },
            async claimDailyGameReward(type) {
                const state = await fetchDailyQuest();
                const claim = dailyQuest.validateGameClaim(state, type);
                await requestPolicy.delay(500);
                await request(claim.endpoint, {method: 'POST'});
                await requestPolicy.delay(600);
                return fetchDailyQuest();
            },
            async openDailyQuest() {
                globalThis.open(new URL('/daily-quest', TARGET_ORIGIN).href, '_blank', 'noopener,noreferrer');
            },
            async logout() {
                await cookies?.clearAllCookies?.();
                cachedRemoteRacers = null;
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

    function formatDailyCount(task) {
        const maximum = task.maxDaily > 0 ? ` / ${task.maxDaily}` : '';
        return `${task.completionCount}${maximum} 次 · ${formatChips(task.fragmentsEarned)} 碎片`;
    }

    function formatDailyGame(task) {
        const maximum = task.maxRewards > 0 ? ` / ${task.maxRewards}` : '';
        return `已得 ${task.rewardsEarned}${maximum} · 待领 ${task.unclaimed}`;
    }

    function renderDailyClickCounter() {
        elements.dailyClickCount.textContent = `${dailyClickCount} / 100`;
        elements.dailyClickBar.style.width = `${dailyClickCount}%`;
    }

    function renderDailyQuest(state) {
        dailyState = state;
        elements.dailyReciteProgress.textContent = formatDailyCount(state.recite);
        elements.dailyClickProgress.textContent = formatDailyCount(state.click);
        elements.dailyDodgeProgress.textContent = formatDailyGame(state.dodge);
        elements.dailyTimerProgress.textContent = formatDailyGame(state.timer);
        elements.dailyText.textContent = state.text?.content || '当前没有可用的复述题目';
        elements.dailyReciteInput.disabled = !state.text;
        updateDailyControls();
    }

    function updateDailyControls() {
        const busy = syncing || mutating || dailyBusy;
        const clickAtLimit = dailyState?.click?.maxDaily > 0
            && dailyState.click.completionCount >= dailyState.click.maxDaily;
        const timerAtLimit = dailyState?.timer?.maxRewards > 0
            && dailyState.timer.rewardsEarned >= dailyState.timer.maxRewards;
        elements.dailyRefresh.disabled = busy || !authenticated;
        elements.dailyOpen.disabled = busy || !authenticated;
        elements.dailyReciteSubmit.disabled = busy || !dailyState?.text || !elements.dailyReciteInput.value.trim();
        elements.dailyAutoRecite.disabled = busy || !dailyState?.text;
        elements.dailyClickButton.disabled = busy || !dailyState || clickAtLimit;
        elements.dailyClickReset.disabled = busy || dailyClickCount === 0;
        elements.dailyAutoClick.disabled = busy || !dailyState || clickAtLimit;
        elements.dailyAutoTimer.disabled = busy || !dailyState || timerAtLimit;
        elements.dailyTimerErrorTest.disabled = busy || !dailyState || timerAtLimit;
        elements.dailyDodgeClaim.disabled = busy || !dailyState || dailyState.dodge.unclaimed < 1;
        elements.dailyTimerClaim.disabled = busy || !dailyState || dailyState.timer.unclaimed < 1;
    }

    function resetDailyClicks(message = '') {
        clearTimeout(dailyClickResetTimer);
        dailyClickResetTimer = null;
        dailyClickCount = 0;
        renderDailyClickCounter();
        updateDailyControls();
        if (message) setStatus(elements.dailyStatus, message);
    }

    async function refreshDailyQuest(announce = true) {
        if (!authenticated || dailyBusy || mutating) return;
        const adapter = getAdapter();
        if (!adapter?.syncDailyQuest) return;
        dailyBusy = true;
        if (announce) setStatus(elements.dailyStatus, '正在低频读取日常进度和当前题目…');
        updateBetControls();

        try {
            renderDailyQuest(await adapter.syncDailyQuest());
            setStatus(elements.dailyStatus, `日常进度已更新 · ${new Date().toLocaleTimeString('zh-CN', {hour12: false})}`, 'success');
        } catch (error) {
            setStatus(elements.dailyStatus, String(error.message || error), 'error');
        } finally {
            dailyBusy = false;
            updateBetControls();
        }
    }

    async function performDailyRecite(intent, automatic = false) {
        if (!authenticated || mutating || dailyBusy) return;
        const adapter = getAdapter();
        if (!adapter?.submitDailyRecite || (automatic && !adapter.autoSubmitDailyRecite)) return;

        try {
            if (automatic) dailyQuest.createAutomaticReciteSubmission(dailyState);
            else dailyQuest.validateReciteSubmission(dailyState, intent);
        } catch (error) {
            setStatus(elements.dailyStatus, String(error.message || error), 'error');
            return;
        }

        mutating = true;
        setStatus(elements.dailyStatus, `正在重新核对题目并提交${automatic ? '自动' : '手动'}复述；本次 POST 不会自动重试…`);
        updateBetControls();

        try {
            const state = automatic
                ? await adapter.autoSubmitDailyRecite()
                : await adapter.submitDailyRecite(intent);
            renderDailyQuest(state);
            elements.dailyReciteInput.value = '';
            setStatus(elements.dailyStatus, `${automatic ? '自动' : '手动'}复述已通过站点验证；碎片余额将在下一轮同步更新。`, 'success');
        } catch (error) {
            setStatus(elements.dailyStatus, `${String(error.message || error)}；如遇超时，请先手动刷新日常，禁止立即重复提交。`, 'error');
        } finally {
            mutating = false;
            updateBetControls();
        }
    }

    function submitDailyRecite() {
        return performDailyRecite({text: elements.dailyReciteInput.value, questTextId: dailyState?.text?.id});
    }

    function automateDailyRecite() {
        return performDailyRecite(null, true);
    }

    async function completeDailyClicks(automatic = false) {
        if (!authenticated || mutating || dailyBusy || (!automatic && dailyClickCount !== 100)) return;
        const adapter = getAdapter();
        if (!adapter?.completeDailyClick) return;
        clearTimeout(dailyClickResetTimer);
        dailyClickResetTimer = null;
        if (automatic) {
            dailyClickCount = 100;
            renderDailyClickCounter();
        }
        mutating = true;
        setStatus(elements.dailyStatus, `${automatic ? '自动' : '手动'}完成 100 次点击，正在重新核对每日上限并提交一轮…`);
        updateBetControls();

        try {
            renderDailyQuest(await adapter.completeDailyClick(100));
            resetDailyClicks();
            setStatus(elements.dailyStatus, '打工点击任务完成一轮；碎片余额将在下一轮同步更新。', 'success');
        } catch (error) {
            resetDailyClicks();
            setStatus(elements.dailyStatus, `${String(error.message || error)}；本轮已清零，请刷新确认结果后再开始。`, 'error');
        } finally {
            mutating = false;
            updateBetControls();
        }
    }

    async function automateDailyTimer() {
        if (!authenticated || mutating || dailyBusy) return;
        const adapter = getAdapter();
        if (!adapter?.completeDailyTimer) return;

        try {
            dailyQuest.createAutomaticTimerSubmission(dailyState);
        } catch (error) {
            setStatus(elements.dailyStatus, String(error.message || error), 'error');
            return;
        }

        mutating = true;
        setStatus(elements.dailyStatus, '正在自动提交 60.00 秒报时；本次 POST 不会自动重试…');
        updateBetControls();

        try {
            renderDailyQuest(await adapter.completeDailyTimer());
            setStatus(elements.dailyStatus, '60.00 秒自动报时已提交；待领奖励已重新同步。', 'success');
        } catch (error) {
            setStatus(elements.dailyStatus, `${String(error.message || error)}；请先刷新进度，再决定是否重新报时。`, 'error');
        } finally {
            mutating = false;
            updateBetControls();
        }
    }

    async function testDailyTimerError() {
        if (!authenticated || mutating || dailyBusy) return;
        const adapter = getAdapter();
        if (!adapter?.testDailyTimerError) return;

        try {
            dailyQuest.createRandomTimerSubmission(dailyState, () => 0.5);
        } catch (error) {
            setStatus(elements.dailyStatus, String(error.message || error), 'error');
            return;
        }

        mutating = true;
        setStatus(elements.dailyStatus, '正在随机生成并提交 59.80–60.20 秒测试值；本次 POST 不会自动重试…');
        updateBetControls();

        try {
            const response = await adapter.testDailyTimerError();
            const result = response.result;
            const serverDiff = result.diff === null ? '未返回' : `${result.diff.toFixed(3)} 秒`;
            const verdict = result.isSuccess ? '通过' : '未通过';
            const detail = result.message ? `；${result.message}` : '';
            renderDailyQuest(response.state);
            setStatus(
                elements.dailyStatus,
                `随机误差测试${verdict}：提交 ${result.actualTime.toFixed(2)} 秒，绝对误差 ${result.absoluteError.toFixed(2)} 秒，服务端误差 ${serverDiff}${detail}`,
                result.isSuccess ? 'success' : 'error'
            );
        } catch (error) {
            setStatus(elements.dailyStatus, `${String(error.message || error)}；请先刷新进度，再决定是否重新测试。`, 'error');
        } finally {
            mutating = false;
            updateBetControls();
        }
    }

    function registerDailyClick() {
        if (!authenticated || mutating || dailyBusy || !dailyState || dailyClickCount >= 100) return;
        dailyClickCount += 1;
        clearTimeout(dailyClickResetTimer);
        dailyClickResetTimer = setTimeout(() => resetDailyClicks('连续 10 秒没有点击，本轮计数已清零。'), 10000);
        renderDailyClickCounter();
        updateDailyControls();
        if (dailyClickCount === 100) completeDailyClicks();
    }

    async function claimDailyGameReward(type) {
        const taskName = type === 'dodge' ? '躲避飞吻' : '乖宝宝报时';
        const unclaimed = dailyState?.[type]?.unclaimed || 0;
        if (!authenticated || mutating || dailyBusy || unclaimed < 1) return;
        if (!window.confirm(`确认领取 ${taskName} 当前 ${unclaimed} 份待领奖励吗？`)) return;
        const adapter = getAdapter();
        if (!adapter?.claimDailyGameReward) return;
        mutating = true;
        setStatus(elements.dailyStatus, `正在重新核对并领取${taskName}奖励；本次 POST 不会自动重试…`);
        updateBetControls();

        try {
            renderDailyQuest(await adapter.claimDailyGameReward(type));
            setStatus(elements.dailyStatus, `${taskName}待领奖励已领取；碎片余额将在下一轮同步更新。`, 'success');
        } catch (error) {
            setStatus(elements.dailyStatus, `${String(error.message || error)}；如遇超时，请刷新进度后再决定是否重试。`, 'error');
        } finally {
            mutating = false;
            updateBetControls();
        }
    }

    async function openDailyQuest() {
        if (!authenticated) return;

        try {
            await getAdapter()?.openDailyQuest?.();
            setStatus(elements.dailyStatus, '已请求使用系统浏览器打开官方日常页面；躲避游戏保持官方页面原有流程。');
        } catch (error) {
            setStatus(elements.dailyStatus, String(error.message || error), 'error');
        }
    }

    function updateSnapshot(snapshot) {
        latestSnapshot = snapshot;
        const raceStatus = snapshot.current?.status || '未知';
        const phaseText = snapshot.pool?.phase === 'unbound' ? '下一场开放池' : snapshot.pool?.phase === 'bound' ? `第 ${snapshot.pool.sessionId} 场` : '盘口';

        elements.race.textContent = snapshot.current ? `第 ${snapshot.current.sessionId} 场 · ${raceStatus}` : '未取得比赛状态';
        elements.pool.textContent = `${phaseText} · ${formatChips(snapshot.pool?.total)} 碎片`;
        elements.balance.textContent = snapshot.account ? `${formatChips(snapshot.account.magicFragments)} 碎片` : '账户信息不可用';
        if (snapshot.mode !== 'bet') {
            elements.reward.textContent = snapshot.pendingRewards.length > 0
                ? `${snapshot.pendingRewards.length} 笔 · ${formatChips(snapshot.pendingRewardTotal)} 碎片`
                : '暂无待领取';
            renderRewards(snapshot);
        }
        if (snapshot.mode === 'full') {
            elements.history.textContent = `最近 ${snapshot.sessions.length} 场已同步`;
            elements.account.textContent = snapshot.myStats
                ? `${snapshot.myStats.totalBets} 次下注 · 净收益 ${formatChips(snapshot.myStats.netProfit)}`
                : '个人统计不可用';
        }

        window.dispatchEvent(new CustomEvent('slime-race-remote-snapshot', {detail: snapshot}));
        setStatus(elements.status, `已同步 · ${new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN', {hour12: false})}`, 'success');
        updateBetControls();
    }

    function isAutoSyncPaused() {
        const editingBet = document.activeElement === elements.betRacer || document.activeElement === elements.betAmount;
        const editingRecite = Boolean(elements.dailyReciteInput.value.trim());
        return dailyBusy || editingBet || editingRecite || dailyClickCount > 0 || pendingBets.length > 0;
    }

    async function sync(mode = 'live', automatic = false) {
        if (!authenticated || syncing || mutating || pendingBets.length > 0) return;
        if (automatic && (!elements.autoSync.checked || isAutoSyncPaused())) return;
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
            updateBetControls();
        }
    }

    function startPolling() {
        clearInterval(timer);
        timer = null;
        liveTicks = 0;
        if (!authenticated || !elements.autoSync.checked) return;
        timer = setInterval(() => {
            if (document.hidden) return;
            liveTicks += 1;
            sync(liveTicks % 10 === 0 ? 'full' : 'live', true);
        }, 4000);
    }

    function toggleAutoSync() {
        if (!authenticated) return;
        startPolling();
        setStatus(
            elements.status,
            elements.autoSync.checked
                ? '自动实时更新已开启；日常任务和下注操作期间会自动暂停。'
                : '自动实时更新已关闭；仍可使用“立即全量同步”。',
            'success'
        );
    }

    function reviewBet() {
        try {
            const planned = remoteActions.validateBetBatch(latestSnapshot, [{
                racerId: elements.betRacer.value,
                amount: elements.betAmount.value
            }]);
            showBetConfirmation(planned, '手动下注');
            setStatus(elements.betStatus, '请再次核对史莱姆和碎片数量。');
        } catch (error) {
            pendingBets = [];
            elements.betConfirm.hidden = true;
            setStatus(elements.betStatus, String(error.message || error), 'error');
            updateBetControls();
        }
    }

    async function reviewOptimalBets() {
        if (!authenticated || syncing || mutating) return;
        const adapter = getAdapter();
        if (!adapter) return;

        const needsRefresh = !hasFreshRecommendation();
        syncing = true;
        setStatus(elements.betStatus, needsRefresh ? '正在轻量刷新当前盘口并重新计算最优建议…' : '正在核对最近 5 秒内的最优建议…');
        updateBetControls();

        try {
            if (needsRefresh) updateSnapshot(await adapter.sync('bet'));
            if (!hasCurrentRecommendation()) throw new Error('当前策略建议等待或停止追加，没有可执行的一键下注方案');
            const planned = remoteActions.validateBetBatch(latestSnapshot, latestRecommendation.bets);
            showBetConfirmation(planned, '当前最优建议');
            setStatus(elements.betStatus, `${needsRefresh ? '盘口已轻量刷新' : '已复用最近同步结果'}；确认后仍会重新校验，任一失败都会停止剩余下注。`);
        } catch (error) {
            pendingBets = [];
            elements.betConfirm.hidden = true;
            setStatus(elements.betStatus, String(error.message || error), 'error');
        } finally {
            syncing = false;
            updateBetControls();
        }
    }

    function cancelBetReview() {
        pendingBets = [];
        elements.betConfirm.hidden = true;
        setStatus(elements.betStatus, '已取消，未提交任何下注。');
        updateBetControls();
    }

    async function submitBets() {
        if (pendingBets.length === 0 || mutating || syncing) return;
        const adapter = getAdapter();
        if (!adapter) return;

        const submitted = pendingBets.map(bet => ({...bet}));
        mutating = true;
        setStatus(elements.betStatus, `正在重新校验并串行提交 ${submitted.length} 笔下注；两笔间主动等待，请勿重复点击…`);
        updateBetControls();

        try {
            updateSnapshot(await adapter.placeBets(submitted));
            pendingBets = [];
            elements.betConfirm.hidden = true;
            elements.betAmount.value = '1';
            const summary = submitted.map(bet => `${racerNames[bet.racerId]} +${formatChips(bet.amount)}`).join('，');
            setStatus(elements.betStatus, `${submitted.length} 笔下注全部成功：${summary}。`, 'success');
        } catch (error) {
            const message = String(error.message || error);
            setStatus(elements.betStatus, message, 'error');
            pendingBets = [];
            elements.betConfirm.hidden = true;
            if (!message.includes('请求过于频繁')) {
                try {
                    await requestPolicy.delay(800);
                    updateSnapshot(await adapter.sync('bet'));
                } catch {
                    // Preserve the original mutation error when reconciliation is unavailable.
                }
            }
        } finally {
            mutating = false;
            updateBetControls();
            if (latestSnapshot?.mode !== 'bet') renderRewards(latestSnapshot);
        }
    }

    async function claimReward(reward) {
        if (mutating || !window.confirm(`确认领取 ${formatChips(reward.amount)} 魔法碎片吗？`)) return;
        const adapter = getAdapter();
        if (!adapter) return;
        mutating = true;
        setStatus(elements.claimStatus, '正在重新核对并领取奖励…');
        updateBetControls();
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
            updateBetControls();
            if (latestSnapshot) renderRewards(latestSnapshot);
        }
    }

    async function activateRemoteSession(snapshot) {
        authenticated = true;
        elements.actions.hidden = false;
        elements.syncButton.hidden = false;
        elements.logoutButton.hidden = false;
        elements.username.disabled = true;
        elements.password.disabled = true;
        elements.autoSync.disabled = false;
        updateSnapshot(snapshot);
        await requestPolicy.delay(900);
        await refreshDailyQuest(false);
        startPolling();
    }

    async function login(event) {
        event.preventDefault();
        const adapter = getAdapter();

        if (!adapter) {
            const message = globalThis.Capacitor?.getPlatform?.() === 'android'
                ? 'Android 网络桥接未初始化，请安装完整 APK 或重新启动应用。'
                : '当前预览环境不提供联网桥接，请在 macOS、Windows 或 Android App 中使用。';
            setStatus(elements.status, message, 'error');
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
            await activateRemoteSession(snapshot);
        } catch (error) {
            elements.password.value = '';
            setStatus(elements.status, String(error.message || error), 'error');
        } finally {
            elements.loginButton.disabled = false;
        }
    }

    async function autoLogin() {
        const adapter = getElectronAdapter();
        if (!adapter?.autoLogin || authenticated) return;
        elements.loginButton.disabled = true;
        elements.username.disabled = true;
        elements.password.disabled = true;
        setStatus(elements.status, '正在使用本地环境文件自动登录…');

        try {
            const snapshot = await adapter.autoLogin();
            if (!snapshot) {
                setStatus(elements.status, '未找到本地自动登录配置，请手动登录。');
                return;
            }
            await activateRemoteSession(snapshot);
            setStatus(elements.status, '已使用本地环境文件自动登录；凭据仅由主进程读取。', 'success');
        } catch (error) {
            setStatus(elements.status, `自动登录失败：${String(error.message || error)}；仍可手动登录。`, 'error');
        } finally {
            elements.loginButton.disabled = false;
            if (!authenticated) {
                elements.username.disabled = false;
                elements.password.disabled = false;
            }
        }
    }

    async function logout() {
        clearInterval(timer);
        timer = null;
        authenticated = false;
        latestSnapshot = null;
        latestRecommendation = null;
        pendingBets = [];
        dailyState = null;
        dailyBusy = false;
        resetDailyClicks();

        try {
            await getAdapter()?.logout();
        } finally {
            elements.username.disabled = false;
            elements.password.disabled = false;
            elements.username.value = '';
            elements.password.value = '';
            elements.autoSync.disabled = true;
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
            elements.dailyReciteProgress.textContent = '等待同步';
            elements.dailyClickProgress.textContent = '等待同步';
            elements.dailyDodgeProgress.textContent = '等待同步';
            elements.dailyTimerProgress.textContent = '等待同步';
            elements.dailyText.textContent = '刷新后显示当前题目';
            elements.dailyReciteInput.value = '';
            elements.dailyReciteInput.disabled = true;
            setStatus(elements.dailyStatus, '登录后低频同步一次；自动化操作每次只执行一轮，不会后台循环或自动领取。');
            setStatus(elements.status, '已退出并清除本机会话；重新启动应用后会再次尝试环境文件自动登录。', 'success');
            window.dispatchEvent(new CustomEvent('slime-race-remote-disconnected'));
        }
    }

    elements.form.addEventListener('submit', login);
    elements.syncButton.addEventListener('click', () => sync('full'));
    elements.autoSync.addEventListener('change', toggleAutoSync);
    elements.logoutButton.addEventListener('click', logout);
    elements.betReview.addEventListener('click', reviewBet);
    elements.optimalBet.addEventListener('click', reviewOptimalBets);
    elements.betCancel.addEventListener('click', cancelBetReview);
    elements.betSubmit.addEventListener('click', submitBets);
    elements.dailyRefresh.addEventListener('click', () => refreshDailyQuest());
    elements.dailyOpen.addEventListener('click', openDailyQuest);
    elements.dailyReciteSubmit.addEventListener('click', submitDailyRecite);
    elements.dailyAutoRecite.addEventListener('click', automateDailyRecite);
    elements.dailyClickButton.addEventListener('click', registerDailyClick);
    elements.dailyClickReset.addEventListener('click', () => resetDailyClicks('本轮点击已手动清零。'));
    elements.dailyAutoClick.addEventListener('click', () => completeDailyClicks(true));
    elements.dailyAutoTimer.addEventListener('click', automateDailyTimer);
    elements.dailyTimerErrorTest.addEventListener('click', testDailyTimerError);
    elements.dailyDodgeClaim.addEventListener('click', () => claimDailyGameReward('dodge'));
    elements.dailyTimerClaim.addEventListener('click', () => claimDailyGameReward('timer'));
    elements.dailyReciteInput.addEventListener('input', updateDailyControls);
    [elements.betRacer, elements.betAmount].forEach(input => input.addEventListener('change', () => {
        pendingBets = [];
        elements.betConfirm.hidden = true;
        updateBetControls();
    }));
    window.addEventListener('slime-race-bet-recommendation', event => {
        const detail = event.detail || {};
        latestRecommendation = {
            poolKey: detail.poolKey,
            strategy: detail.strategy,
            invalid: detail.invalid === true,
            bets: Array.isArray(detail.bets) ? detail.bets.map(bet => ({racerId: bet.racerId, amount: bet.amount})) : []
        };
        updateBetControls();
    });
    window.addEventListener('beforeunload', () => {
        clearInterval(timer);
        clearTimeout(dailyClickResetTimer);
    });
    autoLogin();
})();
