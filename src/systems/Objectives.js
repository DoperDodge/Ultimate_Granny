import { ITEMS, LOCKS } from '../config/items.js';

// Tracks escape progress and produces the HUD objective list. Data-driven from
// LOCKS/ITEMS so adding a lock automatically adds its objective.
export class Objectives {
  constructor(bus) {
    this.bus = bus;
    this.collected = new Set(); // item ids
    this.openedLocks = new Set();
    this.escaped = false;
  }

  reset() {
    // Items/locks persist within a run; reset only on full restart.
    this.collected.clear();
    this.openedLocks.clear();
    this.escaped = false;
    this._changed();
  }

  onItemCollected(id) { this.collected.add(id); this._changed(); }
  onLockOpened(id) { this.openedLocks.add(id); this._changed(); }
  onEscaped() { this.escaped = true; this._changed(); }

  get allLocksOpen() { return LOCKS.every((l) => this.openedLocks.has(l.id)); }

  list() {
    const out = [{ title: true, text: 'ESCAPE THE HOUSE' }];
    // Required items.
    const requiredItems = [...new Set(LOCKS.map((l) => l.requires))];
    for (const itemId of requiredItems) {
      const def = ITEMS[itemId];
      out.push({ text: `Find the ${def ? def.name : itemId}`, done: this.collected.has(itemId) });
    }
    out.push({ text: 'Open the front door', done: this.allLocksOpen });
    return out;
  }

  _changed() { this.bus.emit('objectives:changed', this.list()); }
}
