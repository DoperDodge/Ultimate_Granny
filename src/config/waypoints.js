// ---------------------------------------------------------------------------
// Navigation graph for Granny. Nodes sit at room centres and in every doorway;
// edges only connect nodes whose straight-line path stays inside a single room
// (so Granny never walks through a wall). Stair edges bridge the two floors.
//
// To extend the house, add nodes + edges here. `WaypointGraph` runs A* over it.
// ---------------------------------------------------------------------------

export const NODES = {
  // ===== Ground floor (y = 0) =====
  living:    { pos: [-4, 0, -3] },
  kitchen:   { pos: [4, 0, -3] },
  hall:      { pos: [-3, 0, 3] },
  bathroom:  { pos: [5, 0, 3] },
  frontDoor: { pos: [0, 0, -5.4] },

  door_LK:   { pos: [0, 0, -1.5] },   // living <-> kitchen
  door_LH:   { pos: [-4, 0, 0] },     // living <-> hall
  door_KB:   { pos: [5, 0, 0] },      // kitchen <-> bathroom
  door_HB:   { pos: [2, 0, 3] },      // hall <-> bathroom

  stairBot:  { pos: [-6.5, 0, 1.2] },

  // ===== Upper floor (y = 3) =====
  stairTop:  { pos: [-6.5, 3, 5.0] },
  landingW:  { pos: [-5, 3, 4.5] },
  landing:   { pos: [-2, 3, 3] },
  landingE:  { pos: [4, 3, 3] },
  master:    { pos: [-4, 3, -3] },
  kid:       { pos: [4, 3, -3] },

  door_ML:   { pos: [-4, 3, 0] },     // master <-> landing
  door_KdL:  { pos: [4, 3, 0] },      // kid <-> landing
  door_MK:   { pos: [0, 3, -1.5] },   // master <-> kid
};

// Undirected edges. Each segment was chosen to stay within one convex room area.
export const EDGES = [
  // Ground
  ['living', 'door_LK'], ['kitchen', 'door_LK'],
  ['living', 'door_LH'], ['hall', 'door_LH'],
  ['kitchen', 'door_KB'], ['bathroom', 'door_KB'],
  ['hall', 'door_HB'], ['bathroom', 'door_HB'],
  ['living', 'frontDoor'], ['kitchen', 'frontDoor'],
  ['hall', 'stairBot'],

  // Stairs bridge
  ['stairBot', 'stairTop'],

  // Upper
  ['stairTop', 'landingW'], ['landingW', 'landing'],
  ['landing', 'landingE'],
  ['landing', 'door_ML'], ['master', 'door_ML'],
  ['landingE', 'door_KdL'], ['kid', 'door_KdL'],
  ['master', 'door_MK'], ['kid', 'door_MK'],
];

// Nodes Granny is allowed to idle-patrol toward (skip pure doorway nodes).
export const PATROL_NODES = [
  'living', 'kitchen', 'hall', 'bathroom',
  'master', 'kid', 'landing',
];
