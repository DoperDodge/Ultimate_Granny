import * as THREE from 'three';
import { HOUSE } from '../config/houseLayout.js';
import { CONFIG } from '../config/gameConfig.js';

// Builds the entire static house from HOUSE data into a THREE.Group, while
// populating a Collision instance and collecting interaction anchors
// (containers, hide spots, the exit) for the gameplay systems to wire up.
export class HouseBuilder {
  constructor(collision) {
    this.collision = collision;
    this.group = new THREE.Group();
    this.materials = this._makeMaterials();
    this.lights = [];

    // Anchors handed back to Interactables: world points + metadata.
    this.containers = []; // { id, name, gives, pos, mesh }
    this.hideSpots = [];  // { id, name, pos, enterPos, mesh }
    this.exit = null;     // { pos: THREE.Vector3, facing }
    this.props = [];
  }

  build() {
    this._buildSlabs();
    this._buildStairs();
    this._buildWalls();
    this._buildProps();
    this._buildLights();
    this._buildExit();

    // Collision uses downward raycasts against these meshes, and that runs in
    // update() BEFORE the first render() (which is what normally refreshes world
    // matrices). Force the world matrices now so ground/stair detection is
    // correct on the very first frame and in headless tests.
    this.group.updateMatrixWorld(true);
    return this.group;
  }

  _makeMaterials() {
    return {
      wall: new THREE.MeshStandardMaterial({ color: 0x6b6359, roughness: 0.95 }),
      wallOuter: new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 1.0 }),
      floorWood: new THREE.MeshStandardMaterial({ color: 0x5a4334, roughness: 0.85 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1.0, side: THREE.DoubleSide }),
      lintel: new THREE.MeshStandardMaterial({ color: 0x554e45, roughness: 1.0 }),
      railing: new THREE.MeshStandardMaterial({ color: 0x3a342d, roughness: 1.0 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x6e4a2f, roughness: 0.8 }),
      woodDark: new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.85 }),
      fabric: new THREE.MeshStandardMaterial({ color: 0x55303a, roughness: 1.0 }),
      fabricBlue: new THREE.MeshStandardMaterial({ color: 0x344055, roughness: 1.0 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.6 }),
      white: new THREE.MeshStandardMaterial({ color: 0xcfd2d0, roughness: 0.5 }),
      rug: new THREE.MeshStandardMaterial({ color: 0x6a2f2f, roughness: 1.0 }),
      door: new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.8 }),
      exit: new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.7 }),
      plank: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 }),
    };
  }

  _addBox(w, h, d, x, y, z, material, { collide = false, ground = false, yBase = null } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.group.add(mesh);

    if (collide) {
      const yMin = yBase !== null ? yBase : y - h / 2;
      this.collision.addWallBox({
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2,
        yMin, yMax: yMin + h,
      });
    }
    if (ground) this.collision.addGround(mesh);
    return mesh;
  }

  // ---------- Floors / ceilings ----------
  _buildSlabs() {
    for (const s of HOUSE.slabs) {
      const w = s.x1 - s.x0;
      const d = s.z1 - s.z0;
      const cx = (s.x0 + s.x1) / 2;
      const cz = (s.z0 + s.z1) / 2;
      const mat = this.materials[s.material] || this.materials.floorWood;
      const isCeiling = s.material === 'ceiling';
      // Floor slabs: top surface at s.y. Ceilings: bottom surface at s.y.
      const thickness = 0.1;
      const cy = isCeiling ? s.y + thickness / 2 : s.y - thickness / 2;
      this._addBox(w, thickness, d, cx, cy, cz, mat, { ground: !isCeiling });
    }
  }

  // ---------- Stairs (inclined ramp) ----------
  _buildStairs() {
    for (const st of HOUSE.stairs) {
      const width = st.x1 - st.x0;
      const dz = st.z1 - st.z0;
      const dy = st.yTop - st.yBottom;
      const slopeLen = Math.hypot(dz, dy);
      const cx = (st.x0 + st.x1) / 2;
      const cz = (st.z0 + st.z1) / 2;
      const cy = (st.yBottom + st.yTop) / 2;

      const geo = new THREE.BoxGeometry(width, 0.2, slopeLen);
      const mesh = new THREE.Mesh(geo, this.materials.floorWood);
      mesh.position.set(cx, cy, cz);
      mesh.rotation.x = -Math.atan2(dy, dz); // +Z end tilts up
      this.group.add(mesh);
      this.collision.addGround(mesh);

      // Visual stepped face under the ramp (cosmetic only).
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        const z = st.z0 + dz * t;
        const y = st.yBottom + dy * t - 0.5;
        this._addBox(width * 0.96, 0.5, dz / steps, cx, y, z, this.materials.woodDark);
      }
    }
  }

  // ---------- Walls (with door openings + lintels) ----------
  _buildWalls() {
    const T = CONFIG.wallThickness;
    for (const wall of HOUSE.walls) {
      const baseY = (wall.floor || 0) * CONFIG.floorHeight;
      const height = wall.height || CONFIG.wallHeight;
      const horizontal = wall.z1 === wall.z2; // runs along X
      const mat = wall.railing ? this.materials.railing
        : (wall.floor === 0 && this._isOuter(wall)) ? this.materials.wallOuter
        : this.materials.wall;

      // Solid sub-segments around the door gaps.
      const axisStart = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.z1, wall.z2);
      const axisEnd = horizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.z1, wall.z2);
      const fixed = horizontal ? wall.z1 : wall.x1;
      const doors = (wall.doors || []).slice().sort((a, b) => a.at - b.at);

      let cursor = axisStart;
      const doorH = Math.min(2.1, height);

      const emitSolid = (a, b) => {
        if (b - a < 0.01) return;
        const len = b - a;
        const center = (a + b) / 2;
        if (horizontal) {
          this._addBox(len, height, T, center, baseY + height / 2, fixed, mat, { collide: true, yBase: baseY });
        } else {
          this._addBox(T, height, len, fixed, baseY + height / 2, center, mat, { collide: true, yBase: baseY });
        }
      };

      for (const door of doors) {
        const a = door.at - door.width / 2;
        const b = door.at + door.width / 2;
        emitSolid(cursor, a);
        cursor = b;

        // Lintel above the door (visual; high enough not to block the player).
        if (height > doorH + 0.02) {
          const len = door.width;
          const center = door.at;
          const ly = baseY + doorH + (height - doorH) / 2;
          if (horizontal) {
            this._addBox(len, height - doorH, T, center, ly, fixed, this.materials.lintel);
          } else {
            this._addBox(T, height - doorH, len, fixed, ly, center, this.materials.lintel);
          }
        }

        // The exit door leaf (the thing you unlock) gets built later from anchor.
        if (door.exit) {
          this._exitDoorAxis = { fixed, at: door.at, width: door.width, baseY, horizontal };
        }
      }
      emitSolid(cursor, axisEnd);
    }
  }

  _isOuter(wall) {
    const b = HOUSE.bounds;
    const onX = wall.x1 === wall.x2 && (wall.x1 === b.x0 || wall.x1 === b.x1);
    const onZ = wall.z1 === wall.z2 && (wall.z1 === b.z0 || wall.z1 === b.z1);
    return onX || onZ;
  }

  // ---------- Lighting ----------
  _buildLights() {
    // Dim, warm, horror ambiance. Each room gets a weak point light.
    const ambient = new THREE.AmbientLight(0x404654, 0.35);
    this.group.add(ambient);

    for (const room of HOUSE.rooms) {
      const y = room.floor * CONFIG.floorHeight + 2.4;
      const light = new THREE.PointLight(room.light || 0xffe0b0, 7.5, 9, 1.8);
      light.position.set(room.center[0], y, room.center[1]);
      this.group.add(light);
      this.lights.push(light);

      // Visible bulb so flickering reads on screen.
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshBasicMaterial({ color: room.light || 0xffe0b0 })
      );
      bulb.position.copy(light.position);
      this.group.add(bulb);
    }
  }

  // ---------- Props / furniture ----------
  _buildProps() {
    for (const p of HOUSE.props) {
      const g = this.buildProp(p);
      if (!g) continue;
      g.position.set(p.pos[0], p.pos[1], p.pos[2]);
      g.rotation.y = p.rot || 0;
      this.group.add(g);
      this.props.push(g);

      // Collision: wrap the prop in an AABB sized to its footprint.
      if (p.solid && g.userData.footprint) {
        const fp = g.userData.footprint;
        // Rotated footprint: swap dimensions for 90° rotations.
        const rotated = Math.abs(Math.round((p.rot || 0) / (Math.PI / 2)) % 2) === 1;
        const fw = rotated ? fp.d : fp.w;
        const fd = rotated ? fp.w : fp.d;
        this.collision.addWallBox({
          minX: p.pos[0] - fw / 2, maxX: p.pos[0] + fw / 2,
          minZ: p.pos[2] - fd / 2, maxZ: p.pos[2] + fd / 2,
          yMin: p.pos[1], yMax: p.pos[1] + fp.h,
        });
      }

      // Register interaction anchors.
      const anchorPos = new THREE.Vector3(p.pos[0], p.pos[1] + 1.0, p.pos[2]);
      if (p.container) {
        const def = HOUSE.containers[p.container] || { name: 'drawer' };
        this.containers.push({ id: p.container, name: def.name, gives: def.gives, pos: anchorPos, mesh: g });
      }
      if (p.hideSpot) {
        const def = HOUSE.hideSpots[p.hideSpot] || { name: 'wardrobe' };
        // Hide position: slightly inside the wardrobe.
        const enterPos = new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]);
        this.hideSpots.push({ id: p.hideSpot, name: def.name, pos: anchorPos, enterPos, mesh: g });
      }
    }
  }

  // Returns a THREE.Group for a prop type, tagging userData.footprint = {w,h,d}.
  buildProp(p) {
    const M = this.materials;
    const g = new THREE.Group();
    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    switch (p.type) {
      case 'bed': {
        const w = p.small ? 1.0 : 1.5, len = 2.0;
        box(w, 0.3, len, 0, 0.3, 0, M.wood);          // frame
        box(w - 0.1, 0.18, len - 0.1, 0, 0.5, 0, M.white); // mattress
        box(w - 0.1, 0.16, 0.5, 0, 0.62, -len / 2 + 0.3, M.fabric); // pillow
        box(w, 0.6, 0.1, 0, 0.5, len / 2, M.woodDark); // footboard
        g.userData.footprint = { w, h: 0.7, d: len };
        return g;
      }
      case 'nightstand':
        box(0.5, 0.5, 0.5, 0, 0.25, 0, M.woodDark);
        g.userData.footprint = { w: 0.5, h: 0.5, d: 0.5 };
        return g;
      case 'wardrobe': {
        box(1.2, 2.0, 0.6, 0, 1.0, 0, M.woodDark);
        box(0.56, 1.8, 0.04, -0.3, 1.0, 0.31, M.wood);
        box(0.56, 1.8, 0.04, 0.3, 1.0, 0.31, M.wood);
        box(0.04, 0.2, 0.04, 0.0, 1.0, 0.34, M.metal); // handles
        g.userData.footprint = { w: 1.2, h: 2.0, d: 0.6 };
        return g;
      }
      case 'dresser':
        box(1.2, 0.9, 0.5, 0, 0.45, 0, M.wood);
        box(1.0, 0.22, 0.04, 0, 0.55, 0.27, M.woodDark);
        box(1.0, 0.22, 0.04, 0, 0.28, 0.27, M.woodDark);
        g.userData.footprint = { w: 1.2, h: 0.9, d: 0.5 };
        return g;
      case 'counter':
        box(3.0, 0.9, 0.6, 0, 0.45, 0, M.woodDark);
        box(3.1, 0.06, 0.66, 0, 0.92, 0, M.white); // countertop
        g.userData.footprint = { w: 3.0, h: 0.95, d: 0.6 };
        return g;
      case 'table': {
        const h = p.low ? 0.4 : 0.75;
        box(1.4, 0.08, 0.9, 0, h, 0, M.wood);
        for (const sx of [-0.6, 0.6]) for (const sz of [-0.35, 0.35]) box(0.08, h, 0.08, sx, h / 2, sz, M.woodDark);
        g.userData.footprint = { w: 1.4, h: h + 0.08, d: 0.9 };
        return g;
      }
      case 'fridge':
        box(0.8, 1.8, 0.7, 0, 0.9, 0, M.white);
        box(0.04, 0.4, 0.04, -0.32, 1.2, 0.36, M.metal);
        g.userData.footprint = { w: 0.8, h: 1.8, d: 0.7 };
        return g;
      case 'sofa':
        box(2.2, 0.5, 0.9, 0, 0.25, 0, M.fabricBlue);
        box(2.2, 0.5, 0.2, 0, 0.6, -0.35, M.fabricBlue); // back
        box(0.2, 0.5, 0.9, -1.0, 0.5, 0, M.fabricBlue);  // arm
        box(0.2, 0.5, 0.9, 1.0, 0.5, 0, M.fabricBlue);   // arm
        g.userData.footprint = { w: 2.2, h: 0.8, d: 0.9 };
        return g;
      case 'shelf':
        box(1.4, 1.8, 0.35, 0, 0.9, 0, M.woodDark);
        for (const sy of [0.4, 0.9, 1.4]) box(1.3, 0.04, 0.3, 0, sy, 0, M.wood);
        g.userData.footprint = { w: 1.4, h: 1.8, d: 0.35 };
        return g;
      case 'cabinet':
        box(0.9, 0.9, 0.5, 0, 0.45, 0, M.white);
        box(0.4, 0.7, 0.04, -0.22, 0.45, 0.27, M.woodDark);
        box(0.4, 0.7, 0.04, 0.22, 0.45, 0.27, M.woodDark);
        g.userData.footprint = { w: 0.9, h: 0.9, d: 0.5 };
        return g;
      case 'bath':
        box(1.8, 0.6, 0.8, 0, 0.3, 0, M.white);
        g.userData.footprint = { w: 1.8, h: 0.6, d: 0.8 };
        return g;
      case 'rug': {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), M.rug);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.011;
        g.add(m);
        return g; // no footprint -> no collision
      }
      default:
        return null;
    }
  }

  // ---------- Exit door leaf (the unlockable front door) ----------
  _buildExit() {
    const ex = HOUSE.exit;
    const pos = new THREE.Vector3(ex.pos[0], ex.pos[1], ex.pos[2]);
    this.exit = { pos, facing: ex.facing };

    // Door leaf + frame at the south opening.
    const frame = new THREE.Group();
    frame.position.copy(pos);

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 0.12), this.materials.exit);
    leaf.position.set(0, 1.15, 0);
    frame.add(leaf);

    // Boards / padlock visuals that get removed as locks clear.
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 0.16), this.materials.plank);
    plank.position.set(0, 1.5, 0.12);
    plank.rotation.z = 0.06;
    plank.name = 'lock_plank';
    frame.add(plank);

    const padlock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.1), this.materials.metal);
    padlock.position.set(0.5, 1.1, 0.14);
    padlock.name = 'lock_padlock';
    frame.add(padlock);

    const deadbolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), this.materials.metal);
    deadbolt.rotation.z = Math.PI / 2;
    deadbolt.position.set(0.55, 1.4, 0.14);
    deadbolt.name = 'lock_deadbolt';
    frame.add(deadbolt);

    this.group.add(frame);
    this.exit.mesh = frame;
    this.exit.leaf = leaf;

    // The closed exit door is solid until opened: add a collision box we can
    // later remove. Tag it so Interactables can drop it on win.
    this._exitBox = {
      minX: pos.x - 0.8, maxX: pos.x + 0.8,
      minZ: pos.z - 0.15, maxZ: pos.z + 0.15,
      yMin: 0, yMax: 2.3,
    };
    this.collision.addWallBox(this._exitBox);
    this.exit.collisionBox = this._exitBox;
  }
}
