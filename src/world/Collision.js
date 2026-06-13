import * as THREE from 'three';

// Collision world: axis-aligned wall boxes for horizontal blocking, and a set
// of "ground" meshes (floor slabs + stair ramp) probed with a downward ray to
// find standing height. Player & Granny share this.
export class Collision {
  constructor() {
    this.wallBoxes = []; // { minX, maxX, minZ, maxZ, yMin, yMax }
    this.groundMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._down = new THREE.Vector3(0, -1, 0);
    this._los = new THREE.Raycaster();
  }

  addWallBox(box) { this.wallBoxes.push(box); return box; }
  addGround(mesh) { this.groundMeshes.push(mesh); }

  removeWallBox(box) {
    const i = this.wallBoxes.indexOf(box);
    if (i >= 0) this.wallBoxes.splice(i, 1);
  }

  _overlapsY(w, feetY, headY) {
    return headY > w.yMin + 0.03 && feetY < w.yMax - 0.03;
  }

  // Resolve a horizontal move for a square footprint of half-size `r`. Axis-
  // separated (X then Z) so the body slides along walls instead of sticking.
  // Returns the corrected { x, z } plus whether a wall was hit (for bump SFX).
  resolveMove(x, z, dx, dz, r, feetY, headY) {
    let nx = x + dx;
    let bumped = false;

    for (const w of this.wallBoxes) {
      if (!this._overlapsY(w, feetY, headY)) continue;
      if (nx + r > w.minX && nx - r < w.maxX && z + r > w.minZ && z - r < w.maxZ) {
        if (dx > 0) nx = Math.min(nx, w.minX - r);
        else if (dx < 0) nx = Math.max(nx, w.maxX + r);
        bumped = true;
      }
    }

    let nz = z + dz;
    for (const w of this.wallBoxes) {
      if (!this._overlapsY(w, feetY, headY)) continue;
      if (nx + r > w.minX && nx - r < w.maxX && nz + r > w.minZ && nz - r < w.maxZ) {
        if (dz > 0) nz = Math.min(nz, w.minZ - r);
        else if (dz < 0) nz = Math.max(nz, w.maxZ + r);
        bumped = true;
      }
    }

    return { x: nx, z: nz, bumped };
  }

  // Highest ground surface at/below `fromY` under (x,z). Returns y or null.
  groundHeightAt(x, z, fromY) {
    this._origin.set(x, fromY, z);
    this.raycaster.set(this._origin, this._down);
    this.raycaster.far = fromY + 60;
    const hits = this.raycaster.intersectObjects(this.groundMeshes, false);
    return hits.length ? hits[0].point.y : null;
  }

  // Line-of-sight test between two eye points. Blocked by any wall box. Uses an
  // analytic segment-vs-AABB sweep rather than meshes (cheaper, and walls are
  // boxes anyway). Returns true if clear.
  hasLineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;

    for (const w of this.wallBoxes) {
      // Expand box slightly so grazing a corner still counts as blocked.
      if (this._segmentHitsBox(ax, ay, az, dx, dy, dz, w)) return false;
    }
    return true;
  }

  // Slab method: does segment P + t*D (t in [0,1]) intersect AABB w?
  _segmentHitsBox(px, py, pz, dx, dy, dz, w) {
    let tmin = 0, tmax = 1;
    const slab = (p, d, lo, hi) => {
      if (Math.abs(d) < 1e-8) return p >= lo && p <= hi;
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      return tmin <= tmax;
    };
    if (!slab(px, dx, w.minX, w.maxX)) return false;
    if (!slab(py, dy, w.yMin, w.yMax)) return false;
    if (!slab(pz, dz, w.minZ, w.maxZ)) return false;
    return tmin <= tmax;
  }
}
