// The canyon itself: a fixed-length track of segments, generated once from a
// seed. Each segment knows how sharply the canyon bends, how wide it is, how
// tall its walls stand and how high its floor sits; rings, rock spires and
// fuel cells are placed along it, and the last stretch opens into a flat
// valley with a runway. Nothing here draws or listens to input: it is only
// the shape of the world the plane flies through.

import { CANYON, CELL, RING, RUNWAY, SPIRE, SEG_LEN } from './config.js';

/** Smoothly blend one value toward another over a number of segments. */
function blend(from, to, step, span) {
  const t = Math.min(1, Math.max(0, step / span));
  const eased = t * t * (3 - 2 * t);
  return from + (to - from) * eased;
}

/** A gentle random walk that never runs away: each step pulls back to zero. */
function wander(random, value, pull, jitter) {
  return value * (1 - pull) + (random() - 0.5) * 2 * jitter;
}

// Notes: the track is generated once, up front, and never changes during a
// flight — the plane moves through it, never the other way around. Leg 3
// widens the canyon into a valley and flattens the floor so the runway reads
// as a runway, not as another stretch of canyon.
export function createTrack(random) {
  const count = CANYON.segments;
  const segments = [];
  let centre = 0;
  let curve = 0;
  let floor = 4;
  let wall = 46;

  for (let index = 0; index < count; index += 1) {
    const leg = index < CANYON.legEnds[0] ? 0 : index < CANYON.legEnds[1] ? 1 : 2;
    const targetWidth = CANYON.halfWidth[leg];
    const prevWidth = index === 0 ? targetWidth : segments[index - 1].halfWidth;
    const halfWidth = leg === 2 && index < CANYON.legEnds[1] + 10
      ? blend(prevWidth, targetWidth, index - CANYON.legEnds[1], 10)
      : targetWidth;

    // The canyon bends: the bend itself wanders, and the centre follows it.
    curve = wander(random, curve, 0.12, CANYON.maxCurve);
    centre += curve;
    if (centre > CANYON.maxCentre) { centre = CANYON.maxCentre; curve = -Math.abs(curve) * 0.5; }
    if (centre < -CANYON.maxCentre) { centre = -CANYON.maxCentre; curve = Math.abs(curve) * 0.5; }

    // The floor rolls in low hills; the walls breathe between low and high.
    floor = Math.min(CANYON.floorMax, Math.max(CANYON.floorMin, floor + (random() - 0.5) * 1.6));
    wall = Math.min(CANYON.wallMax, Math.max(CANYON.wallMin, wall + (random() - 0.5) * 6));

    const segment = {
      index,
      leg,
      z: index * SEG_LEN,
      centre,
      curve,
      halfWidth,
      wallH: leg === 2 ? 18 : wall,
      floorY: leg === 2 ? RUNWAY.flatFloor : floor,
      ring: null,
      spire: null,
      cell: null,
    };
    segments.push(segment);
  }

  // Rings: one every few segments, hung somewhere a pilot can reach — never
  // so close to a wall that the line through them is a scrape.
  for (let index = RING.firstSegment; index < CANYON.legEnds[1]; index += RING.every) {
    const segment = segments[index];
    const reach = Math.max(4, segment.halfWidth - RING.radius - 6);
    segment.ring = {
      x: segment.centre + (random() - 0.5) * 2 * reach,
      y: segment.floorY + RING.low + random() * (RING.high - RING.low),
      r: RING.radius,
      passed: false,
    };
  }

  // Rock spires: leg 2 only, tall stone teeth rising from the canyon floor
  // that a pilot must fly around, never through.
  for (let index = SPIRE.firstSegment; index < CANYON.legEnds[1]; index += SPIRE.every) {
    const segment = segments[index];
    const reach = Math.max(3, segment.halfWidth - SPIRE.radius - 5);
    segment.spire = {
      x: segment.centre + (random() - 0.5) * 2 * reach,
      top: segment.floorY + SPIRE.minHeight + random() * (SPIRE.maxHeight - SPIRE.minHeight),
      r: SPIRE.radius,
    };
  }

  // Fuel cells: small bright pickups, hung where a ring would be, for pilots
  // who watch their gauge as well as the rings.
  for (let index = CELL.firstSegment; index < CANYON.legEnds[1]; index += CELL.every) {
    const segment = segments[index];
    const reach = Math.max(4, segment.halfWidth - 6);
    segment.cell = {
      x: segment.centre + (random() - 0.5) * 2 * reach,
      y: segment.floorY + CELL.low + random() * (CELL.high - CELL.low),
      taken: false,
    };
  }

  const runwayStart = (count - RUNWAY.segments) * SEG_LEN;

  /** The segment under a distance along the track (clamped to the track). */
  function at(z) {
    const index = Math.min(count - 1, Math.max(0, Math.floor(z / SEG_LEN)));
    return segments[index];
  }

  /** The canyon centre at a distance, smoothly joined between segments. */
  function centreAt(z) {
    const index = Math.min(count - 2, Math.max(0, Math.floor(z / SEG_LEN)));
    const t = (z - index * SEG_LEN) / SEG_LEN;
    return segments[index].centre + (segments[index + 1].centre - segments[index].centre) * t;
  }

  /** The floor height at a distance, smoothly joined between segments. */
  function floorAt(z) {
    const index = Math.min(count - 2, Math.max(0, Math.floor(z / SEG_LEN)));
    const t = (z - index * SEG_LEN) / SEG_LEN;
    return segments[index].floorY + (segments[index + 1].floorY - segments[index].floorY) * t;
  }

  /** The canyon half-width at a distance, smoothly joined between segments. */
  function widthAt(z) {
    const index = Math.min(count - 2, Math.max(0, Math.floor(z / SEG_LEN)));
    const t = (z - index * SEG_LEN) / SEG_LEN;
    return segments[index].halfWidth + (segments[index + 1].halfWidth - segments[index].halfWidth) * t;
  }

  return { segments, count, at, centreAt, floorAt, widthAt, runwayStart, length: count * SEG_LEN };
}
