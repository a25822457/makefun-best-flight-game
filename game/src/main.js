// Boot and the one loop: input is read every frame, the flight advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over (crashed or landed).
//
// ?seed=N fixes the canyon. ?shot=start|play|storm|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, PLANE, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTrack } from './track.js';
import { createFlight, EVENT_HIT, EVENT_LANDED, EVENT_OVER, EVENT_RING, EVENT_CELL } from './flight.js';
import { ACTION_BRAKE, ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
/** Throttle steps per second while Shift or Ctrl is held. */
const THROTTLE_RATE = 0.55;
/** The throttle a new flight starts at. */
const START_THROTTLE = 0.65;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const track = createTrack(random);
const flight = createFlight(track);
const renderer = createRenderer(canvas, createRandom(seed ^ 0x9e3779b9));
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, track, flight);
  let painted = 0;
  function paint() {
    renderer.draw(flight.state, track, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let throttle = START_THROTTLE;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    flight.reset();
    throttle = START_THROTTLE;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Flying. Thread the rings, mind the walls, mind the fuel.');
  }

  function endGame(landed) {
    screen = SCREEN_OVER;
    const score = Math.floor(flight.state.score);
    if (score > best) {
      best = score;
      saveBest(best);
    }
    announce(landed ? `Landed. Score ${score}. Best ${best}.` : `Crashed. Score ${score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function control(dt, actions) {
    throttle = Math.max(0, Math.min(1, throttle + input.throttleStep() * THROTTLE_RATE * dt));
    return {
      steer: input.steer(),
      pitch: input.pitch(),
      throttle,
      brake: Boolean(actions & ACTION_BRAKE),
    };
  }

  function step(dt, actions) {
    if (screen === SCREEN_TITLE) {
      flight.step(dt, { steer: 0, pitch: 0, throttle: 0.55, brake: false }, true);
      return;
    }
    const events = flight.step(dt, control(dt, actions), false);
    audio.engine(throttle, flight.state.speed / PLANE.maxSpeed);
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring ${flight.state.rings} of ${flight.state.ringsTotal}. Score ${Math.floor(flight.state.score)}.`);
    }
    if (events & EVENT_CELL) audio.cell();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_OVER) {
      audio.crash();
      endGame(false);
    } else if (events & EVENT_LANDED) {
      audio.land();
      endGame(true);
    }
    if (flight.state.fuel < 20 && flight.state.fuel > 0) audio.alarm(dt);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(STEP, actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(flight.state, track, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the canyon
  // fly past unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ridge Runner. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
