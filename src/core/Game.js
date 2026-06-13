import * as THREE from 'three';
import { CONFIG, DIFFICULTIES, applyDifficulty } from '../config/gameConfig.js';
import { HOUSE } from '../config/houseLayout.js';
import { EventBus } from './EventBus.js';
import { Input } from './Input.js';
import { Collision } from '../world/Collision.js';
import { HouseBuilder } from '../world/HouseBuilder.js';
import { WaypointGraph } from '../ai/WaypointGraph.js';
import { Player } from '../player/Player.js';
import { Granny, GRANNY_STATE } from '../enemy/Granny.js';
import { Inventory } from '../systems/Inventory.js';
import { Objectives } from '../systems/Objectives.js';
import { DayCycle } from '../systems/DayCycle.js';
import { Interactables } from '../systems/Interactables.js';
import { AudioManager } from '../audio/AudioManager.js';
import { UI } from '../ui/UI.js';

const GAME_STATE = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', TRANSITION: 'transition', ENDED: 'ended' };

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.state = GAME_STATE.MENU;
    this.difficultyKey = 'normal';
    this._transitioning = false;

    // --- Renderer / scene / camera ---
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.075);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 200);

    // --- Core systems ---
    this.bus = new EventBus();
    this.input = new Input(canvas);
    this.audio = new AudioManager(this.bus);
    this.ui = new UI(uiRoot, this.bus);

    this.collision = new Collision();
    this.houseBuilder = new HouseBuilder(this.collision);
    this.scene.add(this.houseBuilder.build());

    this.graph = new WaypointGraph();
    this.player = new Player(this.camera, this.collision, this.input, this.bus);
    this.granny = new Granny(this.scene, this.collision, this.graph, this.bus, () => this.player);

    this.inventory = new Inventory(this.bus);
    this.objectives = new Objectives(this.bus);
    this.dayCycle = new DayCycle(this.bus, CONFIG.maxDays);
    this.interactables = new Interactables(this.houseBuilder, this.collision, this.inventory, this.objectives, this.bus);

    this.clock = new THREE.Clock();
    this._danger = 0;

    this._wireUI();
    this._wireEvents();

    window.addEventListener('resize', () => this._onResize());
    this.input.onLockChange = (locked) => this._onLockChange(locked);

    // Initial render so the menu sits over a dim scene.
    this.granny.deactivate();
    this._loop();
  }

  _wireUI() {
    this.ui.buildDifficulty(DIFFICULTIES, this.difficultyKey, (key) => { this.difficultyKey = key; });
    this.ui.onStart(() => this.startGame());
    this.ui.onResume(() => this.resume());
    this.ui.onQuit(() => this.toMenu());
    this.ui.onAgain(() => this.toMenu());
    this.ui.showMenu(true);
    this.ui.showHud(false);
  }

  _wireEvents() {
    this.bus.on('player:caught', () => this.onCaught());
    this.bus.on('player:escaped', () => this.onEscaped());
    this.bus.on('item:collected', () => this.bus.emit('sfx', { name: 'pickup' }));
  }

  // ---------------- Flow ----------------
  startGame() {
    applyDifficulty(this.difficultyKey);
    this.dayCycle.maxDays = CONFIG.maxDays;
    this.audio.init();

    // Fresh run state.
    this.inventory.reset();
    this.objectives.reset();
    this.interactables.reset();
    this.dayCycle.reset();

    this.ui.showMenu(false);
    this.ui.hideEnd();
    this.ui.showHud(true);
    this.ui.fadeTo(0, { ms: 1 });

    this._beginDay(true);
    this.state = GAME_STATE.PLAYING;
    this.input.enabled = true;
    this.input.requestLock();
    this.ui.hint('Click to look around');
  }

  _beginDay(first = false) {
    const startNode = this.graph.node(CONFIG.startNodeId) || this.graph.node('master');
    // Spawn looking into the room.
    this.player.spawn(startNode.pos.x, startNode.pos.y, startNode.pos.z, Math.PI);
    this.player.frozen = false;
    this.granny.spawn(CONFIG.granny.spawnNodeId);
    this._danger = 0;
    this.audio.setDanger(0);
    this.ui.setDanger(0);
  }

  toMenu() {
    this.state = GAME_STATE.MENU;
    this.input.enabled = false;
    this.input.exitLock();
    this.granny.deactivate();
    this.ui.hideEnd();
    this.ui.showPause(false);
    this.ui.showHud(false);
    this.ui.showMenu(true);
    this.ui.setDanger(0);
    this.audio.setDanger(0);
    this.ui.fadeTo(0, { ms: 300 });
  }

  pause() {
    if (this.state !== GAME_STATE.PLAYING) return;
    this.state = GAME_STATE.PAUSED;
    this.player.frozen = true;
    this.ui.showPause(true);
    this.ui.hint(null);
  }

  resume() {
    if (this.state !== GAME_STATE.PAUSED) return;
    this.state = GAME_STATE.PLAYING;
    this.player.frozen = false;
    this.ui.showPause(false);
    this.input.requestLock();
  }

  async onCaught() {
    if (this.state !== GAME_STATE.PLAYING || this._transitioning) return;
    this._transitioning = true;
    this.state = GAME_STATE.TRANSITION;
    this.player.frozen = true;
    this.input.exitLock();

    this.audio.sting('jumpscare');
    this.ui.flash(true, 90);
    this.ui.setDanger(1);

    await this.ui.fadeTo(1, { red: true, ms: 420 });
    await this._wait(500);

    const stillAlive = this.dayCycle.advance();
    this.granny.deactivate();

    if (!stillAlive) {
      this._transitioning = false;
      this.onLose(`Granny got you one too many times. You never left the house.`);
      return;
    }

    // New day: reposition, keep progress.
    this._beginDay();
    this.audio.sting('newday');
    this.ui.toast(`You black out... and wake the next morning. Day ${this.dayCycle.day}.`);
    this.ui.setDanger(0);
    await this.ui.fadeTo(0, { ms: 700 });

    this.state = GAME_STATE.PLAYING;
    this.player.frozen = false;
    this._transitioning = false;
    this.input.requestLock();
  }

  async onEscaped() {
    if (this.state === GAME_STATE.ENDED) return;
    this.state = GAME_STATE.ENDED;
    this.player.frozen = true;
    this.audio.sting('win');
    this.audio.setDanger(0);
    this.ui.setDanger(0);
    await this._wait(900);
    this.input.exitLock();
    this.ui.showEnd('YOU ESCAPED', `You slipped out the front door on day ${this.dayCycle.day}. The night air never felt so good.`, '#6c9c5a', 'Play Again');
  }

  onLose(reason) {
    this.state = GAME_STATE.ENDED;
    this.player.frozen = true;
    this.input.exitLock();
    this.audio.sting('lose');
    this.audio.setDanger(0);
    this.ui.setDanger(0);
    this.ui.fadeTo(0, { ms: 400 });
    this.ui.showEnd('GAME OVER', reason, '#b33', 'Try Again');
  }

  // ---------------- Loop ----------------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === GAME_STATE.PLAYING) {
      this._updatePlaying(dt);
    }

    this.audio.update(dt);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  _updatePlaying(dt) {
    // Pause hotkey (in case pointer lock is retained).
    if (this.input.wasPressed('Escape')) { this.pause(); return; }

    this.player.update(dt);
    this.granny.update(dt);

    // Interactions.
    const q = this.interactables.query(this.player);
    this.ui.setPrompt(q ? q.prompt : null);
    if (this.input.wasPressed('KeyE')) {
      this.interactables.interact(this.player);
    }

    // HUD: stamina.
    this.ui.setStamina(this.player.stamina / CONFIG.player.maxStamina);

    // Danger / heartbeat from Granny proximity & state.
    this._updateDanger(dt);

    // Hide the click hint once the player starts moving.
    if (this.input.locked) this.ui.hint(null);
  }

  _updateDanger(dt) {
    let target = 0;
    if (this.granny.active) {
      const d = this.granny.distanceToPlayer();
      const range = 12;
      let prox = Math.max(0, 1 - d / range);
      // Reduce cross-floor tension.
      const dy = Math.abs(this.granny.pos.y - this.player.pos.y);
      if (dy > 1.6) prox *= 0.5;
      target = prox;
      if (this.granny.state === GRANNY_STATE.CHASE) target = Math.max(target, 0.8);
      else if (this.granny.state === GRANNY_STATE.SEARCH || this.granny.state === GRANNY_STATE.INVESTIGATE) target = Math.max(target, 0.35);
    }
    // Smooth toward target.
    this._danger += (target - this._danger) * Math.min(1, dt * 4);
    this.audio.setDanger(this._danger);
    this.ui.setDanger(this._danger);
  }

  _onLockChange(locked) {
    // Losing the lock mid-play (e.g. pressing Esc) pauses the game.
    if (!locked && this.state === GAME_STATE.PLAYING && !this._transitioning) {
      this.pause();
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
}
