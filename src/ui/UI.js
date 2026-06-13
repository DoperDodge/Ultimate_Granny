import { ITEMS } from '../config/items.js';

// Owns every DOM overlay. Subscribes to the EventBus for HUD updates and exposes
// imperative methods (showMenu, showFade, etc.) the Game state machine calls.
export class UI {
  constructor(root, bus) {
    this.root = root;
    this.bus = bus;
    this._toastTimer = null;
    this._build();
    this._wireEvents();
  }

  _build() {
    this.root.innerHTML = `
      <div id="vignette"></div>
      <div id="hud" style="display:none">
        <div id="crosshair"></div>
        <div id="day-counter"><span class="big">DAY 1</span><div class="sub">of 5 — survive or escape</div></div>
        <div id="objectives"></div>
        <div id="inventory"></div>
        <div id="stamina-wrap"><div id="stamina-bar"></div></div>
        <div id="prompt"></div>
        <div id="toast"></div>
        <div id="hint" class="hidden"></div>
      </div>
      <div id="fade"></div>
      <div id="overlay-menu" class="overlay">
        <h1>ULTIMATE GRANNY</h1>
        <p>You wake locked inside her house. You have <b>5 days</b> before she does what she does to those who don't get out. Find what you need, unlock the front door, and escape — without letting Granny hear or see you.</p>
        <div id="difficulty-row" style="display:flex; gap:10px;"></div>
        <button class="btn" id="start-btn">Start</button>
        <div class="controls-grid">
          <b>Move</b><span>W A S D</span>
          <b>Look</b><span>Mouse</span>
          <b>Sprint</b><span>Shift</span>
          <b>Crouch</b><span>Ctrl / C</span>
          <b>Interact</b><span>E</span>
          <b>Pause</b><span>Esc</span>
        </div>
        <p style="font-size:0.75rem; opacity:0.6;">Tip: sprinting is loud. Crouch-walk to stay quiet. Hide in wardrobes when she's close.</p>
      </div>

      <div id="overlay-pause" class="overlay hidden">
        <h2>PAUSED</h2>
        <button class="btn" id="resume-btn">Resume</button>
        <button class="btn" id="quit-btn">Quit to Menu</button>
      </div>

      <div id="overlay-end" class="overlay hidden">
        <h1 id="end-title">CAUGHT</h1>
        <p id="end-text"></p>
        <button class="btn" id="again-btn">Try Again</button>
      </div>
    `;

    this.hud = this.root.querySelector('#hud');
    this.dayCounter = this.root.querySelector('#day-counter');
    this.objectivesEl = this.root.querySelector('#objectives');
    this.inventoryEl = this.root.querySelector('#inventory');
    this.staminaWrap = this.root.querySelector('#stamina-wrap');
    this.staminaBar = this.root.querySelector('#stamina-bar');
    this.promptEl = this.root.querySelector('#prompt');
    this.toastEl = this.root.querySelector('#toast');
    this.hintEl = this.root.querySelector('#hint');
    this.fade = this.root.querySelector('#fade');
    this.vignette = this.root.querySelector('#vignette');

    this.menu = this.root.querySelector('#overlay-menu');
    this.pause = this.root.querySelector('#overlay-pause');
    this.end = this.root.querySelector('#overlay-end');
  }

  _wireEvents() {
    this.bus.on('toast', ({ text }) => this.toast(text));
    this.bus.on('inventory:changed', (list) => this.renderInventory(list));
    this.bus.on('objectives:changed', (list) => this.renderObjectives(list));
    this.bus.on('day:changed', ({ day, maxDays }) => this.renderDay(day, maxDays));
  }

  // ---- Menu / difficulty ----
  buildDifficulty(difficulties, current, onPick) {
    const row = this.root.querySelector('#difficulty-row');
    row.innerHTML = '';
    for (const [key, def] of Object.entries(difficulties)) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = def.label;
      b.style.opacity = key === current ? '1' : '0.55';
      b.style.fontSize = '0.85rem';
      b.style.padding = '0.4rem 1.1rem';
      b.onclick = () => { onPick(key); [...row.children].forEach((c) => (c.style.opacity = '0.55')); b.style.opacity = '1'; };
      row.appendChild(b);
    }
  }

  onStart(fn) { this.root.querySelector('#start-btn').onclick = fn; }
  onResume(fn) { this.root.querySelector('#resume-btn').onclick = fn; }
  onQuit(fn) { this.root.querySelector('#quit-btn').onclick = fn; }
  onAgain(fn) { this.root.querySelector('#again-btn').onclick = fn; }

  showMenu(show) { this.menu.classList.toggle('hidden', !show); }
  showPause(show) { this.pause.classList.toggle('hidden', !show); }
  showHud(show) { this.hud.style.display = show ? 'block' : 'none'; }

  showEnd(title, text, color = '#b33', buttonLabel = 'Try Again') {
    this.root.querySelector('#end-title').textContent = title;
    this.root.querySelector('#end-title').style.color = color;
    this.root.querySelector('#end-text').textContent = text;
    this.root.querySelector('#again-btn').textContent = buttonLabel;
    this.end.classList.remove('hidden');
  }
  hideEnd() { this.end.classList.add('hidden'); }

  // ---- HUD renders ----
  renderDay(day, maxDays) {
    this.dayCounter.querySelector('.big').textContent = `DAY ${day}`;
    this.dayCounter.querySelector('.sub').textContent = `of ${maxDays} — survive or escape`;
  }

  renderObjectives(list) {
    this.objectivesEl.innerHTML = list.map((o) => {
      if (o.title) return `<div class="title">${o.text}</div>`;
      return `<div class="${o.done ? 'done' : ''}">${o.done ? '✓' : '•'} ${o.text}</div>`;
    }).join('');
  }

  renderInventory(list) {
    const slots = 4;
    let html = '';
    for (let i = 0; i < slots; i++) {
      const item = list[i];
      html += `<div class="inv-slot">${item ? item.icon : ''}${item ? `<span class="label">${item.name}</span>` : ''}</div>`;
    }
    this.inventoryEl.innerHTML = html;
  }

  setStamina(frac) {
    this.staminaBar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.staminaWrap.classList.toggle('low', frac < 0.25);
  }

  setPrompt(text) {
    if (text) {
      this.promptEl.innerHTML = `<b>[E]</b> ${text}`;
      this.promptEl.classList.add('show');
    } else {
      this.promptEl.classList.remove('show');
    }
  }

  setDanger(level) {
    this.vignette.style.setProperty('--danger', level.toFixed(3));
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  hint(text) {
    if (text) { this.hintEl.textContent = text; this.hintEl.classList.remove('hidden'); }
    else this.hintEl.classList.add('hidden');
  }

  // ---- Fades (returns a promise that resolves after the transition) ----
  fadeTo(opacity, { red = false, ms = 500 } = {}) {
    this.fade.style.transitionDuration = `${ms}ms`;
    this.fade.classList.toggle('red', red);
    // Force reflow so consecutive fades animate.
    void this.fade.offsetWidth;
    this.fade.classList.toggle('show', opacity >= 1);
    return new Promise((res) => setTimeout(res, ms));
  }

  flash(red = true, ms = 120) {
    this.fade.style.transitionDuration = `${ms}ms`;
    this.fade.classList.toggle('red', red);
    this.fade.classList.add('show');
    setTimeout(() => this.fade.classList.remove('show'), ms);
  }
}
