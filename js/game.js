import { loadState, saveState, SHEET_SIZES, ACHIEVEMENTS } from './state.js';
import { BubbleScene } from './scene.js';
import { AudioEngine } from './audio.js';
import {
  UPGRADE_DEFS, regenSecondsFor, autoPopperRateFor, splashRadiusFor,
  prestigeMultiplierFor, purchase, canPrestige, doRecycle,
} from './upgrades.js';
import { checkCounterAchievements, unlockFlag, applyPaletteUnlock } from './achievements.js';

const COMBO_WINDOW = 2.2;
const SAVE_INTERVAL = 8;

function comboMultiplier(combo) {
  return 1 + Math.min(combo, 40) * 0.05;
}

function pointsForKind(kind) {
  switch (kind) {
    case 'golden': return 15;
    case 'giant': return 5;
    case 'musical': return 2;
    default: return 1; // normal + dud
  }
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
    this.perfectAchieved = false;

    this.scene.init(state);

    this._pendingOfflineSeconds = offlineSeconds;
    this._pendingNewDay = isNewDay;

    this._bindInput();
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
    this.emit('gridChanged', this.state.gridSizeIndex);

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this._tick(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _bindInput() {
    this.canvas.addEventListener('pointermove', (e) => {
      this.scene.setPointer(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      this.audio.ensureStarted();
      this._handleClick(e.clientX, e.clientY);
    });
  }

  _handleClick(x, y) {
    const splashRadius = splashRadiusFor(this.state);
    const hits = this.scene.hitTest(x, y, splashRadius);
    if (hits.length === 0) {
      this.hitsSinceMiss = 0;
      return;
    }

    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    const comboLvl = Math.floor(this.combo / 5);
    const mult = comboMultiplier(this.combo) * prestigeMultiplierFor(this.state);

    let totalPoints = 0;
    let playedTone = false;
    for (const bubble of hits) {
      const result = this.scene.popBubble(bubble);
      if (!result) continue;
      totalPoints += Math.max(1, Math.round(pointsForKind(result.kind) * mult));
      this.state.lifetimePops++;
      this.hitsSinceMiss++;

      if (result.kind === 'dud') {
        this.audio.playDud();
      } else if (result.kind === 'musical') {
        this.audio.playMusicalNote(bubble.noteIndex);
      } else if (!playedTone) {
        this.audio.playPop({ pitch: 0.9 + Math.random() * 0.3, size: result.kind === 'giant' ? 1.6 : 1, comboLevel: comboLvl });
        playedTone = true;
      }
    }
    this.state.points += totalPoints;
    this.emit('points', this.state.points);
    this.emit('combo', { combo: this.combo, multiplier: comboMultiplier(this.combo) });
    this.emit('gain', totalPoints);

    const totalCells = this.scene.gridN * this.scene.gridN;
    if (this.hitsSinceMiss >= totalCells && !this.perfectAchieved) {
      this.perfectAchieved = true;
      this._unlockFlag('perfect_sheet');
    }

    this._drainSceneEvents();
    this._checkCounterAchievements();
  }

  _drainSceneEvents() {
    for (const ev of this.scene.drainEvents()) {
      if (ev.type === 'dud') this._unlockFlag('find_dud');
      if (ev.type === 'melody') {
        this._unlockFlag('melody');
        this.state.points += 250;
        this.emit('points', this.state.points);
        this.emit('toast', { text: '🎵 Melody complete! +250' });
        this.audio.playAchievement();
      }
    }
  }

  _unlockFlag(id) {
    const def = unlockFlag(this.state, id);
    if (!def) return;
    const palette = applyPaletteUnlock(this.state, def);
    this.audio.playAchievement();
    this.emit('achievement', { def, palette });
  }

  _checkCounterAchievements() {
    const unlocked = checkCounterAchievements(this.state);
    for (const def of unlocked) {
      const palette = applyPaletteUnlock(this.state, def);
      this.audio.playAchievement();
      this.emit('achievement', { def, palette });
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
            const pts = Math.max(1, Math.round(pointsForKind(result.kind) * prestigeMultiplierFor(this.state)));
            this.state.points += pts;
            this.state.lifetimePops++;
            this.audio.playPop({ pitch: 0.7 + Math.random() * 0.2, size: 0.7, comboLevel: 0 });
            this._drainSceneEvents();
          }
        }
      }
      this.emit('points', this.state.points);
      this._checkCounterAchievements();
    }

    this.scene.update(dt, { regenSeconds: regenSecondsFor(this.state) });

    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_INTERVAL) {
      this.saveTimer = 0;
      saveState(this.state);
    }

    if (canPrestige(this.state) && !this._prestigeNotified) {
      this._prestigeNotified = true;
      this.emit('prestigeAvailable');
    }
  }

  buyUpgrade(id) {
    const def = UPGRADE_DEFS.find((u) => u.id === id);
    if (!def) return false;
    const wasGrid = this.state.gridSizeIndex;
    const ok = purchase(def, this.state);
    if (ok) {
      if (this.state.gridSizeIndex !== wasGrid) {
        this.scene.setGridSize(this.state.gridSizeIndex);
        this.hitsSinceMiss = 0;
        this.perfectAchieved = false;
        this.emit('gridChanged', this.state.gridSizeIndex);
      }
      this.emit('points', this.state.points);
      this.emit('upgradesChanged');
      saveState(this.state);
    }
    return ok;
  }

  setPalette(id) {
    if (!this.state.cosmetics.unlocked.includes(id)) return false;
    this.state.cosmetics.active = id;
    this.scene.setPalette(id);
    saveState(this.state);
    this.emit('paletteChanged', id);
    return true;
  }

  recycle() {
    const gained = doRecycle(this.state);
    if (gained > 0) {
      this.scene.setGridSize(this.state.gridSizeIndex);
      this.hitsSinceMiss = 0;
      this.perfectAchieved = false;
      this._prestigeNotified = false;
      this.emit('points', this.state.points);
      this.emit('gridChanged', this.state.gridSizeIndex);
      this.emit('upgradesChanged');
      this.emit('prestiged', gained);
      saveState(this.state);
    }
    return gained;
  }

  toggleMute() {
    this.state.muted = !this.state.muted;
    this.audio.setMuted(this.state.muted);
    saveState(this.state);
    return this.state.muted;
  }

  saveNow() {
    saveState(this.state);
  }
}
