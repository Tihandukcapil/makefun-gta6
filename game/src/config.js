// Sunset Keys — tuning and palette for Marisol Bay.
// One place for every number the rest of the game shares, so a balance
// change never means hunting through a dozen modules.

export const WORLD = {
  WIDTH: 3200,
  HEIGHT: 2400,
  // The sea runs along the east edge; the beach is the strip beside it.
  SEA_X: 2880,
  BEACH_X: 2720,
};

export const PLAYER = {
  RADIUS: 14,
  WALK_SPEED: 230,
  HEALTH: 100,
  INTERACT_RANGE: 95,
  PUNCH_RANGE: 46,
  PUNCH_DAMAGE: 12,
};

export const CAR = {
  RADIUS: 16,
  ACCEL: 430,
  BRAKE: 720,
  MAX_SPEED: 620,
  MAX_REVERSE: 180,
  REVERSE_ACCEL: 270,
  TURN_RATE: 2.7,
  DRAG: 0.55,
  // A hit only hurts above this closing speed (px/s).
  IMPACT_SPEED: 180,
  IMPACT_DAMAGE: 5,
};

export const COP = {
  RADIUS: 16,
  ACCEL: 470,
  MAX_SPEED: 640,
  TURN_RATE: 2.9,
  RAM_DAMAGE: 5,
  RAM_COOLDOWN: 0.8,
  // Cops give up once the player is this far away and the heat is low.
  LOSE_DISTANCE: 900,
};

export const WANTED = {
  MAX: 5,
  // Heat decays this much per second while the player stays out of trouble.
  DECAY: 0.12,
  // One star per 25 heat, roughly: a stolen car is a star, a hit cop two.
  PER_STAR: 25,
};

// Bit flags for the input actions.
export const ACTION = {
  INTERACT: 1,
  ATTACK: 2,
  HANDBRAKE: 4,
};

// The clock starts at sunset and runs 1 game-hour per 4 real minutes.
export const CLOCK = {
  START_HOUR: 17.25,
  HOURS_PER_SECOND: 1 / 240,
};

// Sun-soaked palette: warm sand, teal sea, coral accents.
export const PALETTE = {
  SEA: '#1d7f8e',
  SEA_DEEP: '#14616f',
  SAND: '#e8c98f',
  SAND_LIGHT: '#f2d9a7',
  GRASS: '#7fae62',
  ROAD: '#3d3d46',
  ROAD_LINE: '#e8d44d',
  SIDEWALK: '#9a938a',
  BUILDING: ['#c96f4a', '#d9a05b', '#e8b4b8', '#7fb3a3', '#b08968', '#a3b18a'],
  ROOF: ['#8c4a2f', '#7a6a53', '#5d6b7a'],
  CAR_PLAYER: '#ff5d8f',
  CAR_TRAFFIC: ['#e8e8e8', '#5b7fa6', '#c9a227', '#7a4a6b', '#4a7a5b', '#b0b0b0'],
  COP_CAR: '#1f3a93',
  PED: ['#e07a5f', '#81b29a', '#f2cc8f', '#6d6875', '#3d405b'],
  HUD_BG: 'rgba(12, 14, 24, 0.72)',
  GOLD: '#ffd36a',
};
