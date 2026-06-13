// ---------------------------------------------------------------------------
// Central tuning. Almost every gameplay feel-knob lives here so the game can be
// re-balanced without touching system code. Difficulty presets at the bottom
// override a subset of these values.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // --- World ---
  wallHeight: 3.0,
  wallThickness: 0.2,
  floorHeight: 3.0, // vertical distance between floor 0 and floor 1

  // --- Player ---
  player: {
    radius: 0.3,
    eyeHeight: 1.62,
    crouchEyeHeight: 0.95,
    walkSpeed: 2.6,
    sprintSpeed: 4.7,
    crouchSpeed: 1.3,
    acceleration: 14,
    gravity: 18,
    maxStamina: 5.0, // seconds of sprint
    staminaRegen: 0.55, // per second
    staminaDrain: 1.0, // per second while sprinting
    stepHeight: 0.62, // how high a ledge/stair the player auto-steps
    mouseSensitivity: 0.0022,
    headBob: 0.045,
  },

  // --- Noise (how loud each action is, in "world units" of hearing radius) ---
  noise: {
    walk: 4.0,
    sprint: 9.0,
    crouchWalk: 1.2,
    drawer: 7.5,
    door: 6.5,
    pickup: 3.0,
    land: 8.0,
    bump: 5.0,
  },

  // --- Granny ---
  granny: {
    walkSpeed: 1.9, // patrol
    chaseSpeed: 3.35, // when she sees you (slightly faster than player walk, slower than sprint)
    searchSpeed: 2.4,
    turnSpeed: 4.0, // radians/sec
    sightRange: 13.0,
    sightFovDeg: 105, // full cone width
    closeSenseRange: 2.2, // feels you if very close even out of cone
    hearingMultiplier: 1.0, // scales every noise radius she can hear
    attackRange: 1.35,
    attackCooldown: 1.0,
    investigateTime: 7.0, // seconds spent looking around a noise/last-seen spot
    patrolPauseMin: 1.0,
    patrolPauseMax: 3.0,
    memoryTime: 4.0, // keeps chasing this long after losing sight
    spawnNodeId: 'kitchen',
  },

  // --- Match / progression ---
  maxDays: 5, // survive past this and you've lost; escape before to win
  startNodeId: 'master', // bedroom where each day begins

  // --- Audio ---
  audio: {
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.9,
  },
};

// Difficulty presets shallow-merge over CONFIG.granny / CONFIG.player when applied.
export const DIFFICULTIES = {
  easy: {
    label: 'Scared',
    granny: { chaseSpeed: 3.0, sightRange: 10, hearingMultiplier: 0.8, memoryTime: 3 },
    maxDays: 7,
  },
  normal: {
    label: 'Granny',
    granny: {},
    maxDays: 5,
  },
  hard: {
    label: 'Nightmare',
    granny: { chaseSpeed: 3.7, walkSpeed: 2.2, sightRange: 15, hearingMultiplier: 1.25, memoryTime: 6, investigateTime: 9 },
    maxDays: 4,
  },
};

// Pristine snapshot taken at module load so difficulty changes always layer on
// top of base values instead of compounding.
const BASE = structuredClone(CONFIG);

// Returns a fully merged config object for the given difficulty key.
export function buildConfig(difficultyKey = 'normal') {
  const diff = DIFFICULTIES[difficultyKey] || DIFFICULTIES.normal;
  const merged = structuredClone(BASE);
  if (diff.granny) Object.assign(merged.granny, diff.granny);
  if (diff.player) Object.assign(merged.player, diff.player);
  if (typeof diff.maxDays === 'number') merged.maxDays = diff.maxDays;
  merged.difficultyKey = difficultyKey;
  merged.difficultyLabel = diff.label;
  return merged;
}

// Applies a difficulty onto the LIVE CONFIG sub-objects in place, so modules
// that captured references to CONFIG.granny / CONFIG.player see the change.
export function applyDifficulty(difficultyKey = 'normal') {
  const c = buildConfig(difficultyKey);
  Object.assign(CONFIG.granny, c.granny);
  Object.assign(CONFIG.player, c.player);
  CONFIG.maxDays = c.maxDays;
  CONFIG.difficultyKey = c.difficultyKey;
  CONFIG.difficultyLabel = c.difficultyLabel;
  return CONFIG;
}
