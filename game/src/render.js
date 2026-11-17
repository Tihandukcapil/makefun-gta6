// The renderer: Marisol Bay on a canvas, a HUD with minimap, and the day
// turning to dusk and night over the city. Camera follows the player.

import { WORLD, PALETTE, WANTED } from './config.js';
import { PLACES } from './world.js';
import { currentMission, currentStep, currentObjective } from './missions.js';

const ZOOM = 0.88;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function fmtClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 0 = full day, 1 = deep night. Dusk sits in between, warm and low.
function nightFactor(hours) {
  if (hours >= 10 && hours < 16.5) return 0;
  if (hours >= 16.5 && hours < 19) return (hours - 16.5) / 2.5 * 0.55;
  if (hours >= 19 || hours < 6) return 0.55;
  if (hours >= 6 && hours < 10) return (10 - hours) / 4 * 0.55;
  return 0;
}

function drawCar(ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-19, -11, 38, 24);
  ctx.fillStyle = car.color;
  ctx.fillRect(-20, -11, 40, 22);
  ctx.fillStyle = '#22242e';
  ctx.fillRect(-6, -9, 12, 18);
  ctx.fillStyle = '#cfe8ff';
  ctx.fillRect(10, -8, 6, 16);
  if (car.kind === 'cop') {
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2d2d' : '#2d7dff';
    ctx.fillRect(-2, -11, 5, 5);
    ctx.fillStyle = flash ? '#2d7dff' : '#ff2d2d';
    ctx.fillRect(-2, 6, 5, 5);
  }
  if (isPlayer) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -11, 40, 22);
  }
  ctx.restore();
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(0, 2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.kind === 'cop' ? '#1f3a93' : ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  if (ped.wantTaxi) {
    ctx.fillStyle = '#ffd36a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, -14);
  }
  ctx.restore();
}

function drawMinimap(ctx, state, sys, x, y, w, h) {
  const sx = w / sys.world.width;
  const sy = h / sys.world.height;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 12, 22, 0.8)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffd36a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  // Sea and beach.
  ctx.fillStyle = '#1d7f8e';
  ctx.fillRect(x + WORLD.SEA_X * sx, y, (WORLD.WIDTH - WORLD.SEA_X) * sx, h);
  ctx.fillStyle = '#e8c98f';
  ctx.fillRect(x + WORLD.BEACH_X * sx, y, (WORLD.SEA_X - WORLD.BEACH_X) * sx, h);
  // Roads, brighter than the ground.
  ctx.fillStyle = '#8a8a96';
  for (const road of sys.world.roads) {
    ctx.fillRect(x + road.x1 * sx, y + road.y1 * sy, (road.x2 - road.x1) * sx, (road.y2 - road.y1) * sy);
  }
  // Buildings.
  ctx.fillStyle = '#c9a06a';
  for (const b of sys.world.buildings) {
    ctx.fillRect(x + b.x * sx, y + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  }
  // Mission target.
  const mission = currentMission(state.missions);
  if (mission) {
    const step = currentStep(state.missions);
    if (step && step.place) {
      const p = PLACES[step.place];
      ctx.fillStyle = '#ffd36a';
      ctx.beginPath();
      ctx.arc(x + p.x * sx, y + p.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cops, then the player on top.
  ctx.fillStyle = '#2d7dff';
  for (const cop of state.police.cops) {
    ctx.fillRect(x + cop.x * sx - 2, y + cop.y * sy - 2, 4, 4);
  }
  ctx.fillStyle = '#ff5d8f';
  ctx.beginPath();
  ctx.arc(x + state.player.x * sx, y + state.player.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx, state, sys, w, h) {
  const pad = 16;
  ctx.save();
  // Money + health, top left.
  ctx.fillStyle = PALETTE.HUD_BG;
  ctx.fillRect(pad, pad, 230, 64);
  ctx.fillStyle = PALETTE.GOLD;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`$${state.money}`, pad + 12, pad + 20);
  ctx.fillStyle = '#3a3a44';
  ctx.fillRect(pad + 12, pad + 40, 200, 10);
  ctx.fillStyle = state.player.health > 30 ? '#58c96b' : '#e5484d';
  ctx.fillRect(pad + 12, pad + 40, 200 * Math.max(0, state.player.health / 100), 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(`HEALTH ${Math.max(0, Math.round(state.player.health))}`, pad + 12, pad + 58);

  // Wanted stars, top centre.
  const stars = state.police.wanted;
  ctx.fillStyle = PALETTE.HUD_BG;
  ctx.fillRect(w / 2 - 110, pad, 220, 40);
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < WANTED.MAX; i++) {
    ctx.fillStyle = i < stars ? '#ffd36a' : '#55555f';
    ctx.fillText('★', w / 2 - 80 + i * 32, pad + 22);
  }

  // Clock + speed, top right.
  ctx.fillStyle = PALETTE.HUD_BG;
  ctx.fillRect(w - 150, pad, 134, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(fmtClock(state.time), w - pad - 12, pad + 20);
  const speed = state.player.onFoot ? 0 : Math.abs(state.player.speed || 0);
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = '#ffd36a';
  ctx.fillText(state.player.onFoot ? 'ON FOOT' : `${Math.round(speed * 0.12)} mph`, w - pad - 12, pad + 46);

  // Mission objective bar, under the stars.
  ctx.fillStyle = PALETTE.HUD_BG;
  const obj = currentObjective(state.missions);
  ctx.font = 'bold 15px system-ui, sans-serif';
  const objW = Math.min(w - 480, ctx.measureText(obj).width + 32);
  ctx.fillRect(w / 2 - objW / 2, pad + 52, objW, 34);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(obj, w / 2, pad + 70);
  const step = currentStep(state.missions);
  if (step && step.timer !== undefined && state.missions.timer > 0) {
    ctx.fillStyle = state.missions.timer < 15 ? '#e5484d' : '#ffd36a';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(state.missions.timer)}s`, w / 2, pad + 100);
  }
  if (state.taxi) {
    ctx.fillStyle = PALETTE.HUD_BG;
    ctx.fillRect(w / 2 - 130, pad + 96, 260, 30);
    ctx.fillStyle = '#ffd36a';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`TAXI → ${PLACES[state.taxi.destKey].label} · ${Math.ceil(state.taxi.timer)}s`, w / 2, pad + 112);
  }

  // Minimap, top right under the clock.
  drawMinimap(ctx, state, sys, w - 236, pad + 76, 220, 165);

  // Context hint, bottom centre.
  if (state.player.onFoot) {
    ctx.fillStyle = 'rgba(12, 14, 24, 0.6)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WASD move · E steal a car · SPACE punch · SHIFT handbrake', w / 2, h - 18);
  }
  ctx.restore();
}

function drawBanners(ctx, state, w, h) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = h * 0.32;
  for (const b of state.banners) {
    const alpha = Math.min(1, (b.dur - b.t) / 0.5, b.t / 0.2 + 0.2);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillStyle = '#ffd36a';
    ctx.fillText(b.text, w / 2, y);
    if (b.sub) {
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.sub, w / 2, y + 30);
    }
    y += 64;
  }
  ctx.restore();
}

export function render(ctx, state, sys) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const player = state.player;

  const camX = clamp(player.x - w / 2 / ZOOM, 0, Math.max(0, sys.world.width - w / ZOOM));
  const camY = clamp(player.y - h / 2 / ZOOM, 0, Math.max(0, sys.world.height - h / ZOOM));

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.scale(ZOOM, ZOOM);
  ctx.translate(-camX, -camY);

  // Ground: grass, then sand, then sea.
  ctx.fillStyle = PALETTE.GRASS;
  ctx.fillRect(0, 0, sys.world.width, sys.world.height);
  ctx.fillStyle = PALETTE.SAND_LIGHT;
  ctx.fillRect(WORLD.BEACH_X, 0, WORLD.SEA_X - WORLD.BEACH_X, sys.world.height);
  ctx.fillStyle = PALETTE.SEA;
  ctx.fillRect(WORLD.SEA_X, 0, sys.world.width - WORLD.SEA_X, sys.world.height);
  ctx.fillStyle = PALETTE.SEA_DEEP;
  ctx.fillRect(WORLD.SEA_X + 90, 0, sys.world.width - WORLD.SEA_X - 90, sys.world.height);

  // Roads.
  for (const road of sys.world.roads) {
    ctx.fillStyle = PALETTE.ROAD;
    ctx.fillRect(road.x1, road.y1, road.x2 - road.x1, road.y2 - road.y1);
    ctx.fillStyle = PALETTE.ROAD_LINE;
    if (road.vertical) {
      for (let y = 20; y < sys.world.height; y += 70) ctx.fillRect(road.axis - 2, y, 4, 34);
    } else {
      for (let x = 20; x < sys.world.width; x += 70) ctx.fillRect(x, road.axis - 2, 34, 4);
    }
  }

  // Buildings with roofs and a sun-side shade.
  for (const b of sys.world.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, Math.min(26, b.h - 12));
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let wy = b.y + 34; wy < b.y + b.h - 12; wy += 30) {
      for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += 26) {
        ctx.fillRect(wx, wy, 12, 14);
      }
    }
  }

  // Palms on the beach.
  for (const palm of sys.world.palms) {
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 4, palm.y - 18);
    ctx.stroke();
    ctx.fillStyle = '#3f7d44';
    ctx.beginPath();
    ctx.arc(palm.x + 4, palm.y - 20, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // The lighthouse, tall and striped, at the north beach.
  const light = PLACES.lighthouse;
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(light.x - 10, light.y - 52, 20, 52);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(light.x - 10, light.y - 40, 20, 10);
  ctx.fillRect(light.x - 10, light.y - 18, 20, 10);
  ctx.fillStyle = '#ffd36a';
  ctx.beginPath();
  ctx.arc(light.x, light.y - 56, 7, 0, Math.PI * 2);
  ctx.fill();

  // Cash pickups.
  for (const cash of state.cash) {
    ctx.save();
    ctx.translate(cash.x, cash.y);
    ctx.fillStyle = '#ffd36a';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2f00';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }

  // Mission target marker.
  const mission = currentMission(state.missions);
  if (mission) {
    const step = currentStep(state.missions);
    if (step && step.place) {
      const p = PLACES[step.place];
      const pulse = 1 + Math.sin(performance.now() / 300) * 0.15;
      ctx.save();
      ctx.translate(p.x, p.y - 46);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffd36a';
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(-9, -6);
      ctx.lineTo(9, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Parked cars, traffic, cops, peds, player.
  for (const car of state.parked) drawCar(ctx, car, false);
  for (const car of state.cars) drawCar(ctx, car, car.kind === 'player');
  for (const cop of state.police.cops) drawCar(ctx, cop, false);
  for (const ped of state.peds) drawPed(ctx, ped);

  if (player.onFoot) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(2, 3, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d3557';
    ctx.fillRect(2, -8, 12, 16);
    ctx.restore();
  }

  // Particles.
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // Day → dusk → night tint, plus the crash flash.
  const night = nightFactor(state.time);
  if (night > 0) {
    ctx.fillStyle = `rgba(16, 24, 64, ${night * 0.42})`;
    ctx.fillRect(camX, camY, w / ZOOM, h / ZOOM);
  } else if (state.time >= 16.5 && state.time < 19) {
    ctx.fillStyle = 'rgba(255, 140, 60, 0.07)';
    ctx.fillRect(camX, camY, w / ZOOM, h / ZOOM);
  }
  if (state.crashFlash > 0) {
    ctx.fillStyle = `rgba(255, 60, 40, ${Math.min(0.35, state.crashFlash)})`;
    ctx.fillRect(camX, camY, w / ZOOM, h / ZOOM);
  }

  ctx.restore();

  // Screen-space UI.
  drawHud(ctx, state, sys, w, h);
  drawBanners(ctx, state, w, h);

  if (!state.started) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 12, 26, 0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd36a';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('SUNSET KEYS', w / 2, h / 2 - 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('An open-world crime game in Marisol Bay', w / 2, h / 2 - 24);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('WASD / arrows — move and drive · E — steal or enter a car', w / 2, h / 2 + 22);
    ctx.fillText('SPACE — punch · SHIFT — handbrake · M — mute', w / 2, h / 2 + 48);
    ctx.fillStyle = '#ffd36a';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('Press ENTER to start', w / 2, h / 2 + 96);
    ctx.restore();
  }

  if (state.busted || state.wasted) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 12, 26, 0.66)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.busted ? '#7fb3ff' : '#e5484d';
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillText(state.busted ? 'BUSTED' : 'WASTED', w / 2, h / 2 - 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Press ENTER to get back on the streets', w / 2, h / 2 + 34);
    ctx.restore();
  }
}
