// Keyboard input: WASD or arrows to move/drive, E to interact (steal a car,
// enter/exit), Space to punch, Shift for the handbrake. Interact and attack
// are edge-triggered — holding the key does not repeat them.

import { ACTION } from './config.js';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyE: 'interact',
  Space: 'attack',
  ShiftLeft: 'handbrake', ShiftRight: 'handbrake',
  KeyM: 'mute',
  Enter: 'start',
};

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  let muted = false;

  function onKeyDown(event) {
    const name = KEYMAP[event.code];
    if (!name) return;
    if (['up', 'down', 'left', 'right', 'attack'].includes(name)) event.preventDefault();
    if (!held.has(name)) pressed.add(name);
    held.add(name);
  }
  function onKeyUp(event) {
    held.delete(KEYMAP[event.code]);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    // Direction vector, normalised, from the held movement keys.
    dir() {
      let x = 0;
      let y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    // Bitmask of the held actions (interact/attack are consumed on read).
    actions() {
      let mask = 0;
      if (pressed.has('interact')) mask |= ACTION.INTERACT;
      if (pressed.has('attack')) mask |= ACTION.ATTACK;
      if (held.has('handbrake')) mask |= ACTION.HANDBRAKE;
      return mask;
    },
    // Call once per frame after reading actions(): clears the edge triggers.
    endFrame() {
      pressed.clear();
    },
    startPressed() {
      return pressed.has('start');
    },
    mutePressed() {
      if (pressed.has('mute')) { muted = !muted; return true; }
      return false;
    },
    isMuted() {
      return muted;
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}
