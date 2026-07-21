import * as THREE from './vendor/three.module.min.js';
import { ParticleSystem } from './particles.js';
import { SHEET_SIZES } from './state.js';
import { PALETTES } from './state.js';
import { regenSecondsFor } from './upgrades.js';

const SPACING = 1.08;
const RADIUS = 0.44;
const POP_ANIM_SECONDS = 0.22;

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

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export class BubbleScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.cameraBase = new THREE.Vector3(0, 0, 10);
    this.camera.position.copy(this.cameraBase);

    this._setupLights();

    this.plane = null;
    this.bubbles = [];
    this.gridSizeIndex = 0;
    this.gridN = SHEET_SIZES[0];

    this.particles = new ParticleSystem(this.scene);

    this.pointerNDC = new THREE.Vector2(0, 0);
    this.pointerTarget = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();

    this.kickOffset = new THREE.Vector3();
    this.kickVelocity = new THREE.Vector3();

    this.time = 0;
    this.paletteId = 'pastel';
    this.events = [];

    this._musicalRowCooldown = 15 + Math.random() * 15;
    this._musicalRowActive = null; // { row, notesPopped:Set }

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xfff3e6, 0xd9c8ff, 0.65);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    const key = new THREE.DirectionalLight(0xfff1e0, 1.05);
    key.position.set(4, 5, 6);
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xcfe8ff, 0.4);
    fill.position.set(-5, 2, 3);
    this.scene.add(fill);
    this.fillLight = fill;

    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(-2, -3, -4);
    this.scene.add(rim);
    this.rimLight = rim;

    const sparkle = new THREE.PointLight(0xffffff, 0.5, 12, 2);
    sparkle.position.set(0, 1.5, 6);
    this.scene.add(sparkle);
  }

  init(state) {
    this.setPalette(state.cosmetics.active);
    this.setGridSize(state.gridSizeIndex);
  }

  setPalette(paletteId) {
    this.paletteId = paletteId;
    const pal = PALETTES[paletteId] || PALETTES.pastel;
    const [c1, c2] = pal.bg;
    this.scene.background = new THREE.Color(c1);
    this._bgTop = new THREE.Color(c1);
    this._bgBottom = new THREE.Color(c2);
    this.hemiLight.color.set(pal.emissive ? 0x445577 : 0xfff3e6);
    this.hemiLight.groundColor.set(new THREE.Color(c2));

    if (this._starField) {
      this.scene.remove(this._starField);
      this._starField = null;
    }
    if (pal.stars) {
      const starGeo = new THREE.BufferGeometry();
      const N = 300;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 40;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
        pos[i * 3 + 2] = -8 - Math.random() * 15;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.8 });
      this._starField = new THREE.Points(starGeo, starMat);
      this.scene.add(this._starField);
    }

    for (const b of this.bubbles) this._applyMaterial(b);
    this._applyPlaneColor();
  }

  _applyPlaneColor() {
    if (!this._planeMat) return;
    const pal = PALETTES[this.paletteId] || PALETTES.pastel;
    const c1 = new THREE.Color(pal.bg[0]);
    const c2 = new THREE.Color(pal.bg[1]);
    this._planeMat.color.copy(c1).lerp(c2, 0.5);
  }

  setGridSize(gridSizeIndex) {
    this.gridSizeIndex = gridSizeIndex;
    this.gridN = SHEET_SIZES[gridSizeIndex];
    this._buildGrid();
    this._fitCamera();
  }

  _buildGrid() {
    for (const b of this.bubbles) {
      b.mesh.geometry.dispose();
      this.group.remove ? null : null;
    }
    if (this.group) this.scene.remove(this.group);
    if (this.plane) {
      this.plane.geometry.dispose();
      this.plane.material.dispose();
    }

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const n = this.gridN;
    const extent = (n - 1) * SPACING;
    const half = extent / 2;

    const segs = Math.min(48, n * 3);
    const planeSize = extent + SPACING * 16; // generously oversized so it always fills the frame, even with camera parallax/kick
    const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize, segs, segs);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0 });
    this.plane = new THREE.Mesh(planeGeo, planeMat);
    this.plane.position.z = -0.16;
    this.group.add(this.plane);
    this._planeBasePos = planeGeo.attributes.position.array.slice();
    this._planeMat = planeMat;
    this._applyPlaneColor();

    const domeGeo = new THREE.SphereGeometry(RADIUS, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.rotateX(Math.PI / 2);
    this._domeGeo = domeGeo;

    this.bubbles = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const mesh = new THREE.Mesh(domeGeo, null);
        mesh.position.set(col * SPACING - half, row * SPACING - half, 0);
        this.group.add(mesh);
        const bubble = {
          row, col, mesh,
          kind: 'normal',
          state: 'alive',
          timer: 0,
          regenSeconds: 1,
          baseScale: 1,
          noteIndex: col,
        };
        mesh.userData.bubble = bubble;
        this._applyMaterial(bubble);
        this.bubbles.push(bubble);
      }
    }
  }

  _kindScale(kind) {
    if (kind === 'giant') return 1.5;
    return 1;
  }

  _applyMaterial(bubble) {
    const pal = PALETTES[this.paletteId] || PALETTES.pastel;
    const colors = pal.colors;
    let hex = colors[(bubble.row * 7 + bubble.col * 3) % colors.length];
    let emissiveHex = 0x000000;
    let emissiveIntensity = pal.emissive ? 0.35 : 0.08;
    let roughness = 0.28;
    let metalness = 0.05;

    if (bubble.kind === 'golden') {
      hex = '#ffd24d';
      emissiveHex = 0xffb300;
      emissiveIntensity = 0.55;
      metalness = 0.35;
      roughness = 0.2;
    } else if (bubble.kind === 'dud') {
      hex = '#b9c2a5';
      emissiveIntensity = 0.02;
      roughness = 0.6;
    } else if (bubble.kind === 'musical') {
      hex = '#7fb8ff';
      emissiveHex = 0x2e6bff;
      emissiveIntensity = 0.4;
    } else if (bubble.kind === 'giant') {
      emissiveIntensity = Math.max(emissiveIntensity, 0.2);
    }

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(hex),
      roughness,
      metalness,
      emissive: new THREE.Color(emissiveHex),
      emissiveIntensity,
      clearcoat: pal.iridescent ? 1 : 0.5,
      clearcoatRoughness: 0.25,
      iridescence: pal.iridescent ? 1 : 0,
      iridescenceIOR: 1.3,
      sheen: pal.iridescent ? 1 : 0,
      sheenColor: new THREE.Color(0xffffff),
    });
    if (bubble.mesh.material) bubble.mesh.material.dispose();
    bubble.mesh.material = mat;
  }

  _fitCamera() {
    const n = this.gridN;
    const extent = (n - 1) * SPACING + SPACING * 1.6;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect;
    const distV = (extent / 2) / Math.tan(fovRad / 2);
    const distH = (extent / 2) / (Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(distV, distH) * 1.08;
    this.cameraBase.set(0, 0, dist);
    this._targetDist = dist;
    if (!this._currentDist) this._currentDist = dist;
  }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.gridN) this._fitCamera();
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
    const meshes = this.bubbles.filter((b) => b.state === 'alive').map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return [];
    const primary = hits[0].object.userData.bubble;
    if (splashRadius <= 0) return [primary];
    const result = [];
    for (const b of this.bubbles) {
      if (b.state !== 'alive') continue;
      const dr = Math.abs(b.row - primary.row);
      const dc = Math.abs(b.col - primary.col);
      if (Math.max(dr, dc) <= splashRadius) result.push(b);
    }
    return result;
  }

  popBubble(bubble, { flourish = true } = {}) {
    if (bubble.state !== 'alive') return;
    bubble.state = 'popping';
    bubble.timer = 0;
    bubble.regenSeconds = this._regenSeconds;

    const worldPos = new THREE.Vector3();
    bubble.mesh.getWorldPosition(worldPos);

    if (flourish) {
      const pal = PALETTES[this.paletteId] || PALETTES.pastel;
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
    if (!this._musicalRowActive || this._musicalRowActive.row !== bubble.row) return;
    this._musicalRowActive.notesPopped.add(bubble.col);
    if (this._musicalRowActive.notesPopped.size >= this.gridN) {
      this.events.push({ type: 'melody' });
      this._musicalRowActive = null;
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

  update(dt, { regenSeconds }) {
    this.time += dt;
    this._regenSeconds = regenSeconds;

    // pointer parallax (smoothed)
    this.pointerNDC.lerp(this.pointerTarget, Math.min(1, dt * 4));

    // camera kick spring
    this.kickVelocity.multiplyScalar(Math.pow(0.001, dt));
    this.kickOffset.addScaledVector(this.kickVelocity, dt);
    this.kickOffset.multiplyScalar(Math.pow(0.0001, dt));

    if (this._currentDist !== undefined && this._targetDist !== undefined) {
      this._currentDist += (this._targetDist - this._currentDist) * Math.min(1, dt * 3);
    }

    const drift = new THREE.Vector3(
      Math.sin(this.time * 0.12) * 0.35,
      Math.cos(this.time * 0.09) * 0.2,
      0
    );
    const parallax = new THREE.Vector3(this.pointerNDC.x * 0.6, this.pointerNDC.y * 0.35, 0);

    this.camera.position.set(
      drift.x + parallax.x + this.kickOffset.x,
      drift.y + parallax.y + this.kickOffset.y,
      (this._currentDist || this.cameraBase.z) - this.kickOffset.z
    );
    this.camera.lookAt(0, 0, 0);

    // musical row designation
    this._musicalRowCooldown -= dt;
    if (this._musicalRowCooldown <= 0 && !this._musicalRowActive) {
      this._tryDesignateMusicalRow();
      this._musicalRowCooldown = 4;
    }

    // bubble animation
    for (const b of this.bubbles) {
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
          b.kind = this._nextKind(b);
          this._applyMaterial(b);
          b.mesh.scale.set(this._kindScale(b.kind), this._kindScale(b.kind), this._kindScale(b.kind));
        }
      } else if (b.state === 'alive') {
        // gentle idle bob per-bubble for life
        const bob = Math.sin(this.time * 1.4 + b.row * 0.7 + b.col * 0.5) * 0.015;
        b.mesh.position.z = bob;
      }
    }

    // plane subtle flex
    if (this.plane) {
      const pos = this.plane.geometry.attributes.position;
      const base = this._planeBasePos;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const z = Math.sin(x * 0.6 + this.time * 0.6) * 0.03 + Math.cos(y * 0.5 + this.time * 0.4) * 0.03;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }

    // flash rings
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

    if (this._starField) this._starField.rotation.z += dt * 0.005;

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _tryDesignateMusicalRow() {
    const n = this.gridN;
    const row = Math.floor(Math.random() * n);
    for (let col = 0; col < n; col++) {
      const b = this.bubbles[row * n + col];
      if (b.state !== 'alive' || b.kind !== 'normal') return; // not eligible this tick, retry later
    }
    for (let col = 0; col < n; col++) {
      const b = this.bubbles[row * n + col];
      b.kind = 'musical';
      b.noteIndex = col;
      this._applyMaterial(b);
    }
    this._musicalRowActive = { row, notesPopped: new Set() };
    this._musicalRowCooldown = 20 + Math.random() * 25;
  }

  _nextKind() {
    return rollKind();
  }

  countAlive() {
    return this.bubbles.filter((b) => b.state === 'alive').length;
  }

  randomAliveBubble() {
    const alive = this.bubbles.filter((b) => b.state === 'alive');
    if (alive.length === 0) return null;
    return alive[Math.floor(Math.random() * alive.length)];
  }
}
