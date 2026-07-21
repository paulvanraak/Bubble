import * as THREE from './vendor/three.module.min.js';
import { ParticleSystem } from './particles.js';
import { ROW_TIERS, PALETTES } from './state.js';

const RADIUS = 0.5;
const SPACING = 0.97; // bubbles sit almost touching, like real bubble wrap
const POP_ANIM_SECONDS = 0.22;
const BUFFER_COLS = 2;
const ZOOM_MAX_OUT = 0.55;
const ZOOM_DECAY = 0.015; // per-second multiplier applied continuously - the "shoot back" spring
const MOMENTUM_DECAY = 0.05;
const TAP_MOVE_THRESHOLD_PX = 8;
const TAP_MAX_MS = 500;

const KIND_WEIGHTS = [
  ['normal', 0.85],
  ['golden', 0.045],
  ['giant', 0.045],
  ['dud', 0.06],
];

function rollKind() {
  const r = Math.random();
  let acc = 0;
  for (const [kind, w] of KIND_WEIGHTS) {
    acc += w;
    if (r <= acc) return kind;
  }
  return 'normal';
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class BubbleScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._setupLights();
    this._buildTextures();
    this._buildEnvironment();

    this.particles = new ParticleSystem(this.scene);

    this.pointerNDC = new THREE.Vector2(0, 0);
    this.pointerTarget = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();

    this.kickOffset = new THREE.Vector3();
    this.kickVelocity = new THREE.Vector3();

    this.scrollX = 0;
    this.zoomOffset = 0;
    this.dragVelocity = 0;
    this._dragging = false;
    this._pointers = new Map();

    this.time = 0;
    this.paletteId = 'clear';
    this.events = [];
    this.onTap = null;

    this.rows = ROW_TIERS[0];
    this.activeCols = new Map();
    this.freeColSlots = [];

    this._musicalRowCooldown = 15 + Math.random() * 15;
    this._musicalPhrase = null; // { row, cols:[...], notesPopped:Set }

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x081018, 0.55);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    // Kept deliberately to two dynamic lights (plus the hemisphere above) - every
    // extra light doubles per-pixel shading cost across ~100 on-screen bubbles.
    const key = new THREE.DirectionalLight(0xeaf6ff, 1.15);
    key.position.set(4, 5, 7);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xbfe9ff, 0.45);
    rim.position.set(-3, -2, -4);
    this.scene.add(rim);
  }

  // Procedural noise canvas used as both a bump map (surface wrinkles) and a
  // roughness map (uneven sheen) so the plastic never needs an external texture file.
  _buildTextures() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 3 + Math.random() * 14;
      const shade = 90 + Math.floor(Math.random() * 110);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${shade},${shade},${shade},0.5)`);
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const x1 = Math.random() * size, y1 = Math.random() * size;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + (Math.random() - 0.5) * 60, y1 + (Math.random() - 0.5) * 60);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    this._noiseTex = tex;
  }

  // A tiny procedural equirectangular gradient (no external HDRI) fed through
  // PMREMGenerator so the glossy/transmissive bubbles pick up soft reflections.
  _buildEnvironment() {
    const w = 128, h = 64;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#dff3ff');
    grad.addColorStop(0.35, '#8fb9d6');
    grad.addColorStop(0.7, '#1b2a38');
    grad.addColorStop(1, '#05080c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(w * 0.3, h * 0.18, w * 0.16, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(w * 0.75, h * 0.28, w * 0.12, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    const envTex = new THREE.CanvasTexture(c);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(envTex);
    this.scene.environment = rt.texture;
    envTex.dispose();
    pmrem.dispose();
  }

  init(state) {
    this.scrollX = state.scrollX || 0;
    this.setPalette(state.cosmetics.active);
    this.setRows(state.rowTierIndex);
  }

  setPalette(paletteId) {
    this.paletteId = paletteId;
    const pal = PALETTES[paletteId] || PALETTES.clear;
    const [c1, c2] = pal.bg;
    this._bgGrad = this._makeBgTexture(c1, c2);
    this.scene.background = this._bgGrad;
    this.hemiLight.color.set(pal.emissive ? 0x6fd0ff : 0x9fd8ff);

    if (this._starField) {
      this.scene.remove(this._starField);
      this._starField = null;
    }
    if (pal.stars) {
      const starGeo = new THREE.BufferGeometry();
      const N = 260;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
        pos[i * 3 + 2] = -8 - Math.random() * 15;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.75 });
      this._starField = new THREE.Points(starGeo, starMat);
      this.scene.add(this._starField);
    }

    this._buildMaterials();
    for (const slot of this.activeCols.values()) {
      for (const b of slot.bubbles) this._applyMaterial(b);
    }
    this._applyPlaneColor();
  }

  _makeBgTexture(c1, c2) {
    const w = 4, h = 128;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildMaterials() {
    const pal = PALETTES[this.paletteId] || PALETTES.clear;
    const tint = new THREE.Color(pal.tint);

    // Note: MeshPhysicalMaterial's real `transmission` forces an extra full-scene
    // render pass every frame - too expensive with 100+ bubbles on screen, especially
    // on mobile. We fake clear plastic instead with alpha transparency + clearcoat +
    // envMap reflections, which uses ordinary (cheap) alpha blending.
    const mk = (hex, { emissive = false, opacity = 0.62, extra = {} } = {}) => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(hex),
      transparent: true,
      opacity,
      roughness: 0.22,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      bumpMap: this._noiseTex,
      bumpScale: 0.01,
      envMapIntensity: 1.3,
      iridescence: pal.iridescent ? 0.85 : 0,
      iridescenceIOR: 1.3,
      emissive: emissive ? new THREE.Color(hex) : new THREE.Color(0x000000),
      emissiveIntensity: emissive ? 0.22 : 0,
      ...extra,
    });

    if (this._materials) Object.values(this._materials).forEach((m) => m.dispose());
    this._materials = {
      normal: mk(tint.getHex(), { emissive: pal.emissive }),
      golden: mk(0xffcf4d, { emissive: true, opacity: 0.85, extra: { metalness: 0.2, roughness: 0.12, emissiveIntensity: 0.4 } }),
      dud: mk(0x83917f, { opacity: 0.8, extra: { roughness: 0.55, clearcoat: 0.25 } }),
      musical: mk(0x8fc7ff, { emissive: true, opacity: 0.7, extra: { emissiveIntensity: 0.35 } }),
    };
  }

  _applyPlaneColor() {
    // handled via bg texture behind the transmissive plane; the plane itself
    // stays a neutral frosted white so light transmits through it convincingly.
  }

  setRows(rowTierIndex) {
    this.rowTierIndex = rowTierIndex;
    this.rows = ROW_TIERS[rowTierIndex];
    this._rebuild();
    this._fitCamera();
  }

  _rebuild() {
    for (const slot of this.activeCols.values()) this._disposeSlot(slot);
    for (const slot of this.freeColSlots) this._disposeSlot(slot);
    this.activeCols.clear();
    this.freeColSlots.length = 0;

    if (this.plane) {
      this.group.remove(this.plane);
      this.plane.geometry.dispose();
      this.plane.material.dispose();
    }
    const planeW = 90;
    const planeH = this.rows * SPACING + SPACING * 6;
    const segX = 60, segY = Math.max(8, Math.round(this.rows * 2));
    const planeGeo = new THREE.PlaneGeometry(planeW, planeH, segX, segY);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x0d1a22, roughness: 0.95, metalness: 0.0 });
    this.plane = new THREE.Mesh(planeGeo, planeMat);
    this.plane.position.z = -0.2;
    this.group.add(this.plane);
    this._planeBasePos = planeGeo.attributes.position.array.slice();

    if (!this._domeGeo) {
      const domeGeo = new THREE.SphereGeometry(RADIUS, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      domeGeo.rotateX(Math.PI / 2);
      this._domeGeo = domeGeo;
    }
    if (!this._materials) this._buildMaterials();

    this._reconcileColumns(true);
  }

  _disposeSlot(slot) {
    for (const b of slot.bubbles) {
      this.group.remove(b.mesh);
    }
  }

  _createColumnSlot() {
    const bubbles = [];
    for (let row = 0; row < this.rows; row++) {
      const mesh = new THREE.Mesh(this._domeGeo, this._materials.normal);
      mesh.position.set(0, this._rowY(row), 0);
      this.group.add(mesh);
      bubbles.push({
        row, col: 0, mesh,
        kind: 'normal', state: 'alive', timer: 0, regenSeconds: 1, noteIndex: 0,
      });
    }
    return { colIndex: null, bubbles };
  }

  _rowY(row) {
    return (row - (this.rows - 1) / 2) * SPACING;
  }

  _kindScale(kind) {
    return kind === 'giant' ? 1.5 : 1;
  }

  _applyMaterial(bubble) {
    bubble.mesh.material = this._materials[bubble.kind] || this._materials.normal;
  }

  _ensureColumn(col) {
    if (this.activeCols.has(col)) return;
    let slot = this.freeColSlots.pop();
    if (!slot) slot = this._createColumnSlot();
    slot.colIndex = col;
    for (const b of slot.bubbles) {
      b.col = col;
      b.kind = rollKind();
      b.state = 'alive';
      b.timer = 0;
      b.mesh.position.x = col * SPACING;
      b.mesh.position.y = this._rowY(b.row);
      b.mesh.position.z = 0;
      b.mesh.scale.setScalar(this._kindScale(b.kind));
      b.mesh.visible = true;
      this._applyMaterial(b);
    }
    this.activeCols.set(col, slot);
  }

  _releaseColumn(col) {
    const slot = this.activeCols.get(col);
    if (!slot) return;
    this.activeCols.delete(col);
    for (const b of slot.bubbles) {
      b.mesh.position.x = 1e6;
      b.mesh.visible = false;
    }
    this.freeColSlots.push(slot);
  }

  _visibleColRange() {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const dist = this._currentDist || 10;
    const halfHeightWorld = dist * Math.tan(vFov / 2);
    const halfWidthWorld = halfHeightWorld * this.camera.aspect;
    const minCol = Math.floor((this.scrollX - halfWidthWorld) / SPACING) - BUFFER_COLS;
    const maxCol = Math.ceil((this.scrollX + halfWidthWorld) / SPACING) + BUFFER_COLS;
    return [minCol, maxCol];
  }

  _reconcileColumns(force = false) {
    const [minCol, maxCol] = this._visibleColRange();
    for (const col of Array.from(this.activeCols.keys())) {
      if (col < minCol || col > maxCol) this._releaseColumn(col);
    }
    for (let col = minCol; col <= maxCol; col++) {
      if (!this.activeCols.has(col)) this._ensureColumn(col);
    }
  }

  _fitCamera() {
    const extent = this.rows * SPACING + SPACING * 1.4;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const dist = (extent / 2) / Math.tan(fovRad / 2);
    this._baseDist = dist;
    if (!this._currentDist) this._currentDist = dist;
  }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.rows) this._fitCamera();
  }

  // ---------- input: drag-to-scroll, tap-to-pop, pinch/wheel zoom with elastic snap-back ----------

  _bindInput() {
    const canvas = this.canvas;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._startDrag(e.clientX, e.clientY);
      } else if (this._pointers.size === 2) {
        this._dragging = false;
        this._pinchStartDist = this._pointerDist();
        this._pinchStartZoom = this.zoomOffset;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      this.setPointer(e.clientX, e.clientY);
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 2) {
        const dist = this._pointerDist();
        if (this._pinchStartDist > 1) {
          const ratio = dist / this._pinchStartDist;
          const desired = this._pinchStartZoom + (1 / ratio - 1);
          this.zoomOffset = Math.max(0, Math.min(ZOOM_MAX_OUT, desired));
        }
        return;
      }
      if (this._dragging) {
        const now = performance.now();
        const dtSec = Math.max(0.001, (now - this._dragLast.t) / 1000);
        const dxPix = e.clientX - this._dragLast.x;
        const dxWorld = -dxPix * this._worldPerPixel();
        this.scrollX += dxWorld;
        this.dragVelocity = dxWorld / dtSec;
        this._dragMoved += Math.abs(dxPix) + Math.abs(e.clientY - this._dragLast.y);
        this._dragLast = { x: e.clientX, y: e.clientY, t: now };
      }
    });

    const endPointer = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 0) {
        if (this._dragging) {
          const heldMs = performance.now() - this._dragStart.t;
          if (this._dragMoved < TAP_MOVE_THRESHOLD_PX && heldMs < TAP_MAX_MS) {
            this.dragVelocity = 0;
            if (this.onTap) this.onTap(e.clientX, e.clientY);
          }
        }
        this._dragging = false;
      } else if (this._pointers.size === 1) {
        const [[, pos]] = this._pointers;
        this._startDrag(pos.x, pos.y);
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        this.scrollX += e.deltaX * this._worldPerPixel() * 1.4;
      } else {
        this.zoomOffset = Math.max(0, Math.min(ZOOM_MAX_OUT, this.zoomOffset + e.deltaY * 0.0006));
      }
    }, { passive: false });
  }

  _startDrag(x, y) {
    this._dragStart = { x, y, t: performance.now() };
    this._dragLast = { x, y, t: performance.now() };
    this._dragMoved = 0;
    this._dragging = true;
    this.dragVelocity = 0;
  }

  _pointerDist() {
    const pts = Array.from(this._pointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  _worldPerPixel() {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const dist = this._currentDist || this._baseDist || 10;
    const canvasH = this.canvas.clientHeight || window.innerHeight;
    return (2 * dist * Math.tan(vFov / 2)) / canvasH;
  }

  setPointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerTarget.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerTarget.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  // Returns the primary hit bubble plus any alive neighbors within splashRadius (chebyshev distance).
  hitTest(clientX, clientY, splashRadius) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [];
    for (const slot of this.activeCols.values()) {
      for (const b of slot.bubbles) if (b.state === 'alive') meshes.push(b.mesh);
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return [];
    const primary = this._bubbleForMesh(hits[0].object);
    if (!primary) return [];
    if (splashRadius <= 0) return [primary];
    const result = [];
    for (const slot of this.activeCols.values()) {
      for (const b of slot.bubbles) {
        if (b.state !== 'alive') continue;
        const dr = Math.abs(b.row - primary.row);
        const dc = Math.abs(b.col - primary.col);
        if (Math.max(dr, dc) <= splashRadius) result.push(b);
      }
    }
    return result;
  }

  _bubbleForMesh(mesh) {
    for (const slot of this.activeCols.values()) {
      for (const b of slot.bubbles) if (b.mesh === mesh) return b;
    }
    return null;
  }

  popBubble(bubble, { flourish = true } = {}) {
    if (bubble.state !== 'alive') return;
    bubble.state = 'popping';
    bubble.timer = 0;
    bubble.regenSeconds = this._regenSeconds;

    const worldPos = new THREE.Vector3();
    bubble.mesh.getWorldPosition(worldPos);

    if (flourish) {
      let colorHex = bubble.mesh.material.color.getHex();
      let count = bubble.kind === 'giant' ? 34 : 16;
      this.particles.burst(worldPos, {
        count,
        colorHex,
        size: bubble.kind === 'giant' ? 1.6 : 1,
        speed: bubble.kind === 'golden' ? 3.4 : 2.6,
      });
      this._spawnFlashRing(worldPos, colorHex, bubble.kind === 'giant' ? 1.6 : 1);
    }

    if (bubble.kind === 'dud') this.events.push({ type: 'dud' });
    if (bubble.kind === 'musical') this._registerMusicalPop(bubble);

    this.kickVelocity.x += (Math.random() - 0.5) * 0.05;
    this.kickVelocity.y += (Math.random() - 0.5) * 0.05;
    this.kickVelocity.z += 0.06;

    return { kind: bubble.kind, row: bubble.row, col: bubble.col };
  }

  _registerMusicalPop(bubble) {
    if (!this._musicalPhrase || this._musicalPhrase.row !== bubble.row) return;
    if (!this._musicalPhrase.cols.includes(bubble.col)) return;
    this._musicalPhrase.notesPopped.add(bubble.col);
    if (this._musicalPhrase.notesPopped.size >= this._musicalPhrase.cols.length) {
      this.events.push({ type: 'melody' });
      this._musicalPhrase = null;
    }
  }

  _spawnFlashRing(pos, colorHex, scale = 1) {
    const geo = new THREE.RingGeometry(0.05, 0.09, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(pos);
    ring.position.z += 0.02;
    this.scene.add(ring);
    ring.userData.life = 0;
    ring.userData.maxLife = 0.4;
    ring.userData.scale = scale;
    if (!this._flashRings) this._flashRings = [];
    this._flashRings.push(ring);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  getScrollX() {
    return this.scrollX;
  }

  update(dt, { regenSeconds }) {
    this.time += dt;
    this._regenSeconds = regenSeconds;

    if (!this._dragging && this._pointers.size === 0 && Math.abs(this.dragVelocity) > 0.01) {
      this.scrollX += this.dragVelocity * dt;
      this.dragVelocity *= Math.pow(MOMENTUM_DECAY, dt);
    } else if (this._pointers.size !== 1) {
      this.dragVelocity = 0;
    }

    this.zoomOffset *= Math.pow(ZOOM_DECAY, dt);
    if (this.zoomOffset < 0.001) this.zoomOffset = 0;

    this.pointerNDC.lerp(this.pointerTarget, Math.min(1, dt * 4));

    this.kickVelocity.multiplyScalar(Math.pow(0.001, dt));
    this.kickOffset.addScaledVector(this.kickVelocity, dt);
    this.kickOffset.multiplyScalar(Math.pow(0.0001, dt));

    const targetDist = (this._baseDist || 10) * (1 + this.zoomOffset);
    this._currentDist = this._currentDist === undefined ? targetDist : this._currentDist + (targetDist - this._currentDist) * Math.min(1, dt * 6);

    this._reconcileColumns();

    const drift = new THREE.Vector3(
      Math.sin(this.time * 0.1) * 0.3,
      Math.cos(this.time * 0.08) * 0.18,
      0
    );
    const parallax = new THREE.Vector3(this.pointerNDC.x * 0.5, this.pointerNDC.y * 0.3, 0);

    this.camera.position.set(
      this.scrollX + drift.x + parallax.x + this.kickOffset.x,
      drift.y + parallax.y + this.kickOffset.y,
      this._currentDist - this.kickOffset.z
    );
    this.camera.lookAt(this.scrollX, 0, 0);

    this._musicalRowCooldown -= dt;
    if (this._musicalRowCooldown <= 0 && !this._musicalPhrase) {
      this._tryDesignateMusicalPhrase();
      this._musicalRowCooldown = 4;
    }

    for (const slot of this.activeCols.values()) {
      for (const b of slot.bubbles) {
        if (b.state === 'popping') {
          b.timer += dt;
          const t = Math.min(1, b.timer / POP_ANIM_SECONDS);
          let s;
          if (t < 0.35) {
            const st = t / 0.35;
            s = 1 + st * 0.35;
            b.mesh.scale.set(s * 1.15, s * 0.55, s * 1.15);
          } else {
            const st = (t - 0.35) / 0.65;
            s = (1 - st) * this._kindScale(b.kind);
            b.mesh.scale.set(s, s, s);
          }
          if (t >= 1) {
            b.state = 'regenerating';
            b.timer = 0;
            b.mesh.scale.set(0, 0, 0);
          }
        } else if (b.state === 'regenerating') {
          b.timer += dt;
          const t = Math.min(1, b.timer / Math.max(0.4, b.regenSeconds));
          const s = easeOutBack(t) * this._kindScale(b.kind);
          b.mesh.scale.set(Math.max(0, s), Math.max(0, s), Math.max(0, s));
          b.mesh.position.z = 0;
          if (t >= 1) {
            b.state = 'alive';
            b.kind = rollKind();
            this._applyMaterial(b);
            b.mesh.scale.set(this._kindScale(b.kind), this._kindScale(b.kind), this._kindScale(b.kind));
          }
        } else if (b.state === 'alive') {
          const bob = Math.sin(this.time * 1.4 + b.row * 0.7 + b.col * 0.5) * 0.012;
          b.mesh.position.z = bob;
        }
      }
    }

    if (this.plane) {
      this.plane.position.x = this.scrollX;
      const pos = this.plane.geometry.attributes.position;
      const base = this._planeBasePos;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const z = Math.sin(x * 0.5 + this.time * 0.5) * 0.025 + Math.cos(y * 0.45 + this.time * 0.35) * 0.025;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }

    if (this._flashRings && this._flashRings.length) {
      for (let i = this._flashRings.length - 1; i >= 0; i--) {
        const r = this._flashRings[i];
        r.userData.life += dt;
        const t = r.userData.life / r.userData.maxLife;
        if (t >= 1) {
          this.scene.remove(r);
          r.geometry.dispose();
          r.material.dispose();
          this._flashRings.splice(i, 1);
          continue;
        }
        const sc = (0.3 + t * 2.2) * r.userData.scale;
        r.scale.set(sc, sc, sc);
        r.material.opacity = 0.85 * (1 - t);
        r.lookAt(this.camera.position);
      }
    }

    if (this._starField) {
      this._starField.position.x = this.scrollX;
      this._starField.rotation.z += dt * 0.004;
    }

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _tryDesignateMusicalPhrase() {
    const row = Math.floor(Math.random() * this.rows);
    const startCol = Math.round(this.scrollX / SPACING) + Math.floor((Math.random() - 0.5) * 4);
    const len = 5;
    const cols = [];
    for (let i = 0; i < len; i++) {
      const col = startCol + i;
      const slot = this.activeCols.get(col);
      if (!slot) return; // not currently active, try again later
      const b = slot.bubbles[row];
      if (b.state !== 'alive' || b.kind !== 'normal') return;
      cols.push(col);
    }
    for (let i = 0; i < len; i++) {
      const slot = this.activeCols.get(cols[i]);
      const b = slot.bubbles[row];
      b.kind = 'musical';
      b.noteIndex = i;
      this._applyMaterial(b);
    }
    this._musicalPhrase = { row, cols, notesPopped: new Set() };
    this._musicalRowCooldown = 18 + Math.random() * 22;
  }

  randomAliveBubble() {
    const candidates = [];
    for (const slot of this.activeCols.values()) {
      for (const b of slot.bubbles) if (b.state === 'alive') candidates.push(b);
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
