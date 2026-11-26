// Every tuning number and colour in one place. The world is a 2400 x 2400 m valley;
// the play area the missions use is roughly the central 1600 x 1600 m.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = {
  size: 2400,
  half: 1200,
  waterLevel: 2,
  seed: 20261126,
};

export const RUNWAY = {
  // Runway centre, running along the X axis (heading 090 / 270).
  x: 0,
  z: 120,
  length: 420,
  width: 34,
  heading: 90,
};

export const PLANE = {
  maxBankDeg: 62,
  maxPitchDeg: 26,
  minSpeed: 15, // m/s, below this the wing stops flying
  maxSpeed: 68, // m/s at full throttle
  accel: 7, // m/s^2 toward the throttle's target speed
  turnRate: 0.55, // rad/s at full bank, scaled by speed
  stallSpeed: 21,
  climbSink: 0.9,
};

export const FUEL = {
  start: 100,
  burnIdle: 0.1, // %/s
  burnFull: 0.42, // %/s at full throttle
};

export const RING = {
  radius: 18,
  tube: 1.1,
};

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Circuit',
    tag: '8 rings · beat the clock',
    desc: 'Thread all 8 rings over the valley. Smooth flying wins: hard banks bleed speed, gentle turns keep it.',
    fuelStart: 100,
    timeLimit: 0, // 0 = no limit, counts up
  },
  {
    id: 'landing',
    name: 'Runway Landing',
    tag: 'Take off · 3 rings · land it',
    desc: 'Take off from runway 09, fly the three guide rings, then bring her home. Touch down slow, level and on the strip.',
    fuelStart: 100,
    timeLimit: 0,
  },
  {
    id: 'dash',
    name: 'Canyon Dash',
    tag: '10 rings · 55% fuel · timed',
    desc: 'A low dash down the canyon. Fuel is tight — carry speed through the turns instead of firewalling the throttle.',
    fuelStart: 55,
    timeLimit: 240,
  },
];

export const PALETTE = {
  sky: 0x87b5d9,
  skyTop: 0x3f6ea6,
  fog: 0xa8c4d8,
  grass: 0x5d8a4a,
  grassDry: 0x8a9a4e,
  rock: 0x8d8578,
  snow: 0xe8eef2,
  sand: 0xc9b078,
  water: 0x2f6f9e,
  runway: 0x3a3d42,
  runwayLine: 0xf2f2e8,
  building: 0xb8a88f,
  hangar: 0x7d8a99,
  tree: 0x2f6b2f,
  trunk: 0x6b4a2f,
  planeOrange: 0xe8622a,
  planeWhite: 0xf4f1e8,
  planeDark: 0x2c313a,
  ringNext: 0x2fe6a8,
  ringOther: 0xff9f2e,
  cloud: 0xffffff,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ridge-runner.best';
