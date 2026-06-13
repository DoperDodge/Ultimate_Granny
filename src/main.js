import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

const game = new Game(canvas, uiRoot);

// Re-acquire pointer lock when the player clicks the scene after it was lost
// (alt-tab, accidental Esc, etc.) without forcing a full pause/resume click.
canvas.addEventListener('click', () => {
  if (game.state === 'playing' && !game.input.locked) {
    game.input.requestLock();
  }
});

// Expose for debugging / future tooling in the browser console.
window.__granny = game;
