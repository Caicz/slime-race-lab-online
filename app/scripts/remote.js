(function startRemoteSync() {
    'use strict';

    const TARGET_ORIGIN = 'https://zouzou-princess-fan-2.replit.app';
    const remoteData = globalThis.SlimeRemoteData;
    const remoteActions = globalThis.SlimeRemoteActions;
    const dailyQuest = globalThis.SlimeDailyQuest;
    const heroAutomation = globalThis.SlimeHeroAutomation;
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
        archiveButton: document.querySelector('#remoteArchiveButton'),
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
        dailyStatus: document.querySelector('#dailyQuestStatus'),
        heroRefresh: document.querySelector('#heroRefreshButton'),
        heroMonster: document.querySelector('#heroMonsterSelect'),
        heroOptimizationMode: document.querySelector('#heroOptimizationMode'),
        heroMaxVictories: document.querySelector('#heroMaxVictories'),
        heroMinWinRate: document.querySelector('#heroMinWinRate'),
        heroSkillSwitch: document.querySelector('#heroSkillSwitchToggle'),
        heroDefensePotions: document.querySelector('#heroDefensePotionToggle'),
        heroHealing: document.querySelector('#heroHealingToggle'),
        heroStart: document.querySelector('#heroStartButton'),
        heroStop: document.querySelector('#heroStopButton'),
        heroBattleCount: document.querySelector('#heroBattleCount'),
        heroPotionStatus: document.querySelector('#heroPotionStatus'),
        heroCurrentStep: document.querySelector('#heroCurrentStep'),
        heroRunResult: document.querySelector('#heroRunResult'),
        heroRecommendations: document.querySelector('#heroRecommendations'),
        heroRunLog: document.querySelector('#heroRunLog'),
        heroStatus: document.querySelector('#heroAutomationStatus'),
        heroUnlock: document.querySelector('#heroUnlockButton'),
        heroUnlockStatus: document.querySelector('#heroUnlockStatus'),
        heroUnlockChallenge: document.querySelector('#heroUnlockChallenge'),
        heroUnlockGrid: document.querySelector('#heroUnlockGrid'),
        heroUnlockLetters: document.querySelector('#heroUnlockLetters'),
        heroUnlockSubmit: document.querySelector('#heroUnlockSubmitButton'),
        heroUnlockCancel: document.querySelector('#heroUnlockCancelButton')
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
    let heroSnapshot = null;
    let heroRecommendations = new Map();
    let heroBusy = false;
    let heroRunning = false;
    let heroStopRequested = false;
    let heroWins = 0;
    let heroLosses = 0;
    let heroUnlockData = null;
    let heroUnlockSelection = new Set();

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
        updateHeroControls();
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

        async function fetchHeroAutomation() {
            const endpoints = {
                account: '/api/auth/me',
                battleStatus: '/api/hero/battle-status',
                skills: '/api/hero/skills',
                rebornSkills: '/api/hero/reborn-skills'
            };
            const names = Object.keys(endpoints);
            const values = await requestPolicy.mapSequential(names, name => request(endpoints[name]), 250);
            return heroAutomation.createSnapshot(Object.fromEntries(names.map((name, index) => [name, values[index]])));
        }

        async function applyHeroAllocation(intent) {
            const snapshot = await fetchHeroAutomation();
            const targetAllocation = intent?.targetAllocation || intent;
            const targetSkill = intent?.activeSkillKey;
            if (intent?.guard) heroAutomation.validateBattleGuard(snapshot, intent.guard);
            if (targetSkill != null && (!heroAutomation.ACTIVE_SKILLS[targetSkill] || Number(snapshot.skills[targetSkill]) <= 0)) {
                throw new Error('推荐主动技能尚未解锁或无效');
            }
            const plan = heroAutomation.planAllocationChanges(snapshot.account, targetAllocation);

            for (const change of plan.deallocate) {
                await request('/api/hero/deallocate-stats', {method: 'POST', data: change});
                await requestPolicy.delay(250);
            }
            for (const change of plan.allocate) {
                await request('/api/hero/allocate-stats', {method: 'POST', data: change});
                await requestPolicy.delay(250);
            }
            if (targetSkill != null && targetSkill !== snapshot.account.equippedActiveSkill) {
                await request('/api/hero/skills/equip', {method: 'POST', data: {skillKey: targetSkill}});
                await requestPolicy.delay(300);
            }

            const updated = await fetchHeroAutomation();
            const actual = heroAutomation.getCurrentAllocation(updated.account);
            if (JSON.stringify(actual) !== JSON.stringify(plan.target)) throw new Error('服务器返回的能力值方案与目标不一致，自动刷怪已停止');
            if (targetSkill !== undefined && updated.account.equippedActiveSkill !== targetSkill) throw new Error('服务器返回的主动技能与推荐不一致，自动刷怪已停止');
            if (intent?.guard) heroAutomation.validateBattleGuard(updated, {...intent.guard, expectedAllocation: plan.target});
            return updated;
        }

        async function prepareHeroHealing() {
            const before = await fetchHeroAutomation();
            const currentRatio = Number(before.battleStatus.currentHp) / Math.max(1, Number(before.battleStatus.maxHp));
            if (currentRatio >= 0.2) return {snapshot: before, consumed: [], triggered: false};
            const inventory = await request('/api/inventory');
            const plan = heroAutomation.planHealingConsumables(before, inventory);

            for (const use of plan.uses) {
                await request('/api/inventory/use', {
                    method: 'POST',
                    data: {inventoryEntryId: use.inventoryEntryId, quantity: use.quantity}
                });
                await requestPolicy.delay(350);
            }

            const snapshot = await fetchHeroAutomation();
            const hpRatio = Number(snapshot.battleStatus.currentHp) / Math.max(1, Number(snapshot.battleStatus.maxHp));
            if (hpRatio < 0.95) throw new Error('恢复药水已经提交，但 HP 未达到 95%；禁止立即重复使用，请先核对官方面板');
            return {snapshot, consumed: plan.uses.map(use => ({itemId: use.itemId, quantity: use.quantity})), triggered: true};
        }

        async function getHeroUnlockChallenge() {
            return request('/api/hero/unlock-challenge');
        }

        async function submitHeroUnlock(letters) {
            const selected = Array.isArray(letters) ? letters.map(letter => String(letter)).filter(Boolean) : [];
            if (selected.length !== 2 || new Set(selected).size !== 2) throw new Error('请选择两个不同的字母');
            const submission = await request('/api/hero/unlock-exp', {method: 'POST', data: {letters: selected}});
            if (submission?.success !== true) return {success: false, challenge: await getHeroUnlockChallenge()};
            const snapshot = await fetchHeroAutomation();
            if (heroAutomation.getBattleCount(snapshot) >= 60) throw new Error('服务器已接受解锁请求，但 60 次限制尚未解除，请核对官方面板');
            return {success: true, snapshot};
        }

        async function prepareHeroDefensePotions() {
            const before = await fetchHeroAutomation();
            const currentStacks = Math.max(0, Math.min(30, Number(before.battleStatus.defenseBuffStacks) || 0));
            const needed = 30 - currentStacks;
            if (needed === 0) return {snapshot: before, consumed: 0};
            const inventory = await request('/api/inventory');
            const entries = (Array.isArray(inventory) ? inventory : [])
                .filter(entry => Number(entry?.itemId) === 7 && Number(entry.quantity) > 0 && (entry.id || entry._id))
                .sort((left, right) => Number(right.quantity) - Number(left.quantity));
            const available = entries.reduce((sum, entry) => sum + Number(entry.quantity), 0);
            if (available < needed) throw new Error(`防御药水不足：补满 30 层还需要 ${needed} 瓶，当前只有 ${available} 瓶`);

            let remaining = needed;
            for (const entry of entries) {
                if (remaining === 0) break;
                const quantity = Math.min(remaining, Number(entry.quantity));
                await request('/api/inventory/use', {method: 'POST', data: {inventoryEntryId: entry.id || entry._id, quantity}});
                remaining -= quantity;
                await requestPolicy.delay(400);
            }

            const snapshot = await fetchHeroAutomation();
            if (Number(snapshot.battleStatus.defenseBuffStacks) !== 30) throw new Error('防御药水提交后未达到 30 层，请在官方面板核对，禁止立即重复使用');
            return {snapshot, consumed: needed};
        }

        async function runHeroBattle(intent) {
            const snapshot = await fetchHeroAutomation();
            const monster = heroAutomation.validateBattleGuard(snapshot, intent);
            const battleCount = heroAutomation.getBattleCount(snapshot);
            if (battleCount >= 60) throw new Error('今日战斗次数已达到 60 次上限');

            const result = heroAutomation.simulateBattle(snapshot, monster.id);
            const payload = heroAutomation.createBattleResultPayload(monster.id, result);
            await requestPolicy.delay(600);
            const submission = await request('/api/hero/battle-result', {method: 'POST', data: payload});
            await requestPolicy.delay(700);
            const updated = await fetchHeroAutomation();
            const nextLevel = heroAutomation.validateLevelTransition(monster.id, monster.level, updated, result.victory);
            heroAutomation.validateBattleCountTransition(battleCount, updated);
            return {snapshot: updated, result, nextLevel, message: String(submission?.message || '').slice(0, 180)};
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
            syncHeroAutomation: fetchHeroAutomation,
            applyHeroAllocation,
            prepareHeroDefensePotions,
            prepareHeroHealing,
            getHeroUnlockChallenge,
            submitHeroUnlock,
            runHeroBattle,
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

    function updateHeroControls() {
        const adapter = getAdapter();
        const supported = Boolean(adapter?.syncHeroAutomation && adapter?.applyHeroAllocation && adapter?.prepareHeroHealing && adapter?.runHeroBattle);
        const busy = syncing || mutating || heroBusy || heroRunning;
        const atBattleLimit = Number(heroSnapshot?.battleStatus?.battleCount) >= 60;
        elements.heroRefresh.disabled = busy || !authenticated || !supported;
        elements.heroMonster.disabled = heroBusy || heroRunning;
        elements.heroOptimizationMode.disabled = heroBusy || heroRunning;
        elements.heroMaxVictories.disabled = heroBusy || heroRunning;
        elements.heroMinWinRate.disabled = heroBusy || heroRunning;
        elements.heroSkillSwitch.disabled = heroBusy || heroRunning;
        elements.heroDefensePotions.disabled = heroBusy || heroRunning;
        elements.heroHealing.disabled = heroBusy || heroRunning;
        elements.heroStart.disabled = busy || !authenticated || !supported || !heroRecommendations.has(elements.heroMonster.value);
        elements.heroStop.disabled = !heroRunning || heroStopRequested;
        elements.heroUnlock.disabled = busy || !authenticated || !atBattleLimit || !adapter?.getHeroUnlockChallenge;
        elements.heroUnlockSubmit.disabled = busy || heroUnlockSelection.size !== 2 || !adapter?.submitHeroUnlock;
        elements.heroUnlockCancel.disabled = busy;
        for (const button of elements.heroUnlockLetters.children) button.disabled = busy;
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

    function renderHeroSnapshot(snapshot) {
        heroSnapshot = snapshot;
        const status = snapshot.battleStatus;
        const stacks = Math.max(0, Number(status.defenseBuffStacks) || 0);
        const expiry = status.defenseBuffExpiry ? new Date(status.defenseBuffExpiry) : null;
        const expiryText = expiry && expiry.getTime() > Date.now()
            ? ` · 至 ${expiry.toLocaleTimeString('zh-CN', {hour12: false})}`
            : '';
        elements.heroBattleCount.textContent = `${Number(status.battleCount) || 0} / 60`;
        elements.heroPotionStatus.textContent = `${stacks} / 30 层${expiryText}`;
        elements.heroRunResult.textContent = `${heroWins} 胜 / ${heroLosses} 负`;
        if (Number(status.battleCount) >= 60 && !heroUnlockData) {
            elements.heroUnlockStatus.textContent = '已达到 60 次，请点击按钮完成官方字母验证后继续。';
        } else if (Number(status.battleCount) < 60 && !heroUnlockData) {
            elements.heroUnlockStatus.textContent = '今日达到 60 次后，可在这里完成官方字母点击验证。';
        }
        updateHeroControls();
    }

    function closeHeroUnlockChallenge() {
        heroUnlockData = null;
        heroUnlockSelection = new Set();
        elements.heroUnlockChallenge.hidden = true;
        elements.heroUnlockGrid.replaceChildren();
        elements.heroUnlockLetters.replaceChildren();
        updateHeroControls();
    }

    function renderHeroUnlockChallenge(challenge) {
        const grid = Array.isArray(challenge?.grid) ? challenge.grid.slice(0, 9) : [];
        const letters = Array.isArray(challenge?.letters) ? challenge.letters.map(String).filter(Boolean) : [];
        if (grid.length !== 9 || letters.length < 2) throw new Error('服务器返回的字母验证题格式无效');
        heroUnlockData = {grid, letters};
        heroUnlockSelection = new Set();
        elements.heroUnlockGrid.replaceChildren();
        elements.heroUnlockLetters.replaceChildren();
        for (const value of grid) {
            const cell = document.createElement('span');
            cell.textContent = String(value || '');
            elements.heroUnlockGrid.append(cell);
        }
        for (const letter of letters) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = letter;
            button.addEventListener('click', () => {
                if (heroUnlockSelection.has(letter)) heroUnlockSelection.delete(letter);
                else if (heroUnlockSelection.size < 2) heroUnlockSelection.add(letter);
                for (const candidate of elements.heroUnlockLetters.children) {
                    candidate.classList.toggle('selected', heroUnlockSelection.has(candidate.textContent));
                }
                updateHeroControls();
            });
            elements.heroUnlockLetters.append(button);
        }
        elements.heroUnlockChallenge.hidden = false;
        elements.heroUnlockStatus.textContent = '请人工查看九宫格并点击对应的两个字母；软件不会自动代答。';
        updateHeroControls();
    }

    function renderHeroRecommendations() {
        elements.heroRecommendations.replaceChildren();
        if (heroRecommendations.size === 0) {
            const empty = document.createElement('p');
            empty.textContent = '点击“刷新六只方案”，读取当前怪物面板并计算每只怪物的推荐配点。';
            elements.heroRecommendations.append(empty);
            return;
        }

        for (const [monsterId, recommendation] of heroRecommendations) {
            const card = document.createElement('article');
            const header = document.createElement('header');
            const title = document.createElement('strong');
            const level = document.createElement('span');
            const allocation = document.createElement('div');
            const footer = document.createElement('footer');
            const survival = document.createElement('span');
            const timing = document.createElement('span');
            card.className = `hero-recommendation${elements.heroMonster.value === monsterId ? ' selected' : ''}`;
            title.textContent = recommendation.monster.name;
            level.textContent = `Lv.${recommendation.monster.level}`;
            header.append(title, level);
            allocation.className = 'hero-allocation';
            for (const [label, key] of [['HP', 'hp'], ['ATK', 'attack'], ['DEF', 'defense'], ['SPD', 'speed']]) {
                const item = document.createElement('span');
                item.textContent = `${label} ${recommendation.allocation[key]}`;
                allocation.append(item);
            }
            survival.textContent = `胜率 ${(recommendation.winRate * 100).toFixed(1)}% · 均掉血 ${Math.round(recommendation.averageHpLost)} · 余血 ${(recommendation.averageRemainingHpRatio * 100).toFixed(1)}%`;
            const victoryTime = Number.isFinite(recommendation.averageVictorySeconds) ? `${recommendation.averageVictorySeconds.toFixed(1)}s` : '无胜场';
            timing.textContent = `${heroAutomation.ACTIVE_SKILLS[recommendation.activeSkillKey] || '无主动技能'} · 均胜时 ${victoryTime}`;
            footer.append(survival, timing);
            card.append(header, allocation, footer);
            card.addEventListener('click', () => {
                elements.heroMonster.value = monsterId;
                renderHeroRecommendations();
                updateHeroControls();
            });
            elements.heroRecommendations.append(card);
        }
    }

    function appendHeroLog(message) {
        if (elements.heroRunLog.children.length === 1 && elements.heroRunLog.firstElementChild?.textContent === '自动循环尚未开始。') {
            elements.heroRunLog.replaceChildren();
        }
        const line = document.createElement('p');
        line.textContent = `[${new Date().toLocaleTimeString('zh-CN', {hour12: false})}] ${message}`;
        elements.heroRunLog.append(line);
        elements.heroRunLog.scrollTop = elements.heroRunLog.scrollHeight;
    }

    async function calculateHeroRecommendation(snapshot, monsterId, allMonsters = false) {
        await new Promise(resolve => setTimeout(resolve, 0));
        const hpRatio = Number(snapshot.battleStatus.currentHp) / Math.max(1, Number(snapshot.battleStatus.maxHp));
        return heroAutomation.findOptimalAllocation(snapshot, monsterId, {
            defensePotionStacks: elements.heroDefensePotions.checked ? 30 : undefined,
            minimumHpRatio: elements.heroHealing.checked && hpRatio < 0.2 ? 0.95 : undefined,
            optimizationMode: elements.heroOptimizationMode.value,
            optimizeActiveSkill: elements.heroSkillSwitch.checked,
            divisions: allMonsters ? 14 : 18,
            coarseSamples: 8,
            finalSamples: allMonsters ? 64 : 96
        });
    }

    async function refreshHeroAnalysis() {
        if (!authenticated || syncing || mutating || heroBusy || heroRunning) return;
        const adapter = getAdapter();
        if (!adapter?.syncHeroAutomation) return;
        heroBusy = true;
        heroRecommendations = new Map();
        elements.heroCurrentStep.textContent = '读取勇者与怪物面板';
        setStatus(elements.heroStatus, '正在读取当前面板并依次计算六只怪物；计算期间不会修改账户数据…');
        renderHeroRecommendations();
        updateBetControls();

        try {
            const snapshot = await adapter.syncHeroAutomation();
            renderHeroSnapshot(snapshot);
            for (const monsterId of Object.keys(heroAutomation.MONSTERS)) {
                elements.heroCurrentStep.textContent = `计算 ${heroAutomation.MONSTERS[monsterId].name}`;
                const recommendation = await calculateHeroRecommendation(snapshot, monsterId, true);
                heroRecommendations.set(monsterId, recommendation);
                renderHeroRecommendations();
            }
            elements.heroCurrentStep.textContent = '六只方案计算完成';
            const modeName = heroAutomation.OPTIMIZATION_MODES[elements.heroOptimizationMode.value];
            const skillText = elements.heroSkillSwitch.checked ? '并优化主动技能' : '并保持当前主动技能';
            setStatus(elements.heroStatus, `已按“${modeName}”目标、${elements.heroDefensePotions.checked ? '30 层防御药水' : '当前药水状态'}${skillText}完成六只方案；点击卡片可选择目标。`, 'success');
        } catch (error) {
            elements.heroCurrentStep.textContent = '计算停止';
            setStatus(elements.heroStatus, String(error.message || error), 'error');
        } finally {
            heroBusy = false;
            updateBetControls();
        }
    }

    function getHeroRunLimit(snapshot) {
        const requested = Number(elements.heroMaxVictories.value);
        if (!Number.isSafeInteger(requested) || requested < 1 || requested > 60) throw new Error('本轮最多胜场必须是 1–60 的整数');
        const remaining = Math.max(0, 60 - (Number(snapshot.battleStatus.battleCount) || 0));
        if (remaining === 0) throw new Error('今日战斗次数已经达到 60 次上限');
        return Math.min(requested, remaining);
    }

    function getHeroMinimumWinRate() {
        const percent = Number(elements.heroMinWinRate.value);
        if (!Number.isFinite(percent) || percent < 50 || percent > 100) throw new Error('最低预测胜率必须在 50%–100% 之间');
        return percent / 100;
    }

    async function startHeroAutomation() {
        if (!authenticated || syncing || mutating || heroBusy || heroRunning) return;
        const adapter = getAdapter();
        if (!adapter?.syncHeroAutomation || !adapter?.applyHeroAllocation || !adapter?.prepareHeroHealing || !adapter?.runHeroBattle) return;
        const monsterId = elements.heroMonster.value;
        let initial;
        let limit;
        let minimumWinRate;

        heroBusy = true;
        elements.heroCurrentStep.textContent = '启动前重新读取面板';
        setStatus(elements.heroStatus, '正在核对最新怪物面板、今日次数和药水状态…');
        updateBetControls();
        try {
            initial = await adapter.syncHeroAutomation();
            renderHeroSnapshot(initial);
            limit = getHeroRunLimit(initial);
            minimumWinRate = getHeroMinimumWinRate();
        } catch (error) {
            heroBusy = false;
            elements.heroCurrentStep.textContent = '启动核对失败';
            setStatus(elements.heroStatus, String(error.message || error), 'error');
            updateBetControls();
            return;
        }

        const monsterName = heroAutomation.MONSTERS[monsterId]?.name || monsterId;
        const modeName = heroAutomation.OPTIMIZATION_MODES[elements.heroOptimizationMode.value];
        const potionText = elements.heroDefensePotions.checked
            ? '；开始时将把防御药水补足到30层，最多消耗30瓶，药效到期立即停止'
            : '；不额外使用防御药水';
        const skillText = elements.heroSkillSwitch.checked ? '；允许自动更换主动技能' : '；保持当前主动技能';
        const healingText = elements.heroHealing.checked ? '；HP低于20%时自动使用恢复药水补到至少95%' : '；不自动使用恢复药水';
        if (!window.confirm(`确认以“${modeName}”目标自动挑战${monsterName}，本轮最多 ${limit} 胜、最低预测胜率 ${(minimumWinRate * 100).toFixed(0)}%${skillText}${potionText}${healingText}？每轮都会重新配点并提交一次真实战斗结果。`)) {
            heroBusy = false;
            elements.heroCurrentStep.textContent = '已取消启动';
            setStatus(elements.heroStatus, '已取消，账户未因本次启动执行配点、用药或战斗提交。');
            updateBetControls();
            return;
        }

        heroBusy = false;
        heroRunning = true;
        heroStopRequested = false;
        heroWins = 0;
        heroLosses = 0;
        mutating = true;
        elements.heroRunLog.replaceChildren();
        renderHeroSnapshot(initial);
        setStatus(elements.heroStatus, '自动循环已启动；实时比赛同步和其他远程操作已暂停。');
        updateBetControls();

        try {
            let snapshot = initial;
            if (elements.heroDefensePotions.checked) {
                elements.heroCurrentStep.textContent = '补足30层防御药水';
                const prepared = await adapter.prepareHeroDefensePotions();
                snapshot = prepared.snapshot;
                renderHeroSnapshot(snapshot);
                appendHeroLog(`防御药水已达到30层，本轮消耗 ${prepared.consumed} 瓶。`);
            }

            while (heroWins < limit && !heroStopRequested) {
                elements.heroCurrentStep.textContent = '重新读取怪物面板';
                snapshot = await adapter.syncHeroAutomation();
                renderHeroSnapshot(snapshot);
                const hpRatio = Number(snapshot.battleStatus.currentHp) / Math.max(1, Number(snapshot.battleStatus.maxHp));
                if (elements.heroHealing.checked && hpRatio < 0.2) {
                    elements.heroCurrentStep.textContent = 'HP低于20%，补血到至少95%';
                    const healing = await adapter.prepareHeroHealing();
                    snapshot = healing.snapshot;
                    renderHeroSnapshot(snapshot);
                    const consumed = healing.consumed.map(use => `${heroAutomation.HEALING_POTIONS[use.itemId]?.name || `物品${use.itemId}`}×${use.quantity}`).join('、');
                    appendHeroLog(`恢复完成：${consumed || '无需消耗'}，当前 HP ${snapshot.battleStatus.currentHp} / ${snapshot.battleStatus.maxHp}。`);
                }
                const monster = heroAutomation.getMonster(snapshot, monsterId);
                if (elements.heroDefensePotions.checked) {
                    const expiry = Date.parse(snapshot.battleStatus.defenseBuffExpiry || '');
                    if (Number(snapshot.battleStatus.defenseBuffStacks) !== 30 || !Number.isFinite(expiry) || expiry <= Date.now()) {
                        throw new Error('30层防御药水已经失效，本轮按约定停止，不会再次消耗药水');
                    }
                }

                elements.heroCurrentStep.textContent = `计算 ${monsterName} Lv.${monster.level} 最优配点`;
                const recommendation = await calculateHeroRecommendation(snapshot, monsterId);
                heroRecommendations.set(monsterId, recommendation);
                renderHeroRecommendations();
                appendHeroLog(`Lv.${monster.level}“${modeName}”推荐 HP ${recommendation.allocation.hp} / ATK ${recommendation.allocation.attack} / DEF ${recommendation.allocation.defense} / SPD ${recommendation.allocation.speed}，主动技能 ${heroAutomation.ACTIVE_SKILLS[recommendation.activeSkillKey] || '无'}，预测胜率 ${(recommendation.winRate * 100).toFixed(1)}%。`);
                if (recommendation.winRate < minimumWinRate) {
                    throw new Error(`Lv.${monster.level} 的最高预测胜率只有 ${(recommendation.winRate * 100).toFixed(1)}%，低于停止线 ${(minimumWinRate * 100).toFixed(0)}%`);
                }
                if (heroStopRequested) break;

                elements.heroCurrentStep.textContent = `应用 Lv.${monster.level} 配点`;
                const allocationGuard = heroAutomation.createBattleGuard(snapshot, monsterId, {
                    requireDefensePotions: elements.heroDefensePotions.checked
                });
                snapshot = await adapter.applyHeroAllocation({
                    targetAllocation: recommendation.allocation,
                    activeSkillKey: recommendation.activeSkillKey,
                    guard: allocationGuard
                });
                renderHeroSnapshot(snapshot);
                if (heroStopRequested) break;

                const allocatedHpRatio = Number(snapshot.battleStatus.currentHp) / Math.max(1, Number(snapshot.battleStatus.maxHp));
                if (elements.heroHealing.checked && allocatedHpRatio < 0.2) {
                    elements.heroCurrentStep.textContent = '配点后HP低于20%，补血到至少95%';
                    const healing = await adapter.prepareHeroHealing();
                    snapshot = healing.snapshot;
                    renderHeroSnapshot(snapshot);
                    const consumed = healing.consumed.map(use => `${heroAutomation.HEALING_POTIONS[use.itemId]?.name || `物品${use.itemId}`}×${use.quantity}`).join('、');
                    appendHeroLog(`配点后恢复：${consumed || '无需消耗'}，当前 HP ${snapshot.battleStatus.currentHp} / ${snapshot.battleStatus.maxHp}。`);
                }
                if (heroStopRequested) break;

                elements.heroCurrentStep.textContent = `挑战 ${monsterName} Lv.${monster.level}`;
                const battleGuard = heroAutomation.createBattleGuard(snapshot, monsterId, {
                    requireDefensePotions: elements.heroDefensePotions.checked,
                    lockHeroPanel: true
                });
                battleGuard.expectedAllocation = recommendation.allocation;
                const response = await adapter.runHeroBattle(battleGuard);
                snapshot = response.snapshot;
                if (response.result.victory) {
                    heroWins += 1;
                    appendHeroLog(`胜利：${monsterName} Lv.${monster.level} → Lv.${response.nextLevel}，剩余 HP ${response.result.currentHp}，${response.message || '结算成功'}。`);
                } else {
                    heroLosses += 1;
                    appendHeroLog(`败北：${monsterName}仍为 Lv.${response.nextLevel}，本轮立即停止。`);
                    heroStopRequested = true;
                }
                renderHeroSnapshot(snapshot);
            }

            elements.heroCurrentStep.textContent = heroStopRequested ? '已安全停止' : '达到本轮目标';
            setStatus(
                elements.heroStatus,
                heroStopRequested ? `自动循环已停止：${heroWins} 胜 / ${heroLosses} 负。` : `自动循环完成：${heroWins} 胜 / ${heroLosses} 负。`,
                heroLosses === 0 ? 'success' : 'error'
            );
        } catch (error) {
            elements.heroCurrentStep.textContent = '异常停机';
            appendHeroLog(`停止原因：${String(error.message || error)}`);
            setStatus(elements.heroStatus, `${String(error.message || error)}；不会自动重试，请先刷新官方面板核对。`, 'error');
        } finally {
            heroRunning = false;
            heroStopRequested = false;
            mutating = false;
            updateBetControls();
            sync('full');
        }
    }

    function stopHeroAutomation() {
        if (!heroRunning || heroStopRequested) return;
        heroStopRequested = true;
        elements.heroCurrentStep.textContent = '等待当前步骤完成后停止';
        appendHeroLog('已收到停止请求；不会开始下一轮，当前在途 POST 不会被重复提交。');
        updateHeroControls();
    }

    async function openHeroUnlockChallenge() {
        if (!authenticated || heroBusy || heroRunning || Number(heroSnapshot?.battleStatus?.battleCount) < 60) return;
        const adapter = getAdapter();
        if (!adapter?.getHeroUnlockChallenge) return;
        heroBusy = true;
        elements.heroUnlockStatus.textContent = '正在读取官方字母验证题…';
        updateBetControls();

        try {
            renderHeroUnlockChallenge(await adapter.getHeroUnlockChallenge());
        } catch (error) {
            elements.heroUnlockStatus.textContent = String(error.message || error);
        } finally {
            heroBusy = false;
            updateBetControls();
        }
    }

    async function submitHeroUnlock() {
        if (!authenticated || heroBusy || heroRunning || heroUnlockSelection.size !== 2) return;
        if (!window.confirm('确认提交当前选择的两个字母并解除本轮 60 次限制吗？本次 POST 不会自动重试。')) return;
        const adapter = getAdapter();
        if (!adapter?.submitHeroUnlock) return;
        const letters = [...heroUnlockSelection];
        heroBusy = true;
        mutating = true;
        elements.heroUnlockStatus.textContent = '正在提交一次字母验证；不会自动重试…';
        updateBetControls();

        try {
            const result = await adapter.submitHeroUnlock(letters);
            if (!result.success) {
                renderHeroUnlockChallenge(result.challenge);
                elements.heroUnlockStatus.textContent = '字母不正确，服务器已刷新题目；请重新人工选择。';
                return;
            }
            closeHeroUnlockChallenge();
            renderHeroSnapshot(result.snapshot);
            elements.heroUnlockStatus.textContent = '60 次限制已经解除，可重新启动下一轮自动刷怪。';
            setStatus(elements.heroStatus, '官方字母验证已通过；解锁请求只提交了一次。', 'success');
        } catch (error) {
            elements.heroUnlockStatus.textContent = `${String(error.message || error)}；结果不确定时请先刷新面板，禁止立即重复提交。`;
        } finally {
            heroBusy = false;
            mutating = false;
            updateBetControls();
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
            const archiveText = snapshot.archive?.error
                ? ' · 本地档案写入失败'
                : Number.isFinite(snapshot.archive?.total) ? ` · 本地累计 ${snapshot.archive.total} 场` : '';
            elements.history.textContent = `最近 ${snapshot.sessions.length} 场已同步${archiveText}`;
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
        return dailyBusy || heroBusy || heroRunning || Boolean(heroUnlockData) || editingBet || editingRecite || dailyClickCount > 0 || pendingBets.length > 0;
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
        elements.archiveButton.hidden = !getElectronAdapter()?.openRaceArchive;
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
        if (heroRunning) {
            stopHeroAutomation();
            setStatus(elements.status, '自动刷怪仍有当前步骤在执行，已请求安全停止；停止完成后再退出。');
            return;
        }
        clearInterval(timer);
        timer = null;
        authenticated = false;
        latestSnapshot = null;
        latestRecommendation = null;
        pendingBets = [];
        dailyState = null;
        dailyBusy = false;
        heroSnapshot = null;
        heroRecommendations = new Map();
        heroBusy = false;
        heroStopRequested = false;
        heroWins = 0;
        heroLosses = 0;
        heroUnlockData = null;
        heroUnlockSelection = new Set();
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
            elements.archiveButton.hidden = true;
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
            elements.heroBattleCount.textContent = '等待读取';
            elements.heroPotionStatus.textContent = '等待读取';
            elements.heroCurrentStep.textContent = '尚未启动';
            elements.heroRunResult.textContent = '0 胜 / 0 负';
            elements.heroUnlockStatus.textContent = '今日达到 60 次后，可在这里完成官方字母点击验证。';
            elements.heroUnlockChallenge.hidden = true;
            elements.heroUnlockGrid.replaceChildren();
            elements.heroUnlockLetters.replaceChildren();
            const heroLogPlaceholder = document.createElement('p');
            heroLogPlaceholder.textContent = '自动循环尚未开始。';
            elements.heroRunLog.replaceChildren(heroLogPlaceholder);
            renderHeroRecommendations();
            setStatus(elements.dailyStatus, '登录后低频同步一次；自动化操作每次只执行一轮，不会后台循环或自动领取。');
            setStatus(elements.heroStatus, '每轮会重新选择目标方案、配点和主动技能；HP低于20%时可补到至少95%。任何 POST 都不会自动重试。');
            setStatus(elements.status, '已退出并清除本机会话；重新启动应用后会再次尝试环境文件自动登录。', 'success');
            window.dispatchEvent(new CustomEvent('slime-race-remote-disconnected'));
        }
    }

    elements.form.addEventListener('submit', login);
    elements.syncButton.addEventListener('click', () => sync('full'));
    elements.archiveButton.addEventListener('click', async () => {
        try {
            await getElectronAdapter()?.openRaceArchive?.();
        } catch (error) {
            setStatus(elements.status, String(error.message || error), 'error');
        }
    });
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
    elements.heroRefresh.addEventListener('click', refreshHeroAnalysis);
    elements.heroStart.addEventListener('click', startHeroAutomation);
    elements.heroStop.addEventListener('click', stopHeroAutomation);
    elements.heroUnlock.addEventListener('click', openHeroUnlockChallenge);
    elements.heroUnlockSubmit.addEventListener('click', submitHeroUnlock);
    elements.heroUnlockCancel.addEventListener('click', () => {
        closeHeroUnlockChallenge();
        elements.heroUnlockStatus.textContent = '验证已取消；需要时可重新读取题目。';
    });
    elements.heroMonster.addEventListener('change', () => {
        renderHeroRecommendations();
        updateHeroControls();
    });
    elements.heroDefensePotions.addEventListener('change', () => {
        heroRecommendations = new Map();
        renderHeroRecommendations();
        setStatus(elements.heroStatus, '防御药水计算条件已经变化，请重新刷新六只方案。');
        updateHeroControls();
    });
    elements.heroOptimizationMode.addEventListener('change', () => {
        heroRecommendations = new Map();
        renderHeroRecommendations();
        setStatus(elements.heroStatus, '配点目标已经变化，请重新刷新六只方案。');
        updateHeroControls();
    });
    elements.heroSkillSwitch.addEventListener('change', () => {
        heroRecommendations = new Map();
        renderHeroRecommendations();
        setStatus(elements.heroStatus, '主动技能优化条件已经变化，请重新刷新六只方案。');
        updateHeroControls();
    });
    elements.heroHealing.addEventListener('change', () => {
        heroRecommendations = new Map();
        renderHeroRecommendations();
        setStatus(elements.heroStatus, '恢复药水条件已经变化，请重新刷新六只方案。');
        updateHeroControls();
    });
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
        heroStopRequested = true;
        clearInterval(timer);
        clearTimeout(dailyClickResetTimer);
    });
    autoLogin();
})();
