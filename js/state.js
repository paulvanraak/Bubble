// Game state: defaults, persistence, offline-earnings & streak calculations.

export const ROW_TIERS = [7, 9, 11, 13]; // reference framing size for each zoom/view tier - the sheet itself is infinite in every direction
const SAVE_KEY = 'bubblewrap.save.v2';
const OFFLINE_CAP_SECONDS = 8 * 60 * 60; // 8 hours

// Skins tint the same realistic clear-plastic bubble material - they never
// replace it with flat paint, so the sheet always reads as real bubble wrap.
export const PALETTES = {
  clear: {
    name: 'Clear',
    bg: ['#0c1620', '#050a10'],
    tint: '#bfe3ee',
    unlockedByDefault: true,
  },
  arctic: {
    name: 'Arctic',
    bg: ['#0a1a24', '#03080d'],
    tint: '#dff6ff',
    emissive: true,
  },
  amber: {
    name: 'Amber',
    bg: ['#1a1006', '#0a0603'],
    tint: '#ffcf8a',
  },
  iridescent: {
    name: 'Iridescent',
    bg: ['#0b0f22', '#04050f'],
    tint: '#d9d4ff',
    iridescent: true,
  },
  midnight: {
    name: 'Midnight Glow',
    bg: ['#020409', '#000000'],
    tint: '#7ee6c8',
    emissive: true,
    stars: true,
  },
};

export const ACHIEVEMENTS = [
  { id: 'pop_100', name: 'Getting Started', desc: 'Pop 100 bubbles', goal: 100, type: 'lifetimePops', unlocksPalette: null },
  { id: 'pop_10k', name: 'Pop Enthusiast', desc: 'Pop 10,000 bubbles', goal: 10000, type: 'lifetimePops', unlocksPalette: 'arctic' },
  { id: 'pop_1m', name: 'Pop Legend', desc: 'Pop 1,000,000 bubbles', goal: 1000000, type: 'lifetimePops', unlocksPalette: 'midnight' },
  { id: 'flawless_streak', name: 'Flawless Streak', desc: 'Pop 150 bubbles in a row without a single missed click', goal: 1, type: 'flag', unlocksPalette: 'iridescent' },
  { id: 'find_dud', name: 'That\'s Not a Pop', desc: 'Find a dud bubble', goal: 1, type: 'flag', unlocksPalette: 'amber' },
  { id: 'melody', name: 'Perfect Pitch', desc: 'Complete a musical melody row', goal: 1, type: 'flag', unlocksPalette: null },
];

function defaultState() {
  return {
    points: 0,
    lifetimePops: 0,
    rowTierIndex: 0,
    scrollX: 0, // world-space scroll position on the infinite sheet
    scrollY: 0,
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
      unlocked: ['clear'],
      active: 'clear',
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
