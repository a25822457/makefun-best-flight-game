// Keyboard and pointer input. Held keys give steering, pitch and throttle;
// one-shot presses (start or restart, pause, brake) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost
// and never counted twice. The mouse steers too: holding the left button
// and moving it banks the plane toward the pointer.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_BRAKE = 4;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const BRAKE = new Set(['KeyB']);

export function createInput(target) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  let pointerSteer = 0;
  let pointerActive = false;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (BRAKE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_BRAKE;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur, and stop the mouse steering with it.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    throttleUp = false;
    throttleDown = false;
    pointerActive = false;
    pointerSteer = 0;
  });

  target.addEventListener('pointerdown', (event) => {
    pointerActive = true;
    pointerSteer = (event.clientX / window.innerWidth) * 2 - 1;
  });
  target.addEventListener('pointermove', (event) => {
    if (pointerActive) pointerSteer = (event.clientX / window.innerWidth) * 2 - 1;
  });
  target.addEventListener('pointerup', () => {
    pointerActive = false;
    pointerSteer = 0;
  });
  target.addEventListener('pointercancel', () => {
    pointerActive = false;
    pointerSteer = 0;
  });

  return {
    /** Steering -1 (left) to 1 (right): keys first, then the mouse. */
    steer() {
      if (pointerActive) return Math.max(-1, Math.min(1, pointerSteer * 1.4));
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** Pitch -1 (dive) to 1 (climb): up is climb, down is dive. */
    pitch() {
      return (up ? 1 : 0) - (down ? 1 : 0);
    },
    /** Throttle steps held by Shift (up) and Ctrl (down). */
    throttleStep() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True while the pilot is steering with the mouse. */
    pointerSteering() {
      return pointerActive;
    },
  };
}
