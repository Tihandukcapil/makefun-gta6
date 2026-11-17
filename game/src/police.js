// The Marisol Bay police: a wanted level from heat, cop cars that chase the
// player, roadblocks at high heat, and bust / wasted when the player is
// caught or their health runs out. Police cars take ids from 1000 up, so
// they can never collide with traffic or parked car ids.

import { WORLD, COP, WANTED, PALETTE } from './config.js';

let nextCopId = 1000;

export function createPolice() {
  return { wanted: 0, heat: 0, cops: [] };
}

export function addHeat(police, amount) {
  police.heat = Math.min(WANTED.MAX * WANTED.PER_STAR, police.heat + amount);
  police.wanted = Math.min(WANTED.MAX, Math.floor(police.heat / WANTED.PER_STAR));
}

export function decayHeat(police, dt) {
  if (police.heat <= 0) return;
  police.heat = Math.max(0, police.heat - WANTED.DECAY * dt);
  police.wanted = Math.min(WANTED.MAX, Math.floor(police.heat / WANTED.PER_STAR));
}

function spawnCop(police, world, random, player) {
  // Cops arrive from the edge nearest the player, or from Police HQ.
  const fromHq = random.chance(0.4);
  let x;
  let y;
  if (fromHq) {
    x = world.places.police.x + random.range(-80, 80);
    y = world.places.police.y + random.range(-80, 80);
  } else {
    const edge = random.int(0, 3);
    if (edge === 0) { x = random.range(0, WORLD.WIDTH); y = 60; }
    else if (edge === 1) { x = random.range(0, WORLD.WIDTH); y = WORLD.HEIGHT - 60; }
    else if (edge === 2) { x = 60; y = random.range(0, WORLD.HEIGHT); }
    else { x = WORLD.WIDTH - 60; y = random.range(0, WORLD.HEIGHT); }
  }
  police.cops.push({
    id: nextCopId++,
    kind: 'cop',
    x, y,
    angle: Math.atan2(player.y - y, player.x - x),
    speed: 0,
    color: PALETTE.COP_CAR,
    ramCooldown: 0,
    roadblock: false,
  });
}

export function stepPolice(police, world, random, state, dt) {
  const player = state.player;
  // How many cops the wanted level calls for.
  const wanted = police.wanted;
  const target = wanted === 0 ? 0 : wanted + 1;
  while (police.cops.length < target) spawnCop(police, world, random, player);
  while (police.cops.length > target) police.cops.pop();

  for (const cop of police.cops) {
    if (cop.ramCooldown > 0) cop.ramCooldown -= dt;
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.angle += Math.max(-COP.TURN_RATE * dt, Math.min(COP.TURN_RATE * dt, diff));
    // Cops ease off at very close range so they ram instead of orbiting.
    const cruise = dist > 120 ? COP.MAX_SPEED : COP.MAX_SPEED * 0.55;
    cop.speed += Math.sign(cruise - cop.speed) * COP.ACCEL * dt;
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    cop.x = Math.max(30, Math.min(WORLD.WIDTH - 30, cop.x));
    cop.y = Math.max(30, Math.min(WORLD.HEIGHT - 30, cop.y));
  }

  // At 3+ stars the heat stays: cops do not give up while the player runs.
  if (wanted >= 3) police.heat = Math.max(police.heat, WANTED.PER_STAR * 3);
}

// True when a cop is close enough to bust a player on foot.
export function bustCheck(police, player) {
  if (player.onFoot === false) return false;
  for (const cop of police.cops) {
    if (Math.hypot(cop.x - player.x, cop.y - player.y) < 44) return true;
  }
  return false;
}
