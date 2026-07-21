import { ACHIEVEMENTS } from './state.js';

// Checks lifetime-counter achievements against current state; flag-type achievements
// (perfect_sheet, find_dud, melody) are unlocked directly via unlockFlag().
export function checkCounterAchievements(state) {
  const unlocked = [];
  for (const def of ACHIEVEMENTS) {
    if (def.type !== 'lifetimePops') continue;
    if (state.achievements[def.id]) continue;
    if (state[def.type] >= def.goal) {
      state.achievements[def.id] = true;
      unlocked.push(def);
    }
  }
  return unlocked;
}

export function unlockFlag(state, id) {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def || state.achievements[id]) return null;
  state.achievements[id] = true;
  return def;
}

export function applyPaletteUnlock(state, def) {
  if (def && def.unlocksPalette && !state.cosmetics.unlocked.includes(def.unlocksPalette)) {
    state.cosmetics.unlocked.push(def.unlocksPalette);
    return def.unlocksPalette;
  }
  return null;
}
