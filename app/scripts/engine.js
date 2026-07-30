(function exposeEngine(root, factory) {
    const engine = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = engine;
    }

    root.SlimeRaceEngine = engine;
})(typeof globalThis === 'object' ? globalThis : this, function createEngine() {
    'use strict';

    const TAU = Math.PI * 2;
    const RACERS = Object.freeze([
        Object.freeze({id: 'melon', name: '迷你哈密瓜', shortName: '哈密瓜', color: '#42e695', baseSpeed: 85, stumble: [0.65, 0.7], burst: [1.55, 1.6], observedWins: 78}),
        Object.freeze({id: 'blueberry', name: '迷你蓝莓', shortName: '蓝莓', color: '#4c8dff', baseSpeed: 87, stumble: [0.55, 0.7], burst: [1.45, 1.6], observedWins: 115}),
        Object.freeze({id: 'dragonfruit', name: '迷你火龙果', shortName: '火龙果', color: '#ff5f6d', baseSpeed: 88, stumble: [0.5, 0.7], burst: [1.4, 1.6], observedWins: 167}),
        Object.freeze({id: 'lemon', name: '迷你柠檬', shortName: '柠檬', color: '#ffd84d', baseSpeed: 86, stumble: [0.6, 0.7], burst: [1.5, 1.6], observedWins: 99})
    ]);
    const EVENTS = Object.freeze({normal: '正常', stumble: '绊倒', burst: '疾冲', ready: '准备'});
    const DEFAULT_CONFIG = Object.freeze({
        lapLength: 2000,
        trackWidthSeconds: 1,
        laps: 2,
        initialDelay: 5,
        initialDelayJitter: 0.25,
        eventMinDuration: 1,
        eventMaxDuration: 1.5,
        routeChangeChance: 0.72,
        laneCrossingSeconds: 1.2,
        stepSeconds: 0.05,
        smoothing: 0.1,
        maxRaceSeconds: 90
    });

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function randomBetween(random, min, max) {
        return min + random() * (max - min);
    }

    function hashSeed(value) {
        const text = String(value || 'slime-race');
        let hash = 2166136261;

        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return hash >>> 0;
    }

    function createRandom(seed) {
        let state = hashSeed(seed);

        return function nextRandom() {
            state += 0x6D2B79F5;
            let value = state;
            value = Math.imul(value ^ value >>> 15, value | 1);
            value ^= value + Math.imul(value ^ value >>> 7, value | 61);
            return ((value ^ value >>> 14) >>> 0) / 4294967296;
        };
    }

    function normalizeConfig(overrides) {
        const config = {...DEFAULT_CONFIG, ...(overrides || {})};
        config.lapLength = clamp(Number(config.lapLength) || DEFAULT_CONFIG.lapLength, 500, 10000);
        config.trackWidthSeconds = clamp(Number(config.trackWidthSeconds) || 0, 0, 3);
        config.laps = clamp(Math.round(Number(config.laps) || DEFAULT_CONFIG.laps), 1, 10);
        config.initialDelay = clamp(Number(config.initialDelay) || 0, 0, 15);
        config.routeChangeChance = clamp(Number(config.routeChangeChance) || 0, 0, 1);
        config.laneCrossingSeconds = clamp(Number(config.laneCrossingSeconds) || DEFAULT_CONFIG.laneCrossingSeconds, 0.2, 5);
        return config;
    }

    function selectEvent(racer, race) {
        const roll = race.random();
        let event = 'normal';

        if (roll < 0.15) {
            event = 'stumble';
        } else if (roll < 0.3) {
            event = 'burst';
        }

        const range = event === 'normal' ? [1, 1] : racer.profile[event];
        racer.event = event;
        racer.multiplier = randomBetween(race.random, range[0], range[1]);
        racer.targetSpeed = racer.profile.baseSpeed * racer.multiplier;
        racer.eventRemaining = randomBetween(race.random, race.config.eventMinDuration, race.config.eventMaxDuration);
    }

    function selectLane(racer, race) {
        racer.routeGate += 1;

        if (race.random() <= race.config.routeChangeChance) {
            racer.targetLane = randomBetween(race.random, -0.5, 0.5);
        }
    }

    function createRace(overrides, seed) {
        const config = normalizeConfig(overrides);
        const random = createRandom(seed);
        const racers = RACERS.map(profile => ({
            profile,
            speed: profile.baseSpeed * randomBetween(random, 0.8, 1.2),
            targetSpeed: profile.baseSpeed,
            multiplier: 1,
            event: 'ready',
            eventRemaining: config.initialDelay + randomBetween(random, -config.initialDelayJitter, config.initialDelayJitter),
            progress: 0,
            lane: randomBetween(random, -0.12, 0.12),
            targetLane: randomBetween(random, -0.2, 0.2),
            routeGate: 0,
            finishTime: null,
            place: null
        }));

        return {config, random, racers, elapsed: 0, winner: null, finished: false, finishOrder: []};
    }

    function updateEvent(racer, race, step) {
        racer.eventRemaining -= step;

        while (racer.eventRemaining <= 0) {
            const overflow = racer.eventRemaining;
            selectEvent(racer, race);
            racer.eventRemaining += overflow;
        }
    }

    function updateLane(racer, race, step) {
        const nextGate = Math.floor(racer.progress * 2 + 1e-9);

        while (racer.routeGate < nextGate) {
            selectLane(racer, race);
        }

        const maxChange = step / race.config.laneCrossingSeconds;
        racer.lane += clamp(racer.targetLane - racer.lane, -maxChange, maxChange);
        racer.lane = clamp(racer.lane, -0.5, 0.5);
    }

    function updateRacer(racer, race, step) {
        if (racer.finishTime !== null) {
            return;
        }

        updateEvent(racer, race, step);
        racer.speed += (racer.targetSpeed - racer.speed) * race.config.smoothing;
        updateLane(racer, race, step);

        const trackWidth = 86.5 * race.config.trackWidthSeconds;
        const laneLapLength = Math.max(race.config.lapLength * 0.55, race.config.lapLength + TAU * racer.lane * trackWidth);
        const previousProgress = racer.progress;
        racer.progress += racer.speed * step / laneLapLength;

        if (racer.progress < race.config.laps) {
            return;
        }

        const stepFraction = (race.config.laps - previousProgress) / (racer.progress - previousProgress);
        racer.finishTime = race.elapsed + step * clamp(stepFraction, 0, 1);
        racer.place = race.finishOrder.length + 1;
        race.finishOrder.push(racer);

        if (!race.winner) {
            race.winner = racer;
        }
    }

    function stepRace(race) {
        if (race.finished) {
            return race;
        }

        const step = race.config.stepSeconds;
        race.racers.forEach(racer => updateRacer(racer, race, step));
        race.elapsed += step;
        race.finished = race.finishOrder.length === race.racers.length || race.elapsed >= race.config.maxRaceSeconds;
        return race;
    }

    function runRace(overrides, seed) {
        const race = createRace(overrides, seed);

        while (!race.finished) {
            stepRace(race);
        }

        return race;
    }

    function getStandings(race) {
        return [...race.racers].sort((left, right) => {
            if (left.finishTime !== null || right.finishTime !== null) {
                if (left.finishTime === null) return 1;
                if (right.finishTime === null) return -1;
                return left.finishTime - right.finishTime;
            }

            return right.progress - left.progress;
        });
    }

    function getObservedStats() {
        const total = RACERS.reduce((sum, racer) => sum + racer.observedWins, 0);
        return RACERS.map(racer => ({...racer, rate: racer.observedWins / total}));
    }

    return Object.freeze({RACERS, EVENTS, DEFAULT_CONFIG, createRace, stepRace, runRace, getStandings, getObservedStats, createRandom, normalizeConfig});
});
