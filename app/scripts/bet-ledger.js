(function exposeBetLedger(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SlimeBetLedger = api;
})(typeof globalThis === 'object' ? globalThis : this, function createBetLedger() {
    'use strict';

    const SCHEMA_VERSION = 1;
    const STORAGE_PREFIX = 'slime-race-lab.bet-ledger.v1';
    const TIME_ZONE = 'Asia/Shanghai';
    const RACER_IDS = Object.freeze(['melon', 'blueberry', 'dragonfruit', 'lemon']);

    function toFiniteNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function hashIdentity(value) {
        let first = 2166136261;
        let second = 2246822507;
        for (const character of String(value)) {
            const code = character.charCodeAt(0);
            first = Math.imul(first ^ code, 16777619);
            second = Math.imul(second ^ code, 3266489909);
        }
        return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
    }

    function getAccountStorageKey(rawAccount) {
        const identity = rawAccount?.id ?? rawAccount?.username;
        if (identity === null || identity === undefined || String(identity).trim() === '') return null;
        return `u-${hashIdentity(`slime-race-ledger:${identity}`)}`;
    }

    function getStorageKey(accountKey) {
        const normalized = String(accountKey || '').trim();
        if (!/^u-[a-z0-9]+$/i.test(normalized)) throw new Error('本地押注账本账号标识无效');
        return `${STORAGE_PREFIX}.${normalized}`;
    }

    function createEmptyLedger(accountKey) {
        return {schemaVersion: SCHEMA_VERSION, accountKey, updatedAt: null, records: []};
    }

    function normalizeBet(bet) {
        const racerId = String(bet?.racerId || '');
        if (!RACER_IDS.includes(racerId)) return null;
        return {
            racerId,
            amount: Math.max(0, Math.round(toFiniteNumber(bet.amount))),
            won: bet.won === true,
            rewardAmount: Math.max(0, Math.round(toFiniteNumber(bet.rewardAmount))),
            rewardClaimed: bet.rewardClaimed === true
        };
    }

    function normalizeRecord(record) {
        const sessionId = Number(record?.sessionId);
        const settledAt = new Date(record?.settledAt || '').toISOString();
        const bets = (Array.isArray(record?.bets) ? record.bets : []).map(normalizeBet).filter(Boolean);
        if (!Number.isSafeInteger(sessionId) || sessionId <= 0 || bets.length === 0) return null;
        const spent = bets.reduce((sum, bet) => sum + bet.amount, 0);
        const returned = bets.reduce((sum, bet) => sum + bet.rewardAmount, 0);
        return {
            sessionId,
            settledAt,
            dateKey: getDateKey(settledAt),
            winnerId: RACER_IDS.includes(record?.winnerId) ? record.winnerId : null,
            bets,
            spent,
            returned,
            netProfit: returned - spent
        };
    }

    function normalizeLedger(value, accountKey) {
        if (value?.schemaVersion !== SCHEMA_VERSION || value?.accountKey !== accountKey || !Array.isArray(value.records)) {
            return createEmptyLedger(accountKey);
        }
        const records = value.records.map(record => {
            try {
                return normalizeRecord(record);
            } catch {
                return null;
            }
        }).filter(Boolean).sort((left, right) => right.sessionId - left.sessionId);
        return {schemaVersion: SCHEMA_VERSION, accountKey, updatedAt: value.updatedAt || null, records};
    }

    function loadLedger(storage, accountKey) {
        try {
            return normalizeLedger(JSON.parse(storage?.getItem(getStorageKey(accountKey)) || 'null'), accountKey);
        } catch {
            return createEmptyLedger(accountKey);
        }
    }

    function saveLedger(storage, ledger) {
        storage?.setItem(getStorageKey(ledger.accountKey), JSON.stringify(ledger));
    }

    function getDateKey(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) throw new Error('押注结算时间无效');
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const get = type => parts.find(part => part.type === type)?.value;
        return `${get('year')}-${get('month')}-${get('day')}`;
    }

    function getSettledAt(session, bets, fallback, previous) {
        if (!session && previous) return previous;
        const startedAt = session?.raceStartAt || session?.startedAt || bets.find(bet => bet.createdAt)?.createdAt || fallback;
        const start = new Date(startedAt || '').getTime();
        if (!Number.isFinite(start)) return new Date(fallback).toISOString();
        return new Date(start + Math.max(0, toFiniteNumber(session?.totalDurationMs))).toISOString();
    }

    function createSessionRecord(sessionId, bets, session, fallback, previous) {
        const byRacer = new Map();
        for (const rawBet of bets) {
            const bet = normalizeBet(rawBet);
            if (!bet) continue;
            const aggregate = byRacer.get(bet.racerId) || {racerId: bet.racerId, amount: 0, won: false, rewardAmount: 0, rewardClaimed: true};
            aggregate.amount += bet.amount;
            aggregate.won ||= bet.won;
            aggregate.rewardAmount += bet.rewardAmount;
            aggregate.rewardClaimed &&= bet.rewardClaimed;
            byRacer.set(bet.racerId, aggregate);
        }
        return normalizeRecord({
            sessionId,
            settledAt: getSettledAt(session, bets, fallback, previous?.settledAt),
            winnerId: session?.winnerId || bets.find(bet => bet.won)?.racerId || previous?.winnerId || null,
            bets: [...byRacer.values()]
        });
    }

    function mergeSettledBets(ledger, snapshot, mergedAt = new Date().toISOString()) {
        const accountKey = snapshot?.account?.storageKey;
        const current = normalizeLedger(ledger, accountKey);
        const sessions = new Map((Array.isArray(snapshot?.sessions) ? snapshot.sessions : [])
            .filter(session => Number.isSafeInteger(Number(session?.sessionId)))
            .map(session => [Number(session.sessionId), session]));
        const grouped = new Map();

        for (const bet of Array.isArray(snapshot?.myBets) ? snapshot.myBets : []) {
            const sessionId = Number(bet?.sessionId);
            const session = sessions.get(sessionId);
            const finished = bet?.sessionStatus === 'finished' || session?.status === 'finished';
            if (!Number.isSafeInteger(sessionId) || sessionId <= 0 || !finished) continue;
            if (!grouped.has(sessionId)) grouped.set(sessionId, []);
            grouped.get(sessionId).push(bet);
        }

        const bySession = new Map(current.records.map(record => [record.sessionId, record]));
        let changed = false;
        for (const [sessionId, bets] of grouped) {
            const record = createSessionRecord(sessionId, bets, sessions.get(sessionId), mergedAt, bySession.get(sessionId));
            if (!record) continue;
            if (JSON.stringify(bySession.get(sessionId)) !== JSON.stringify(record)) {
                bySession.set(sessionId, record);
                changed = true;
            }
        }
        if (!changed) return {ledger: current, changed: false, added: 0};

        const added = [...grouped.keys()].filter(sessionId => !current.records.some(record => record.sessionId === sessionId)).length;
        const records = [...bySession.values()].sort((left, right) => right.sessionId - left.sessionId);
        return {
            ledger: {schemaVersion: SCHEMA_VERSION, accountKey, updatedAt: mergedAt, records},
            changed: true,
            added
        };
    }

    function getRecentDailySummaries(ledger, now = new Date().toISOString(), dayCount = 3) {
        const count = Math.max(1, Math.min(31, Math.round(toFiniteNumber(dayCount, 3))));
        const currentTime = new Date(now).getTime();
        const dateKeys = Array.from({length: count}, (_, index) => getDateKey(currentTime - index * 86400000));
        const records = Array.isArray(ledger?.records) ? ledger.records : [];
        const days = dateKeys.map(dateKey => {
            const dayRecords = records.filter(record => record.dateKey === dateKey);
            const spent = dayRecords.reduce((sum, record) => sum + record.spent, 0);
            const returned = dayRecords.reduce((sum, record) => sum + record.returned, 0);
            return {
                dateKey,
                records: dayRecords,
                sessions: dayRecords.length,
                bets: dayRecords.reduce((sum, record) => sum + record.bets.length, 0),
                spent,
                returned,
                netProfit: returned - spent
            };
        });
        return {
            days,
            sessions: days.reduce((sum, day) => sum + day.sessions, 0),
            bets: days.reduce((sum, day) => sum + day.bets, 0),
            spent: days.reduce((sum, day) => sum + day.spent, 0),
            returned: days.reduce((sum, day) => sum + day.returned, 0),
            netProfit: days.reduce((sum, day) => sum + day.netProfit, 0)
        };
    }

    return Object.freeze({
        SCHEMA_VERSION,
        STORAGE_PREFIX,
        TIME_ZONE,
        getAccountStorageKey,
        getStorageKey,
        createEmptyLedger,
        loadLedger,
        saveLedger,
        mergeSettledBets,
        getRecentDailySummaries
    });
});
