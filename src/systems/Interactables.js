import * as THREE from 'three';
import { CONFIG } from '../config/gameConfig.js';
import { LOCKS, ITEMS } from '../config/items.js';

// Builds and manages every interactable in the world: containers (drawers /
// cabinets), hide spots (wardrobes), and the exit door with its lock sequence.
// Exposes `query(player)` returning the focused interactable + prompt, and
// `interact(player)` to act on it.
export class Interactables {
  constructor(houseBuilder, collision, inventory, objectives, bus) {
    this.house = houseBuilder;
    this.collision = collision;
    this.inventory = inventory;
    this.objectives = objectives;
    this.bus = bus;

    this.range = 2.2;
    this.list = [];
    this._build();
  }

  _build() {
    // Containers
    for (const c of this.house.containers) {
      this.list.push({
        kind: 'container',
        pos: c.pos.clone(),
        def: c,
        opened: false,
        prompt: (p) => (this._opened(c) ? `Search ${c.name}` : `Open ${c.name}`),
        act: (p) => this._openContainer(c),
        _opened: false,
      });
    }

    // Hide spots
    for (const h of this.house.hideSpots) {
      this.list.push({
        kind: 'hide',
        pos: h.pos.clone(),
        def: h,
        prompt: (p) => (p.hideSpot === h ? 'Come out' : `Hide in ${h.name}`),
        act: (p) => this._toggleHide(p, h),
      });
    }

    // Exit door
    const ex = this.house.exit;
    this.exitState = LOCKS.map((l) => ({ ...l, open: false }));
    this.list.push({
      kind: 'exit',
      pos: ex.pos.clone(),
      def: ex,
      prompt: () => this._exitPrompt(),
      act: (p) => this._tryExit(p),
    });
  }

  _opened(c) { return !!c._opened; }

  // ---- Container ----
  _openContainer(c) {
    this.bus.emit('noise', { pos: c.pos.clone(), radius: CONFIG.noise.drawer });
    this.bus.emit('sfx', { name: 'drawer' });

    if (!c._opened) {
      c._opened = true;
      if (c.gives && !c._taken) {
        c._taken = true;
        const added = this.inventory.add(c.gives);
        if (added) this.objectives.onItemCollected(c.gives);
      } else {
        this.bus.emit('toast', { text: 'Empty.' });
      }
    } else {
      this.bus.emit('toast', { text: 'Nothing else here.' });
    }
  }

  // ---- Hiding ----
  _toggleHide(player, spot) {
    if (player.hidden && player.hideSpot === spot) {
      player.hidden = false;
      player.hideSpot = null;
      this.bus.emit('sfx', { name: 'door' });
      this.bus.emit('toast', { text: 'You step out.' });
      this.bus.emit('hide:changed', { hidden: false });
    } else if (!player.hidden) {
      // Tuck the player inside the wardrobe.
      player.pos.x = spot.enterPos.x;
      player.pos.z = spot.enterPos.z;
      player.hidden = true;
      player.hideSpot = spot;
      this.bus.emit('noise', { pos: spot.pos.clone(), radius: CONFIG.noise.door });
      this.bus.emit('sfx', { name: 'door' });
      this.bus.emit('toast', { text: 'Hidden. Hold still. Press E to come out.' });
      this.bus.emit('hide:changed', { hidden: true });
    }
  }

  // ---- Exit ----
  _nextLock() { return this.exitState.find((l) => !l.open) || null; }

  _exitPrompt() {
    const lock = this._nextLock();
    if (!lock) return 'Open the door';
    const item = ITEMS[lock.requires];
    if (this.inventory.has(lock.requires)) return `${lock.verb}`;
    return `Locked — need ${item ? item.name : lock.requires}`;
  }

  _tryExit(player) {
    const lock = this._nextLock();
    if (!lock) { this._openDoor(); return; }
    if (!this.inventory.has(lock.requires)) {
      const item = ITEMS[lock.requires];
      this.bus.emit('toast', { text: `It won't budge — you need the ${item ? item.name : lock.requires}.` });
      this.bus.emit('sfx', { name: 'lockedRattle' });
      return;
    }
    // Solve this lock.
    lock.open = true;
    this.bus.emit('sfx', { name: 'unlock' });
    this.objectives.onLockOpened(lock.id);
    this._removeLockVisual(lock.id);
    this.bus.emit('toast', { text: `${lock.label} cleared.` });

    if (!this._nextLock()) {
      this._openDoor();
    }
  }

  _removeLockVisual(lockId) {
    const name = `lock_${lockId}`;
    const mesh = this.house.exit.mesh.getObjectByName(name);
    if (mesh) mesh.visible = false;
  }

  _openDoor() {
    this.objectives.onEscaped();
    // Swing the leaf open + drop its collision so the player can walk through.
    if (this.house.exit.leaf) this.house.exit.leaf.parent.rotation.y = -1.2;
    if (this.house.exit.collisionBox) this.collision.removeWallBox(this.house.exit.collisionBox);
    this.bus.emit('sfx', { name: 'doorOpen' });
    this.bus.emit('player:escaped', {});
  }

  // ---- Per-frame focus selection ----
  // Returns { target, prompt } for the interactable the player is looking at /
  // standing next to, or null.
  query(player) {
    // While hidden, the only action is to come out of the current spot.
    if (player.hidden && player.hideSpot) {
      const spot = this.list.find((i) => i.kind === 'hide' && i.def === player.hideSpot);
      return spot ? { target: spot, prompt: spot.prompt(player) } : null;
    }

    const eye = player.eyeWorld();
    const dir = player.lookDir();
    let best = null, bestScore = -Infinity;

    for (const it of this.list) {
      const to = new THREE.Vector3().subVectors(it.pos, eye);
      const dist = to.length();
      if (dist > this.range) continue;
      to.normalize();
      const facing = to.dot(dir); // 1 = looking straight at it
      if (facing < 0.35) continue;
      // Prefer things we're looking more directly at, then closer.
      const score = facing * 2 - dist * 0.4;
      if (score > bestScore) { bestScore = score; best = it; }
    }

    return best ? { target: best, prompt: best.prompt(player) } : null;
  }

  interact(player) {
    const q = this.query(player);
    if (!q) return false;
    q.target.act(player);
    return true;
  }

  // Full reset for a new game.
  reset() {
    for (const it of this.list) {
      if (it.kind === 'container') { it._opened = false; it.def._opened = false; it.def._taken = false; }
    }
    for (const l of this.exitState) {
      l.open = false;
      this._removeLockVisualRestore(l.id);
    }
    if (this.house.exit.leaf) this.house.exit.leaf.parent.rotation.y = 0;
    if (this.house.exit.collisionBox && this.collision.wallBoxes.indexOf(this.house.exit.collisionBox) < 0) {
      this.collision.addWallBox(this.house.exit.collisionBox);
    }
  }

  _removeLockVisualRestore(lockId) {
    const mesh = this.house.exit.mesh.getObjectByName(`lock_${lockId}`);
    if (mesh) mesh.visible = true;
  }
}
