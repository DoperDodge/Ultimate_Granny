import { ITEMS } from '../config/items.js';

// Player inventory. Items persist across days (only the escape resets state).
export class Inventory {
  constructor(bus) {
    this.bus = bus;
    this.items = new Set();
  }

  reset() {
    this.items.clear();
    this.bus.emit('inventory:changed', this.list());
  }

  has(id) { return this.items.has(id); }

  add(id) {
    if (this.items.has(id)) return false;
    this.items.add(id);
    const def = ITEMS[id];
    this.bus.emit('inventory:changed', this.list());
    this.bus.emit('toast', { text: `Picked up: ${def ? def.name : id}` });
    this.bus.emit('item:collected', { id });
    return true;
  }

  remove(id) {
    if (this.items.delete(id)) this.bus.emit('inventory:changed', this.list());
  }

  list() {
    return [...this.items].map((id) => ITEMS[id] || { id, name: id, icon: '?' });
  }
}
