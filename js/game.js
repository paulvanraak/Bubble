import { loadState, saveState, SPECIAL_KINDS, computePopScore } from './state.js';
import { BubbleScene } from './scene.js';
import { AudioEngine } from './audio.js';
import {
  UPGRADE_DEFS, autoPopperRateFor, prestigeMultiplierFor, purchase, canPrestige, doRecycle,
} from './upgrades.js';
import { checkCounterAchievements, checkCollectorAchievement, unlockFlag } from './achievements.js';

const COMBO_WINDOW = 2.2;
const SAVE_INTERVAL = 8;
const FLAWLESS_STREAK_GOAL = 150; // consecutive pops without a miss - matches the achievement's description in state.js
const DISCO_MULTIPLIER = 2;

const POINTS_FOR_KIND = {
  normal: 1,
  dud: 1,
  golden: 15,
  musical: 2,
  red: 4,
  smile: 4,
  water: 3,
  disco: 20,
  conveyor: 5,
  column: 5,
  diagonal: 6,
  spiral: 8,
  pulse: 4,
  vortex: 7,
};

const MOVEMENT_ABILITIES = new Set(['rowConveyor', 'colConveyor', 'diagonal', 'spiral', 'pulse', 'vortex']);

function comboMultiplier(combo) {
  return 1 + Math.min(combo, 40) * 0.05;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new BubbleScene(canvas);
    this.audio = new AudioEngine();
    this.listeners = {};

    const { state, offlineSeconds, isNewDay } = loadState();
    this.state = state;
    this.audio.setMuted(state.muted);

    this.combo = 0;
    this.comboTimer = 0;
    this.saveTimer = 0;
    this.autoPopperAccum = 0;
    this.hitsSinceMiss = 0;

    this.scene.init(state);
    this.scene.onTap = (x, y) => this._handleTap(x, y);

    this._pendingOfflineSeconds = offlineSeconds;
    this._pendingNewDay = isNewDay;

    this.canvas.addEventListener('pointerdown', () => this.audio.ensureStarted());
  }

  on(event, cb) {
    (this.listeners[event] = this.listeners[event] || []).push(cb);
  }

  emit(event, payload) {
    (this.listeners[event] || []).forEach((cb) => cb(payload));
  }

  start() {
    if (this._pendingOfflineSeconds > 20) {
      const rate = autoPopperRateFor(this.state);
      if (rate > 0) {
        const mult = prestigeMultiplierFor(this.state);
        const earned = Math.round(this._pendingOfflineSeconds * rate * 1.15 * mult);
        if (earned > 0) {
          this.state.points += earned;
          this.state.lifetimePops += Math.round(this._pendingOfflineSeconds * rate);
          this.emit('offlineEarnings', { seconds: this._pendingOfflineSeconds, earned });
        }
      }
    }
    if (this._pendingNewDay) {
      this.emit('streak', { count: this.state.streak.count });
    }
    this.emit('points', this.state.points);
    this.emit('rowsChanged', this.state.rowTierIndex);

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this._tick(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _handleTap(x, y) {
    const primary = this.scene.hitTest(x, y);
    if (!primary) {
      this.hitsSinceMiss = 0;
      return;
    }

    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    const comboLvl = Math.floor(this.combo / 5);
    const discoMult = this.scene.isDiscoActive() ? DISCO_MULTIPLIER : 1;
    const mult = comboMultiplier(this.combo) * prestigeMultiplierFor(this.state) * discoMult;

    const specialDef = SPECIAL_KINDS[primary.kind];
    const ability = specialDef ? specialDef.ability : null;

    let popList = [primary];
    if (ability === 'cross') popList = popList.concat(this.scene.crossTargets(primary));
    else if (ability === 'curve') popList = popList.concat(this.scene.curveTargets(primary));

    let totalPoints = 0;
    let playedTone = false;
    for (const bubble of popList) {
      const result = this.scene.popBubble(bubble);
      if (!result) continue;
      totalPoints += Math.max(1, Math.round((POINTS_FOR_KIND[result.kind] || 1) * mult));
      this.state.lifetimePops++;
      this.hitsSinceMiss++;

      if (result.kind === 'dud') {
        this.audio.playDud();
      } else if (result.kind === 'musical') {
        this.audio.playMusicalNote(Math.floor(Math.random() * 8));
      } else if (!playedTone) {
        this.audio.playPop({ pitch: 0.9 + Math.random() * 0.3, size: 1, comboLevel: comboLvl });
        playedTone = true;
      }

      if (SPECIAL_KINDS[result.kind]) this._registerCollectible(result.kind);
    }

    this._vibrate(popList.some((b) => SPECIAL_KINDS[b.kind]) ? [12, 30, 18] : 12);

    if (ability === 'wave') {
      const touched = this.scene.triggerWave(primary);
      if (touched > 0) totalPoints += Math.max(1, Math.round(touched * mult));
    } else if (ability === 'disco') {
      this.scene.triggerDisco();
      this.audio.playDisco();
    } else if (MOVEMENT_ABILITIES.has(ability)) {
      this.scene.triggerMovement(ability, primary);
      this.audio.playSpecialCollected();
    }

    this.state.points += totalPoints;
    this.emit('points', this.state.points);
    this.emit('combo', { combo: this.combo, multiplier: comboMultiplier(this.combo) });
    this.emit('gain', totalPoints);

    if (this.hitsSinceMiss >= FLAWLESS_STREAK_GOAL) {
      this._unlockFlag('flawless_streak');
    }

    this._checkCounterAchievements();
  }

  _registerCollectible(kind) {
    const def = SPECIAL_KINDS[kind];
    if (!def) return;
    const c = this.state.collection[kind];
    const firstTime = !c.discovered;
    c.count++;
    c.discovered = true;
    this.emit('collectionChanged');
    if (firstTime) {
      this.audio.playSpecialCollected();
      this._vibrate([15, 40, 15, 40, 25]);
      this.emit('toast', { text: `Collected: ${def.name}!` });
      const collectorDef = checkCollectorAchievement(this.state);
      if (collectorDef) {
        this.audio.playAchievement();
        this.emit('achievement', { def: collectorDef });
      }
    }
  }

  _unlockFlag(id) {
    const def = unlockFlag(this.state, id);
    if (!def) return;
    this.audio.playAchievement();
    this._vibrate([15, 40, 15, 40, 25]);
    this.emit('achievement', { def });
  }

  // Web Vibration API - Android/Chrome only, iOS Safari does not expose it to web content.
  _vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  _checkCounterAchievements() {
    const unlocked = checkCounterAchievements(this.state);
    for (const def of unlocked) {
      this.audio.playAchievement();
      this.emit('achievement', { def });
    }
  }

  _tick(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0 && this.combo > 0) {
        this.combo = 0;
        this.emit('combo', { combo: 0, multiplier: 1 });
      }
    }

    const rate = autoPopperRateFor(this.state);
    if (rate > 0) {
      this.autoPopperAccum += dt * rate;
      while (this.autoPopperAccum >= 1) {
        this.autoPopperAccum -= 1;
        const bubble = this.scene.randomAliveBubble();
        if (bubble) {
          const result = this.scene.popBubble(bubble, { flourish: true });
          if (result) {
            const pts = Math.max(1, Math.round((POINTS_FOR_KIND[result.kind] || 1) * prestigeMultiplierFor(this.state)));
            this.state.points += pts;
            this.state.lifetimePops++;
            this.audio.playPop({ pitch: 0.7 + Math.random() * 0.2, size: 0.7, comboLevel: 0 });
            if (SPECIAL_KINDS[result.kind]) this._registerCollectible(result.kind);
          }
        }
      }
      this.emit('points', this.state.points);
      this._checkCounterAchievements();
    }

    this.scene.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_INTERVAL) {
      this.saveTimer = 0;
      this.saveNow();
    }

    if (canPrestige(this.state) && !this._prestigeNotified) {
      this._prestigeNotified = true;
      this.emit('prestigeAvailable');
    }
  }

  buyUpgrade(id) {
    const def = UPGRADE_DEFS.find((u) => u.id === id);
    if (!def) return false;
    const wasRows = this.state.rowTierIndex;
    const ok = purchase(def, this.state);
    if (ok) {
      if (this.state.rowTierIndex !== wasRows) {
        this.scene.setViewTier(this.state.rowTierIndex);
        this.hitsSinceMiss = 0;
        this.emit('rowsChanged', this.state.rowTierIndex);
      }
      this.emit('points', this.state.points);
      this.emit('upgradesChanged');
      this.saveNow();
    }
    return ok;
  }

  recycle() {
    const gained = doRecycle(this.state);
    if (gained > 0) {
      this.scene.setViewTier(this.state.rowTierIndex);
      this.hitsSinceMiss = 0;
      this._prestigeNotified = false;
      this.emit('points', this.state.points);
      this.emit('rowsChanged', this.state.rowTierIndex);
      this.emit('upgradesChanged');
      this.emit('prestiged', gained);
      this.saveNow();
    }
    return gained;
  }

  popScore() {
    return computePopScore(this.state);
  }

  toggleMute() {
    this.state.muted = !this.state.muted;
    this.audio.setMuted(this.state.muted);
    this.saveNow();
    return this.state.muted;
  }

  saveNow() {
    this.state.scrollX = this.scene.getScrollX();
    this.state.scrollY = this.scene.getScrollY();
    saveState(this.state);
  }
}
