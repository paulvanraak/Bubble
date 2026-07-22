// Game state: defaults, persistence, offline-earnings & streak calculations.

export const ROW_TIERS = [7, 9, 11, 13]; // reference framing size for each zoom/view tier - the sheet itself is infinite in every direction
const SAVE_KEY = 'bubblewrap.save.v3';
const OFFLINE_CAP_SECONDS = 8 * 60 * 60; // 8 hours

// The single realistic clear-plastic look the whole sheet uses now (skins removed).
export const BASE_PALETTE = {
  bg: ['#0c1620', '#050a10'],
  tint: '#bfe3ee',
};

// Special, collectible bubble kinds. Each has an on-pop ability, a rarity-driven
// spawn weight, and a score contribution toward the player's overall Pop-Score.
// 'normal' and 'dud' are not collectible - they're the plain sheet and comic relief.
export const SPECIAL_KINDS = {
  golden: { name: 'Golden', tint: '#ffcf4d', weight: 0.035, rarityScore: 5, ability: 'windfall', desc: 'A big points bonus.' },
  musical: { name: 'Musical', tint: '#8fc7ff', weight: 0.03, rarityScore: 6, ability: 'note', desc: 'Plays a note in key.' },
  red: { name: 'Cross Pop', tint: '#ff5c5c', weight: 0.02, rarityScore: 12, ability: 'cross', desc: 'Pops a cross of 5 bubbles at once.' },
  smile: { name: 'Curve Pop', tint: '#ffd15c', weight: 0.015, rarityScore: 15, ability: 'curve', desc: 'Pops a curved sweep of bubbles.' },
  water: { name: 'Wave Pop', tint: '#5cd6ff', weight: 0.015, rarityScore: 10, ability: 'wave', desc: 'Sends a wavy dance rippling across the sheet.' },
  disco: { name: 'Disco Pop', tint: '#ff5cd6', weight: 0.005, rarityScore: 40, ability: 'disco', desc: 'Everything goes crazy colors for a few seconds.' },
};

export const KIND_WEIGHTS = [
  ['normal', 0.83],
  ['dud', 0.05],
  ...Object.entries(SPECIAL_KINDS).map(([id, def]) => [id, def.weight]),
];

export function computePopScore(state) {
  let score = 0;
  for (const id of Object.keys(SPECIAL_KINDS)) {
    const c = state.collection[id];
    if (!c || c.count <= 0) continue;
    score += SPECIAL_KINDS[id].rarityScore + Math.min(c.count - 1, 20);
  }
  return score;
}

export const ACHIEVEMENTS = [
  { id: 'pop_100', name: 'Getting Started', desc: 'Pop 100 bubbles', goal: 100, type: 'lifetimePops' },
  { id: 'pop_10k', name: 'Pop Enthusiast', desc: 'Pop 10,000 bubbles', goal: 10000, type: 'lifetimePops' },
  { id: 'pop_1m', name: 'Pop Legend', desc: 'Pop 1,000,000 bubbles', goal: 1000000, type: 'lifetimePops' },
  { id: 'flawless_streak', name: 'Flawless Streak', desc: 'Pop 150 bubbles in a row without a single missed click', goal: 1, type: 'flag' },
  { id: 'find_dud', name: 'That\'s Not a Pop', desc: 'Find a dud bubble', goal: 1, type: 'flag' },
  { id: 'collector', name: 'Collector', desc: 'Discover every special bubble type', goal: 1, type: 'flag' },
];

function defaultCollection() {
  const c = {};
  for (const id of Object.keys(SPECIAL_KINDS)) c[id] = { count: 0, discovered: false };
  return c;
}

function defaultState() {
  return {
    points: 0,
    lifetimePops: 0,
    rowTierIndex: 0,
    scrollX: 0, // world-space scroll position on the infinite sheet
    scrollY: 0,
    poppedCells: {}, // "row,col" -> variant index (0-29) - popped bubbles never come back
    collection: defaultCollection(),
    upgrades: {
      autoPopper: 0, // 0-3
    },
    prestige: {
      shards: 0,
      recycles: 0,
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
