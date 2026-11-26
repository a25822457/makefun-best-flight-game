// The flight model and the rules, with no drawing and no browser in it: the
// plane's position, speed, fuel and hull, the rings it threads, the walls it
// must not scrape and the runway it must land on. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without
// the flight model knowing about screens or sound. Nothing here allocates
// after createFlight returns.

import { CANYON, LANDING, LEGS, PLANE, RING, RUNWAY, SEG_LEN } from './config.js';

export const EVENT_RING = 1;
export const EVENT_CELL = 2;
export const EVENT_HIT = 4;
export const EVENT_SCRAPE = 8;
export const EVENT_OVER = 16;
export const EVENT_LANDED = 32;
export const EVENT_LEG = 64;

export const STATUS_FLYING = 'flying';
export const STATUS_CRASHED = 'crashed';
export const STATUS_LANDED = 'landed';

/** Heading drifts with the canyon's bend and the pilot's own turning. */
const HEADING_BASE = 90;
const HEADING_PER_CURVE = 6;

// Notes: the model is deliberately forgiving in the air and strict on the
// ground — walls scrape before they kill, the floor kills at once, and the
// runway only counts a landing that is slow, low and on the centreline, so a
// touchdown reads as an achievement rather than an accident.
export function createFlight(track) {
  const ringsTotal = track.segments.reduce((sum, s) => sum + (s.ring ? 1 : 0), 0);
  const state = {
    z: 0,
    x: 0,
    y: 6,
    speed: 0,
    throttle: 0,
    steer: 0,
    pitch: 0,
    bank: 0,
    heading: HEADING_BASE,
    fuel: PLANE.fuelMax,
    hull: PLANE.hull,
    score: 0,
    rings: 0,
    ringsTotal,
    leg: 0,
    time: 0,
    distance: 0,
    status: STATUS_FLYING,
    scrapeTimer: 0,
    message: '',
    messageTimer: 0,
  };

  function reset() {
    state.z = 0;
    state.x = 0;
    state.y = 6;
    state.speed = 0;
    state.throttle = 0;
    state.steer = 0;
    state.pitch = 0;
    state.bank = 0;
    state.heading = HEADING_BASE;
    state.fuel = PLANE.fuelMax;
    state.hull = PLANE.hull;
    state.score = 0;
    state.rings = 0;
    state.leg = 0;
    state.time = 0;
    state.distance = 0;
    state.status = STATUS_FLYING;
    state.scrapeTimer = 0;
    state.message = '';
    state.messageTimer = 0;
    for (const segment of track.segments) {
      if (segment.ring) segment.ring.passed = false;
      if (segment.cell) segment.cell.taken = false;
    }
  }

  function note(message, seconds) {
    state.message = message;
    state.messageTimer = seconds;
  }

  function crash(reason) {
    if (state.status !== STATUS_FLYING) return EVENT_OVER;
    state.status = STATUS_CRASHED;
    note(reason, 6);
    return EVENT_OVER;
  }

  function damage(amount, reason) {
    state.hull -= amount;
    if (state.hull <= 0) {
      state.hull = 0;
      return crash(reason);
    }
    note(reason, 2);
    return EVENT_HIT;
  }

  /**
   * One fixed step. `control` is { steer (-1..1), pitch (-1..1), throttle
   * (0..1), brake (bool) }. With `harmless` set (the title screen's
   * backdrop) the plane flies itself and nothing can hurt it.
   */
  function step(dt, control, harmless) {
    let events = 0;
    if (state.status !== STATUS_FLYING) return events;
    state.time += dt;

    // Throttle sets the target speed; the engine works toward it, and the
    // air always drags a little speed away.
    const target = PLANE.minSpeed + control.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    const pull = target > state.speed ? PLANE.accel : PLANE.accel * 1.6;
    state.speed += Math.max(-pull * dt, Math.min(pull * dt, target - state.speed));
    if (control.brake) state.speed = Math.max(PLANE.minSpeed * 0.55, state.speed - 34 * dt);
    state.speed -= state.speed * PLANE.drag * dt * 0.12;

    // Banking turns the plane: the lateral speed grows with the bank and the
    // speed, so a fast turn is a wide turn and a slow one is tight.
    const wantBank = control.steer * PLANE.bankMax;
    state.bank += (wantBank - state.bank) * Math.min(1, dt * 5);
    const lateral = Math.sin((state.bank * Math.PI) / 180) * state.speed * 0.62
      + control.steer * state.speed * 0.1;
    state.x += lateral * dt;
    state.steer = control.steer;

    // Pitch climbs and dives; the air pushes the nose back toward level.
    const climb = control.pitch > 0 ? PLANE.climbRate : PLANE.diveRate;
    state.y += control.pitch * climb * dt - 0.4 * dt;
    state.pitch += (control.pitch * 14 - state.pitch) * Math.min(1, dt * 4);

    // The heading follows the canyon's bend and the pilot's turning.
    const segment = track.at(state.z);
    state.heading += (segment.curve * HEADING_PER_CURVE + control.steer * 9) * dt * (state.speed / 70);
    state.heading = ((state.heading % 360) + 360) % 360;

    state.z += state.speed * dt;
    state.distance = state.z;

    // Fuel burns with the throttle; an empty tank means a dead engine.
    state.fuel = Math.max(0, state.fuel - PLANE.fuelDrain * (0.4 + control.throttle) * dt);
    if (state.fuel === 0 && state.speed > PLANE.minSpeed) {
      state.speed = Math.max(PLANE.minSpeed * 0.6, state.speed - 12 * dt);
    }

    if (state.messageTimer > 0) state.messageTimer -= dt;

    // Legs change as the distance grows; the storm leg brings gusts.
    const leg = state.z < CANYON.legEnds[0] * SEG_LEN ? 0
      : state.z < CANYON.legEnds[1] * SEG_LEN ? 1 : 2;
    if (leg !== state.leg) {
      state.leg = leg;
      note(leg === 1 ? 'LEG 2 — RIDGE STORM: narrow canyon, gusts' : 'FINAL APPROACH — line up for the runway', 3.5);
      events |= EVENT_LEG;
    }
    if (leg === 1 && !harmless) {
      state.x += Math.sin(state.time * 1.7) * 2.4 * dt;
      state.y += Math.sin(state.time * 2.3 + 1.3) * 1.1 * dt;
    }

    const centre = track.centreAt(state.z);
    const floor = track.floorAt(state.z);
    const halfWidth = track.widthAt(state.z);
    const relX = state.x - centre;

    // Rings and fuel cells are checked as the plane crosses their segment.
    const prev = track.at(state.z - state.speed * dt);
    for (let index = prev.index; index <= segment.index; index += 1) {
      const seg = track.segments[index];
      if (seg.ring && !seg.ring.passed) {
        seg.ring.passed = true;
        const dx = state.x - seg.ring.x;
        const dy = state.y - seg.ring.y;
        if (Math.hypot(dx, dy) < seg.ring.r + PLANE.radius) {
          state.rings += 1;
          state.score += RING.points;
          state.fuel = Math.min(PLANE.fuelMax, state.fuel + PLANE.ringFuel);
          note('RING! +' + RING.points, 1.2);
          events |= EVENT_RING;
        }
      }
      if (seg.cell && !seg.cell.taken) {
        seg.cell.taken = true;
        const dx = state.x - seg.cell.x;
        const dy = state.y - seg.cell.y;
        if (Math.hypot(dx, dy) < 6) {
          state.fuel = Math.min(PLANE.fuelMax, state.fuel + PLANE.cellFuel);
          state.score += 25;
          note('FUEL +26', 1.2);
          events |= EVENT_CELL;
        }
      }
    }

    if (harmless) {
      // The title backdrop never leaves the canyon: keep it centred, and
      // ease it up to a height where the ground fills the frame below.
      state.x = centre + (state.x - centre) * 0.98;
      state.y += ((floor + 14) - state.y) * Math.min(1, dt * 2);
      return events;
    }

    // Rock spires: a solid hit, not a scrape.
    if (segment.spire) {
      const dx = state.x - segment.spire.x;
      const dy = state.y - floor;
      const dz = state.z - segment.z;
      if (Math.abs(dz) < SEG_LEN * 0.6 && Math.hypot(dx, dy) < segment.spire.r + PLANE.radius
        && state.y < segment.spire.top) {
        events |= damage(1, 'SPIRE STRIKE — hull ' + state.hull + '/3');
        state.x += dx > 0 ? 4 : -4;
        if (state.status !== STATUS_FLYING) return events;
      }
    }

    // The ground: flying into the canyon floor ends the flight.
    if (state.y <= floor + 1.2) {
      state.y = floor + 1.2;
      if (state.z >= track.runwayStart) {
        const offset = Math.abs(relX);
        if (state.speed <= LANDING.maxSpeed && offset <= LANDING.maxOffset && state.y - floor <= LANDING.maxHeight) {
          state.status = STATUS_LANDED;
          const bonus = LANDING.bonus + Math.round(state.fuel) * 2 + state.hull * 50;
          state.score += bonus;
          note('TOUCHDOWN! +' + bonus, 6);
          return events | EVENT_LANDED;
        }
        return crash('RUNWAY OVERRUN — too fast or off the centreline');
      }
      return crash('TERRAIN — flew into the canyon floor');
    }

    // The walls: a scrape costs hull over time, and the scrape timer keeps
    // the warning from firing every frame.
    if (Math.abs(relX) > halfWidth - 2.5) {
      state.scrapeTimer -= dt;
      if (state.scrapeTimer <= 0) {
        state.scrapeTimer = 0.9;
        note('WALL SCRAPE — ease off the canyon wall', 1.4);
        events |= EVENT_SCRAPE;
        events |= damage(1, 'WALL SCRAPE — hull ' + state.hull + '/3');
        state.x = centre + Math.sign(relX) * (halfWidth - 3.5);
        if (state.status !== STATUS_FLYING) return events;
      }
    }

    // Low fuel and low altitude warnings, before they become the end.
    if (state.fuel < 20 && state.fuel > 0) note('LOW FUEL — find a ring or a cell', 1);
    if (state.y - floor < 4 && state.z < track.runwayStart) note('PULL UP', 1);

    // Past the end of the valley with no landing, the flight is over.
    if (state.z >= track.length - 5) return crash('RAN OUT OF RUNWAY — the valley ends here');

    // Distance itself is worth a little: a steady pilot is a scoring pilot.
    state.score += state.speed * dt * 0.05;
    return events;
  }

  reset();
  return { state, reset, step, LEGS };
}
