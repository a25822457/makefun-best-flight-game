// The screenshot scenes behind ?shot=start|play|storm|end. Each one plays the
// real rules forward from a fresh flight for a fixed number of steps, steered
// by a simple autopilot (aim at the next ring, fly around the spires, mind
// the fuel), so the frame is what a short game really looks like and the same
// seed always gives the same frame. The end scene's pilot throttles back for
// the runway and lands, so the last shot shows the runway and the touchdown.

import { LEGS, PLANE, SEG_LEN, STEP } from './config.js';
import { EVENT_LANDED, EVENT_OVER, STATUS_LANDED } from './flight.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 22;
const STORM_SECONDS = 40;
const END_LIMIT_SECONDS = 600;

/** How far ahead, in metres, the autopilot looks for the next ring. */
const LOOK_AHEAD = 320;
/** How far ahead, in metres, it looks for a spire to fly around. */
const SPIRE_AHEAD = 170;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/** The next ring or fuel cell ahead that the pilot should aim at. */
function nextTarget(track, flight) {
  const state = flight.state;
  const start = Math.floor(state.z / SEG_LEN);
  for (let index = start; index < Math.min(track.count, start + 16); index += 1) {
    const segment = track.segments[index];
    if (segment.ring && !segment.ring.passed) return { x: segment.ring.x, y: segment.ring.y, z: segment.z };
  }
  const segment = track.at(state.z + LOOK_AHEAD);
  return { x: track.centreAt(state.z + LOOK_AHEAD), y: segment.floorY + 14, z: state.z + LOOK_AHEAD };
}

/** A spire close ahead that the pilot must fly around, if there is one. */
function spireAhead(track, flight) {
  const state = flight.state;
  const start = Math.floor(state.z / SEG_LEN);
  for (let index = start; index < Math.min(track.count, start + 8); index += 1) {
    const segment = track.segments[index];
    if (!segment.spire) continue;
    const dz = segment.z - state.z;
    if (dz > 0 && dz < SPIRE_AHEAD && Math.abs(segment.spire.x - state.x) < 9) return segment.spire;
  }
  return null;
}

/**
 * Steer the plane: aim at the next ring, swing around any spire ahead, and
 * hold the throttle the scene asks for. Returns a control object.
 */
function autopilot(track, flight, throttle, landing) {
  const state = flight.state;
  const target = nextTarget(track, flight);
  let aimX = target.x;
  let aimY = target.y;
  const spire = spireAhead(track, flight);
  if (spire) {
    // Fly around the spire on the side with more room.
    const centre = track.centreAt(state.z);
    aimX = spire.x + (spire.x > centre ? -13 : 13);
  }
  if (landing && state.z > track.runwayStart - 600) {
    // Final approach: centreline and slow. Hold a few metres up until the
    // runway is well underneath, then descend onto it — touching the floor
    // before the runway is a crash, not a landing.
    aimX = track.centreAt(state.z + 60);
    aimY = state.z > track.runwayStart + 100 ? track.floorAt(state.z) + 1 : track.floorAt(state.z) + 3.5;
  }
  const steer = clamp((aimX - state.x) / 11, -1, 1);
  const pitch = clamp((aimY - state.y) / 7, -1, 1);
  const brake = landing && state.z > track.runwayStart - 600 && state.speed > 48;
  const throttleOut = landing && state.z > track.runwayStart - 600 ? 0.1 : throttle;
  return { steer, pitch, throttle: throttleOut, brake };
}

/**
 * Set `flight` to the named scene (start, play, storm or end; any other name
 * is start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, track, flight) {
  flight.reset();
  const state = flight.state;
  if (name !== 'play' && name !== 'storm' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      flight.step(STEP, { steer: 0, pitch: 0, throttle: 0.55, brake: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const seconds = name === 'storm' ? STORM_SECONDS : name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const landing = name === 'end';
  for (let index = 0; index < seconds / STEP; index += 1) {
    const control = autopilot(track, flight, landing ? 0.55 : 0.72, landing);
    const events = flight.step(STEP, control, false);
    if (events & EVENT_OVER) break;
    if (events & EVENT_LANDED) break;
    if (state.status === STATUS_LANDED) break;
  }
  const over = state.status !== 'flying';
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: Math.floor(state.score) };
}
