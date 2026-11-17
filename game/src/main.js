// Sunset Keys — entry point. Builds the world, runs the frame loop, saves
// progress to localStorage, and exposes a small hook for the headless
// screenshot and play-test drivers (window.__game, ?shot= / ?seed=).

import { WORLD, PLAYER } from './config.js';
import { createWorld, PLACES } from './world.js';
import { createRandom } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createTraffic, stepTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { stepGame } from './simulate.js';
import { render } from './render.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'sunset-keys-save-v1';
const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shotName = params.get('shot');

export function createGame(seed) {
  const random = createRandom(seed);
  const world = createWorld(random);
  const traffic = createTraffic(world, random);
  const police = createPolice();
  const missions = createMissions();
  const audio = createAudio();

  // A few beat cops on foot, and five pedestrians who want a taxi.
  const peds = traffic.peds;
  for (let i = 0; i < 4 && peds.length > 0; i++) {
    const ped = peds[random.int(0, peds.length - 1)];
    ped.kind = 'cop';
    ped.color = '#1f3a93';
  }
  let taxiCount = 0;
  let guard = 0;
  while (taxiCount < 5 && guard++ < 200) {
    const ped = peds[random.int(0, peds.length - 1)];
    if (ped.kind !== 'cop' && !ped.wantTaxi) {
      ped.wantTaxi = true;
      taxiCount++;
    }
  }

  // Cash pickups scattered along the roads.
  const cash = [];
  for (let i = 0; i < 8; i++) {
    const spot = world.nearestRoadPoint(
      random.range(0, WORLD.WIDTH),
      random.range(0, WORLD.HEIGHT),
    );
    cash.push({
      x: spot.x + random.range(-60, 60),
      y: spot.y + random.range(-60, 60),
      value: random.int(10, 25),
      taken: false,
    });
  }

  const state = {
    seed,
    time: 17.2, // golden hour, just before sunset
    money: 0,
    player: {
      x: PLACES.plaza.x, y: PLACES.plaza.y,
      angle: 0, speed: 0,
      onFoot: true, carId: null,
      health: PLAYER.HEALTH,
    },
    cars: traffic.cars,
    parked: traffic.parked,
    peds: traffic.peds,
    police,
    missions,
    cash,
    taxi: null,
    banners: [],
    particles: [],
    flags: {
      carStolen: false, stolenSound: false, crashSound: false,
      pickupSound: false, punchSound: false,
      missionJingle: false, bustedSound: false,
    },
    stats: { stolen: 0, earned: 0 },
    crashFlash: 0,
    started: false,
    busted: false,
    wasted: false,
  };

  const sys = {
    world,
    random,
    audio,
    trafficStep: (st, sy, dt) => stepTraffic(
      { cars: st.cars, parked: st.parked, peds: st.peds },
      world, random, dt,
    ),
  };
  return { state, sys };
}

function saveGame(state) {
  if (shotName) return; // staged screenshots are not progress
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      missionsIndex: state.missions.index,
      time: state.time,
      player: { x: state.player.x, y: state.player.y, health: state.player.health },
    }));
  } catch (e) { /* storage unavailable — the game still runs */ }
}

function loadGame(state) {
  if (shotName) return;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const save = JSON.parse(raw);
    if (typeof save.money === 'number') state.money = save.money;
    if (typeof save.missionsIndex === 'number') state.missions.index = save.missionsIndex;
    if (typeof save.time === 'number') state.time = save.time;
    if (save.player) {
      state.player.x = save.player.x;
      state.player.y = save.player.y;
      if (typeof save.player.health === 'number') state.player.health = save.player.health;
    }
  } catch (e) { /* a bad save never blocks the game */ }
}

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const { state, sys } = createGame(seed);
  loadGame(state);
  const input = createInput();

  if (shotName) {
    applyShot(state, sys, shotName);
    state.started = true;
  }

  window.__game = { state, sys };
  window.__shotReady = false;

  let last = performance.now();
  let saveTimer = 0;
  let frames = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (input.startPressed() && (!state.started || state.busted || state.wasted)) {
      if (state.busted || state.wasted) {
        state.busted = false;
        state.wasted = false;
      }
      state.started = true;
      sys.audio.unlock();
      sys.audio.music(true);
    }
    if (input.mutePressed()) sys.audio.setMuted(input.isMuted());
    if (state.started && !state.busted && !state.wasted) {
      stepGame(state, sys, input, dt);
    }
    input.endFrame();
    render(ctx, state, sys);
    frames++;
    if (frames === 3) window.__shotReady = true;
    saveTimer += dt;
    if (saveTimer > 5) {
      saveTimer = 0;
      saveGame(state);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
