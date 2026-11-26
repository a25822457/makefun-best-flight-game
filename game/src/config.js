// Ridge Runner — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. All distances in the
// world are metres, all speeds metres per second, all angles degrees.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** One track segment is this long, in metres, along the canyon. */
export const SEG_LEN = 25;

/** How far ahead of the plane the renderer draws, in segments. */
export const DRAW_AHEAD = 48;

/** Camera sits this far behind the plane and this high above it. */
export const CAMERA = { behind: 14, above: 3.2, depth: 1.15 };

/** The plane: speeds, turn and climb rates, damage and fuel. */
export const PLANE = {
  minSpeed: 42,
  maxSpeed: 118,
  cruiseSpeed: 78,
  accel: 26,
  drag: 0.35,
  turnRate: 34,
  bankMax: 38,
  climbRate: 17,
  diveRate: 22,
  hull: 3,
  fuelMax: 100,
  fuelDrain: 1.15,
  ringFuel: 7,
  cellFuel: 26,
  radius: 2.2,
};

/** The canyon: widths, wall heights and floor hills per leg. */
export const CANYON = {
  segments: 264,
  legEnds: [88, 184, 264],
  halfWidth: [33, 22, 64],
  wallMin: 24,
  wallMax: 40,
  floorMin: 0,
  floorMax: 13,
  maxCurve: 1.35,
  maxCentre: 130,
};

/** Rings: how far apart, how big, how high they sit above the floor. */
export const RING = {
  every: 11,
  firstSegment: 7,
  radius: 7.5,
  low: 9,
  high: 26,
  points: 100,
};

/** Rock spires (leg 2 only): how often, how tall, how wide. */
export const SPIRE = {
  every: 17,
  firstSegment: 96,
  minHeight: 11,
  maxHeight: 24,
  radius: 3.4,
};

/** Fuel cells: how often they appear along the track. */
export const CELL = { every: 29, firstSegment: 22, low: 10, high: 24 };

/** The runway: the last stretch of the track is a flat open valley. */
export const RUNWAY = { segments: 22, width: 9, flatFloor: 0 };

/** The distance along the track where the runway valley begins. */
export const RUNWAY_START = (CANYON.segments - RUNWAY.segments) * SEG_LEN;

/** Landing: slow enough, low enough and close enough to the centreline. */
export const LANDING = { maxSpeed: 50, maxHeight: 3.5, maxOffset: 6, bonus: 500 };

/** Leg names shown on the HUD and the title screen. */
export const LEGS = ['CANYON RUN', 'RIDGE STORM', 'FINAL APPROACH'];

/** Golden-hour palette: one warm style for sky, rock, ground and plane. */
export const PALETTE = {
  backdrop: '#191325',
  skyTop: '#2b2350',
  skyMid: '#7a4a6e',
  skyLow: '#e2703a',
  sun: '#ffd9a0',
  sunCore: '#fff3d6',
  mountainFar: '#5d4a7d',
  mountainNear: '#46365e',
  wallLight: '#c96f3f',
  wallShade: '#7a3f2a',
  wallDark: '#4e2718',
  ground: '#b98a52',
  groundStripe: '#a1763f',
  runway: '#3a3f4a',
  runwayLine: '#f5d76e',
  ring: '#39d5c0',
  ringGlow: '#8ff5e4',
  cell: '#ffd23e',
  spire: '#5e3a2c',
  planeBody: '#f2ede4',
  planeTrim: '#e2703a',
  planeDark: '#2e2a33',
  canopy: '#7fd4e8',
  hud: '#eaf6ff',
  hudDim: '#9db8c8',
  hudWarn: '#ff5a4e',
  hudGood: '#7dffb0',
  panel: 'rgba(16, 12, 28, 0.82)',
  panelEdge: '#e2703a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ridge-runner.best';
