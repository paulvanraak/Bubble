import { ROW_TIERS } from './state.js';

const AUTO_POPPER_RATE_BY_TIER = [0, 0.15, 0.5, 1.2]; // pops per second, passive

export const UPGRADE_DEFS = [
  {
    id: 'sheetHeight',
    tier: 1,
    name: 'Wide View',
    desc: 'Zoom out to see more of the infinite sheet at once.',
    maxLevel: ROW_TIERS.length - 1,
    costs: [300, 1500, 6000],
    levelOf: (state) => state.rowTierIndex,
    canBuy: () => true,
    buy: (state) => { state.rowTierIndex++; },
  },
  {
    id: 'autoPopper',
    tier: 2,
    name: 'Auto-Popper',
    desc: 'Passively pops bubbles for you - even while you\'re away.',
    maxLevel: 3,
    costs: [500, 2500, 12000],
    levelOf: (state) => state.upgrades.autoPopper,
    canBuy: () => true,
    buy: (state) => { state.upgrades.autoPopper++; },
  },
];

export function autoPopperRateFor(state) {
  return AUTO_POPPER_RATE_BY_TIER[state.upgrades.autoPopper];
}

export function prestigeMultiplierFor(state) {
  return 1 + state.prestige.shards * 0.05;
}

export function costFor(def, state) {
  const level = def.levelOf(state);
  if (level >= def.maxLevel) return null;
  return def.costs[level];
}

export function canAfford(def, state) {
  const cost = costFor(def, state);
  return cost !== null && state.points >= cost && def.canBuy(state);
}

export function purchase(def, state) {
  if (!canAfford(def, state)) return false;
  const cost = costFor(def, state);
  state.points -= cost;
  def.buy(state);
  return true;
}

// Prestige "Recycle": available once the player has maxed sheet height and earned enough lifetime points.
export const PRESTIGE_MIN_LIFETIME_POINTS = 50000;

export function canPrestige(state) {
  return state.rowTierIndex >= ROW_TIERS.length - 1 && state.lifetimePops >= 2000 && state.points >= PRESTIGE_MIN_LIFETIME_POINTS;
}

export function shardsFromRecycle(state) {
  return Math.floor(Math.sqrt(state.points / 1000));
}

// Recycling clears the popped history so the sheet feels fresh again, but keeps
// achievements and the special-bubble Collection (and the Pop-Score it represents).
export function doRecycle(state) {
  if (!canPrestige(state)) return 0;
  const gained = shardsFromRecycle(state);
  state.prestige.shards += gained;
  state.prestige.recycles++;
  state.points = 0;
  state.rowTierIndex = 0;
  state.upgrades = { autoPopper: 0 };
  for (const k of Object.keys(state.poppedCells)) delete state.poppedCells[k];
  return gained;
}
