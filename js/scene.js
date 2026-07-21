import * as THREE from './vendor/three.module.min.js';
import { ParticleSystem } from './particles.js';
import { ROW_TIERS, PALETTES } from './state.js';

const RADIUS = 0.43;
const SPACING = 1.0; // a small visible gap between bubbles, like real bubble wrap
const POP_ANIM_SECONDS = 0.22; // squash + flatten into the popped disc
const REFORM_SECONDS = 0.17; // quick snap back to round - not a slow "inflate"
const FLAT_SCALE_Z = 0.045;
const POPPED_VARIANTS = 30;
const BUFFER_CELLS = 2;
const ZOOM_OUT_BASE = 1.22; // pulled back a bit further by default
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
    this.scrollY = 0;
    this.zoomOffset = 0;
    this.dragVelocityX = 0;
    this.dragVelocityY = 0;
    this._dragging = false;
    this._pointers = new Map();

    this.time = 0;
    this.paletteId = 'clear';
    this.events = [];
    this.onTap = null;

    this.viewTier = ROW_TIERS[0];
    this.activeCells = new Map();
    this.freeBubbles = [];

    this._musicalRowCooldown = 15 + Math.random() * 15;
    this._musicalPhrase = null; // { row, cols:[...], notesPopped:Set }

    if (!this._domeGeo) {
      const domeGeo = new THREE.SphereGeometry(RADIUS, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      domeGeo.rotateX(Math.PI / 2);
      this._domeGeo = domeGeo;
    }

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x081018, 0.55);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    // Kept deliberately to two dynamic lights (plus the hemisphere above) - every
    // extra light doubles per-pixel shading cost across ~100+ on-screen bubbles.
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

    // 30 distinct "popped" wrinkle patterns (radiating creases + random tears)
    // so no two popped bubbles look copy-pasted.
    this._poppedWrinkleTextures = [];
    for (let v = 0; v < POPPED_VARIANTS; v++) {
      this._poppedWrinkleTextures.push(this._makePoppedWrinkleTexture());
    }
  }

  _makePoppedWrinkleTexture() {
    const size = 96;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#7d7d7d';
    ctx.fillRect(0, 0, size, size);
    const cx = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const cy = size / 2 + (Math.random() - 0.5) * size * 0.3;
    const rays = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + Math.random() * 0.6;
      const len = size * (0.35 + Math.random() * 0.4);
      const kinkX = cx + Math.cos(angle) * len * 0.5 + (Math.random() - 0.5) * 12;
      const kinkY = cy + Math.sin(angle) * len * 0.5 + (Math.random() - 0.5) * 12;
      const endX = cx + Math.cos(angle) * len;
      const endY = cy + Math.sin(angle) * len;
      ctx.strokeStyle = `rgba(40,40,40,${0.25 + Math.random() * 0.25})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(kinkX, kinkY, endX, endY);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.18})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + 1, cy + 1);
      ctx.quadraticCurveTo(kinkX + 1, kinkY + 1, endX + 1, endY + 1);
      ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const r = 1 + Math.random() * 5;
      const dark = Math.random() > 0.5;
      ctx.fillStyle = dark ? `rgba(30,30,30,${0.08 + Math.random() * 0.1})` : `rgba(255,255,255,${0.08 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,30,30,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.28 + Math.random() * 0.12), 0, Math.PI * 2);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  // A tiny procedural equirectangular gradient (no external HDRI) fed through
  // PMREMGenerator so the glossy bubbles pick up soft reflections.
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
    this.scrollY = state.scrollY || 0;
    this.setPalette(state.cosmetics.active);
    this.setViewTier(state.rowTierIndex);
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
        pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
        pos[i * 3 + 2] = -8 - Math.random() * 15;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.75 });
      this._starField = new THREE.Points(starGeo, starMat);
      this.scene.add(this._starField);
    }

    this._buildMaterials();
    for (const b of this.activeCells.values()) this._applyMaterial(b);
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

    if (this._poppedMaterials) this._poppedMaterials.forEach((m) => m.dispose());
    const poppedTint = tint.clone().lerp(new THREE.Color(0x1a2228), 0.35);
    this._poppedMaterials = this._poppedWrinkleTextures.map((wrinkleTex) => new THREE.MeshPhysicalMaterial({
      color: poppedTint,
      transparent: true,
      opacity: 0.72,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      bumpMap: wrinkleTex,
      bumpScale: 0.03,
      envMapIntensity: 0.7,
      emissive: pal.emissive ? tint.clone() : new THREE.Color(0x000000),
      emissiveIntensity: pal.emissive ? 0.1 : 0,
    }));
  }

  setViewTier(rowTierIndex) {
    this.rowTierIndex = rowTierIndex;
    this.viewTier = ROW_TIERS[rowTierIndex];
    this._rebuild();
    this._fitCamera();
  }

  _rebuild() {
    for (const b of this.activeCells.values()) this.group.remove(b.mesh);
    for (const b of this.freeBubbles) this.group.remove(b.mesh);
    this.activeCells.clear();
    this.freeBubbles.length = 0;

    if (this.plane) {
      this.group.remove(this.plane);
      this.plane.geometry.dispose();
      this.plane.material.dispose();
    }
    const planeSize = 80;
    const segs = 64;
    const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize, segs, segs);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x0d1a22, roughness: 0.95, metalness: 0.0 });
    this.plane = new THREE.Mesh(planeGeo, planeMat);
    this.plane.position.z = -0.2;
    this.group.add(this.plane);
    this._planeBasePos = planeGeo.attributes.position.array.slice();

    if (!this._materials) this._buildMaterials();

    this._reconcileCells();
  }

  _kindScale(kind) {
    return kind === 'giant' ? 1.5 : 1;
  }

  _applyMaterial(bubble) {
    if (bubble.state === 'popped') {
      bubble.mesh.material = this._poppedMaterials[bubble.poppedVariant];
    } else {
      bubble.mesh.material = this._materials[bubble.kind] || this._materials.normal;
    }
  }

  _key(row, col) {
    return row + ',' + col;
  }

  _createBubble() {
    const mesh = new THREE.Mesh(this._domeGeo, this._materials.normal);
    this.group.add(mesh);
    return {
      row: 0, col: 0, mesh,
      kind: 'normal', state: 'alive', timer: 0, regenSeconds: 1, noteIndex: 0, poppedVariant: 0,
    };
  }

  _ensureCell(row, col) {
    const key = this._key(row, col);
    if (this.activeCells.has(key)) return;
    let b = this.freeBubbles.pop();
    if (!b) b = this._createBubble();
    b.row = row;
    b.col = col;
    b.kind = rollKind();
    b.state = 'alive';
    b.timer = 0;
    b.mesh.position.set(col * SPACING, row * SPACING, 0);
    b.mesh.scale.setScalar(this._kindScale(b.kind));
    b.mesh.visible = true;
    this._applyMaterial(b);
    this.activeCells.set(key, b);
  }

  _releaseCell(row, col) {
    const key = this._key(row, col);
    const b = this.activeCells.get(key);
    if (!b) return;
    this.activeCells.delete(key);
    b.mesh.position.set(1e6, 1e6, 0);
    b.mesh.visible = false;
    this.freeBubbles.push(b);
  }

  _visibleRange() {
    const vFov = (this.camera.fov * Math.PI) / 180;
    const dist = this._currentDist || 10;
    const halfH = dist * Math.tan(vFov / 2);
    const halfW = halfH * this.camera.aspect;
    const minCol = Math.floor((this.scrollX - halfW) / SPACING) - BUFFER_CELLS;
    const maxCol = Math.ceil((this.scrollX + halfW) / SPACING) + BUFFER_CELLS;
    const minRow = Math.floor((this.scrollY - halfH) / SPACING) - BUFFER_CELLS;
    const maxRow = Math.ceil((this.scrollY + halfH) / SPACING) + BUFFER_CELLS;
    return { minCol, maxCol, minRow, maxRow };
  }

  _reconcileCells() {
    const { minCol, maxCol, minRow, maxRow } = this._visibleRange();
    for (const [key, b] of Array.from(this.activeCells.entries())) {
      if (b.row < minRow || b.row > maxRow || b.col < minCol || b.col > maxCol) this._releaseCell(b.row, b.col);
    }
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!this.activeCells.has(this._key(row, col))) this._ensureCell(row, col);
      }
    }
  }

  _fitCamera() {
    const extent = this.viewTier * SPACING + SPACING * 1.4;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const dist = ((extent / 2) / Math.tan(fovRad / 2)) * ZOOM_OUT_BASE;
    this._baseDist = dist;
    if (!this._currentDist) this._currentDist = dist;
  }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.viewTier) this._fitCamera();
  }

  // ---------- input: drag-to-scroll (both axes), tap-to-pop, pinch/wheel zoom with elastic snap-back ----------

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
        const dyPix = e.clientY - this._dragLast.y;
        const wpp = this._worldPerPixel();
        const dxWorld = -dxPix * wpp;
        const dyWorld = dyPix * wpp;
        this.scrollX += dxWorld;
        this.scrollY += dyWorld;
        this.dragVelocityX = dxWorld / dtSec;
        this.dragVelocityY = dyWorld / dtSec;
        this._dragMoved += Math.abs(dxPix) + Math.abs(dyPix);
        this._dragLast = { x: e.clientX, y: e.clientY, t: now };
      }
    });

    const endPointer = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 0) {
        if (this._dragging) {
          const heldMs = performance.now() - this._dragStart.t;
          if (this._dragMoved < TAP_MOVE_THRESHOLD_PX && heldMs < TAP_MAX_MS) {
            this.dragVelocityX = 0;
            this.dragVelocityY = 0;
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
      const wpp = this._worldPerPixel();
      if (e.ctrlKey || e.metaKey) {
        this.zoomOffset = Math.max(0, Math.min(ZOOM_MAX_OUT, this.zoomOffset + e.deltaY * 0.0006));
      } else {
        this.scrollX += e.deltaX * wpp * 1.4;
        this.scrollY -= e.deltaY * wpp * 1.4;
      }
    }, { passive: false });
  }

  _startDrag(x, y) {
    this._dragStart = { x, y, t: performance.now() };
    this._dragLast = { x, y, t: performance.now() };
    this._dragMoved = 0;
    this._dragging = true;
    this.dragVelocityX = 0;
    this.dragVelocityY = 0;
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
    for (const b of this.activeCells.values()) if (b.state === 'alive') meshes.push(b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return [];
    const primary = this._bubbleForMesh(hits[0].object);
    if (!primary) return [];
    if (splashRadius <= 0) return [primary];
    const result = [];
    for (const b of this.activeCells.values()) {
      if (b.state !== 'alive') continue;
      const dr = Math.abs(b.row - primary.row);
      const dc = Math.abs(b.col - primary.col);
      if (Math.max(dr, dc) <= splashRadius) result.push(b);
    }
    return result;
  }

  _bubbleForMesh(mesh) {
    for (const b of this.activeCells.values()) if (b.mesh === mesh) return b;
    return null;
  }

  popBubble(bubble, { flourish = true } = {}) {
    if (bubble.state !== 'alive') return;
    bubble.state = 'popping';
    bubble.timer = 0;
    bubble.regenSeconds = this._regenSeconds;
    bubble.poppedVariant = Math.floor(Math.random() * POPPED_VARIANTS);

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

  getScrollY() {
    return this.scrollY;
  }

  update(dt, { regenSeconds }) {
    this.time += dt;
    this._regenSeconds = regenSeconds;

    const noPointers = this._pointers.size === 0;
    if (!this._dragging && noPointers && (Math.abs(this.dragVelocityX) > 0.01 || Math.abs(this.dragVelocityY) > 0.01)) {
      this.scrollX += this.dragVelocityX * dt;
      this.scrollY += this.dragVelocityY * dt;
      const decay = Math.pow(MOMENTUM_DECAY, dt);
      this.dragVelocityX *= decay;
      this.dragVelocityY *= decay;
    } else if (this._pointers.size !== 1) {
      this.dragVelocityX = 0;
      this.dragVelocityY = 0;
    }

    this.zoomOffset *= Math.pow(ZOOM_DECAY, dt);
    if (this.zoomOffset < 0.001) this.zoomOffset = 0;

    this.pointerNDC.lerp(this.pointerTarget, Math.min(1, dt * 4));

    this.kickVelocity.multiplyScalar(Math.pow(0.001, dt));
    this.kickOffset.addScaledVector(this.kickVelocity, dt);
    this.kickOffset.multiplyScalar(Math.pow(0.0001, dt));

    const targetDist = (this._baseDist || 10) * (1 + this.zoomOffset);
    this._currentDist = this._currentDist === undefined ? targetDist : this._currentDist + (targetDist - this._currentDist) * Math.min(1, dt * 6);

    this._reconcileCells();

    const drift = new THREE.Vector3(
      Math.sin(this.time * 0.1) * 0.3,
      Math.cos(this.time * 0.08) * 0.18,
      0
    );
    const parallax = new THREE.Vector3(this.pointerNDC.x * 0.5, this.pointerNDC.y * 0.3, 0);

    this.camera.position.set(
      this.scrollX + drift.x + parallax.x + this.kickOffset.x,
      this.scrollY + drift.y + parallax.y + this.kickOffset.y,
      this._currentDist - this.kickOffset.z
    );
    this.camera.lookAt(this.scrollX, this.scrollY, 0);

    this._musicalRowCooldown -= dt;
    if (this._musicalRowCooldown <= 0 && !this._musicalPhrase) {
      this._tryDesignateMusicalPhrase();
      this._musicalRowCooldown = 4;
    }

    for (const b of this.activeCells.values()) {
      if (b.state === 'popping') {
        b.timer += dt;
        const t = Math.min(1, b.timer / POP_ANIM_SECONDS);
        const kScale = this._kindScale(b.kind);
        if (t < 0.35) {
          const st = t / 0.35;
          const s = 1 + st * 0.35;
          b.mesh.scale.set(s * 1.15 * kScale, s * 0.55 * kScale, s * 1.15 * kScale);
        } else {
          const st = (t - 0.35) / 0.65;
          const sxy = kScale * (1.15 - 0.1 * st);
          const sz = 0.55 * kScale * (1 - st) + FLAT_SCALE_Z * st;
          b.mesh.scale.set(sxy, sz, sxy);
        }
        if (t >= 1) {
          b.state = 'popped';
          b.timer = 0;
          this._applyMaterial(b);
          const kScale2 = this._kindScale(b.kind);
          b.mesh.scale.set(1.05 * kScale2, 1.05 * kScale2, FLAT_SCALE_Z);
        }
      } else if (b.state === 'popped') {
        b.timer += dt;
        if (b.timer >= Math.max(0.4, b.regenSeconds)) {
          b.state = 'reforming';
          b.timer = 0;
        }
      } else if (b.state === 'reforming') {
        b.timer += dt;
        const t = Math.min(1, b.timer / REFORM_SECONDS);
        const kScale = this._kindScale(b.kind);
        const eased = easeOutBack(t);
        const sxy = (1.05 * (1 - t) + eased * t) * kScale;
        const sz = FLAT_SCALE_Z * (1 - t) + eased * t * kScale;
        b.mesh.scale.set(Math.max(0.001, sxy), Math.max(0.001, sxy), Math.max(0.001, sz));
        if (t >= 1) {
          b.state = 'alive';
          b.kind = rollKind();
          this._applyMaterial(b);
          const kScale2 = this._kindScale(b.kind);
          b.mesh.scale.set(kScale2, kScale2, kScale2);
        }
      } else if (b.state === 'alive') {
        const bob = Math.sin(this.time * 1.4 + b.row * 0.7 + b.col * 0.5) * 0.012;
        b.mesh.position.z = bob;
      }
    }

    if (this.plane) {
      this.plane.position.x = this.scrollX;
      this.plane.position.y = this.scrollY;
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
      this._starField.position.y = this.scrollY;
      this._starField.rotation.z += dt * 0.004;
    }

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _tryDesignateMusicalPhrase() {
    const row = Math.round(this.scrollY / SPACING) + Math.floor((Math.random() - 0.5) * 4);
    const startCol = Math.round(this.scrollX / SPACING) + Math.floor((Math.random() - 0.5) * 4);
    const len = 5;
    const cols = [];
    for (let i = 0; i < len; i++) {
      const col = startCol + i;
      const b = this.activeCells.get(this._key(row, col));
      if (!b || b.state !== 'alive' || b.kind !== 'normal') return; // not currently eligible, try again later
      cols.push(col);
    }
    for (let i = 0; i < len; i++) {
      const b = this.activeCells.get(this._key(row, cols[i]));
      b.kind = 'musical';
      b.noteIndex = i;
      this._applyMaterial(b);
    }
    this._musicalPhrase = { row, cols, notesPopped: new Set() };
    this._musicalRowCooldown = 18 + Math.random() * 22;
  }

  randomAliveBubble() {
    const candidates = [];
    for (const b of this.activeCells.values()) if (b.state === 'alive') candidates.push(b);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
