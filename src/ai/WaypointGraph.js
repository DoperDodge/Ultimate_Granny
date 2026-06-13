import * as THREE from 'three';
import { NODES, EDGES, PATROL_NODES } from '../config/waypoints.js';

// A* over the hand-authored waypoint graph. Granny pathfinds node-to-node;
// each edge's straight segment is guaranteed (by layout design) to be wall-free.
export class WaypointGraph {
  constructor() {
    this.nodes = new Map(); // id -> { id, pos:Vector3, edges:Set<id> }
    for (const [id, def] of Object.entries(NODES)) {
      this.nodes.set(id, {
        id,
        pos: new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]),
        edges: new Set(),
      });
    }
    for (const [a, b] of EDGES) {
      this.nodes.get(a)?.edges.add(b);
      this.nodes.get(b)?.edges.add(a);
    }
    this.patrolIds = PATROL_NODES.filter((id) => this.nodes.has(id));
  }

  node(id) { return this.nodes.get(id); }

  randomPatrolId(excludeId = null) {
    const pool = this.patrolIds.filter((id) => id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)] || this.patrolIds[0];
  }

  // Nearest node to an arbitrary world point, weighting Y heavily so we don't
  // snap to a node on the wrong floor.
  nearestId(point) {
    let best = null, bestD = Infinity;
    for (const n of this.nodes.values()) {
      const dx = n.pos.x - point.x;
      const dy = (n.pos.y - point.y) * 4; // floor separation penalty
      const dz = n.pos.z - point.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  }

  // A* returning an array of node ids from start to goal (inclusive), or null.
  findPath(startId, goalId) {
    if (startId === goalId) return [startId];
    const open = new Set([startId]);
    const cameFrom = new Map();
    const g = new Map([[startId, 0]]);
    const h = (id) => this.nodes.get(id).pos.distanceTo(this.nodes.get(goalId).pos);
    const f = new Map([[startId, h(startId)]]);

    while (open.size) {
      // node in open with lowest f
      let current = null, bestF = Infinity;
      for (const id of open) {
        const fv = f.get(id) ?? Infinity;
        if (fv < bestF) { bestF = fv; current = id; }
      }
      if (current === goalId) {
        const path = [current];
        while (cameFrom.has(current)) { current = cameFrom.get(current); path.unshift(current); }
        return path;
      }
      open.delete(current);
      const cur = this.nodes.get(current);
      for (const nb of cur.edges) {
        const tentative = (g.get(current) ?? Infinity) + cur.pos.distanceTo(this.nodes.get(nb).pos);
        if (tentative < (g.get(nb) ?? Infinity)) {
          cameFrom.set(nb, current);
          g.set(nb, tentative);
          f.set(nb, tentative + h(nb));
          open.add(nb);
        }
      }
    }
    return null;
  }

  // Convenience: world-space path (array of Vector3) between two world points.
  pathBetween(fromPoint, toPoint) {
    const a = this.nearestId(fromPoint);
    const b = this.nearestId(toPoint);
    const ids = this.findPath(a, b);
    if (!ids) return null;
    const pts = ids.map((id) => this.nodes.get(id).pos.clone());
    // Append the precise target so Granny finishes at the real point.
    pts.push(toPoint.clone());
    return pts;
  }
}
