(function startApplication() {
    'use strict';

    const engine = globalThis.SlimeRaceEngine;
    const betting = globalThis.SlimeBetting;
    const marketMonitor = globalThis.SlimeMarketMonitor;
    const STORAGE_KEYS = Object.freeze({
        winners: 'slime-race-lab.real-winners.v1',
        pool: 'slime-race-lab.live-pool.v1',
        betting: 'slime-race-lab.betting-settings.v1',
        market: 'slime-race-lab.market-monitor.v1'
    });
    const elements = {
        canvas: document.querySelector('#raceCanvas'),
        trackStage: document.querySelector('#trackStage'),
        trackCenterCard: document.querySelector('#trackCenterCard'),
        winnerBanner: document.querySelector('#winnerBanner'),
        winnerName: document.querySelector('#winnerName'),
        raceTitle: document.querySelector('#raceTitle'),
        raceTime: document.querySelector('#raceTime'),
        playButton: document.querySelector('#playButton'),
        playIcon: document.querySelector('#playButton .play-icon'),
        playLabel: document.querySelector('#playButton .button-label'),
        resetButton: document.querySelector('#resetButton'),
        seedInput: document.querySelector('#seedInput'),
        standings: document.querySelector('#standings'),
        observedBars: document.querySelector('#observedBars'),
        sampleBadge: document.querySelector('#sampleBadge'),
        realPickPair: document.querySelector('#realPickPair'),
        realCoverage: document.querySelector('#realCoverage'),
        realCoverageBar: document.querySelector('#realCoverageBar'),
        realCoverageNote: document.querySelector('#realCoverageNote'),
        centerPrediction: document.querySelector('#centerPrediction'),
        centerCoverage: document.querySelector('#centerCoverage'),
        platformBadge: document.querySelector('#platformBadge'),
        batchCount: document.querySelector('#batchCount'),
        batchButton: document.querySelector('#batchButton'),
        batchProgress: document.querySelector('#batchProgress'),
        batchProgressBar: document.querySelector('#batchProgress i'),
        batchPlaceholder: document.querySelector('#batchPlaceholder'),
        batchResults: document.querySelector('#batchResults'),
        modelPair: document.querySelector('#modelPair'),
        modelCoverage: document.querySelector('#modelCoverage'),
        simulatedBars: document.querySelector('#simulatedBars'),
        firstAverage: document.querySelector('#firstAverage'),
        lastAverage: document.querySelector('#lastAverage'),
        lapLength: document.querySelector('#lapLengthInput'),
        trackWidth: document.querySelector('#trackWidthInput'),
        trackWidthOutput: document.querySelector('#trackWidthOutput'),
        routeChance: document.querySelector('#routeChanceInput'),
        routeChanceOutput: document.querySelector('#routeChanceOutput'),
        laneTime: document.querySelector('#laneTimeInput'),
        laneTimeOutput: document.querySelector('#laneTimeOutput'),
        initialDelay: document.querySelector('#initialDelayInput'),
        initialDelayOutput: document.querySelector('#initialDelayOutput'),
        defaultSettings: document.querySelector('#defaultSettingsButton'),
        winnerImportInput: document.querySelector('#winnerImportInput'),
        importWinnersButton: document.querySelector('#importWinnersButton'),
        undoWinnerButton: document.querySelector('#undoWinnerButton'),
        clearWinnersButton: document.querySelector('#clearWinnersButton'),
        winnerImportStatus: document.querySelector('#winnerImportStatus'),
        importedCountBadge: document.querySelector('#importedCountBadge'),
        realSummary: document.querySelector('#realSummary'),
        recentRealWinners: document.querySelector('#recentRealWinners'),
        poolInputs: [...document.querySelectorAll('[data-pool-id]')],
        poolImportInput: document.querySelector('#poolImportInput'),
        importPoolButton: document.querySelector('#importPoolButton'),
        clearPoolButton: document.querySelector('#clearPoolButton'),
        poolImportStatus: document.querySelector('#poolImportStatus'),
        currentPoolBadge: document.querySelector('#currentPoolBadge'),
        closingPool: document.querySelector('#closingPoolInput'),
        publicStrategy: document.querySelector('#publicStrategyInput'),
        publicBias: document.querySelector('#publicBiasInput'),
        publicBiasOutput: document.querySelector('#publicBiasOutput'),
        oddsShare: document.querySelector('#oddsShareInput'),
        oddsShareOutput: document.querySelector('#oddsShareOutput'),
        oddsShareControl: document.querySelector('#oddsShareControl'),
        betStrategy: document.querySelector('#betStrategyInput'),
        bankroll: document.querySelector('#bankrollInput'),
        maxBet: document.querySelector('#maxBetInput'),
        betUnit: document.querySelector('#betUnitInput'),
        maxLossRate: document.querySelector('#maxLossRateInput'),
        maxLossRateOutput: document.querySelector('#maxLossRateOutput'),
        maxLossControl: document.querySelector('#maxLossControl'),
        existingBetInputs: [...document.querySelectorAll('[data-existing-bet-id]')],
        existingBetStatus: document.querySelector('#existingBetStatus'),
        analyzeBetButton: document.querySelector('#analyzeBetButton'),
        poolAnalysisBody: document.querySelector('#poolAnalysisBody'),
        projectionNote: document.querySelector('#projectionNote'),
        recommendationCard: document.querySelector('#recommendationCard'),
        recommendationLabel: document.querySelector('#recommendationLabel'),
        recommendationTitle: document.querySelector('#recommendationTitle'),
        recommendedBets: document.querySelector('#recommendedBets'),
        recommendationMetrics: document.querySelector('#recommendationMetrics'),
        recommendationNote: document.querySelector('#recommendationNote'),
        scenarioBody: document.querySelector('#scenarioBody'),
        marketSampleCount: document.querySelector('#marketSampleCount'),
        marketPoolGrowth: document.querySelector('#marketPoolGrowth'),
        marketOddsShare: document.querySelector('#marketOddsShare'),
        marketAverageClose: document.querySelector('#marketAverageClose'),
        marketPublicSuggestion: document.querySelector('#marketPublicSuggestion'),
        portfolioRobustTitle: document.querySelector('#portfolioRobustTitle'),
        portfolioRobustNote: document.querySelector('#portfolioRobustNote'),
        applyMarketMonitor: document.querySelector('#applyMarketMonitorButton'),
        clearMarketMonitor: document.querySelector('#clearMarketMonitorButton')
    };
    const context = elements.canvas.getContext('2d');
    const standingRows = new Map();
    let race;
    let raceNumber = 1;
    let playing = false;
    let simulationSpeed = 1;
    let lastFrameTime = 0;
    let accumulatedTime = 0;
    let animationFrame = 0;
    let batchRunId = 0;
    let importedWinners = [];
    let syncedObservedWins = null;
    let syncedRecentWinners = [];
    let remoteBetPoolKey = null;
    let marketState = {};
    let realStats = betting.mergeRealStats(engine.RACERS, importedWinners);

    function getConfig() {
        return engine.normalizeConfig({
            lapLength: Number(elements.lapLength.value),
            trackWidthSeconds: Number(elements.trackWidth.value),
            routeChangeChance: Number(elements.routeChance.value),
            laneCrossingSeconds: Number(elements.laneTime.value),
            initialDelay: Number(elements.initialDelay.value)
        });
    }

    function formatTime(seconds) {
        return seconds.toFixed(2).padStart(5, '0');
    }

    function formatPercent(value, digits = 2) {
        return `${(value * 100).toFixed(digits)}%`;
    }

    function formatChips(value, digits = 0) {
        return Math.round(value).toLocaleString('zh-CN', {maximumFractionDigits: digits});
    }

    function readStoredJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch {
            return fallback;
        }
    }

    function writeStoredJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // The app remains usable when storage is unavailable.
        }
    }

    function getProfile(id) {
        return engine.RACERS.find(profile => profile.id === id);
    }

    function getProbabilities() {
        return Object.fromEntries(realStats.racers.map(profile => [profile.id, profile.rate]));
    }

    function getCurrentPool() {
        return Object.fromEntries(elements.poolInputs.map(input => [input.dataset.poolId, Math.max(0, Number(input.value) || 0)]));
    }

    function getExistingBets() {
        return Object.fromEntries(elements.existingBetInputs.map(input => [input.dataset.existingBetId, Math.max(0, Number(input.value) || 0)]));
    }

    function detectPlatform() {
        const agent = navigator.userAgent.toLowerCase();

        if (agent.includes('android')) return 'ANDROID';
        if (agent.includes('electron') && agent.includes('windows')) return 'WINDOWS';
        if (agent.includes('electron') && agent.includes('macintosh')) return 'MACOS';
        return 'APP PREVIEW';
    }

    function createStandingRows() {
        elements.standings.replaceChildren();

        engine.RACERS.forEach(profile => {
            const row = document.createElement('div');
            row.className = 'standing-row';
            row.style.setProperty('--racer-color', profile.color);
            row.innerHTML = `
                <span class="place-number">—</span>
                <span class="racer-name"><i></i><strong>${profile.name}</strong></span>
                <span class="progress-cell">
                    <span class="progress-meta"><b>第 1 / 2 圈</b><em>0.0%</em></span>
                    <span class="progress-line"><i></i></span>
                </span>
                <span class="speed-value">${profile.baseSpeed.toFixed(1)}</span>
                <span class="event-badge">准备</span>`;
            elements.standings.append(row);
            standingRows.set(profile.id, row);
        });
    }

    function createBarRow(profile, rate, suffix) {
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.style.setProperty('--racer-color', profile.color);
        row.innerHTML = `<span>${profile.shortName}</span><span class="bar-track"><i></i></span><strong>${formatPercent(rate)}</strong>`;
        row.querySelector('.bar-track i').style.width = `${rate * 100}%`;

        if (suffix) {
            row.querySelector('strong').title = suffix;
        }

        return row;
    }

    function renderObservedBars() {
        elements.observedBars.replaceChildren();
        realStats.racers.forEach(profile => {
            elements.observedBars.append(createBarRow(profile, profile.rate, `${profile.wins} 胜`));
        });
    }

    function createPickCard(profile, rank) {
        const card = document.createElement('div');
        card.className = 'pick-card';
        card.style.setProperty('--racer-color', profile.color);
        card.innerHTML = `
            <span class="rank-number">${rank}</span>
            <i class="slime-dot"></i>
            <div><strong>${profile.shortName}</strong><small>${profile.wins} 胜 · ${formatPercent(profile.rate)}</small></div>`;
        return card;
    }

    function renderRealStats() {
        const observedProfiles = syncedObservedWins
            ? engine.RACERS.map(profile => ({...profile, observedWins: syncedObservedWins[profile.id] ?? profile.observedWins}))
            : engine.RACERS;
        const effectiveImportedWinners = syncedObservedWins ? [] : importedWinners;
        realStats = betting.mergeRealStats(observedProfiles, effectiveImportedWinners);
        const ranked = [...realStats.racers].sort((left, right) => right.rate - left.rate);
        const topPair = ranked.slice(0, 2);
        const coverage = topPair.reduce((total, profile) => total + profile.rate, 0);

        elements.sampleBadge.textContent = `${realStats.total} 场实盘`;
        elements.importedCountBadge.textContent = syncedObservedWins ? '联网同步' : `新增 ${realStats.importedTotal} 场`;
        elements.realCoverage.textContent = formatPercent(coverage);
        elements.realCoverageBar.style.width = `${coverage * 100}%`;
        elements.realCoverageNote.textContent = syncedObservedWins
            ? `已使用网站累计 ${realStats.total} 场实盘；本地手工记录不会重复计入。`
            : realStats.importedTotal > 0
            ? `已合并 ${realStats.importedTotal} 场新增实盘；模拟盘结果不会计入。`
            : '当前使用 459 场实盘基线；模拟盘结果不会计入。';
        elements.realPickPair.replaceChildren(createPickCard(topPair[0], 1));
        const plus = document.createElement('span');
        plus.className = 'pair-plus';
        plus.textContent = '+';
        elements.realPickPair.append(plus, createPickCard(topPair[1], 2));
        elements.centerPrediction.replaceChildren();
        topPair.forEach((profile, index) => {
            const dot = document.createElement('i');
            dot.className = 'mini-dot';
            dot.style.background = profile.color;
            elements.centerPrediction.append(dot, document.createTextNode(` ${profile.shortName} `));

            if (index === 0) {
                const separator = document.createElement('b');
                separator.textContent = '+';
                elements.centerPrediction.append(separator);
            }
        });
        elements.centerCoverage.textContent = `实盘覆盖率 ${formatPercent(coverage)}`;
        elements.realSummary.replaceChildren();
        realStats.racers.forEach(profile => {
            const card = document.createElement('div');
            card.className = 'real-stat';
            card.style.setProperty('--racer-color', profile.color);
            const source = syncedObservedWins ? '联网同步' : `新增 ${profile.importedWins}`;
            card.innerHTML = `<span>${profile.shortName}</span><strong>${profile.wins} 胜</strong><small>${formatPercent(profile.rate)} · ${source}</small>`;
            elements.realSummary.append(card);
        });

        renderObservedBars();
        renderRecentWinners();
        elements.undoWinnerButton.disabled = importedWinners.length === 0;
        elements.clearWinnersButton.disabled = importedWinners.length === 0;
    }

    function renderRecentWinners() {
        elements.recentRealWinners.replaceChildren();
        const recentWinners = syncedObservedWins ? syncedRecentWinners : importedWinners.slice(-12).reverse();

        if (recentWinners.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'form-status';
            empty.textContent = syncedObservedWins ? '网站最近场次暂时没有可用冠军。' : '尚未导入 459 场基线之后的新实盘赛果。';
            elements.recentRealWinners.append(empty);
            return;
        }

        recentWinners.forEach((id, index) => {
            const profile = getProfile(id);
            const chip = document.createElement('span');
            chip.className = 'recent-chip';
            chip.style.setProperty('--racer-color', profile.color);
            chip.innerHTML = `<i></i>${index === 0 ? '最近 · ' : ''}${profile.shortName}`;
            elements.recentRealWinners.append(chip);
        });
    }

    function setFormStatus(element, message, type = '') {
        element.textContent = message;
        element.className = `form-status${type ? ` ${type}` : ''}`;
    }

    function saveWinners() {
        writeStoredJson(STORAGE_KEYS.winners, importedWinners);
        renderRealStats();
        renderBetAnalysis();
    }

    function appendWinner(id) {
        importedWinners.push(id);
        saveWinners();
        setFormStatus(elements.winnerImportStatus, `已追加 1 场实盘冠军：${getProfile(id).shortName}。`, 'success');
    }

    function importWinners() {
        const parsed = betting.parseWinnerInput(elements.winnerImportInput.value);

        if (parsed.winnerIds.length === 0) {
            setFormStatus(elements.winnerImportStatus, parsed.invalidTokens.length > 0 ? `未识别：${parsed.invalidTokens.join('、')}` : '请先输入至少一场实盘冠军。', 'error');
            return;
        }

        importedWinners.push(...parsed.winnerIds);
        elements.winnerImportInput.value = '';
        saveWinners();
        const invalidNote = parsed.invalidTokens.length > 0 ? `；忽略未识别项：${parsed.invalidTokens.join('、')}` : '';
        setFormStatus(elements.winnerImportStatus, `成功导入 ${parsed.winnerIds.length} 场新增实盘${invalidNote}。`, parsed.invalidTokens.length > 0 ? 'error' : 'success');
    }

    function undoWinner() {
        const id = importedWinners.pop();

        if (!id) return;
        saveWinners();
        setFormStatus(elements.winnerImportStatus, `已撤销最近一场：${getProfile(id).shortName}。`, 'success');
    }

    function clearWinners() {
        if (importedWinners.length === 0 || !window.confirm('确定清空所有新增实盘记录吗？459 场基线不会受影响。')) return;
        importedWinners = [];
        saveWinners();
        setFormStatus(elements.winnerImportStatus, '已清空新增实盘记录，恢复为 459 场基线。', 'success');
    }

    function updateSettingsLabels() {
        elements.trackWidthOutput.value = `${Number(elements.trackWidth.value).toFixed(2)} 秒`;
        elements.routeChanceOutput.value = `${Math.round(Number(elements.routeChance.value) * 100)}%`;
        elements.laneTimeOutput.value = `${Number(elements.laneTime.value).toFixed(2)} 秒`;
        elements.initialDelayOutput.value = `${Number(elements.initialDelay.value).toFixed(2)} 秒`;
    }

    function setPoolInputs(stakes) {
        elements.poolInputs.forEach(input => {
            input.value = Math.max(0, Number(stakes?.[input.dataset.poolId]) || 0);
        });
    }

    function setExistingBetInputs(bets) {
        elements.existingBetInputs.forEach(input => {
            input.value = Math.max(0, Number(bets?.[input.dataset.existingBetId]) || 0);
        });
    }

    function savePoolAndSettings() {
        writeStoredJson(STORAGE_KEYS.pool, getCurrentPool());
        writeStoredJson(STORAGE_KEYS.betting, {
            closingPool: Math.max(0, Number(elements.closingPool.value) || 0),
            publicStrategy: elements.publicStrategy.value,
            publicBias: Math.max(0.5, Number(elements.publicBias.value) || 1.25),
            oddsShare: Math.min(1, Math.max(0, Number(elements.oddsShare.value) || 0)),
            betStrategy: elements.betStrategy.value,
            bankroll: Math.max(0, Number(elements.bankroll.value) || 0),
            maxBet: Math.max(0, Number(elements.maxBet.value) || 0),
            betUnit: Math.max(1, Number(elements.betUnit.value) || 1),
            maxLossRate: Math.min(0.2, Math.max(0.01, Number(elements.maxLossRate.value) || 0.05))
        });
    }

    function importPool() {
        const parsed = betting.parsePoolInput(elements.poolImportInput.value);
        const importedIds = Object.keys(parsed.stakes);

        if (importedIds.length === 0) {
            setFormStatus(elements.poolImportStatus, parsed.invalidEntries.length > 0 ? `未识别：${parsed.invalidEntries.join('；')}` : '请先输入至少一项押注池数据。', 'error');
            return;
        }

        setPoolInputs({...getCurrentPool(), ...parsed.stakes});
        elements.poolImportInput.value = '';
        renderBetAnalysis();
        const invalidNote = parsed.invalidEntries.length > 0 ? `；忽略：${parsed.invalidEntries.join('；')}` : '';
        setFormStatus(elements.poolImportStatus, `已导入 ${importedIds.length} 只史莱姆的当前押注${invalidNote}。`, parsed.invalidEntries.length > 0 ? 'error' : 'success');
    }

    function clearPool() {
        setPoolInputs({});
        renderBetAnalysis();
        setFormStatus(elements.poolImportStatus, '已清空当前实盘押注池。', 'success');
    }

    function applyRemoteSnapshot(snapshot) {
        if (Array.isArray(snapshot?.racers) && snapshot.racers.length === engine.RACERS.length) {
            syncedObservedWins = Object.fromEntries(snapshot.racers.map(racer => [racer.id, Math.max(0, Number(racer.wins) || 0)]));
        }

        if (snapshot?.mode === 'full' && Array.isArray(snapshot.recentWinnerIds)) {
            syncedRecentWinners = snapshot.recentWinnerIds.filter(id => betting.RACER_IDS.includes(id));
        }

        if (snapshot?.pool?.stakes) {
            setPoolInputs(snapshot.pool.stakes);
            setFormStatus(elements.poolImportStatus, `联网聚合池已更新：${formatChips(snapshot.pool.total)} 筹码；未保存其他玩家 ID。`, 'success');
        }

        const poolKey = `${snapshot?.current?.sessionId ?? 'none'}:${snapshot?.pool?.phase || 'unknown'}:${snapshot?.pool?.sessionId ?? 'open'}`;
        if (remoteBetPoolKey !== null && poolKey !== remoteBetPoolKey) {
            setExistingBetInputs({});
            elements.existingBetStatus.textContent = '检测到新盘口，已清空上一场仓位；等待下一次个人下注完整同步。';
        }
        remoteBetPoolKey = poolKey;

        if (snapshot?.currentUserPool?.stakes) {
            setExistingBetInputs(snapshot.currentUserPool.stakes);
            const total = Math.max(0, Number(snapshot.currentUserPool.total) || 0);
            elements.existingBetStatus.textContent = total > 0
                ? `已从当前实盘同步 ${formatChips(total)} 筹码；这些下注不可撤回，只分析是否追加。`
                : '当前实盘未识别到我的已提交下注，可手动填写后分析。';
        }

        if (snapshot?.account && Number.isFinite(Number(snapshot.account.magicFragments))) {
            const committed = Math.max(0, Number(snapshot.currentUserPool?.total) || 0);
            elements.bankroll.value = Math.max(0, Number(snapshot.account.magicFragments)) + committed;
        }

        renderRealStats();
        marketState = marketMonitor.recordSnapshot(marketState, snapshot, getProbabilities());
        writeStoredJson(STORAGE_KEYS.market, marketState);
        renderMarketMonitor();
        renderBetAnalysis();
    }

    function disconnectRemoteStats() {
        syncedObservedWins = null;
        syncedRecentWinners = [];
        remoteBetPoolKey = null;
        elements.existingBetStatus.textContent = '联网已断开；保留当前显示值供核对，可手动修改。';
        renderRealStats();
        renderBetAnalysis();
    }

    function createTableSlime(profile) {
        return `<span class="table-slime" style="--racer-color: ${profile.color}"><i></i>${profile.shortName}</span>`;
    }

    function formatSignedChips(value) {
        const rounded = Math.round(value);
        if (rounded === 0) return '0';
        return `${rounded > 0 ? '+' : '−'}${formatChips(Math.abs(rounded))}`;
    }

    function renderMarketMonitor() {
        const analysis = marketMonitor.analyze(marketState, getProbabilities());
        const publicLabels = {popular: '追历史热门', mixed: '混合群体', odds: '追高赔率冷门'};

        elements.marketSampleCount.textContent = `${analysis.samples} 次`;
        elements.marketPoolGrowth.textContent = formatSignedChips(analysis.currentGrowth);
        elements.marketOddsShare.textContent = analysis.estimatedOddsShare === null ? '等待样本' : formatPercent(analysis.estimatedOddsShare, 0);
        elements.marketAverageClose.textContent = analysis.completedRounds > 0
            ? `${formatChips(analysis.averageClosingTotal)} · ${analysis.completedRounds} 场`
            : '等待完整场次';
        elements.marketPublicSuggestion.textContent = publicLabels[analysis.recommendedPublicStrategy];
    }

    function renderPortfolioRobustness(analysis) {
        const robust = analysis.robust;
        const selected = realStats.racers.filter(profile => robust.additions[profile.id] > 0);
        const scenarioNames = {popular: '追热门', mixed: '混合', odds: '追高赔率'};
        const scenarioText = analysis.scenarios.map(scenario => {
            const names = realStats.racers.filter(profile => scenario.result.additions[profile.id] > 0).map(profile => profile.shortName);
            return `${scenarioNames[scenario.id]}：${names.join('+') || '等待'}`;
        }).join('；');

        if (selected.length === 0) {
            elements.portfolioRobustTitle.textContent = '稳健组合：等待，不追加';
            elements.portfolioRobustNote.textContent = `${scenarioText}。没有候选能在三种公众情景下同时保持正增量期望。`;
            return;
        }

        const betText = selected.map(profile => `${profile.shortName} +${formatChips(robust.additions[profile.id])}`).join('，');
        elements.portfolioRobustTitle.textContent = `稳健组合：${betText}`;
        elements.portfolioRobustNote.textContent = `${analysis.positiveScenarioCount}/3 种情景为正增量期望；最坏情景 ${formatSignedChips(robust.worstDeltaExpectedProfit)}，平均 ${formatSignedChips(robust.averageDeltaExpectedProfit)}。${scenarioText}。`;
    }

    function renderPoolTable(analysis) {
        elements.poolAnalysisBody.replaceChildren();

        realStats.racers.forEach(profile => {
            const item = analysis.racers[profile.id];
            const row = document.createElement('tr');
            const edgeClass = item.edge > 0.00005 ? 'value-positive' : item.edge < -0.00005 ? 'value-negative' : '';
            row.innerHTML = `
                <td>${createTableSlime(profile)}</td>
                <td>${formatPercent(item.probability)}</td>
                <td>${formatChips(item.stake)}</td>
                <td>${formatPercent(item.share)}</td>
                <td>${item.multiple === null ? '—' : `${item.multiple.toFixed(2)}×`}</td>
                <td class="${edgeClass}">${item.edge >= 0 ? '+' : ''}${(item.edge * 100).toFixed(2)}%</td>`;
            elements.poolAnalysisBody.append(row);
        });
    }

    function renderRecommendation(result) {
        const strategyLabels = {
            'max-ev': '最大期望净收益',
            'win-rate': '单场盈利概率优先',
            balanced: '风险调整后方案',
            preserve: '本金保护方案',
            'long-term': '长线稳健方案 · 每日5场',
            'high-odds': '高赔率价值方案'
        };
        const selected = realStats.racers.filter(profile => result.additions[profile.id] > 0);
        elements.recommendedBets.replaceChildren();
        elements.recommendationLabel.textContent = strategyLabels[result.strategy];

        if (result.invalidExistingSelection) {
            elements.recommendationTitle.textContent = '请先核对已下注仓位';
            const empty = document.createElement('div');
            empty.className = 'recommended-bet';
            empty.textContent = '已填写超过两只史莱姆，无法生成合规追加方案';
            elements.recommendedBets.append(empty);
        } else if (selected.length === 0) {
            elements.recommendationTitle.textContent = result.action === 'stop' ? '停止追加' : '等待，不下注';
            const empty = document.createElement('div');
            empty.className = 'recommended-bet';
            empty.textContent = result.action === 'stop' ? '保持已提交仓位，不再投入筹码' : '当前赔率下没有正增量期望方案';
            elements.recommendedBets.append(empty);
        } else {
            const action = result.action === 'add' ? '追加' : '下注';
            elements.recommendationTitle.textContent = `${action} ${selected.map(profile => profile.shortName).join(' + ')}`;
            selected.forEach(profile => {
                const item = document.createElement('div');
                item.className = 'recommended-bet';
                item.style.setProperty('--racer-color', profile.color);
                item.innerHTML = `<span><i></i>${profile.shortName}</span><strong>+${formatChips(result.additions[profile.id])} 筹码</strong>`;
                elements.recommendedBets.append(item);
            });
        }

        elements.recommendationMetrics.innerHTML = `
            <div><span>本轮追加</span><strong>${formatChips(result.additionalBet)}</strong></div>
            <div><span>最终累计投入</span><strong>${formatChips(result.totalBet)}</strong></div>
            <div><span>增量期望收益</span><strong class="${result.deltaExpectedProfit > 0 ? 'value-positive' : result.deltaExpectedProfit < 0 ? 'value-negative' : ''}">${formatSignedChips(result.deltaExpectedProfit)}</strong></div>
            <div><span>追加增量 ROI</span><strong>${result.additionalBet > 0 ? formatPercent(result.incrementalRoi) : '—'}</strong></div>
            <div><span>最终盈利概率</span><strong>${formatPercent(result.profitProbability)}</strong></div>
            <div><span>最坏情况</span><strong>${formatSignedChips(result.worstProfit)}</strong></div>`;
        const precisionNote = result.searchUnit > result.requestedUnit ? ` 为控制计算量，本次按 ${formatChips(result.searchUnit)} 筹码步长搜索。` : '';
        const strategyNotes = {
            'max-ev': '优先最大化追加带来的期望净收益，单场仍可能损失全部累计投入。',
            'win-rate': '先排除负增量期望，再优先提高这一场出现正净收益的概率；赔率不足的高胜率热门仍不会入选。',
            balanced: '同时惩罚预期下行风险，可能用较少筹码换取更平缓的波动。',
            preserve: result.riskBudgetExceeded
                ? `已提交下注超过 ${formatPercent(result.maxLossRate, 0)} 本金风险预算，无法撤回；本轮不会继续扩大风险。最坏赛果后预计剩余 ${formatChips(result.bankroll + result.worstProfit)} 筹码。`
                : `累计投入受 ${formatPercent(result.maxLossRate, 0)} 本金风险预算约束；最坏赛果后预计至少剩余 ${formatChips(result.bankroll + result.worstProfit)} 筹码。最多双押无法对四种冠军结果同时做到零亏损。`,
            'long-term': result.longTermBudgetExceeded
                ? '本场已提交仓位超过长线单场预算，无法撤回；为保护后续场次，本轮停止追加。'
                : '按每日 12:00、15:00、18:00、21:00、23:00 共五场规划；只选正增量期望且提高长期资金对数增长的组合，单场累计投入不超过赛前本金 1%，连续五场最坏结果后理论保留约 95.1% 本金，但不保证盈利。',
            'high-odds': '只在正增量期望候选中优先追加 ROI 与高返还倍数，波动和未押中概率通常更高。'
        };
        let actionNote = selected.length === 0 ? '“等待 / 停止追加”也参与比较；当前没有更好的正增量方案。' : strategyNotes[result.strategy];
        if (result.strategy === 'preserve' && result.riskBudgetExceeded) actionNote = strategyNotes.preserve;
        if (result.strategy === 'long-term' && result.longTermBudgetExceeded) actionNote = strategyNotes['long-term'];
        if (result.invalidExistingSelection) actionNote = '最多只能选择两只史莱姆；请核对手动输入或等待个人下注重新同步。';
        const baselineNote = result.existingTotal > 0 ? ` 已提交 ${formatChips(result.existingTotal)} 筹码被视为不可撤回。` : '';
        elements.recommendationNote.textContent = `${actionNote}${baselineNote}${precisionNote}`;
        window.dispatchEvent(new CustomEvent('slime-race-bet-recommendation', {
            detail: {
                poolKey: remoteBetPoolKey,
                strategy: result.strategy,
                bets: selected
                    .map(profile => ({racerId: profile.id, amount: result.additions[profile.id]}))
                    .sort((left, right) => right.amount - left.amount),
                additionalBet: result.additionalBet,
                deltaExpectedProfit: result.deltaExpectedProfit,
                invalid: result.invalidExistingSelection
            }
        }));
    }

    function renderScenarios(result) {
        elements.scenarioBody.replaceChildren();

        realStats.racers.forEach(profile => {
            const outcome = result.outcomes[profile.id];
            const ownBet = result.bets[profile.id];
            const multiple = outcome.finalRacerStake > 0 ? result.finalTotal / outcome.finalRacerStake : null;
            const row = document.createElement('tr');
            const profitClass = outcome.profit > 0 ? 'value-positive' : outcome.profit < 0 ? 'value-negative' : '';
            row.innerHTML = `
                <td>${createTableSlime(profile)}</td>
                <td>${formatChips(ownBet)}</td>
                <td>${multiple === null ? '—' : `${multiple.toFixed(2)}×`}</td>
                <td>${formatChips(outcome.grossReturn)}</td>
                <td class="${profitClass}">${formatSignedChips(outcome.profit)}</td>`;
            elements.scenarioBody.append(row);
        });
    }

    function renderBetAnalysis() {
        const currentPool = getCurrentPool();
        const existingBets = getExistingBets();
        const currentTotal = Object.values(currentPool).reduce((sum, value) => sum + value, 0);
        const probabilities = getProbabilities();
        const requestedClosingTotal = Math.max(0, Number(elements.closingPool.value) || 0);
        const publicStrategy = elements.publicStrategy.value;
        const publicBias = Math.max(0.5, Number(elements.publicBias.value) || 1.25);
        const oddsShare = Math.min(1, Math.max(0, Number(elements.oddsShare.value) || 0));
        const projected = betting.projectClosingPool(currentPool, requestedClosingTotal, probabilities, {
            strategy: publicStrategy,
            bias: publicBias,
            oddsShare
        });
        const analysis = betting.analyzePool(probabilities, projected.stakes);
        const bankroll = Math.max(0, Number(elements.bankroll.value) || 0);
        const maxBet = Math.max(0, Number(elements.maxBet.value) || 0);
        const unit = Math.max(1, Number(elements.betUnit.value) || 1);
        const strategy = elements.betStrategy.value;
        const maxLossRate = Math.min(0.2, Math.max(0.01, Number(elements.maxLossRate.value) || 0.05));
        const result = betting.optimizeAdditions(probabilities, projected.stakes, existingBets, {
            maxBet,
            bankroll,
            unit,
            strategy,
            maxLossRate,
            riskAversion: 0.75
        });
        const robustness = betting.analyzePortfolioScenarios(probabilities, currentPool, existingBets, {
            expectedTotal: requestedClosingTotal,
            publicBias,
            oddsShare,
            maxBet,
            bankroll,
            unit,
            strategy,
            maxLossRate,
            riskAversion: 0.75,
            maxSteps: 80
        });
        const projectionDescriptions = {
            popular: `按历史胜率的 ${publicBias.toFixed(2)} 次方追热门`,
            odds: `按当前池占比倒数的 ${publicBias.toFixed(2)} 次方追高赔率`,
            uniform: '在四只史莱姆间均匀分配',
            mixed: `由 ${formatPercent(1 - oddsShare, 0)} 追热门与 ${formatPercent(oddsShare, 0)} 追高赔率人群混合`
        };

        elements.publicBiasOutput.value = publicBias.toFixed(2);
        elements.oddsShareOutput.value = formatPercent(oddsShare, 0);
        elements.oddsShare.disabled = publicStrategy !== 'mixed';
        elements.oddsShareControl.classList.toggle('control-disabled', publicStrategy !== 'mixed');
        elements.maxLossRateOutput.value = formatPercent(maxLossRate, 0);
        elements.maxLossRate.disabled = strategy !== 'preserve';
        elements.maxLossControl.classList.toggle('control-disabled', strategy !== 'preserve');
        elements.currentPoolBadge.textContent = `${formatChips(currentTotal)} 筹码`;
        elements.projectionNote.textContent = projected.added > 0
            ? `当前池 ${formatChips(currentTotal)}；预计还有 ${formatChips(projected.added)} 公众筹码进入，${projectionDescriptions[publicStrategy]}。`
            : `当前池 ${formatChips(currentTotal)} 已达到预计封盘总池，直接按当前实盘池分析。`;
        renderPoolTable(analysis);
        renderRecommendation(result);
        renderScenarios(result);
        renderPortfolioRobustness(robustness);
        savePoolAndSettings();
    }

    function updatePlayButton() {
        if (race.finished) {
            elements.playIcon.textContent = '＋';
            elements.playLabel.textContent = '下一场';
            return;
        }

        elements.playIcon.textContent = playing ? 'Ⅱ' : '▶';
        elements.playLabel.textContent = playing ? '暂停' : race.elapsed > 0 ? '继续比赛' : '开始比赛';
    }

    function resetRace(options = {}) {
        playing = false;

        if (options.advance) {
            raceNumber += 1;
            elements.seedInput.value = `slime-${String(raceNumber).padStart(3, '0')}`;
        }

        race = engine.createRace(getConfig(), elements.seedInput.value.trim() || `slime-${raceNumber}`);
        accumulatedTime = 0;
        lastFrameTime = 0;
        elements.winnerBanner.hidden = true;
        elements.trackCenterCard.hidden = false;
        updatePlayButton();
        renderRace();
    }

    function toggleRace() {
        if (race.finished) {
            resetRace({advance: true});
            playing = true;
        } else {
            playing = !playing;
        }

        lastFrameTime = 0;
        updatePlayButton();
    }

    function updateStandingRows() {
        const standings = engine.getStandings(race);

        standings.forEach((racer, index) => {
            const row = standingRows.get(racer.profile.id);
            const progress = Math.min(1, racer.progress / race.config.laps);
            const currentLap = racer.finishTime === null ? Math.min(race.config.laps, Math.floor(racer.progress) + 1) : race.config.laps;
            const eventName = racer.finishTime === null ? engine.EVENTS[racer.event] : `第 ${racer.place} 名`;
            const eventClass = racer.finishTime === null ? racer.event : 'finished';
            row.querySelector('.place-number').textContent = `0${index + 1}`;
            row.querySelector('.progress-meta b').textContent = `第 ${currentLap} / ${race.config.laps} 圈`;
            row.querySelector('.progress-meta em').textContent = formatPercent(progress, 1);
            row.querySelector('.progress-line i').style.width = `${progress * 100}%`;
            row.querySelector('.speed-value').textContent = racer.finishTime === null ? racer.speed.toFixed(1) : `${racer.finishTime.toFixed(2)}s`;
            row.querySelector('.event-badge').textContent = eventName;
            row.querySelector('.event-badge').className = `event-badge ${eventClass}`;
            elements.standings.append(row);
        });
    }

    function drawEllipse(x, y, radiusX, radiusY) {
        context.beginPath();
        context.ellipse(x, y, Math.max(1, radiusX), Math.max(1, radiusY), 0, 0, Math.PI * 2);
    }

    function drawTrack(width, height) {
        const minSize = Math.min(width, height);
        const centerX = width / 2;
        const centerY = height / 2;
        const radiusX = width * 0.345;
        const radiusY = height * 0.325;
        const trackWidth = minSize * 0.18;
        const outerX = radiusX + trackWidth / 2;
        const outerY = radiusY + trackWidth / 2;
        const innerX = radiusX - trackWidth / 2;
        const innerY = radiusY - trackWidth / 2;
        const background = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.6);
        background.addColorStop(0, '#0b2030');
        background.addColorStop(1, '#06101b');
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);

        context.save();
        context.shadowColor = 'rgba(0, 0, 0, 0.45)';
        context.shadowBlur = 32;
        drawEllipse(centerX, centerY, outerX, outerY);
        context.fillStyle = '#172d3a';
        context.fill();
        context.restore();

        drawEllipse(centerX, centerY, outerX, outerY);
        context.strokeStyle = 'rgba(112, 155, 175, 0.28)';
        context.lineWidth = 2;
        context.stroke();

        drawEllipse(centerX, centerY, innerX, innerY);
        context.fillStyle = '#0a1b27';
        context.fill();
        context.strokeStyle = 'rgba(112, 155, 175, 0.22)';
        context.stroke();

        context.save();
        context.setLineDash([5, 9]);
        drawEllipse(centerX, centerY, radiusX, radiusY);
        context.strokeStyle = 'rgba(168, 203, 218, 0.16)';
        context.lineWidth = 1;
        context.stroke();
        context.restore();

        const lineGradient = context.createLinearGradient(centerX - trackWidth / 2, 0, centerX + trackWidth / 2, 0);
        lineGradient.addColorStop(0, '#e8f6ff');
        lineGradient.addColorStop(0.5, '#587383');
        lineGradient.addColorStop(1, '#e8f6ff');
        context.strokeStyle = lineGradient;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(centerX, centerY - innerY);
        context.lineTo(centerX, centerY - outerY);
        context.stroke();

        return {centerX, centerY, radiusX, radiusY, trackWidth};
    }

    function drawRacer(racer, geometry, scale) {
        const angle = (racer.progress % 1) * Math.PI * 2 - Math.PI / 2;
        const laneOffset = racer.lane * geometry.trackWidth;
        const radiusX = geometry.radiusX + laneOffset;
        const radiusY = geometry.radiusY + laneOffset;
        const x = geometry.centerX + Math.cos(angle) * radiusX;
        const y = geometry.centerY + Math.sin(angle) * radiusY;
        const radius = Math.max(7, Math.min(12, 9 * scale));

        context.save();
        context.globalAlpha = 0.22;
        context.fillStyle = racer.profile.color;
        context.beginPath();
        context.arc(x - Math.cos(angle) * radius * 1.4, y - Math.sin(angle) * radius * 1.4, radius * 0.72, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.shadowColor = racer.profile.color;
        context.shadowBlur = racer.event === 'burst' ? 22 : 13;
        context.fillStyle = racer.profile.color;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        context.fillStyle = 'rgba(255, 255, 255, 0.7)';
        context.beginPath();
        context.arc(x - radius * 0.28, y - radius * 0.3, radius * 0.22, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }

    function drawRace() {
        const rect = elements.canvas.getBoundingClientRect();
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.round(rect.width * pixelRatio);
        const targetHeight = Math.round(rect.height * pixelRatio);

        if (elements.canvas.width !== targetWidth || elements.canvas.height !== targetHeight) {
            elements.canvas.width = targetWidth;
            elements.canvas.height = targetHeight;
        }

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        const geometry = drawTrack(rect.width, rect.height);
        const scale = Math.min(rect.width / 760, rect.height / 450);
        const drawingOrder = [...race.racers].sort((left, right) => left.progress - right.progress);
        drawingOrder.forEach(racer => drawRacer(racer, geometry, scale));
    }

    function renderRace() {
        elements.raceTime.textContent = formatTime(race.elapsed);

        if (race.finished) {
            elements.raceTitle.textContent = `第 ${raceNumber} 场 · 全部完赛`;
        } else if (race.winner) {
            elements.raceTitle.textContent = `第 ${raceNumber} 场 · 冠军已产生`;
        } else if (playing) {
            elements.raceTitle.textContent = `第 ${raceNumber} 场 · 比赛进行中`;
        } else {
            elements.raceTitle.textContent = `第 ${raceNumber} 场 · ${race.elapsed > 0 ? '已暂停' : '等待开始'}`;
        }

        if (race.winner) {
            elements.winnerName.textContent = `${race.winner.profile.name} · ${race.winner.finishTime.toFixed(2)} 秒`;
            elements.winnerName.style.color = race.winner.profile.color;
            elements.winnerBanner.hidden = false;
            elements.trackCenterCard.hidden = true;
        }

        updateStandingRows();
        drawRace();
    }

    function runAnimation(timestamp) {
        if (!lastFrameTime) {
            lastFrameTime = timestamp;
        }

        const realDelta = Math.min((timestamp - lastFrameTime) / 1000, 0.2);
        lastFrameTime = timestamp;

        if (playing && !race.finished) {
            accumulatedTime += realDelta * simulationSpeed;

            while (accumulatedTime >= race.config.stepSeconds) {
                engine.stepRace(race);
                accumulatedTime -= race.config.stepSeconds;
            }

            if (race.finished) {
                playing = false;
                updatePlayButton();
            }
        }

        renderRace();
        animationFrame = requestAnimationFrame(runAnimation);
    }

    async function yieldToInterface() {
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    async function runBatchSimulation() {
        const total = Math.max(100, Math.min(50000, Math.round(Number(elements.batchCount.value) || 3000)));
        const config = getConfig();
        const seed = elements.seedInput.value.trim() || 'slime-batch';
        const runId = ++batchRunId;
        const counts = Object.fromEntries(engine.RACERS.map(profile => [profile.id, 0]));
        let firstTimeTotal = 0;
        let lastTimeTotal = 0;

        elements.batchCount.value = total;
        elements.batchButton.disabled = true;
        elements.batchButton.textContent = '计算中…';
        elements.batchProgress.hidden = false;
        elements.batchPlaceholder.hidden = true;
        elements.batchResults.hidden = true;
        elements.batchProgressBar.style.width = '0%';

        for (let start = 0; start < total; start += 25) {
            const end = Math.min(total, start + 25);

            for (let index = start; index < end; index += 1) {
                const simulatedRace = engine.runRace(config, `${seed}:batch:${index}`);
                counts[simulatedRace.winner.profile.id] += 1;
                firstTimeTotal += simulatedRace.finishOrder[0].finishTime;
                lastTimeTotal += simulatedRace.finishOrder[3].finishTime;
            }

            elements.batchProgressBar.style.width = `${end / total * 100}%`;
            await yieldToInterface();

            if (runId !== batchRunId) {
                return;
            }
        }

        renderBatchResults(counts, total, firstTimeTotal / total, lastTimeTotal / total);
        elements.batchButton.disabled = false;
        elements.batchButton.textContent = '再次模拟';
        elements.batchProgress.hidden = true;
        elements.batchResults.hidden = false;
    }

    function renderBatchResults(counts, total, firstAverage, lastAverage) {
        const ranked = [...engine.RACERS].sort((left, right) => counts[right.id] - counts[left.id]);
        const pairWins = counts[ranked[0].id] + counts[ranked[1].id];
        elements.modelPair.textContent = `${ranked[0].shortName} + ${ranked[1].shortName}`;
        elements.modelCoverage.textContent = formatPercent(pairWins / total);
        elements.firstAverage.textContent = `${firstAverage.toFixed(2)} 秒`;
        elements.lastAverage.textContent = `${lastAverage.toFixed(2)} 秒`;
        elements.simulatedBars.replaceChildren();

        engine.RACERS.forEach(profile => {
            const rate = counts[profile.id] / total;
            elements.simulatedBars.append(createBarRow(profile, rate, `${counts[profile.id]} 胜`));
        });
    }

    function restoreDefaultSettings() {
        const defaults = engine.DEFAULT_CONFIG;
        elements.lapLength.value = defaults.lapLength;
        elements.trackWidth.value = defaults.trackWidthSeconds;
        elements.routeChance.value = defaults.routeChangeChance;
        elements.laneTime.value = defaults.laneCrossingSeconds;
        elements.initialDelay.value = defaults.initialDelay;
        updateSettingsLabels();
        resetRace();
    }

    function clearMarketHistory() {
        if (!window.confirm('确定清空本机保存的逐场聚合盘口监控记录吗？')) return;
        marketState = {};
        writeStoredJson(STORAGE_KEYS.market, marketState);
        renderMarketMonitor();
    }

    function applyMarketSuggestion() {
        const analysis = marketMonitor.analyze(marketState, getProbabilities());

        if (analysis.averageClosingTotal > 0) elements.closingPool.value = Math.round(analysis.averageClosingTotal);
        if (analysis.estimatedOddsShare !== null) elements.oddsShare.value = analysis.estimatedOddsShare.toFixed(2);
        elements.publicStrategy.value = analysis.recommendedPublicStrategy;
        renderBetAnalysis();
    }

    function loadPersistentState() {
        const storedWinners = readStoredJson(STORAGE_KEYS.winners, []);
        const storedPool = readStoredJson(STORAGE_KEYS.pool, {});
        const storedBetting = readStoredJson(STORAGE_KEYS.betting, {});
        marketState = readStoredJson(STORAGE_KEYS.market, {});

        importedWinners = Array.isArray(storedWinners) ? storedWinners.filter(id => betting.RACER_IDS.includes(id)) : [];
        setPoolInputs(storedPool);
        if (Number.isFinite(Number(storedBetting.closingPool))) elements.closingPool.value = Math.max(0, Number(storedBetting.closingPool));
        if (['popular', 'odds', 'mixed', 'uniform'].includes(storedBetting.publicStrategy)) elements.publicStrategy.value = storedBetting.publicStrategy;
        if (Number.isFinite(Number(storedBetting.publicBias))) elements.publicBias.value = Math.min(2, Math.max(0.5, Number(storedBetting.publicBias)));
        if (Number.isFinite(Number(storedBetting.oddsShare))) elements.oddsShare.value = Math.min(1, Math.max(0, Number(storedBetting.oddsShare)));
        if (['max-ev', 'win-rate', 'balanced', 'preserve', 'long-term', 'high-odds'].includes(storedBetting.betStrategy)) elements.betStrategy.value = storedBetting.betStrategy;
        if (Number.isFinite(Number(storedBetting.bankroll))) elements.bankroll.value = Math.max(0, Number(storedBetting.bankroll));
        if (Number.isFinite(Number(storedBetting.maxBet))) elements.maxBet.value = Math.max(0, Number(storedBetting.maxBet));
        if (Number.isFinite(Number(storedBetting.maxLossRate))) elements.maxLossRate.value = Math.min(0.2, Math.max(0.01, Number(storedBetting.maxLossRate)));
    }

    function bindEvents() {
        elements.playButton.addEventListener('click', toggleRace);
        elements.resetButton.addEventListener('click', () => resetRace({advance: true}));
        elements.seedInput.addEventListener('change', () => resetRace());
        elements.batchButton.addEventListener('click', runBatchSimulation);
        elements.defaultSettings.addEventListener('click', restoreDefaultSettings);
        elements.importWinnersButton.addEventListener('click', importWinners);
        elements.undoWinnerButton.addEventListener('click', undoWinner);
        elements.clearWinnersButton.addEventListener('click', clearWinners);
        document.querySelectorAll('[data-winner]').forEach(button => {
            button.addEventListener('click', () => appendWinner(button.dataset.winner));
        });
        elements.importPoolButton.addEventListener('click', importPool);
        elements.clearPoolButton.addEventListener('click', clearPool);
        elements.applyMarketMonitor.addEventListener('click', applyMarketSuggestion);
        elements.clearMarketMonitor.addEventListener('click', clearMarketHistory);
        elements.analyzeBetButton.addEventListener('click', renderBetAnalysis);
        elements.poolInputs.forEach(input => input.addEventListener('change', renderBetAnalysis));
        elements.existingBetInputs.forEach(input => input.addEventListener('change', () => {
            elements.existingBetStatus.textContent = '已使用手动填写的不可撤回仓位；请确认这些筹码已包含在当前总押注池中。';
            renderBetAnalysis();
        }));
        [elements.closingPool, elements.publicStrategy, elements.betStrategy, elements.bankroll, elements.maxBet, elements.betUnit].forEach(input => {
            input.addEventListener('change', renderBetAnalysis);
        });
        elements.publicBias.addEventListener('input', () => {
            elements.publicBiasOutput.value = Number(elements.publicBias.value).toFixed(2);
        });
        elements.publicBias.addEventListener('change', renderBetAnalysis);
        elements.oddsShare.addEventListener('input', () => {
            elements.oddsShareOutput.value = formatPercent(Number(elements.oddsShare.value), 0);
        });
        elements.oddsShare.addEventListener('change', renderBetAnalysis);
        elements.maxLossRate.addEventListener('input', () => {
            elements.maxLossRateOutput.value = formatPercent(Number(elements.maxLossRate.value), 0);
        });
        elements.maxLossRate.addEventListener('change', renderBetAnalysis);
        document.querySelectorAll('.speed-button').forEach(button => {
            button.addEventListener('click', () => {
                simulationSpeed = Number(button.dataset.speed);
                document.querySelectorAll('.speed-button').forEach(item => item.classList.toggle('active', item === button));
            });
        });

        [elements.trackWidth, elements.routeChance, elements.laneTime, elements.initialDelay].forEach(input => {
            input.addEventListener('input', updateSettingsLabels);
            input.addEventListener('change', () => resetRace());
        });
        elements.lapLength.addEventListener('change', () => resetRace());
        window.addEventListener('slime-race-remote-snapshot', event => applyRemoteSnapshot(event.detail));
        window.addEventListener('slime-race-remote-disconnected', disconnectRemoteStats);
        window.addEventListener('resize', drawRace);
        document.addEventListener('visibilitychange', () => {
            lastFrameTime = 0;
        });
    }

    function initialize() {
        elements.platformBadge.textContent = detectPlatform();
        loadPersistentState();
        createStandingRows();
        renderRealStats();
        renderMarketMonitor();
        updateSettingsLabels();
        bindEvents();
        renderBetAnalysis();
        resetRace();
        animationFrame = requestAnimationFrame(runAnimation);
    }

    window.addEventListener('beforeunload', () => cancelAnimationFrame(animationFrame));
    initialize();
})();
