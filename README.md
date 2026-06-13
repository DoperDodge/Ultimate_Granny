# Ultimate Granny

A 3D first-person survival-horror game in the style of the classic "trapped in a
house, escape before she gets you" formula — built from scratch with
[Three.js](https://threejs.org/) and plain ES modules. It's deliberately written
as a **clean, data-driven foundation** so it can grow into something much bigger.

> All geometry, audio, and code here are original and generated procedurally —
> there are no external art or sound assets to manage.

---

## Quick start

```bash
npm install
npm run dev      # open the printed http://localhost:5173 URL
```

Build a static version (deployable to GitHub Pages, itch.io, any static host):

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

Requires Node 18+.

---

## How to play

You wake locked inside Granny's house. You have **5 days**. Each time she catches
you, you black out and lose a day; survive past the last day and it's over. Find
the items hidden in drawers and cabinets, clear the locks on the front door, and
escape.

| Action | Keys |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Look | Mouse |
| Sprint (loud!) | `Shift` |
| Crouch (quiet) | `Ctrl` or `C` |
| Interact | `E` |
| Pause | `Esc` |

**Granny hears and sees.** Sprinting, bumping walls, and yanking drawers make
noise that draws her. She chases on sight, then searches your last known spot.
Crouch-walk to stay quiet and duck into a wardrobe when she's close.

The default escape route: find the **Hammer** (kitchen), **Padlock Key** (child's
room dresser), and **Master Key** (bathroom cabinet), then work the three locks
on the front door.

---

## Architecture

Everything is decoupled through a tiny synchronous `EventBus`, and all gameplay
content lives in `src/config/` as plain data.

```
src/
├── main.js                 # bootstraps Game
├── core/
│   ├── Game.js             # state machine + main loop, wires every system
│   ├── Input.js            # keyboard / mouse / pointer-lock
│   └── EventBus.js         # pub/sub used by all systems
├── config/                 # ← tune & extend the game here (pure data)
│   ├── gameConfig.js       # all tuning knobs + difficulty presets
│   ├── houseLayout.js      # walls, floors, stairs, props, containers
│   ├── waypoints.js        # Granny's navigation graph
│   └── items.js            # items + the exit-door lock sequence
├── world/
│   ├── HouseBuilder.js     # turns houseLayout data into meshes + collision
│   └── Collision.js        # AABB wall blocking + downward-ray ground/stairs
├── player/
│   └── Player.js           # FPS controller: move/sprint/crouch/stamina/noise
├── enemy/
│   └── Granny.js           # mesh + AI state machine (patrol/investigate/chase/search/attack)
├── ai/
│   └── WaypointGraph.js    # A* over the waypoint graph
├── systems/
│   ├── Inventory.js
│   ├── Objectives.js       # escape-progress tracking (derived from items.js)
│   ├── Interactables.js    # drawers, hiding spots, the unlockable exit
│   └── DayCycle.js         # the 5-day counter
├── audio/
│   └── AudioManager.js     # 100% procedural Web Audio (ambient, heartbeat, sfx)
└── ui/
    └── UI.js               # menu, HUD, prompts, day transitions, win/lose
```

### How the pieces talk

- The **Player** emits `noise` events (footsteps, bumps, drawers). **Granny**
  subscribes and investigates.
- **Granny** raises `player:caught`; **Interactables** raise `player:escaped`.
  **Game** listens and drives the day/win/lose flow.
- **Collision** is shared by Player and Granny: walls are analytic AABBs (cheap,
  exact), while floor height (including stairs) comes from a single downward
  raycast against the floor/ramp meshes.

---

## Extending it

This is the fun part — the project is structured so most additions are *data*,
not new engine code.

**Add a room / reshape the house** — edit `src/config/houseLayout.js`. Walls are
axis-aligned segments with optional `doors`. Add a matching node + edges in
`src/config/waypoints.js` so Granny can navigate there (keep each edge inside one
room so the straight path never crosses a wall).

**Add an item or a new lock** — edit `src/config/items.js`. Add the item to
`ITEMS`, drop it in a container via a prop's `container` field in
`houseLayout.js`, and (optionally) add a `LOCKS` entry that requires it. The
objective list and door logic pick it up automatically.

**Add furniture** — add a prop to `houseLayout.js` (`solid: true` gives it
collision). New furniture *shapes* go in `HouseBuilder.buildProp()`.

**Rebalance difficulty** — `src/config/gameConfig.js` holds every speed, sight
range, hearing radius, stamina value, and day count, plus the `DIFFICULTIES`
presets.

### Good "make it more complex" next steps

The seams are already in place for these:

- **Basement / third floor** — add slabs, a second staircase, walls, and
  waypoint nodes. The collision + AI already handle multiple floors.
- **A weapon that stuns Granny** — `Granny.js` already reserves a `STUNNED`
  state; add a pickup + a melee/throw action and transition her into it.
- **Bear traps & environmental hazards** — add a new interactable kind in
  `Interactables.js` that freezes the player and emits noise.
- **Real models & sound** — swap procedural meshes in `HouseBuilder.buildProp()`
  for glTF models and route `AudioManager` through loaded buffers; the event
  names stay the same.
- **Saving progress** — persist `Inventory`, `Objectives`, and `DayCycle` to
  `localStorage`.
- **Mobile / touch controls** — add a touch layer feeding the same `Input` API.
- **Smarter AI** — give Granny door-opening, wardrobe-checking, and a true
  navmesh instead of the waypoint graph.

---

## Tech notes

- **No build-time assets.** Meshes are primitives; audio is synthesised at
  runtime with the Web Audio API (ambient drone, proximity heartbeat, footsteps,
  jumpscare stingers).
- **Collision** is hybrid: analytic box-vs-box for walls (with axis-separated
  sliding) and raycast-against-mesh for ground height, which makes stairs and
  multi-floor "just work."
- **Granny's AI** is a hearing/sight-driven state machine on top of A* waypoint
  pathfinding, with noise hearing radius, a vision cone + line-of-sight check,
  and chase "memory."

## License

MIT — see `package.json`.
