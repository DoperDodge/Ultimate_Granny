import { CONFIG } from '../config/gameConfig.js';

// Tracks the day counter. Getting caught advances the day; surviving past
// maxDays is a loss; escaping is a win (handled by Game). Emits 'day:changed'.
export class DayCycle {
  constructor(bus, maxDays = CONFIG.maxDays) {
    this.bus = bus;
    this.maxDays = maxDays;
    this.day = 1;
  }

  reset() {
    this.day = 1;
    this.bus.emit('day:changed', { day: this.day, maxDays: this.maxDays });
  }

  // Returns true if the player still has days left after advancing.
  advance() {
    this.day += 1;
    this.bus.emit('day:changed', { day: this.day, maxDays: this.maxDays });
    return this.day <= this.maxDays;
  }

  get isFinalDay() { return this.day >= this.maxDays; }
}
