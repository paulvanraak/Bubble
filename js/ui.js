import { ACHIEVEMENTS, PALETTES, SHEET_SIZES } from './state.js';
import { UPGRADE_DEFS, costFor, canAfford, canPrestige, shardsFromRecycle, prestigeMultiplierFor, splashRadiusFor, autoPopperRateFor, regenSecondsFor } from './upgrades.js';

function formatNumber(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = ['', 'k', 'M', 'B', 'T'];
  let u = 0;
  let v = n;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)}${units[u]}`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.state = game.state;

    this.pointsEl = document.getElementById('points-display');
    this.comboBar = document.getElementById('combo-bar');
    this.comboLabel = document.getElementById('combo-label');
    this.streakCount = document.getElementById('streak-count');
    this.muteBtn = document.getElementById('mute-btn');
    this.toastContainer = document.getElementById('toast-container');
    this.panelOverlay = document.getElementById('panel-overlay');
    this.panelContent = document.getElementById('panel-content');
    this.panelTitle = document.getElementById('panel-title');
    this.modalOverlay = document.getElementById('modal-overlay');
    this.modal = document.getElementById('modal');
    this.prestigeBtn = document.getElementById('prestige-btn');

    this._wireStatic();
    this._wireGameEvents();
    this.streakCount.textContent = this.state.streak.count;
    this.muteBtn.textContent = this.state.muted ? '🔇' : '🔊';
    this._renderPoints(this.state.points);
  }

  _wireStatic() {
    document.querySelectorAll('#bottom-nav button[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => this.openPanel(btn.dataset.panel));
    });
    document.getElementById('panel-close').addEventListener('click', () => this.closePanel());
    this.panelOverlay.addEventListener('click', (e) => {
      if (e.target === this.panelOverlay) this.closePanel();
    });
    this.muteBtn.addEventListener('click', () => {
      const muted = this.game.toggleMute();
      this.muteBtn.textContent = muted ? '🔇' : '🔊';
    });
  }

  _wireGameEvents() {
    this.game.on('points', (p) => this._renderPoints(p));
    this.game.on('gain', (amount) => this._popGainLabel(amount));
    this.game.on('combo', ({ combo, multiplier }) => this._renderCombo(combo, multiplier));
    this.game.on('achievement', ({ def, palette }) => this._toastAchievement(def, palette));
    this.game.on('toast', ({ text }) => this._toast(text));
    this.game.on('offlineEarnings', (data) => this._showOfflineModal(data));
    this.game.on('streak', ({ count }) => this._showStreakModal(count));
    this.game.on('upgradesChanged', () => { if (this._openPanelId === 'shop') this._renderShop(); });
    this.game.on('gridChanged', () => { if (this._openPanelId === 'shop') this._renderShop(); });
    this.game.on('paletteChanged', () => { if (this._openPanelId === 'cosmetics') this._renderCosmetics(); });
    this.game.on('prestiged', (gained) => this._toast(`♻️ Recycled! +${gained} Plastic Shards`));
    this.game.on('prestigeAvailable', () => this.prestigeBtn.classList.remove('hidden'));
    if (canPrestige(this.state)) this.prestigeBtn.classList.remove('hidden');
  }

  _renderPoints(p) {
    this.pointsEl.textContent = `${formatNumber(p)} 💧`;
  }

  _popGainLabel(amount) {
    if (amount <= 0) return;
    const el = document.createElement('div');
    el.className = 'gain-float';
    el.textContent = `+${formatNumber(amount)}`;
    this.pointsEl.parentElement.appendChild(el);
    requestAnimationFrame(() => el.classList.add('rise'));
    setTimeout(() => el.remove(), 900);
  }

  _renderCombo(combo, multiplier) {
    const pct = Math.min(100, (combo / 40) * 100);
    this.comboBar.style.width = `${pct}%`;
    this.comboLabel.textContent = combo > 0 ? `Combo x${multiplier.toFixed(2)}` : '';
    this.comboBar.parentElement.classList.toggle('combo-hot', combo >= 20);
  }

  _toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 3200);
  }

  _toastAchievement(def, palette) {
    this._toast(`🏆 Achievement unlocked: ${def.name}${palette ? ` — new skin: ${PALETTES[palette].name}!` : ''}`);
  }

  openPanel(id) {
    this._openPanelId = id;
    this.panelOverlay.classList.remove('hidden');
    if (id === 'shop') this._renderShop();
    if (id === 'achievements') this._renderAchievements();
    if (id === 'cosmetics') this._renderCosmetics();
    if (id === 'prestige') this._renderPrestige();
  }

  closePanel() {
    this.panelOverlay.classList.add('hidden');
    this._openPanelId = null;
  }

  _renderShop() {
    this.panelTitle.textContent = '🛒 Upgrade Shop';
    const s = this.state;
    this.panelContent.innerHTML = '';

    const stats = document.createElement('div');
    stats.className = 'stat-row';
    stats.innerHTML = `
      <span>Splash radius: ${splashRadiusFor(s)}</span>
      <span>Regen: ${regenSecondsFor(s).toFixed(1)}s</span>
      <span>Auto-pop: ${autoPopperRateFor(s).toFixed(2)}/s</span>
      <span>Grid: ${SHEET_SIZES[s.gridSizeIndex]}×${SHEET_SIZES[s.gridSizeIndex]}</span>
    `;
    this.panelContent.appendChild(stats);

    for (const def of UPGRADE_DEFS) {
      const level = def.levelOf(s);
      const maxed = level >= def.maxLevel;
      const cost = costFor(def, s);
      const afford = canAfford(def, s);
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.innerHTML = `
        <div class="shop-card-main">
          <div class="shop-card-title">${def.name} <span class="level-pill">Lv ${level}/${def.maxLevel}</span></div>
          <div class="shop-card-desc">${def.desc}</div>
        </div>
        <button class="buy-btn" ${maxed || !afford ? 'disabled' : ''}>
          ${maxed ? 'MAX' : `${formatNumber(cost)} 💧`}
        </button>
      `;
      if (!maxed) {
        card.querySelector('.buy-btn').addEventListener('click', () => {
          this.game.buyUpgrade(def.id);
        });
      }
      this.panelContent.appendChild(card);
    }
  }

  _renderAchievements() {
    this.panelTitle.textContent = '🏆 Achievements';
    this.panelContent.innerHTML = '';
    for (const def of ACHIEVEMENTS) {
      const unlocked = !!this.state.achievements[def.id];
      const card = document.createElement('div');
      card.className = `achievement-card ${unlocked ? 'unlocked' : ''}`;
      let progress = '';
      if (!unlocked && def.type === 'lifetimePops') {
        progress = `<div class="ach-progress">${formatNumber(this.state.lifetimePops)} / ${formatNumber(def.goal)}</div>`;
      }
      card.innerHTML = `
        <div class="ach-icon">${unlocked ? '🏆' : '🔒'}</div>
        <div>
          <div class="ach-name">${def.name}</div>
          <div class="ach-desc">${def.desc}</div>
          ${progress}
        </div>
      `;
      this.panelContent.appendChild(card);
    }
  }

  _renderCosmetics() {
    this.panelTitle.textContent = '🎨 Sheet Skins';
    this.panelContent.innerHTML = '';
    for (const [id, pal] of Object.entries(PALETTES)) {
      const unlocked = this.state.cosmetics.unlocked.includes(id);
      const active = this.state.cosmetics.active === id;
      const card = document.createElement('div');
      card.className = `cosmetic-card ${unlocked ? '' : 'locked'} ${active ? 'active' : ''}`;
      const swatches = pal.colors.slice(0, 5).map((c) => `<span class="swatch" style="background:${c}"></span>`).join('');
      card.innerHTML = `
        <div class="swatch-row">${swatches}</div>
        <div class="cosmetic-name">${pal.name}</div>
        <div class="cosmetic-state">${active ? 'Active' : unlocked ? 'Unlocked' : 'Locked'}</div>
      `;
      if (unlocked && !active) {
        card.addEventListener('click', () => { this.game.setPalette(id); this._renderCosmetics(); });
      }
      this.panelContent.appendChild(card);
    }
  }

  _renderPrestige() {
    this.panelTitle.textContent = '♻️ Recycle';
    this.panelContent.innerHTML = '';
    const s = this.state;
    const eligible = canPrestige(s);
    const gain = shardsFromRecycle(s);
    const info = document.createElement('div');
    info.className = 'prestige-info';
    info.innerHTML = `
      <p>Recycle your sheet for a permanent point multiplier. You'll keep all achievements and cosmetics, but your points, grid size and upgrades reset.</p>
      <p>Plastic Shards: <strong>${s.prestige.shards}</strong> (current multiplier ×${prestigeMultiplierFor(s).toFixed(2)})</p>
      <p>${eligible ? `Recycling now grants <strong>+${gain} Shards</strong>.` : 'Grow your sheet to max size and earn 50,000 💧 lifetime to unlock recycling.'}</p>
      <button id="do-recycle" ${eligible ? '' : 'disabled'}>Recycle Now</button>
    `;
    this.panelContent.appendChild(info);
    if (eligible) {
      document.getElementById('do-recycle').addEventListener('click', () => {
        this.game.recycle();
        this._renderPrestige();
      });
    }
  }

  _showOfflineModal({ seconds, earned }) {
    const mins = Math.round(seconds / 60);
    this.modal.innerHTML = `
      <h2>Welcome back!</h2>
      <p>Your auto-poppers kept working while you were away for ${mins} minute${mins === 1 ? '' : 's'}.</p>
      <p class="modal-big">+${formatNumber(earned)} 💧</p>
      <button id="modal-ok">Nice!</button>
    `;
    this.modalOverlay.classList.remove('hidden');
    document.getElementById('modal-ok').addEventListener('click', () => this.modalOverlay.classList.add('hidden'));
  }

  _showStreakModal(count) {
    if (this.modalOverlay.classList.contains('hidden') === false) return;
    this.modal.innerHTML = `
      <h2>🔥 ${count} Day Streak!</h2>
      <p>A fresh bubble sheet is waiting for you. Keep popping — miss a day and nothing bad happens, but come back and the streak keeps growing.</p>
      <button id="modal-ok">Let's pop!</button>
    `;
    this.modalOverlay.classList.remove('hidden');
    document.getElementById('modal-ok').addEventListener('click', () => this.modalOverlay.classList.add('hidden'));
  }
}
