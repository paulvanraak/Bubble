// Game state: defaults, persistence, offline-earnings & streak calculations.

export const SHEET_SIZES = [5, 8, 12, 16];
const SAVE_KEY = 'bubblewrap.save.v1';
const OFFLINE_CAP_SECONDS = 8 * 60 * 60; // 8 hours

export const PALETTES = {
  pastel: {
    name: 'Pastel',
    bg: ['#fdf6f0', '#f3e9ff'],
    colors: ['#ffd6e8', '#c9f2ff', '#fff4c2', '#e2d9ff', '#cdf7e3'],
    unlockedByDefault: true,
  },
  glow: {
    name: 'Glow-in-the-Dark',
    bg: ['#04070f', '#0a1a1f'],
    colors: ['#39ff88', '#33e0ff', '#c6ff4d', '#7dffb8', '#4dfff0'],
    emissive: true,
  },
  holographic: {
    name: 'Holographic',
    bg: ['#0d0a1f', '#1a0f2e'],
    colors: ['#ff9de2', '#9dc6ff', '#c8ff9d', '#ffe89d', '#d29dff'],
    iridescent: true,
  },
  galaxy: {
    name: 'Galaxy',
    bg: ['#050311', '#120a2b'],
    colors: ['#8f6bff', '#5ad1ff', '#ff6bd5', '#ffd76b', '#6bffb0'],
    emissive: true,
    stars: true,
  },
  seasonal: {
    name: 'Peppermint',
    bg: ['#fff5f5', '#ffeaea'],
    colors: ['#ff5c5c', '#ffffff', '#5cff8a', '#ffd15c', '#ff5cd6'],
  },
};

export const ACHIEVEMENTS = [
  { id: 'pop_100', name: 'Getting Started', desc: 'Pop 100 bubbles', goal: 100, type: 'lifetimePops', unlocksPalette: null },
  { id: 'pop_10k', name: 'Pop Enthusiast', desc: 'Pop 10,000 bubbles', goal: 10000, type: 'lifetimePops', unlocksPalette: 'glow' },
  { id: 'pop_1m', name: 'Pop Legend', desc: 'Pop 1,000,000 bubbles', goal: 1000000, type: 'lifetimePops', unlocksPalette: 'galaxy' },
  { id: 'perfect_sheet', name: 'Perfect Sheet', desc: 'Clear a full sheet without a single missed click', goal: 1, type: 'flag', unlocksPalette: 'holographic' },
  { id: 'find_dud', name: 'That\'s... Not a Pop', desc: 'Find a dud bubble', goal: 1, type: 'flag', unlocksPalette: 'seasonal' },
  { id: 'melody', name: 'Perfect Pitch', desc: 'Complete a musical melody row', goal: 1, type: 'flag', unlocksPalette: null },
];

function defaultState() {
  return {
    points: 0,
    lifetimePops: 0,
    gridSizeIndex: 0,
    upgrades: {
      fingerStrength: 0, // 0-3, adds splash radius
      regenSpeed: 0, // 0-3
      autoPopper: 0, // 0-3
      multiPop: false,
    },
    prestige: {
      shards: 0,
      recycles: 0,
    },
    cosmetics: {
      unlocked: ['pastel'],
      active: 'pastel',
    },
    achievements: {}, // id -> true
    streak: {
      count: 0,
      lastPlayedDate: null, // 'YYYY-MM-DD'
    },
    muted: false,
    lastSaveTimestamp: Date.now(),
  };
}

export function loadState() {
  let s;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    s = raw ? JSON.parse(raw) : null;
  } catch (e) {
    s = null;
  }
  const base = defaultState();
  if (!s) {
    base.streak.count = 1;
    base.streak.lastPlayedDate = dateStr(new Date());
    return { state: base, offlineSeconds: 0, isNewDay: false };
  }

  const merged = deepMerge(base, s);

  const now = Date.now();
  const elapsedSeconds = Math.max(0, (now - (merged.lastSaveTimestamp || now)) / 1000);
  const offlineSeconds = Math.min(elapsedSeconds, OFFLINE_CAP_SECONDS);

  const todayStr = dateStr(new Date());
  const isNewDay = merged.streak.lastPlayedDate !== todayStr;
  if (isNewDay) {
    if (merged.streak.lastPlayedDate) {
      const last = new Date(merged.streak.lastPlayedDate + 'T00:00:00');
      const today = new Date(todayStr + 'T00:00:00');
      const dayDiff = Math.round((today - last) / 86400000);
      merged.streak.count = dayDiff === 1 ? merged.streak.count + 1 : 1;
    } else {
      merged.streak.count = 1;
    }
    merged.streak.lastPlayedDate = todayStr;
  }

  return { state: merged, offlineSeconds, isNewDay };
}

export function saveState(state) {
  state.lastSaveTimestamp = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // storage unavailable/full - fail silently, gameplay continues in-memory
  }
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function deepMerge(base, override) {
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  if (typeof base === 'object' && base !== null) {
    const out = { ...base };
    const keys = new Set([...Object.keys(base), ...(override && typeof override === 'object' ? Object.keys(override) : [])]);
    for (const k of keys) {
      if (override && override[k] !== undefined) {
        out[k] = deepMerge(base[k], override[k]);
      }
    }
    return out;
  }
  return override !== undefined ? override : base;
}
