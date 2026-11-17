// Staged scenes for the screenshots (?shot=chase|street|mission|night).
// These are the same game, the same world — just the player, the cops and
// the clock placed where the shot needs them. Nothing is composited or
// faked: every screenshot is a real render of a live frame.

import { PLACES } from './world.js';

// Put the player in a parked car and drive it: the shot scenes all need
// the player behind the wheel.
function putPlayerInCar(state, x, y, angle, speed) {
  const car = state.parked[0];
  if (!car) return null;
  state.parked.splice(0, 1);
  car.kind = 'player';
  car.color = '#ff5d8f';
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
  state.cars.push(car);
  state.player.carId = car.id;
  state.player.onFoot = false;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  state.player.speed = speed;
  return car;
}

function placeCops(state, sys, count, nearX, nearY) {
  for (let i = 0; i < count; i++) {
    state.police.cops.push({
      id: 1000 + i,
      kind: 'cop',
      x: nearX + sys.random.range(-260, 260),
      y: nearY + sys.random.range(-180, 180),
      angle: sys.random.range(0, Math.PI * 2),
      speed: sys.random.range(200, 320),
      color: '#1f3a93',
      ramCooldown: 0,
      roadblock: false,
    });
  }
}

// Cops in pursuit: placed behind the player along the direction of travel,
// already facing the same way and closing in.
function placeCopsBehind(state, sys, count, x, y, angle) {
  for (let i = 0; i < count; i++) {
    const back = 220 + i * 90;
    const side = (i % 2 === 0 ? -1 : 1) * (40 + i * 20);
    state.police.cops.push({
      id: 1000 + i,
      kind: 'cop',
      x: x - Math.cos(angle) * back - Math.sin(angle) * side,
      y: y - Math.sin(angle) * back + Math.cos(angle) * side,
      angle,
      speed: sys.random.range(280, 340),
      color: '#1f3a93',
      ramCooldown: 0,
      roadblock: false,
    });
  }
}

export function applyShot(state, sys, name) {
  const player = state.player;
  if (name === 'chase') {
    // The cover: a car chase at golden hour, 3 stars, cops closing in,
    // minimap and mission objective visible in the same frame. The player
    // drives east along a road so the car is visibly moving, cops behind.
    state.time = 17.6;
    state.money = 250;
    state.missions.index = 1;
    state.missions.step = 0;
    putPlayerInCar(state, 1500, 1250, 0, 500);
    state.police.heat = 90;
    state.police.wanted = 3;
    placeCopsBehind(state, sys, 4, 1500, 1250, 0);
    state.banners.push({ text: 'CAR STOLEN', sub: 'The owner called it in — 1 star', t: 0, dur: 6 });
  } else if (name === 'street') {
    // Cruising a city street at dusk, traffic and pedestrians around.
    state.time = 18.4;
    state.money = 250;
    state.missions.index = 1;
    state.missions.step = 0;
    putPlayerInCar(state, 1100, 900, 0, 300);
    state.police.heat = 0;
    state.police.wanted = 0;
  } else if (name === 'mission') {
    // Mission 2 in progress: the package is at the Marina, the clock runs.
    state.time = 17.0;
    state.money = 250;
    state.missions.index = 1;
    state.missions.step = 0;
    putPlayerInCar(state, PLACES.marina.x - 220, PLACES.marina.y + 60, 0.2, 240);
    state.police.heat = 0;
    state.police.wanted = 0;
  } else if (name === 'night') {
    // Night on South Beach: the city lights, the sea, one star of heat.
    // The player drives north along the beach road, a cop closing in.
    state.time = 21.5;
    state.money = 650;
    state.missions.index = 2;
    state.missions.step = 1;
    state.missions.timer = 42;
    state.missions.stepTimerFor = 1;
    putPlayerInCar(state, 2785, 2100, -Math.PI / 2, 420);
    state.police.heat = 35;
    state.police.wanted = 1;
    placeCopsBehind(state, sys, 2, 2785, 2100, -Math.PI / 2);
  }
  // Keep the player on screen: the camera centres on them.
  player.x = state.player.x;
  player.y = state.player.y;
}
