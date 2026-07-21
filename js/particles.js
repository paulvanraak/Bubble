import * as THREE from './vendor/three.module.min.js';

const MAX_PARTICLES = 400;
const GRAVITY = -4.2;

// A single pooled InstancedMesh drives every particle burst in the scene -
// cheap enough to stay at 60fps even with several overlapping bursts.
export class ParticleSystem {
  constructor(scene) {
    this.geometry = new THREE.TetrahedronGeometry(0.045, 0);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: false,
      roughness: 0.35,
      metalness: 0.1,
      emissiveIntensity: 0.6,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_PARTICLES);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.particles = new Array(MAX_PARTICLES).fill(null).map(() => ({
      alive: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      rotVel: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      scale: 1,
      color: new THREE.Color(),
    }));
    this._cursor = 0;
    this._dummy = new THREE.Object3D();
  }

  burst(origin, { count = 18, colorHex = 0xffffff, spread = 1.4, speed = 2.6, size = 1 } = {}) {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this._cursor];
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;
      p.alive = true;
      p.pos.copy(origin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5 + 0.1;
      const s = (0.5 + Math.random() * 0.8) * speed;
      p.vel.set(
        Math.cos(theta) * Math.sin(phi) * s * spread,
        Math.cos(phi) * s,
        Math.sin(theta) * Math.sin(phi) * s * spread
      );
      p.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      p.rotVel.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      p.life = 0;
      p.maxLife = 0.55 + Math.random() * 0.5;
      p.scale = (0.6 + Math.random() * 0.8) * size;
      p.color.copy(color).offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.15);
    }
  }

  update(dt) {
    let anyAlive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) {
        this._dummy.position.set(9999, 9999, 9999);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }
      anyAlive = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      p.vel.y += GRAVITY * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;

      const tLife = p.life / p.maxLife;
      const fadeScale = p.scale * (1 - tLife * tLife);

      this._dummy.position.copy(p.pos);
      this._dummy.rotation.copy(p.rot);
      this._dummy.scale.setScalar(Math.max(0.0001, fadeScale));
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return anyAlive;
  }
}
