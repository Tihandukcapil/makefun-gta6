// The simulation step: everything that moves, collides, pays or hurts in
// one frame. Player on foot or in a car, traffic, police, missions, cash
// pickups and taxi fares all meet here.

import { PLAYER, CAR, COP, ACTION, WANTED, CLOCK } from './config.js';
import { PLACES } from './world.js';
import { nearestParked, nearestPed } from './traffic.js';
import { addHeat, decayHeat, stepPolice, bustCheck } from './police.js';
import { stepMissions } from './missions.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function findPlayerCar(state) {
  if (state.player.carId === null) return null;
  for (const car of state.cars) {
    if (car.id === state.player.carId) return car;
  }
  return null;
}

export function spawnParticles(state, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 120;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      color, life: 0.5 + Math.random() * 0.4, t: 0,
    });
  }
}

function pushBanner(state, text, sub, dur) {
  state.banners.push({ text, sub: sub || '', t: 0, dur: dur || 2.5 });
}

function stepPlayerOnFoot(state, sys, input, dt) {
  const player = state.player;
  const dir = input.dir();
  const px = player.x;
  const py = player.y;
  const nx = px + dir.x * PLAYER.WALK_SPEED * dt;
  const ny = py + dir.y * PLAYER.WALK_SPEED * dt;
  if (dir.x !== 0 || dir.y !== 0) player.angle = Math.atan2(dir.y, dir.x);
  // Axis-separated collision: slide along a wall instead of sticking to it.
  if (!sys.world.isBlocked(nx, ny, PLAYER.RADIUS)) {
    player.x = nx;
    player.y = ny;
  } else if (!sys.world.isBlocked(px, ny, PLAYER.RADIUS)) {
    player.y = ny;
  } else if (!sys.world.isBlocked(nx, py, PLAYER.RADIUS)) {
    player.x = nx;
  }
  player.x = clamp(player.x, 20, sys.world.width - 20);
  player.y = clamp(player.y, 20, sys.world.height - 20);

  if (input.actions() & ACTION.INTERACT) {
    const car = nearestParked(state.parked, player.x, player.y, PLAYER.INTERACT_RANGE);
    if (car) {
      const index = state.parked.indexOf(car);
      if (index !== -1) state.parked.splice(index, 1);
      car.kind = 'player';
      car.color = '#ff5d8f';
      state.cars.push(car);
      player.carId = car.id;
      player.onFoot = false;
      player.speed = 0;
      player.angle = car.angle;
      player.x = car.x;
      player.y = car.y;
      addHeat(state.police, WANTED.PER_STAR);
      state.flags.carStolen = true;
      state.flags.stolenSound = true;
      state.stats.stolen = (state.stats.stolen || 0) + 1;
      pushBanner(state, 'CAR STOLEN', 'The owner called it in — 1 star');
      spawnParticles(state, car.x, car.y, '#ff5d8f', 8);
    }
  }

  if (input.actions() & ACTION.ATTACK) {
    const ped = nearestPed(state.peds, player.x, player.y, PLAYER.PUNCH_RANGE);
    if (ped) {
      ped.flee = 3;
      ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);
      addHeat(state.police, ped.kind === 'cop' ? WANTED.PER_STAR * 2 : 6);
      state.flags.punchSound = true;
      spawnParticles(state, ped.x, ped.y, '#ffffff', 6);
      if (ped.kind === 'cop') pushBanner(state, 'YOU HIT A COP', 'Wanted level up');
    }
  }
}

function stepPlayerInCar(state, sys, input, dt) {
  const player = state.player;
  const car = findPlayerCar(state);
  if (!car) {
    player.onFoot = true;
    player.carId = null;
    return;
  }
  // Safety net: a collision can shove a car inside a building; without an
  // eject the building check would revert every move and trap it forever.
  if (sys.world.isBlocked(car.x, car.y, CAR.RADIUS)) {
    const out = sys.world.resolveBlocked(car.x, car.y, CAR.RADIUS);
    car.x = out.x;
    car.y = out.y;
    car.speed = 0;
  }
  const dir = input.dir();
  const prevX = car.x;
  const prevY = car.y;
  const prevSpeed = car.speed;
  if (dir.y < 0) car.speed += CAR.ACCEL * dt;
  else if (dir.y > 0) {
    if (car.speed > 20) car.speed -= CAR.BRAKE * dt;
    else car.speed = Math.max(-CAR.MAX_REVERSE, car.speed - CAR.REVERSE_ACCEL * dt);
  } else {
    car.speed -= car.speed * CAR.DRAG * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  if (input.actions() & ACTION.HANDBRAKE) car.speed -= car.speed * 2.2 * dt;
  car.speed = clamp(car.speed, -CAR.MAX_REVERSE, CAR.MAX_SPEED);
  const steer = dir.x * CAR.TURN_RATE * dt * clamp(Math.abs(car.speed) / 220, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = car.speed;

  // Buildings stop cars hard.
  if (sys.world.isBlocked(car.x, car.y, CAR.RADIUS)) {
    car.x = prevX;
    car.y = prevY;
    player.x = prevX;
    player.y = prevY;
    if (Math.abs(prevSpeed) > 260) {
      player.health -= 6;
      state.crashFlash = Math.max(state.crashFlash, 0.5);
      state.flags.crashSound = true;
      spawnParticles(state, car.x, car.y, '#ffb347', 10);
    }
    car.speed *= 0.4;
  }

  // Other cars: push apart, damage only on a real impact.
  for (const other of state.cars) {
    if (other === car || other.kind === 'player') continue;
    const dx = car.x - other.x;
    const dy = car.y - other.y;
    const d = Math.hypot(dx, dy);
    const minD = CAR.RADIUS * 2 + 4;
    if (d > 0 && d < minD) {
      const closing = Math.abs(car.speed - other.speed);
      const push = (minD - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      car.x += nx * push;
      car.y += ny * push;
      other.x -= nx * push;
      other.y -= ny * push;
      // A push must never shove a car inside a building — that traps it.
      if (sys.world.isBlocked(car.x, car.y, CAR.RADIUS)) {
        car.x -= nx * push;
        car.y -= ny * push;
      }
      if (sys.world.isBlocked(other.x, other.y, CAR.RADIUS)) {
        other.x += nx * push;
        other.y += ny * push;
      }
      if (closing > CAR.IMPACT_SPEED) {
        player.health -= CAR.IMPACT_DAMAGE;
        state.crashFlash = Math.max(state.crashFlash, 0.4);
        state.flags.crashSound = true;
        spawnParticles(state, car.x, car.y, '#ffb347', 8);
      }
    }
  }

  // Pedestrians in the way get knocked aside — and the law notices.
  for (const ped of state.peds) {
    const dx = car.x - ped.x;
    const dy = car.y - ped.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < CAR.RADIUS + 12 && Math.abs(car.speed) > 40) {
      ped.flee = 3;
      ped.timer = 3;
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * 30;
      ped.y += (dy / d) * 30;
      if (ped.kind === 'cop') {
        addHeat(state.police, WANTED.PER_STAR * 2);
        pushBanner(state, 'YOU HIT A COP', 'Wanted level up');
      } else {
        addHeat(state.police, WANTED.PER_STAR * 0.4);
      }
      state.flags.crashSound = true;
      spawnParticles(state, ped.x, ped.y, '#ffffff', 6);
    }
  }

  // Cop cars ram the player: impact-only damage with a cooldown each.
  for (const cop of state.police.cops) {
    const dx = car.x - cop.x;
    const dy = car.y - cop.y;
    const d = Math.hypot(dx, dy);
    const minD = CAR.RADIUS + COP.RADIUS + 2;
    if (d > 0 && d < minD) {
      const closing = Math.abs(car.speed - cop.speed);
      const push = (minD - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      car.x += nx * push;
      car.y += ny * push;
      cop.x -= nx * push;
      cop.y -= ny * push;
      // A ram must never shove the player inside a building — that traps it.
      if (sys.world.isBlocked(car.x, car.y, CAR.RADIUS)) {
        car.x -= nx * push;
        car.y -= ny * push;
      }
      if (closing > CAR.IMPACT_SPEED && cop.ramCooldown <= 0) {
        player.health -= COP.RAM_DAMAGE;
        cop.ramCooldown = COP.RAM_COOLDOWN;
        state.crashFlash = Math.max(state.crashFlash, 0.4);
        state.flags.crashSound = true;
        spawnParticles(state, car.x, car.y, '#7fb3ff', 8);
      }
    }
  }

  if (input.actions() & ACTION.INTERACT) {
    // Step out and leave the car where it stands.
    player.onFoot = true;
    player.carId = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    car.speed = 0;
  }
}

function stepPickupsAndTaxi(state, sys, dt) {
  const player = state.player;
  for (const cash of state.cash) {
    if (cash.taken) continue;
    const dx = player.x - cash.x;
    const dy = player.y - cash.y;
    if (dx * dx + dy * dy < 30 * 30) {
      cash.taken = true;
      state.money += cash.value;
      state.stats.earned += cash.value;
      state.flags.pickupSound = true;
      pushBanner(state, `+$${cash.value}`, 'Cash pickup');
      spawnParticles(state, cash.x, cash.y, '#ffd36a', 8);
      // A fresh pickup appears somewhere else.
      const spot = sys.world.nearestRoadPoint(
        sys.random.range(0, sys.world.width),
        sys.random.range(0, sys.world.height),
      );
      state.cash.push({
        x: spot.x + sys.random.range(-60, 60),
        y: spot.y + sys.random.range(-60, 60),
        value: sys.random.int(10, 25),
        taken: false,
      });
    }
  }
  state.cash = state.cash.filter((c) => !c.taken);

  // Taxi fares: drive up to a flagged pedestrian and they hop in.
  if (!state.taxi && !player.onFoot) {
    const ped = nearestPed(state.peds, player.x, player.y, 60);
    if (ped && ped.wantTaxi) {
      const keys = Object.keys(PLACES);
      const destKey = keys[sys.random.int(0, keys.length - 1)];
      state.taxi = { destKey, fare: sys.random.int(20, 60), timer: 60 };
      const index = state.peds.indexOf(ped);
      if (index !== -1) state.peds.splice(index, 1);
      pushBanner(state, 'TAXI FARE', `Take them to ${PLACES[destKey].label} — $${state.taxi.fare}`);
    }
  }
  if (state.taxi) {
    state.taxi.timer -= dt;
    const dest = PLACES[state.taxi.destKey];
    const dx = player.x - dest.x;
    const dy = player.y - dest.y;
    if (dx * dx + dy * dy < 130 * 130) {
      state.money += state.taxi.fare;
      state.stats.earned += state.taxi.fare;
      pushBanner(state, 'FARE PAID', `+$${state.taxi.fare}`);
      state.flags.pickupSound = true;
      state.taxi = null;
    } else if (state.taxi.timer <= 0) {
      pushBanner(state, 'FARE LOST', 'The passenger gave up waiting');
      state.taxi = null;
    }
  }
}

export function stepGame(state, sys, input, dt) {
  state.time += dt * CLOCK.HOURS_PER_SECOND;
  if (state.time >= 24) state.time -= 24;

  if (state.player.onFoot) stepPlayerOnFoot(state, sys, input, dt);
  else stepPlayerInCar(state, sys, input, dt);

  stepPickupsAndTaxi(state, sys, dt);

  sys.trafficStep(state, sys, dt);
  stepPolice(state.police, sys.world, sys.random, state, dt);
  stepMissions(state, dt);
  decayHeat(state.police, dt);

  if (state.police.wanted >= 1 && bustCheck(state.police, state.player)) {
    const fine = Math.min(state.money, 100);
    state.money -= fine;
    state.police.heat = 0;
    state.police.wanted = 0;
    state.police.cops = [];
    state.busted = true;
    state.flags.bustedSound = true;
    pushBanner(state, 'BUSTED', `Fine $${fine} — the heat is off, for now`);
  }
  if (state.player.health <= 0 && !state.wasted) {
    const fine = Math.min(state.money, 100);
    state.money -= fine;
    state.player.health = PLAYER.HEALTH;
    state.player.x = PLACES.plaza.x;
    state.player.y = PLACES.plaza.y;
    state.player.onFoot = true;
    state.player.carId = null;
    state.police.heat = 0;
    state.police.wanted = 0;
    state.police.cops = [];
    state.wasted = true;
    state.flags.bustedSound = true;
    pushBanner(state, 'WASTED', `You wake up at Plaza Marisol — $${fine} gone`);
  }

  for (const b of state.banners) b.t += dt;
  state.banners = state.banners.filter((b) => b.t < b.dur);
  for (const p of state.particles) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  state.particles = state.particles.filter((p) => p.t < p.life);
  if (state.crashFlash > 0) state.crashFlash -= dt;

  // Audio hooks.
  if (!state.player.onFoot) {
    const car = findPlayerCar(state);
    sys.audio.engine(car ? Math.abs(car.speed) / CAR.MAX_SPEED : 0);
  } else {
    sys.audio.engineOff();
  }
  sys.audio.siren(state.police.wanted >= 1);
  if (state.flags.stolenSound) { sys.audio.steal(); state.flags.stolenSound = false; }
  if (state.flags.crashSound) { sys.audio.crash(); state.flags.crashSound = false; }
  if (state.flags.pickupSound) { sys.audio.pickup(); state.flags.pickupSound = false; }
  if (state.flags.punchSound) { sys.audio.punch(); state.flags.punchSound = false; }
  if (state.flags.missionJingle) { sys.audio.missionDone(); state.flags.missionJingle = false; }
  if (state.flags.bustedSound) { sys.audio.busted(); state.flags.bustedSound = false; }
}
