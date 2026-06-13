import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig.js';

const STATE = {
  PATROL: 'patrol',
  INVESTIGATE: 'investigate',
  CHASE: 'chase',
  SEARCH: 'search',
  ATTACK: 'attack',
  STUNNED: 'stunned', // reserved for a future "hit her with a weapon" mechanic
};

export { STATE as GRANNY_STATE };

// Granny: low-poly humanoid + a hearing/sight-driven AI state machine that
// navigates with the WaypointGraph.
export class Granny {
  constructor(scene, collision, graph, bus, getPlayer) {
    this.scene = scene;
    this.collision = collision;
    this.graph = graph;
    this.bus = bus;
    this.getPlayer = getPlayer;
    this.cfg = CONFIG.granny;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.state = STATE.PATROL;

    this.path = null;       // array of Vector3
    this.pathIndex = 0;
    this.targetPoint = null;
    this.lastSeen = null;
    this.memory = 0;        // chase memory timer
    this.stateTimer = 0;    // generic per-state timer
    this.repathTimer = 0;
    this.attackCd = 0;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.active = false;
    this._walkPhase = 0;

    this.group = this._buildMesh();
    this.scene.add(this.group);

    // Hearing: react to noise events.
    this.bus.on('noise', (n) => this._hear(n));
  }

  _buildMesh() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xcdb79e, roughness: 1.0 });
    const dress = new THREE.MeshStandardMaterial({ color: 0x6d2f3a, roughness: 1.0 });
    const hair = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 1.0 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xff3030 });

    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };

    // Body (slightly hunched nightgown)
    add(new THREE.CylinderGeometry(0.22, 0.34, 1.05, 10), dress, 0, 0.95, 0);
    // Head
    const head = add(new THREE.SphereGeometry(0.18, 12, 12), skin, 0, 1.62, 0.02);
    add(new THREE.SphereGeometry(0.2, 10, 10), hair, 0, 1.68, -0.02);
    // Glowing eyes so she's readable in the dark
    add(new THREE.SphereGeometry(0.03, 6, 6), eye, -0.07, 1.63, 0.16);
    add(new THREE.SphereGeometry(0.03, 6, 6), eye, 0.07, 1.63, 0.16);

    // Arms (pivot at shoulder for swing)
    this.armL = new THREE.Group(); this.armL.position.set(-0.26, 1.4, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.26, 1.4, 0);
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.7, 8);
    const aL = new THREE.Mesh(armGeo, skin); aL.position.y = -0.32; this.armL.add(aL);
    const aR = new THREE.Mesh(armGeo, skin); aR.position.y = -0.32; this.armR.add(aR);
    g.add(this.armL, this.armR);

    // Legs
    this.legL = new THREE.Group(); this.legL.position.set(-0.12, 0.45, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.12, 0.45, 0);
    const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.5, 8);
    const lL = new THREE.Mesh(legGeo, skin); lL.position.y = -0.25; this.legL.add(lL);
    const lR = new THREE.Mesh(legGeo, skin); lR.position.y = -0.25; this.legR.add(lR);
    g.add(this.legL, this.legR);

    this.head = head;
    g.visible = false;
    return g;
  }

  spawn(nodeId) {
    const n = this.graph.node(nodeId) || this.graph.node(this.cfg.spawnNodeId);
    this.pos.copy(n.pos);
    this.yaw = Math.random() * Math.PI * 2;
    this.state = STATE.PATROL;
    this.path = null;
    this.pathIndex = 0;
    this.targetPoint = null;
    this.lastSeen = null;
    this.memory = 0;
    this.stateTimer = 0;
    this.active = true;
    this.group.visible = true;
    this._setPatrolTarget();
  }

  deactivate() { this.active = false; this.group.visible = false; }

  get eyeY() { return this.pos.y + 1.55; }

  distanceToPlayer() {
    const p = this.getPlayer();
    return this.pos.distanceTo(p.pos);
  }

  // ---------------- Senses ----------------
  _hear(noise) {
    if (!this.active) return;
    if (this.state === STATE.CHASE || this.state === STATE.ATTACK) return; // already on you
    const eff = noise.radius * this.cfg.hearingMultiplier;
    const d = this.pos.distanceTo(noise.pos);
    if (d <= eff) {
      this.targetPoint = noise.pos.clone();
      this._enter(STATE.INVESTIGATE);
      this._repath(this.targetPoint);
    }
  }

  _canSeePlayer() {
    const p = this.getPlayer();
    if (p.hidden || p.frozen) return false;
    const ex = this.pos.x, ey = this.eyeY, ez = this.pos.z;
    const px = p.pos.x, py = p.headY, pz = p.pos.z;
    const dx = px - ex, dz = pz - ez;
    const dist = Math.hypot(dx, dz, py - ey);
    if (dist > this.cfg.sightRange) return false;

    // Close-range "presence" sense ignores the cone.
    if (dist > this.cfg.closeSenseRange) {
      const fwd = new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
      const to = new THREE.Vector2(dx, dz).normalize();
      const cosA = fwd.dot(to);
      const halfFov = THREE.MathUtils.degToRad(this.cfg.sightFovDeg) / 2;
      if (cosA < Math.cos(halfFov)) return false;
    }
    return this.collision.hasLineOfSight(ex, ey, ez, px, py, pz);
  }

  // ---------------- State helpers ----------------
  _enter(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTimer = 0;
    if (state === STATE.CHASE) this.bus.emit('granny:spotted');
    if (state === STATE.INVESTIGATE || state === STATE.SEARCH) this.bus.emit('granny:alert');
  }

  _setPatrolTarget() {
    const startId = this.graph.nearestId(this.pos);
    const goalId = this.graph.randomPatrolId(startId);
    const node = this.graph.node(goalId);
    this.targetPoint = node.pos.clone();
    this._repath(this.targetPoint);
  }

  _repath(toPoint) {
    const pts = this.graph.pathBetween(this.pos, toPoint);
    if (pts && pts.length) {
      this.path = pts;
      this.pathIndex = 0;
    } else {
      this.path = [toPoint.clone()];
      this.pathIndex = 0;
    }
    this.repathTimer = 0;
  }

  // ---------------- Update ----------------
  update(dt) {
    if (!this.active) return;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stateTimer += dt;
    this.repathTimer += dt;

    const sees = this._canSeePlayer();
    const p = this.getPlayer();

    if (sees) {
      this.lastSeen = p.pos.clone();
      this.memory = this.cfg.memoryTime;
      if (this.state !== STATE.ATTACK) this._enter(STATE.CHASE);
    }

    switch (this.state) {
      case STATE.PATROL: this._updatePatrol(dt); break;
      case STATE.INVESTIGATE: this._updateInvestigate(dt, sees); break;
      case STATE.CHASE: this._updateChase(dt, sees); break;
      case STATE.SEARCH: this._updateSearch(dt); break;
      case STATE.ATTACK: this._updateAttack(dt); break;
    }

    this._animate(dt);
    this._applyTransform();
  }

  _updatePatrol(dt) {
    const arrived = this._followPath(dt, this.cfg.walkSpeed);
    if (arrived) {
      // Pause, then choose a new room.
      if (this.stateTimer > THREE.MathUtils.randFloat(this.cfg.patrolPauseMin, this.cfg.patrolPauseMax)) {
        this._setPatrolTarget();
        this.stateTimer = 0;
      } else {
        // idle look-around
        this.yaw += dt * 0.6;
      }
    }
  }

  _updateInvestigate(dt, sees) {
    const arrived = this._followPath(dt, this.cfg.searchSpeed);
    if (arrived) {
      // Look around the noise source.
      this.yaw += dt * 1.4;
      if (this.stateTimer > this.cfg.investigateTime) {
        this._enter(STATE.PATROL);
        this._setPatrolTarget();
      }
    }
  }

  _updateChase(dt) {
    // Re-path toward the player frequently.
    if (this.lastSeen && (this.repathTimer > 0.35)) this._repath(this.lastSeen);
    this._followPath(dt, this.cfg.chaseSpeed);

    const d = this.distanceToPlayer();
    const p = this.getPlayer();
    if (d <= this.cfg.attackRange && this.collision.hasLineOfSight(this.pos.x, this.eyeY, this.pos.z, p.pos.x, p.headY, p.pos.z)) {
      this._enter(STATE.ATTACK);
      return;
    }

    // Lost sight: burn memory, then search the last-known spot.
    this.memory -= dt;
    if (this.memory <= 0) {
      this._enter(STATE.SEARCH);
      if (this.lastSeen) { this.targetPoint = this.lastSeen.clone(); this._repath(this.targetPoint); }
    }
  }

  _updateSearch(dt) {
    const arrived = this._followPath(dt, this.cfg.searchSpeed);
    if (arrived) {
      this.yaw += dt * 1.8;
      if (this.stateTimer > this.cfg.investigateTime * 0.8) {
        this._enter(STATE.PATROL);
        this._setPatrolTarget();
      }
    }
  }

  _updateAttack(dt) {
    if (this.attackCd <= 0) {
      this.attackCd = this.cfg.attackCooldown;
      const d = this.distanceToPlayer();
      if (d <= this.cfg.attackRange + 0.3) {
        this.bus.emit('player:caught', { pos: this.pos.clone() });
      } else {
        this._enter(STATE.CHASE); // they slipped away
      }
    }
  }

  // Steer/move along this.path. Returns true when the final point is reached.
  _followPath(dt, speed) {
    if (!this.path || this.pathIndex >= this.path.length) return true;
    const target = this.path[this.pathIndex];

    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const distXZ = Math.hypot(dx, dz);

    // Advance to next node when close enough.
    if (distXZ < 0.4) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) return true;
      return false;
    }

    // Turn toward target.
    const desiredYaw = Math.atan2(dx, dz);
    this.yaw = this._turnToward(this.yaw, desiredYaw, this.cfg.turnSpeed * dt);

    // Move forward along facing (helps avoid clipping corners).
    const step = speed * dt;
    const nx = (dx / distXZ) * step;
    const nz = (dz / distXZ) * step;
    const res = this.collision.resolveMove(this.pos.x, this.pos.z, nx, nz, 0.32, this.pos.y, this.pos.y + 1.6);
    this.pos.x = res.x;
    this.pos.z = res.z;

    // Ground follow (stairs / floors).
    const ground = this.collision.groundHeightAt(this.pos.x, this.pos.z, this.pos.y + 0.7);
    if (ground !== null) this.pos.y = ground;

    // Stuck detection -> skip node / repath.
    if (this.pos.distanceToSquared(this.lastPos) < (0.0008)) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.7) {
        this.stuckTimer = 0;
        this.pathIndex++;
        if (this.targetPoint) this._repath(this.targetPoint);
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPos.copy(this.pos);
    return false;
  }

  _turnToward(cur, target, maxStep) {
    let diff = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxStep) return target;
    return cur + Math.sign(diff) * maxStep;
  }

  _animate(dt) {
    const movingStates = (this.state === STATE.PATROL || this.state === STATE.INVESTIGATE ||
                          this.state === STATE.CHASE || this.state === STATE.SEARCH);
    const rate = this.state === STATE.CHASE ? 11 : 6;
    if (movingStates) this._walkPhase += dt * rate;
    const swing = Math.sin(this._walkPhase) * (this.state === STATE.CHASE ? 0.9 : 0.5);
    if (this.legL) this.legL.rotation.x = swing;
    if (this.legR) this.legR.rotation.x = -swing;
    if (this.armL) this.armL.rotation.x = (this.state === STATE.CHASE ? -1.3 : -swing * 0.6); // reaches out when chasing
    if (this.armR) this.armR.rotation.x = (this.state === STATE.CHASE ? -1.3 : swing * 0.6);
  }

  _applyTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }
}
