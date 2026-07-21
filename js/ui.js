import { ACHIEVEMENTS, PALETTES, ROW_TIERS } from './state.js';
import { UPGRADE_DEFS, costFor, canAfford, canPrestige, shardsFromRecycle, prestigeMultiplierFor, splashRadiusFor, autoPopperRateFor, regenSecondsFor } from './upgrades.js';
import { ICONS, icon } from './icons.js';

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

    this._injectStaticIcons();

    this.pointsValue = document.getElementById('points-value');
    this.pointsDisplay = document.getElementById('points-display');
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
    this._setMuteIcon(this.state.muted);
    this._renderPoints(this.state.points);
  }

  _injectStaticIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = ICONS[el.dataset.icon] || '';
    });
  }

  _setMuteIcon(muted) {
    this.muteBtn.innerHTML = `<span class="nav-icon">${muted ? ICONS.speakerOff : ICONS.speakerOn}</span>`;
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
      this._setMuteIcon(muted);
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
    this.game.on('rowsChanged', () => { if (this._openPanelId === 'shop') this._renderShop(); });
    this.game.on('paletteChanged', () => { if (this._openPanelId === 'cosmetics') this._renderCosmetics(); });
    this.game.on('prestiged', (gained) => this._toast(`Recycled - +${gained} Plastic Shards`));
    this.game.on('prestigeAvailable', () => this.prestigeBtn.classList.remove('hidden'));
    if (canPrestige(this.state)) this.prestigeBtn.classList.remove('hidden');
  }

  _renderPoints(p) {
    this.pointsValue.textContent = formatNumber(p);
  }

  _popGainLabel(amount) {
    if (amount <= 0) return;
    const el = document.createElement('div');
    el.className = 'gain-float';
    el.textContent = `+${formatNumber(amount)}`;
    this.pointsDisplay.appendChild(el);
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
    this._toast(`Achievement unlocked: ${def.name}${palette ? ` - new skin: ${PALETTES[palette].name}` : ''}`);
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
    this.panelTitle.textContent = 'Upgrade Shop';
    const s = this.state;
    this.panelContent.innerHTML = '';

    const stats = document.createElement('div');
    stats.className = 'stat-row';
    stats.innerHTML = `
      <span>Splash radius: ${splashRadiusFor(s)}</span>
      <span>Regen: ${regenSecondsFor(s).toFixed(1)}s</span>
      <span>Auto-pop: ${autoPopperRateFor(s).toFixed(2)}/s</span>
      <span>View size: ${ROW_TIERS[s.rowTierIndex]}</span>
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
          ${maxed ? 'MAX' : `${icon('bubble', 'inline-icon')}${formatNumber(cost)}`}
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
    this.panelTitle.textContent = 'Achievements';
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
        <div class="ach-icon">${unlocked ? ICONS.trophy : ICONS.lock}</div>
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
    this.panelTitle.textContent = 'Sheet Skins';
    this.panelContent.innerHTML = '';
    for (const [id, pal] of Object.entries(PALETTES)) {
      const unlocked = this.state.cosmetics.unlocked.includes(id);
      const active = this.state.cosmetics.active === id;
      const card = document.createElement('div');
      card.className = `cosmetic-card ${unlocked ? '' : 'locked'} ${active ? 'active' : ''}`;
      card.innerHTML = `
        <div class="swatch-preview" style="background:linear-gradient(135deg, ${pal.bg[0]}, ${pal.bg[1]})">
          <span class="swatch-bubble" style="background:${pal.tint}"></span>
        </div>
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
    this.panelTitle.textContent = 'Recycle';
    this.panelContent.innerHTML = '';
    const s = this.state;
    const eligible = canPrestige(s);
    const gain = shardsFromRecycle(s);
    const info = document.createElement('div');
    info.className = 'prestige-info';
    info.innerHTML = `
      <p>Recycle your sheet for a permanent point multiplier. You'll keep all achievements and cosmetics, but your points and upgrades reset.</p>
      <p>Plastic Shards: <strong>${s.prestige.shards}</strong> (current multiplier &times;${prestigeMultiplierFor(s).toFixed(2)})</p>
      <p>${eligible ? `Recycling now grants <strong>+${gain} Shards</strong>.` : 'Max out Wide View and earn 50,000 lifetime points to unlock recycling.'}</p>
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
      <h2>Welcome back</h2>
      <p>Your auto-poppers kept working while you were away for ${mins} minute${mins === 1 ? '' : 's'}.</p>
      <p class="modal-big">+${formatNumber(earned)}</p>
      <button id="modal-ok">Continue</button>
    `;
    this.modalOverlay.classList.remove('hidden');
    document.getElementById('modal-ok').addEventListener('click', () => this.modalOverlay.classList.add('hidden'));
  }

  _showStreakModal(count) {
    if (this.modalOverlay.classList.contains('hidden') === false) return;
    this.modal.innerHTML = `
      <h2>${count} Day Streak</h2>
      <p>A fresh stretch of sheet is waiting for you. Miss a day and nothing bad happens - just come back and keep popping.</p>
      <button id="modal-ok">Let's go</button>
    `;
    this.modalOverlay.classList.remove('hidden');
    document.getElementById('modal-ok').addEventListener('click', () => this.modalOverlay.classList.add('hidden'));
  }
}
