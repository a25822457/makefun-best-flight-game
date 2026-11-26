// Drawing only: the flight state and the track in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with
// the backdrop colour. A pseudo-3D chase view: the canyon is drawn segment by
// segment, far to near, each ground and wall projected through a pinhole
// camera that sits behind the plane; the plane itself is drawn in screen
// space, banked and pitched, with the HUD and the panels over the top.

import { CAMERA, DRAW_AHEAD, FIELD, FONT, LEGS, PALETTE, PLANE, RUNWAY_START, SEG_LEN } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const HORIZON = FIELD.height * 0.44;
const FOCAL = 430;
const PANEL = { width: 660, top: 150, line: 34, bottom: 76 };

/** A jagged ridge line across the screen, drawn as one filled silhouette. */
function ridge(random, count, base, amp) {
  const points = [];
  let y = base;
  for (let index = 0; index <= count; index += 1) {
    y = Math.min(base + amp, Math.max(base - amp, y + (random() - 0.5) * amp * 1.4));
    points.push({ x: (index / count) * (FIELD.width + 240) - 120, y });
  }
  return points;
}

export function createRenderer(canvas, random) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const farRidge = ridge(random, 26, HORIZON - 26, 46);
  const nearRidge = ridge(random, 20, HORIZON - 8, 34);
  const clouds = [];
  for (let index = 0; index < 16; index += 1) {
    clouds.push({
      x: (random() - 0.5) * 700,
      y: 55 + random() * 70,
      z: random() * 6500,
      size: 26 + random() * 46,
    });
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = size + (weight || '');
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Project a world point to screen space; null when behind the camera. */
  function project(x, y, z, camX, camY, camZ) {
    const dz = z - camZ;
    if (dz < 1) return null;
    const scale = FOCAL / dz;
    return {
      x: FIELD.width / 2 + (x - camX) * scale,
      y: HORIZON + (camY - y) * scale,
      scale,
    };
  }

  function quad(points, fill) {
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.closePath();
    context.fill();
  }

  function drawSky(state) {
    const gradient = context.createLinearGradient(0, -220, 0, HORIZON + 40);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = gradient;
    context.fillRect(-240, -240, FIELD.width + 480, HORIZON + 280);

    // Low sun, upper right, with a wide warm glow around it.
    const sunX = FIELD.width * 0.76;
    const sunY = HORIZON - 150;
    const glow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, 190);
    glow.addColorStop(0, 'rgba(255, 220, 160, 0.9)');
    glow.addColorStop(0.35, 'rgba(255, 170, 90, 0.35)');
    glow.addColorStop(1, 'rgba(255, 150, 70, 0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 200, sunY - 200, 400, 400);
    context.fillStyle = PALETTE.sunCore;
    context.beginPath();
    context.arc(sunX, sunY, 30, 0, Math.PI * 2);
    context.fill();
  }

  function drawRidge(points, offset, fill) {
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(-240, FIELD.height);
    for (const point of points) context.lineTo(point.x + offset, point.y);
    context.lineTo(FIELD.width + 240, FIELD.height);
    context.closePath();
    context.fill();
  }

  function drawClouds(state, camZ) {
    context.fillStyle = 'rgba(255, 214, 180, 0.5)';
    for (const cloud of clouds) {
      let z = cloud.z;
      while (z < camZ + 40) z += 6500;
      const projected = project(cloud.x, cloud.y, z, state.x, state.y + CAMERA.above, camZ);
      if (!projected || projected.y > HORIZON + 10) continue;
      const size = projected.scale * cloud.size;
      if (size < 2) continue;
      context.beginPath();
      context.ellipse(projected.x, projected.y, size, size * 0.34, 0, 0, Math.PI * 2);
      context.ellipse(projected.x - size * 0.55, projected.y + size * 0.1, size * 0.6, size * 0.26, 0, 0, Math.PI * 2);
      context.ellipse(projected.x + size * 0.55, projected.y + size * 0.08, size * 0.62, size * 0.28, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** One canyon segment: its ground strip and both inner wall faces. */
  function drawSegment(segment, next, camX, camY, camZ) {
    const z0 = segment.z;
    const z1 = next ? next.z : segment.z + SEG_LEN;
    const left0 = project(segment.centre - segment.halfWidth, segment.floorY, z0, camX, camY, camZ);
    const right0 = project(segment.centre + segment.halfWidth, segment.floorY, z0, camX, camY, camZ);
    const left1 = project(next ? next.centre - next.halfWidth : segment.centre - segment.halfWidth, next ? next.floorY : segment.floorY, z1, camX, camY, camZ);
    const right1 = project(next ? next.centre + next.halfWidth : segment.centre + segment.halfWidth, next ? next.floorY : segment.floorY, z1, camX, camY, camZ);
    if (!left0 || !right0 || !left1 || !right1) return;

    // Ground: alternating warm stripes so the speed reads on the screen.
    quad([left0, right0, right1, left1], segment.index % 2 === 0 ? PALETTE.ground : PALETTE.groundStripe);

    // The runway, on the last stretch: dark strip, gold centre line.
    if (segment.leg === 2 && segment.z >= RUNWAY_START) {
      const runL0 = project(segment.centre - 4.5, segment.floorY + 0.15, z0, camX, camY, camZ);
      const runR0 = project(segment.centre + 4.5, segment.floorY + 0.15, z0, camX, camY, camZ);
      const runL1 = project(next ? next.centre - 4.5 : segment.centre - 4.5, (next ? next.floorY : segment.floorY) + 0.15, z1, camX, camY, camZ);
      const runR1 = project(next ? next.centre + 4.5 : segment.centre + 4.5, (next ? next.floorY : segment.floorY) + 0.15, z1, camX, camY, camZ);
      if (runL0 && runR0 && runL1 && runR1) {
        quad([runL0, runR0, runR1, runL1], PALETTE.runway);
        const dashL = project(segment.centre - 0.5, segment.floorY + 0.25, z0, camX, camY, camZ);
        const dashR = project(segment.centre + 0.5, segment.floorY + 0.25, z0, camX, camY, camZ);
        const dashL1 = project(next ? next.centre - 0.5 : segment.centre - 0.5, (next ? next.floorY : segment.floorY) + 0.25, z1, camX, camY, camZ);
        const dashR1 = project(next ? next.centre + 0.5 : segment.centre + 0.5, (next ? next.floorY : segment.floorY) + 0.25, z1, camX, camY, camZ);
        if (dashL && dashR && dashL1 && dashR1 && segment.index % 2 === 0) {
          quad([dashL, dashR, dashR1, dashL1], PALETTE.runwayLine);
        }
      }
    }

    // Walls: the face toward the canyon, lit on the left, shaded on the right,
    // with strata lines so the rock reads as rock and not as flat colour.
    const wallTop = segment.wallH;
    const topL0 = project(segment.centre - segment.halfWidth, segment.floorY + wallTop, z0, camX, camY, camZ);
    const topL1 = project(next ? next.centre - next.halfWidth : segment.centre - segment.halfWidth, (next ? next.floorY : segment.floorY) + (next ? next.wallH : wallTop), z1, camX, camY, camZ);
    const topR0 = project(segment.centre + segment.halfWidth, segment.floorY + wallTop, z0, camX, camY, camZ);
    const topR1 = project(next ? next.centre + next.halfWidth : segment.centre + segment.halfWidth, (next ? next.floorY : segment.floorY) + (next ? next.wallH : wallTop), z1, camX, camY, camZ);
    if (topL0 && topL1) {
      quad([left0, left1, topL1, topL0], PALETTE.wallLight);
      strata(left0, left1, topL0, topL1, 'rgba(78, 39, 24, 0.5)');
    }
    if (topR0 && topR1) {
      quad([right0, topR0, topR1, right1], PALETTE.wallShade);
      strata(right0, right1, topR0, topR1, 'rgba(40, 18, 10, 0.55)');
    }
  }

  /** Two strata lines across a wall face, between its bottom and top edges. */
  function strata(bottom0, bottom1, top0, top1, color) {
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    for (const t of [1 / 3, 2 / 3]) {
      const a = { x: bottom0.x + (top0.x - bottom0.x) * t, y: bottom0.y + (top0.y - bottom0.y) * t };
      const b = { x: bottom1.x + (top1.x - bottom1.x) * t, y: bottom1.y + (top1.y - bottom1.y) * t };
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  /** A target ring: glowing torus drawn as two ellipses, facing the plane. */
  function drawRing(ring, z, camX, camY, camZ) {
    const projected = project(ring.x, ring.y, z, camX, camY, camZ);
    if (!projected) return;
    const radius = projected.scale * ring.r;
    if (radius < 1.5) return;
    context.lineWidth = Math.max(2, radius * 0.26);
    context.strokeStyle = PALETTE.ringGlow;
    context.globalAlpha = 0.5;
    context.beginPath();
    context.ellipse(projected.x, projected.y, radius * 1.12, radius * 1.12, 0, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.lineWidth = Math.max(2, radius * 0.13);
    context.strokeStyle = PALETTE.ring;
    context.beginPath();
    context.ellipse(projected.x, projected.y, radius, radius, 0, 0, Math.PI * 2);
    context.stroke();
  }

  /** A rock spire: a dark stone tooth rising from the canyon floor. */
  function drawSpire(spire, segment, camX, camY, camZ) {
    const base = project(spire.x, segment.floorY, segment.z, camX, camY, camZ);
    const top = project(spire.x, spire.top, segment.z, camX, camY, camZ);
    if (!base || !top) return;
    const half = base.scale * spire.r;
    context.fillStyle = PALETTE.spire;
    context.beginPath();
    context.moveTo(base.x - half, base.y);
    context.lineTo(top.x, top.y);
    context.lineTo(base.x + half, base.y);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.wallLight;
    context.beginPath();
    context.moveTo(base.x, base.y);
    context.lineTo(top.x, top.y);
    context.lineTo(base.x + half, base.y);
    context.closePath();
    context.fill();
  }

  /** A fuel cell: a small bright diamond that bobs above the floor. */
  function drawCell(cell, z, camX, camY, camZ, time) {
    const bob = Math.sin(time * 3 + z * 0.01) * 0.8;
    const projected = project(cell.x, cell.y + bob, z, camX, camY, camZ);
    if (!projected) return;
    const size = Math.max(2, projected.scale * 2.4);
    context.fillStyle = PALETTE.cell;
    context.beginPath();
    context.moveTo(projected.x, projected.y - size);
    context.lineTo(projected.x + size * 0.7, projected.y);
    context.lineTo(projected.x, projected.y + size);
    context.lineTo(projected.x - size * 0.7, projected.y);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255, 210, 62, 0.25)';
    context.beginPath();
    context.arc(projected.x, projected.y, size * 1.8, 0, Math.PI * 2);
    context.fill();
  }

  /** The plane, drawn in screen space from behind and above, banked and
   * pitched, with glowing wingtip lights and twin exhausts. */
  function drawPlane(state) {
    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.62;
    const size = 1 + state.speed / 900;
    context.save();
    context.translate(cx, cy);
    context.rotate((state.bank * Math.PI) / 180);
    context.scale(size, size);

    // Contrails: two fading lines streaming back from the wingtips.
    context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    context.lineWidth = 2;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 62, 6);
      context.lineTo(side * 84, 66);
      context.stroke();
    }

    // Wings: long swept trapezoids, orange tips, dark roots.
    for (const side of [-1, 1]) {
      context.fillStyle = PALETTE.planeBody;
      context.beginPath();
      context.moveTo(side * 8, -6);
      context.lineTo(side * 88, 26);
      context.lineTo(side * 80, 40);
      context.lineTo(side * 6, 12);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.planeTrim;
      context.beginPath();
      context.moveTo(side * 74, 22);
      context.lineTo(side * 88, 26);
      context.lineTo(side * 80, 40);
      context.lineTo(side * 70, 35);
      context.closePath();
      context.fill();
    }

    // Fuselage: a tapered body from the nose (up-screen) to the tail.
    const body = context.createLinearGradient(0, -72, 0, 34);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.6, PALETTE.planeBody);
    body.addColorStop(1, '#cfc8ba');
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(0, -74);
    context.quadraticCurveTo(13, -40, 11, 6);
    context.quadraticCurveTo(10, 26, 6, 32);
    context.lineTo(-6, 32);
    context.quadraticCurveTo(-10, 26, -11, 6);
    context.quadraticCurveTo(-13, -40, 0, -74);
    context.fill();

    // Canopy: a lit blue teardrop the pilot looks out of.
    context.fillStyle = PALETTE.canopy;
    context.beginPath();
    context.ellipse(0, -38, 6.5, 15, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.75)';
    context.beginPath();
    context.ellipse(-2, -44, 2.2, 6, -0.3, 0, Math.PI * 2);
    context.fill();

    // Orange cheatline down the fuselage, and the tail fin.
    context.fillStyle = PALETTE.planeTrim;
    context.fillRect(-1.5, -20, 3, 44);
    context.beginPath();
    context.moveTo(0, 12);
    context.lineTo(9, 34);
    context.lineTo(-9, 34);
    context.closePath();
    context.fillStyle = PALETTE.planeDark;
    context.beginPath();
    context.moveTo(0, 10);
    context.lineTo(7, 32);
    context.lineTo(-7, 32);
    context.closePath();
    context.fill();

    // Twin exhausts, glowing with the throttle.
    context.fillStyle = '#ffb347';
    context.beginPath();
    context.arc(-5, 34, 3.2, 0, Math.PI * 2);
    context.arc(5, 34, 3.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /** A small labelled instrument box, drawn with a lit border. */
  function instrument(x, y, width, label, value, unit, warn) {
    context.fillStyle = 'rgba(10, 8, 20, 0.55)';
    context.fillRect(x, y, width, 58);
    context.strokeStyle = warn ? PALETTE.hudWarn : 'rgba(234, 246, 255, 0.5)';
    context.lineWidth = 1.5;
    context.strokeRect(x + 0.5, y + 0.5, width - 1, 57);
    text(label, x + 10, y + 17, 12, PALETTE.hudDim, 'left', '600');
    text(value, x + 10, y + 46, 26, warn ? PALETTE.hudWarn : PALETTE.hud, 'left', '700');
    if (unit) text(unit, x + width - 10, y + 46, 13, PALETTE.hudDim, 'right', '600');
  }

  function bar(x, y, width, height, fraction, fill, label) {
    context.fillStyle = 'rgba(10, 8, 20, 0.55)';
    context.fillRect(x, y, width, height);
    context.fillStyle = fill;
    context.fillRect(x + 2, y + 2, (width - 4) * Math.max(0, Math.min(1, fraction)), height - 4);
    text(label, x, y - 6, 12, PALETTE.hudDim, 'left', '600');
  }

  /** The artificial horizon: a small dial that rolls with the bank. */
  function horizonDial(x, y, radius, bank, pitch) {
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#3d6a8e';
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.translate(x, y);
    context.rotate((bank * Math.PI) / 180);
    context.translate(0, pitch * 0.9);
    context.fillStyle = '#8a6a3f';
    context.fillRect(-radius, 0, radius * 2, radius);
    context.fillStyle = '#eaf6ff';
    context.fillRect(-radius, -1, radius * 2, 2);
    context.restore();
    context.strokeStyle = 'rgba(234, 246, 255, 0.7)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.hudWarn;
    context.beginPath();
    context.moveTo(x, y - radius + 4);
    context.lineTo(x - 5, y - radius + 12);
    context.lineTo(x + 5, y - radius + 12);
    context.closePath();
    context.fill();
  }

  function drawHud(state, track) {
    const altitude = Math.max(0, Math.round((state.y - track.floorAt(state.z)) * 32.8));
    const speed = Math.round(state.speed * 1.944);
    const heading = String(Math.round(state.heading)).padStart(3, '0');
    instrument(20, 16, 150, 'ALTITUDE', String(altitude), 'FT', altitude < 120);
    instrument(180, 16, 150, 'AIRSPEED', String(speed), 'KT', false);
    instrument(340, 16, 130, 'HEADING', heading, '°', false);

    text(LEGS[state.leg], FIELD.width / 2, 34, 16, PALETTE.hudDim, 'center', '600');
    text(`RINGS ${state.rings}/${state.ringsTotal}`, FIELD.width / 2, 58, 20, PALETTE.ringGlow, 'center', '700');

    text('SCORE', FIELD.width - 200, 33, 12, PALETTE.hudDim, 'right', '600');
    text(String(Math.floor(state.score)), FIELD.width - 20, 62, 30, PALETTE.hud, 'right', '700');

    // Next ring: an arrow and a distance, so the pilot always knows where
    // the next gate is.
    const next = nextRing(track, state.z);
    if (next) {
      const dx = next.ring.x - state.x;
      const dy = next.ring.y - state.y;
      const angle = Math.atan2(dy, dx);
      const ax = FIELD.width / 2 + Math.cos(angle) * 150;
      const ay = FIELD.height * 0.62 + Math.sin(angle) * 110;
      context.fillStyle = PALETTE.ringGlow;
      context.beginPath();
      context.moveTo(ax + Math.cos(angle) * 14, ay + Math.sin(angle) * 14);
      context.lineTo(ax + Math.cos(angle + 2.6) * 10, ay + Math.sin(angle + 2.6) * 10);
      context.lineTo(ax + Math.cos(angle - 2.6) * 10, ay + Math.sin(angle - 2.6) * 10);
      context.closePath();
      context.fill();
      const metres = Math.max(0, Math.round(next.z - state.z));
      text(metres + ' m', FIELD.width / 2, FIELD.height * 0.62 - 108, 15, PALETTE.ringGlow, 'center', '700');
    }

    bar(20, FIELD.height - 58, 210, 14, state.fuel / PLANE.fuelMax,
      state.fuel < 20 ? PALETTE.hudWarn : PALETTE.hudGood, 'FUEL');
    bar(20, FIELD.height - 30, 210, 14, state.hull / PLANE.hull,
      state.hull === 1 ? PALETTE.hudWarn : PALETTE.hudGood, 'HULL');
    bar(FIELD.width - 230, FIELD.height - 58, 210, 14, state.throttle,
      PALETTE.hud, 'THROTTLE');
    horizonDial(FIELD.width - 92, FIELD.height - 116, 30, state.bank, state.pitch);

    // A message from the flight model, centred and impossible to miss.
    if (state.messageTimer > 0 && state.message) {
      const warn = state.message.startsWith('LOW') || state.message.startsWith('PULL')
        || state.message.startsWith('TERRAIN') || state.message.startsWith('RUNWAY')
        || state.message.startsWith('RAN OUT')
        || state.message.includes('SCRAPE') || state.message.includes('STRIKE');
      text(state.message, FIELD.width / 2, 118, 24, warn ? PALETTE.hudWarn : PALETTE.ringGlow, 'center', '700');
    }
  }

  /** The next unpassed ring ahead of the plane, if there is one. */
  function nextRing(track, z) {
    const start = Math.floor(z / SEG_LEN);
    for (let index = start; index < track.count; index += 1) {
      const segment = track.segments[index];
      if (segment.ring && !segment.ring.passed) return { ring: segment.ring, z: segment.z };
    }
    return null;
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, PANEL.width - 2, height - 2);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.hud, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.hudDim, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 22, PALETTE.ringGlow, 'center', '700');
  }

  const TITLE_LINES = [
    'Thread the rings. Mind the walls. Mind the fuel.',
    'Three legs: canyon run, ridge storm, final approach.',
    'Steer with ← → or A D, climb and dive with ↑ ↓.',
    'Throttle with Shift and Ctrl, brake with B, pause with P.',
    '',
  ];
  const PAUSED_LINES = ['The canyon will wait for you.'];
  const OVER_LINES = ['', '', ''];

  /** Paint one frame: sky, canyon, plane, HUD, and the panel for the screen. */
  function draw(state, track, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    const camZ = state.z - CAMERA.behind;
    const camX = state.x;
    const camY = state.y + CAMERA.above;

    // The world rolls a little with the bank, so a turn feels like a turn.
    context.save();
    context.translate(FIELD.width / 2, FIELD.height * 0.62);
    context.rotate((-state.bank * Math.PI) / 180 * 0.22);
    context.translate(-FIELD.width / 2, -FIELD.height * 0.62);
    drawSky(state);
    drawRidge(farRidge, -state.heading * 1.4, PALETTE.mountainFar);
    drawRidge(nearRidge, -state.heading * 3.2, PALETTE.mountainNear);
    drawClouds(state, camZ);

    // Canyon floor under everything: the ground right below the camera has
    // no segment of its own, so without this the bottom of the frame would
    // show the ridge silhouettes through the floor.
    context.fillStyle = PALETTE.ground;
    context.fillRect(0, HORIZON, FIELD.width, FIELD.height - HORIZON);

    const first = Math.max(0, Math.floor(state.z / SEG_LEN));
    for (let index = first + DRAW_AHEAD; index >= first; index -= 1) {
      const segment = track.segments[index];
      if (!segment) continue;
      drawSegment(segment, track.segments[index + 1] || null, camX, camY, camZ);
    }
    for (let index = first + DRAW_AHEAD; index >= first; index -= 1) {
      const segment = track.segments[index];
      if (!segment) continue;
      if (segment.ring && !segment.ring.passed) drawRing(segment.ring, segment.z, camX, camY, camZ);
      if (segment.spire) drawSpire(segment.spire, segment, camX, camY, camZ);
      if (segment.cell && !segment.cell.taken) drawCell(segment.cell, segment.z, camX, camY, camZ, state.time);
    }
    context.restore();

    // Golden-hour haze: the far canyon melts into the sunset, the near
    // ground stays sharp. Drawn over the world, under the plane and HUD.
    const haze = context.createLinearGradient(0, HORIZON - 40, 0, FIELD.height);
    haze.addColorStop(0, 'rgba(226, 112, 58, 0.42)');
    haze.addColorStop(0.5, 'rgba(226, 112, 58, 0.12)');
    haze.addColorStop(1, 'rgba(226, 112, 58, 0)');
    context.fillStyle = haze;
    context.fillRect(0, HORIZON - 40, FIELD.width, FIELD.height - HORIZON + 40);

    drawPlane(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = 'Best ' + best;
      drawPanel('RIDGE RUNNER', TITLE_LINES, 'Press Space or click to fly');
      return;
    }
    drawHud(state, track);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      if (state.status === 'landed') {
        OVER_LINES[0] = 'Landed on the runway. Score ' + Math.floor(state.score);
        OVER_LINES[1] = 'Rings ' + state.rings + ' of ' + state.ringsTotal + '  ·  Best ' + best;
        OVER_LINES[2] = '';
        drawPanel('MISSION COMPLETE', OVER_LINES, 'Press Space or click to fly again');
      } else {
        OVER_LINES[0] = state.message || 'Crashed.';
        OVER_LINES[1] = 'Score ' + Math.floor(state.score) + '  ·  Rings ' + state.rings + ' of ' + state.ringsTotal;
        OVER_LINES[2] = 'Best ' + best;
        drawPanel('CRASHED', OVER_LINES, 'Press Space or click to fly again');
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
