// ---------------------------------------------------------------------------
// Item + puzzle definitions. The escape door reads `LOCKS` in order; each lock
// consumes a required item. Add items/locks here to grow the puzzle — no engine
// changes needed.
// ---------------------------------------------------------------------------

// Pickup items. `icon` is just an emoji glyph for the inventory HUD (no assets
// required); swap for a sprite/model later.
export const ITEMS = {
  hammer: {
    id: 'hammer',
    name: 'Hammer',
    icon: '🔨',
    desc: 'Heavy claw hammer. Good for prying boards loose.',
  },
  padlockKey: {
    id: 'padlockKey',
    name: 'Padlock Key',
    icon: '🗝️',
    desc: 'A small rusted key. Fits a padlock.',
  },
  masterKey: {
    id: 'masterKey',
    name: 'Master Key',
    icon: '🔑',
    desc: 'An ornate brass key for the main deadbolt.',
  },
};

// The exit door's locks, resolved top-to-bottom. Each needs `requires` in the
// inventory; interacting with the door clears them one at a time.
export const LOCKS = [
  { id: 'plank', label: 'Wooden Plank', requires: 'hammer', verb: 'Pry off the plank' },
  { id: 'padlock', label: 'Padlock', requires: 'padlockKey', verb: 'Unlock the padlock' },
  { id: 'deadbolt', label: 'Deadbolt', requires: 'masterKey', verb: 'Turn the deadbolt' },
];
