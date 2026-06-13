// Keyboard + mouse + pointer-lock. Exposes a per-frame snapshot of movement
// intent and edge-triggered "pressed" actions consumed by the player/game.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared each frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.enabled = false; // movement only processed while playing

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      // Prevent scrolling / browser shortcuts during play.
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
        e.preventDefault();
      }
      this.keys.add(code);
      this.pressed.add(code);
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });

    // Mouse buttons mapped to synthetic key codes for uniform handling.
    this.canvas.addEventListener('mousedown', (e) => {
      const code = e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : `Mouse${e.button}`;
      this.keys.add(code);
      this.pressed.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      const code = e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : `Mouse${e.button}`;
      this.keys.delete(code);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    this.canvas.requestPointerLock?.();
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  // Movement axes from WASD / arrows. Returns {x, z} in local space
  // (x = strafe right, z = forward).
  moveAxis() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    return { x, z };
  }

  // Consume accumulated mouse delta (call once per frame).
  consumeMouse() {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }
}
