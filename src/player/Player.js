import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig.js';

// First-person controller. Owns the camera rig. Handles look, locomotion
// (walk/sprint/crouch), stamina, gravity + step-up, head-bob, and emits
// footstep noise through the EventBus.
export class Player {
  constructor(camera, collision, input, bus) {
    this.camera = camera;
    this.collision = collision;
    this.input = input;
    this.bus = bus;
    this.cfg = CONFIG.player;

    this.pos = new THREE.Vector3(0, 0, 0); // feet position
    this.velY = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.stamina = this.cfg.maxStamina;
    this.eyeHeight = this.cfg.eyeHeight;
    this.onGround = true;

    this.frozen = false;     // disabled during cutscenes/menus
    this.hidden = false;     // inside a wardrobe
    this.hideSpot = null;

    this._bobT = 0;
    this._stepDist = 0;      // distance since last footstep
    this._tmp = new THREE.Vector3();
    this.speed = 0;          // current planar speed (for audio)
  }

  spawn(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.velY = 0;
    this.crouching = false;
    this.stamina = this.cfg.maxStamina;
    this.hidden = false;
    this.hideSpot = null;
    this._syncCamera(this.cfg.eyeHeight);
  }

  get headY() { return this.pos.y + (this.crouching ? this.cfg.crouchEyeHeight : this.cfg.eyeHeight); }

  update(dt) {
    if (this.frozen) { this._syncCamera(this.eyeHeight); return; }
    this._look(dt);

    if (this.hidden) {
      // Locked in place while hiding; still allow looking around a little.
      this._syncCamera(this.eyeHeight);
      return;
    }

    this._move(dt);
  }

  _look(dt) {
    const { dx, dy } = this.input.consumeMouse();
    this.yaw -= dx * this.cfg.mouseSensitivity;
    this.pitch -= dy * this.cfg.mouseSensitivity;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  _move(dt) {
    const input = this.input;
    const axis = input.moveAxis();
    const moving = axis.x !== 0 || axis.z !== 0;

    // Crouch toggle/hold (CtrlLeft or C).
    this.crouching = input.isDown('ControlLeft') || input.isDown('KeyC');

    // Sprint (Shift) — only when moving forward-ish, not crouched, has stamina.
    const wantSprint = input.isDown('ShiftLeft') && moving && !this.crouching && this.stamina > 0.05;
    let speed = this.cfg.walkSpeed;
    if (this.crouching) speed = this.cfg.crouchSpeed;
    else if (wantSprint) speed = this.cfg.sprintSpeed;

    if (wantSprint) this.stamina = Math.max(0, this.stamina - this.cfg.staminaDrain * dt);
    else this.stamina = Math.min(this.cfg.maxStamina, this.stamina + this.cfg.staminaRegen * dt);

    // Desired planar velocity in world space.
    const forward = this._tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    wish.addScaledVector(forward, axis.z).addScaledVector(right, axis.x);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    const dx = wish.x * dt;
    const dz = wish.z * dt;

    const feetY = this.pos.y;
    const headY = this.headY;
    const res = this.collision.resolveMove(this.pos.x, this.pos.z, dx, dz, this.cfg.radius, feetY, headY);
    if (res.bumped && moving && this._bumpCd <= 0) {
      this.bus.emit('noise', { pos: this.pos.clone(), radius: CONFIG.noise.bump });
      this.bus.emit('sfx', { name: 'bump' });
      this._bumpCd = 0.4;
    }
    this._bumpCd = Math.max(0, (this._bumpCd || 0) - dt);
    this.pos.x = res.x;
    this.pos.z = res.z;

    // ----- Vertical: probe ground, apply gravity / step-up -----
    const probeY = this.pos.y + this.cfg.stepHeight;
    const ground = this.collision.groundHeightAt(this.pos.x, this.pos.z, probeY);
    if (ground !== null) {
      if (this.pos.y <= ground + 0.02) {
        // On or below ground: snap up (step) and reset fall.
        this.pos.y = ground;
        this.velY = 0;
        this.onGround = true;
      } else {
        // Airborne above known ground: fall.
        this.velY -= this.cfg.gravity * dt;
        this.pos.y += this.velY * dt;
        if (this.pos.y <= ground) {
          if (this.velY < -7) this.bus.emit('noise', { pos: this.pos.clone(), radius: CONFIG.noise.land });
          this.pos.y = ground;
          this.velY = 0;
          this.onGround = true;
        } else {
          this.onGround = false;
        }
      }
    } else {
      // No ground found at all (off-map) — keep falling, will be caught by a
      // lower slab next frame thanks to the long ray.
      this.velY -= this.cfg.gravity * dt;
      this.pos.y += this.velY * dt;
      this.onGround = false;
    }

    // ----- Footstep noise + head-bob -----
    this.speed = Math.hypot(this.pos.x - 0, 0); // placeholder, set below
    const planar = Math.hypot(dx, dz) / dt;
    this.speed = moving ? planar : 0;
    if (moving && this.onGround) {
      this._stepDist += planar * dt;
      this._bobT += dt * (wantSprint ? 13 : this.crouching ? 6 : 9);
      const strideLen = this.crouching ? 1.1 : wantSprint ? 1.7 : 1.35;
      if (this._stepDist >= strideLen) {
        this._stepDist = 0;
        const radius = this.crouching ? CONFIG.noise.crouchWalk : wantSprint ? CONFIG.noise.sprint : CONFIG.noise.walk;
        this.bus.emit('noise', { pos: this.pos.clone(), radius });
        this.bus.emit('sfx', { name: 'step', crouch: this.crouching, sprint: wantSprint });
      }
    }

    // Smooth eye height toward target (crouch transition).
    const targetEye = this.crouching ? this.cfg.crouchEyeHeight : this.cfg.eyeHeight;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    this._syncCamera(this.eyeHeight, moving);
  }

  _syncCamera(eye, moving = false) {
    const bob = moving ? Math.sin(this._bobT) * this.cfg.headBob : 0;
    this.camera.position.set(this.pos.x, this.pos.y + eye + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // World point a short way in front of the eyes (for interaction raycasts).
  eyeWorld() { return new THREE.Vector3(this.pos.x, this.headY, this.pos.z); }
  lookDir() { return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).normalize(); }
}
