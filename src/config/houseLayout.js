// ---------------------------------------------------------------------------
// Data-driven house. Everything here is plain data consumed by HouseBuilder.js,
// so you can reshape the house, add rooms, or hand-author new floors without
// touching rendering/collision code.
//
// Coordinate system: X = east/west, Z = north/south, Y = up.
// Floor 0 sits at y = 0, floor 1 at y = 3 (CONFIG.floorHeight).
// Walls are AXIS-ALIGNED segments (x1==x2 OR z1==z2). Each may carry `doors`,
// an array of openings expressed as {at, width} where `at` is the world
// coordinate (X for a north/south wall, Z for an east/west wall) of the gap
// centre.
// ---------------------------------------------------------------------------

const H = 3;          // wall height per floor
const F1 = 3;         // y of upper floor

// Footprint extents
const X0 = -8, X1 = 8;
const Z0 = -6, Z1 = 6;

export const HOUSE = {
  bounds: { x0: X0, x1: X1, z0: Z0, z1: Z1, top: F1 + H },

  // ---- Floor slabs (walkable surfaces). Each is an axis-aligned rectangle. ----
  slabs: [
    // Ground floor — full footprint
    { x0: X0, x1: X1, z0: Z0, z1: Z1, y: 0, material: 'floorWood' },

    // Upper floor — full footprint MINUS the stairwell opening at the NW back.
    // Stairwell hole = x[-8,-5.5] z[0,6].
    { x0: X0, x1: X1, z0: Z0, z1: 0, y: F1, material: 'floorWood' },      // south half
    { x0: -5.5, x1: X1, z0: 0, z1: Z1, y: F1, material: 'floorWood' },    // north half (east of stairwell)

    // Ceilings (so the upper floor doesn't look skylit). Optional eye-candy.
    { x0: X0, x1: X1, z0: Z0, z1: Z1, y: F1 + H, material: 'ceiling', flip: true },
  ],

  // ---- Staircase: an inclined ramp from ground to the upper floor. ----
  // Rises along +Z (you walk north & up); its east edge (x=-5.5) seams flush
  // with the upper north slab so you step straight off onto the landing near
  // the top. The big height gap lower down naturally prevents stepping off
  // anywhere but the top.
  stairs: [
    { x0: -7.0, x1: -5.5, z0: 0.5, z1: 5.5, yBottom: 0, yTop: F1, material: 'floorWood' },
  ],

  // ---- Walls ----
  walls: [
    // ===== GROUND FLOOR (y 0..3) =====
    // Outer shell — south wall holds the FRONT DOOR (the exit), a 1.6m gap at x=0.
    { x1: X0, z1: Z0, x2: X1, z2: Z0, floor: 0, doors: [{ at: 0, width: 1.6, exit: true }] },
    { x1: X0, z1: Z1, x2: X1, z2: Z1, floor: 0 }, // north
    { x1: X0, z1: Z0, x2: X0, z2: Z1, floor: 0 }, // west
    { x1: X1, z1: Z0, x2: X1, z2: Z1, floor: 0 }, // east

    // Interior — living room | kitchen divider (x=0, south half), door at z=-1.5
    { x1: 0, z1: Z0, x2: 0, z2: 0, floor: 0, doors: [{ at: -1.5, width: 1.1 }] },
    // Interior — south rooms | north hall divider (z=0), doors to living & kitchen
    { x1: X0, z1: 0, x2: X1, z2: 0, floor: 0, doors: [{ at: -4, width: 1.1 }, { at: 5, width: 1.1 }] },
    // Interior — hall | bathroom divider (x=2, north half), door at z=3
    { x1: 2, z1: 0, x2: 2, z2: Z1, floor: 0, doors: [{ at: 3, width: 1.1 }] },

    // ===== UPPER FLOOR (y 3..6) =====
    // Outer shell (solid up here — front door is downstairs only)
    { x1: X0, z1: Z0, x2: X1, z2: Z0, floor: 1 },
    { x1: X0, z1: Z1, x2: X1, z2: Z1, floor: 1 },
    { x1: X0, z1: Z0, x2: X0, z2: Z1, floor: 1 },
    { x1: X1, z1: Z0, x2: X1, z2: Z1, floor: 1 },

    // Master bedroom | kid bedroom divider (x=0, south half), door at z=-1.5
    { x1: 0, z1: Z0, x2: 0, z2: 0, floor: 1, doors: [{ at: -1.5, width: 1.1 }] },
    // Bedrooms | landing divider (z=0). Doors at x=-4 (master) & x=4 (kid).
    { x1: X0, z1: 0, x2: X1, z2: 0, floor: 1, doors: [{ at: -4, width: 1.1 }, { at: 4, width: 1.1 }] },

    // Short railing on the landing's west edge, kept clear of the top of the
    // stairs (z >= 3.5) so the step-off stays open.
    { x1: -5.5, z1: 0, x2: -5.5, z2: 3.4, floor: 1, height: 1.0, railing: true },
  ],

  // ---- Rooms (used only for labels / spawn metadata / lighting hints) ----
  rooms: [
    { id: 'living', name: 'Living Room', floor: 0, center: [-4, -3], light: 0xffd9a0 },
    { id: 'kitchen', name: 'Kitchen', floor: 0, center: [4, -3], light: 0xcfe8ff },
    { id: 'hall', name: 'Hallway', floor: 0, center: [-3, 3], light: 0xffe0b0 },
    { id: 'bathroom', name: 'Bathroom', floor: 0, center: [5, 3], light: 0xd0f0ff },
    { id: 'master', name: 'Master Bedroom', floor: 1, center: [-4, -3], light: 0xffd0b0 },
    { id: 'kid', name: "Child's Bedroom", floor: 1, center: [4, -3], light: 0xffd6e2 },
    { id: 'landing', name: 'Landing', floor: 1, center: [0, 3], light: 0xffe0b0 },
  ],

  // ---- Props: decorative + functional furniture. `solid:true` adds collision. ----
  // type drives the mesh built in HouseBuilder.buildProp().
  props: [
    // Master bedroom (start)
    { type: 'bed', pos: [-5.5, F1, -4], rot: 0, solid: true },
    { type: 'nightstand', pos: [-2.4, F1, -5], rot: 0, solid: true },
    { type: 'wardrobe', pos: [-7, F1, -1], rot: Math.PI / 2, solid: true, hideSpot: 'wardrobeMaster' },
    { type: 'rug', pos: [-4, F1, -2.5], rot: 0 },

    // Kid bedroom
    { type: 'bed', pos: [5.5, F1, -4], rot: 0, solid: true, small: true },
    { type: 'dresser', pos: [1.2, F1, -5], rot: 0, solid: true, container: 'kidDresser' },
    { type: 'wardrobe', pos: [7, F1, -1], rot: -Math.PI / 2, solid: true, hideSpot: 'wardrobeKid' },

    // Kitchen
    { type: 'counter', pos: [4, 0, -5.4], rot: 0, solid: true, container: 'kitchenDrawer' },
    { type: 'table', pos: [3, 0, -2], rot: 0, solid: true },
    { type: 'fridge', pos: [7.2, 0, -4.5], rot: 0, solid: true },

    // Living room
    { type: 'sofa', pos: [-6.2, 0, -4.6], rot: 0, solid: true },
    { type: 'table', pos: [-4, 0, -3], rot: 0, solid: true, low: true },
    { type: 'shelf', pos: [-1, 0, -5.4], rot: 0, solid: true },

    // Bathroom
    { type: 'cabinet', pos: [6.6, 0, 1.2], rot: Math.PI, solid: true, container: 'bathCabinet' },
    { type: 'bath', pos: [5, 0, 4.8], rot: 0, solid: true },

    // Hall / landing
    { type: 'shelf', pos: [1.6, 0, 5.5], rot: Math.PI, solid: true },
    { type: 'shelf', pos: [7.6, F1, 3], rot: -Math.PI / 2, solid: true },
  ],

  // ---- Containers (drawers/cabinets the player opens; some hold items). ----
  // Referenced by prop `container`. `gives` drops an item into the world/inventory.
  containers: {
    kitchenDrawer: { name: 'kitchen drawer', gives: 'hammer' },
    kidDresser: { name: 'dresser', gives: 'padlockKey' },
    bathCabinet: { name: 'cabinet', gives: 'masterKey' },
    kidDresserEmpty: { name: 'dresser' },
  },

  // ---- Hiding spots (wardrobes). Referenced by prop `hideSpot`. ----
  hideSpots: {
    wardrobeMaster: { name: 'wardrobe' },
    wardrobeKid: { name: 'wardrobe' },
  },

  // ---- The exit. Position/orientation of the front-door interaction zone. ----
  exit: { pos: [0, 0, -6], facing: [0, 0, -1] },
};
