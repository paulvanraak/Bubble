import { ACHIEVEMENTS, SPECIAL_KINDS } from './state.js';

// Checks lifetime-counter achievements against current state; flag-type achievements
// (flawless_streak, find_dud, collector) are unlocked directly via unlockFlag().
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

export function checkCollectorAchievement(state) {
  if (state.achievements.collector) return null;
  const allFound = Object.keys(SPECIAL_KINDS).every((id) => state.collection[id] && state.collection[id].discovered);
  if (!allFound) return null;
  return unlockFlag(state, 'collector');
}

export function unlockFlag(state, id) {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def || state.achievements[id]) return null;
  state.achievements[id] = true;
  return def;
}
