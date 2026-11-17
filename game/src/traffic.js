// Traffic, parked cars and pedestrians. Traffic cars cruise their road and
// turn at intersections; pedestrians stroll the sidewalks and flee when the
// player gets violent near them. Every car id is unique: parked cars take
// ids from a counter that only ever goes up, so a parked car's id can never
// collide with a traffic car's (a collision there once let the player
// "steal" a car 900 px away).

import { WORLD, CAR, PALETTE } from './config.js';

let nextCarId = 1;

function makeCar(random, x, y, angle, kind) {
  return {
    id: nextCarId++,
    kind,
    x, y, angle,
    speed: 0,
    targetSpeed: random.range(140, 260),
    color: random.pick(PALETTE.CAR_TRAFFIC),
    // Traffic cars drive along one road axis; they may turn at crossings.
    vertical: Math.abs(Math.cos(angle)) < 0.5,
    turnAt: random.range(400, 1600),
    travelled: 0,
  };
}

export function createTraffic(world, random) {
  const cars = [];
  const parked = [];
  const peds = [];

  // Parked cars line the roads, always on a road centreline.
  for (let i = 0; i < 26; i++) {
    const road = random.pick(world.roads);
    let x;
    let y;
    let angle;
    if (road.vertical) {
      x = road.axis + (random.chance(0.5) ? -26 : 26);
      y = random.range(120, WORLD.HEIGHT - 120);
      angle = random.chance(0.5) ? -Math.PI / 2 : Math.PI / 2;
    } else {
      x = random.range(120, WORLD.WIDTH - 120);
      y = road.axis + (random.chance(0.5) ? -26 : 26);
      angle = random.chance(0.5) ? 0 : Math.PI;
    }
    if (world.isBlocked(x, y, 20)) continue;
    const car = makeCar(random, x, y, angle, 'parked');
    car.speed = 0;
    car.targetSpeed = 0;
    parked.push(car);
  }

  // Moving traffic, spread over the roads.
  for (let i = 0; i < 22; i++) {
    const road = random.pick(world.roads);
    let x;
    let y;
    let angle;
    if (road.vertical) {
      x = road.axis + (random.chance(0.5) ? -14 : 14);
      y = random.range(120, WORLD.HEIGHT - 120);
      angle = random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = random.range(120, WORLD.WIDTH - 120);
      y = road.axis + (random.chance(0.5) ? -14 : 14);
      angle = random.chance(0.5) ? 0 : Math.PI;
    }
    cars.push(makeCar(random, x, y, angle, 'traffic'));
  }

  // Pedestrians on the sidewalks and the plaza.
  for (let i = 0; i < 30; i++) {
    const spot = world.nearestRoadPoint(random.range(0, WORLD.WIDTH), random.range(0, WORLD.HEIGHT));
    peds.push({
      x: spot.x + random.range(-70, 70),
      y: spot.y + random.range(-70, 70),
      angle: random.range(0, Math.PI * 2),
      speed: random.range(28, 55),
      color: random.pick(PALETTE.PED),
      kind: 'ped',
      flee: 0,
      wander: random.range(2, 6),
    });
  }

  return { cars, parked, peds };
}

function turnAtCrossing(car, world, random) {
  // At a crossing, a traffic car may turn onto the crossing road.
  const verticalRoads = world.roads.filter((r) => r.vertical);
  const horizontalRoads = world.roads.filter((r) => !r.vertical);
  if (car.vertical) {
    const near = horizontalRoads.find((r) => Math.abs(car.y - r.axis) < 60);
    if (near && random.chance(0.35)) {
      car.vertical = false;
      car.angle = random.chance(0.5) ? 0 : Math.PI;
      car.y = near.axis + (random.chance(0.5) ? -14 : 14);
    }
  } else {
    const near = verticalRoads.find((r) => Math.abs(car.x - r.axis) < 60);
    if (near && random.chance(0.35)) {
      car.vertical = true;
      car.angle = random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      car.x = near.axis + (random.chance(0.5) ? -14 : 14);
    }
  }
}

export function stepTraffic(traffic, world, random, dt) {
  for (const car of traffic.cars) {
    if (car.kind === 'player') continue; // the player's stolen car is theirs
    car.travelled += Math.abs(car.speed) * dt;
    if (car.travelled > car.turnAt) {
      turnAtCrossing(car, world, random);
      car.travelled = 0;
      car.turnAt = random.range(400, 1600);
    }
    const target = car.targetSpeed;
    car.speed += Math.sign(target - car.speed) * 140 * dt;
    if (Math.abs(car.speed - target) < 4) car.speed = target;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Wrap around the city edge instead of driving off the map.
    if (car.x < 40) { car.x = WORLD.WIDTH - 40; }
    if (car.x > WORLD.WIDTH - 40) { car.x = 40; }
    if (car.y < 40) { car.y = WORLD.HEIGHT - 40; }
    if (car.y > WORLD.HEIGHT - 40) { car.y = 40; }
  }

  for (const ped of traffic.peds) {
    if (ped.flee > 0) {
      ped.flee -= dt;
      ped.x += Math.cos(ped.angle) * 150 * dt;
      ped.y += Math.sin(ped.angle) * 150 * dt;
    } else {
      ped.wander -= dt;
      if (ped.wander <= 0) {
        ped.angle = random.range(0, Math.PI * 2);
        ped.wander = random.range(2, 7);
      }
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
    }
    // Keep pedestrians inside the city and off the sea.
    ped.x = Math.max(30, Math.min(WORLD.WIDTH - 30, ped.x));
    ped.y = Math.max(30, Math.min(WORLD.HEIGHT - 30, ped.y));
    if (ped.x > WORLD.SEA_X - 30) ped.x = WORLD.SEA_X - 30;
  }
}

export function nearestParked(parked, x, y, range) {
  let best = null;
  let bestD = range * range;
  for (const car of parked) {
    const dx = car.x - x;
    const dy = car.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function nearestPed(peds, x, y, range) {
  let best = null;
  let bestD = range * range;
  for (const ped of peds) {
    const dx = ped.x - x;
    const dy = ped.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}
