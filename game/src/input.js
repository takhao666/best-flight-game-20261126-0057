// Keyboard and mouse input. Held keys steer; one-shot presses (start, pause, view,
// mute) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_VIEW = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']); // arcade style: up = climb
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const VIEW = new Set(['KeyC', 'KeyV']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let left = false;
  let right = false;
  let pitchUp = false;
  let pitchDown = false;
  let thrUp = false;
  let thrDown = false;
  let actions = 0;
  // Mouse steer: hold the button and drag; the pointer offset from the grab point steers.
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;
  let grabX = 0;
  let grabY = 0;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (THROTTLE_UP.has(event.code)) thrUp = true;
    else if (THROTTLE_DOWN.has(event.code)) thrDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (VIEW.has(event.code)) {
      if (!event.repeat) actions |= ACTION_VIEW;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (THROTTLE_UP.has(event.code)) thrUp = false;
    else if (THROTTLE_DOWN.has(event.code)) thrDown = false;
  });
  window.addEventListener('blur', () => {
    left = right = pitchUp = pitchDown = thrUp = thrDown = false;
    mouseDown = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    grabX = event.clientX;
    grabY = event.clientY;
    mouseX = 0;
    mouseY = 0;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
    mouseX = 0;
    mouseY = 0;
  });
  window.addEventListener('pointermove', (event) => {
    if (!mouseDown) return;
    mouseX = (event.clientX - grabX) / 120;
    mouseY = (event.clientY - grabY) / 120;
  });

  function clamp(v) {
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  return {
    /** Steering in [-1, 1]: bank (left negative), pitch (up positive), throttle delta. */
    steering() {
      const bank = clamp((right ? 1 : 0) - (left ? 1 : 0) + mouseX);
      const pitch = clamp((pitchUp ? 1 : 0) - (pitchDown ? 1 : 0) - mouseY);
      const throttleDelta = (thrUp ? 1 : 0) - (thrDown ? 1 : 0);
      return { bank, pitch, throttleDelta };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
