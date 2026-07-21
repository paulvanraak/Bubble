import { ROW_TIERS } from './state.js';

// Base regen time (seconds) for a popped bubble to fully regrow, before Regen Speed upgrades.
export const BASE_REGEN_SECONDS = 6;
const REGEN_SECONDS_BY_TIER = [6, 4, 2.5, 1.5];
const AUTO_POPPER_RATE_BY_TIER = [0, 0.15, 0.5, 1.2]; // pops per second, passive
const SPLASH_RADIUS_BY_TIER = [0, 1, 2, 3]; // grid cells, chebyshev radius
const MULTI_POP_BONUS_RADIUS = 2;

export const UPGRADE_DEFS = [
  {
    id: 'fingerStrength',
    tier: 1,
    name: 'Finger Strength',
    desc: 'Increase your pop splash radius.',
    maxLevel: 3,
    costs: [50, 200, 800],
    levelOf: (state) => state.upgrades.fingerStrength,
    canBuy: () => true,
    buy: (state) => { state.upgrades.fingerStrength++; },
  },
  {
    id: 'sheetHeight',
    tier: 2,
    name: 'Wide View',
    desc: 'Zoom out to see more of the infinite sheet at once.',
    maxLevel: ROW_TIERS.length - 1,
    costs: [300, 1500, 6000],
    levelOf: (state) => state.rowTierIndex,
    canBuy: () => true,
    buy: (state) => { state.rowTierIndex++; },
  },
  {
    id: 'regenSpeed',
    tier: 3,
    name: 'Regen Speed',
    desc: 'Bubbles refill faster.',
    maxLevel: 3,
    costs: [150, 600, 2400],
    levelOf: (state) => state.upgrades.regenSpeed,
    canBuy: () => true,
    buy: (state) => { state.upgrades.regenSpeed++; },
  },
  {
    id: 'autoPopper',
    tier: 4,
    name: 'Auto-Popper',
    desc: 'Passively pops bubbles for you - even while you\'re away.',
    maxLevel: 3,
    costs: [500, 2500, 12000],
    levelOf: (state) => state.upgrades.autoPopper,
    canBuy: () => true,
    buy: (state) => { state.upgrades.autoPopper++; },
  },
  {
    id: 'multiPop',
    tier: 5,
    name: 'Multi-Pop',
    desc: 'Every click pops a much wider splash.',
    maxLevel: 1,
    costs: [20000],
    levelOf: (state) => (state.upgrades.multiPop ? 1 : 0),
    canBuy: (state) => state.rowTierIndex >= 1,
    buy: (state) => { state.upgrades.multiPop = true; },
  },
];

export function regenSecondsFor(state) {
  return REGEN_SECONDS_BY_TIER[state.upgrades.regenSpeed];
}

export function autoPopperRateFor(state) {
  return AUTO_POPPER_RATE_BY_TIER[state.upgrades.autoPopper];
}

export function splashRadiusFor(state) {
  let r = SPLASH_RADIUS_BY_TIER[state.upgrades.fingerStrength];
  if (state.upgrades.multiPop) r += MULTI_POP_BONUS_RADIUS;
  return r;
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

export function doRecycle(state) {
  if (!canPrestige(state)) return 0;
  const gained = shardsFromRecycle(state);
  state.prestige.shards += gained;
  state.prestige.recycles++;
  state.points = 0;
  state.rowTierIndex = 0;
  state.upgrades = { fingerStrength: 0, regenSpeed: 0, autoPopper: 0, multiPop: false };
  return gained;
}
