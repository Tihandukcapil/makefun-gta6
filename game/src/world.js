// Marisol Bay: the city itself. A fixed road grid, named places the missions
// use, and seeded buildings filling the blocks between the roads. The places
// never move (missions depend on them); the buildings differ per seed.

import { WORLD, PALETTE } from './config.js';

// Named places, fixed so every mission target is deterministic.
export const PLACES = {
  plaza: { x: 1150, y: 1025, label: 'Plaza Marisol' },
  garage: { x: 1400, y: 1250, label: "Rico's Garage" },
  hotel: { x: 900, y: 800, label: 'Hotel Solana' },
  marina: { x: 2700, y: 1700, label: 'Marina' },
  lighthouse: { x: 2830, y: 400, label: 'Lighthouse' },
  hideout: { x: 450, y: 2050, label: 'Hideout' },
  beach: { x: 2800, y: 1200, label: 'South Beach' },
  police: { x: 1900, y: 800, label: 'Police HQ' },
};

const ROAD_HALF = 45;
const VERTICAL_X = [400, 900, 1400, 1900, 2400];
const HORIZONTAL_Y = [350, 800, 1250, 1700, 2100];

export function createWorld(random) {
  const roads = [];
  for (const x of VERTICAL_X) {
    roads.push({ x1: x - ROAD_HALF, y1: 0, x2: x + ROAD_HALF, y2: WORLD.HEIGHT, vertical: true, axis: x });
  }
  for (const y of HORIZONTAL_Y) {
    roads.push({ x1: 0, y1: y - ROAD_HALF, x2: WORLD.WIDTH, y2: y + ROAD_HALF, vertical: false, axis: y });
  }
  // The coast road, running the length of the beach.
  roads.push({ x1: 2740, y1: 0, x2: 2830, y2: WORLD.HEIGHT, vertical: true, axis: 2785 });

  // City blocks between the roads; each gets buildings unless a place sits
  // in it (places stay clear so missions can always reach them).
  const xBands = [
    [70, 345], [455, 845], [955, 1345], [1455, 1845], [1955, 2345], [2455, 2675],
  ];
  const yBands = [
    [70, 295], [405, 745], [855, 1195], [1305, 1645], [1755, 2045], [2155, 2330],
  ];
  const buildings = [];
  for (const [bx1, bx2] of xBands) {
    for (const [by1, by2] of yBands) {
      if (random.chance(0.25)) continue; // an empty lot, for variety
      const cx = (bx1 + bx2) / 2;
      const cy = (by1 + by2) / 2;
      let nearPlace = false;
      for (const p of Object.values(PLACES)) {
        if (Math.abs(p.x - cx) < 190 && Math.abs(p.y - cy) < 190) { nearPlace = true; break; }
      }
      if (nearPlace) continue;
      // One or two buildings per block.
      const count = random.chance(0.45) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = random.range(90, Math.min(200, bx2 - bx1 - 20));
        const h = random.range(80, Math.min(180, by2 - by1 - 20));
        const x = random.range(bx1 + 10, bx2 - w - 10);
        const y = random.range(by1 + 10, by2 - h - 10);
        buildings.push({
          x, y, w, h,
          color: random.pick(PALETTE.BUILDING),
          roof: random.pick(PALETTE.ROOF),
          floors: random.int(1, 4),
        });
      }
    }
  }

  // A few palm clusters along the beach for the night shot.
  const palms = [];
  for (let i = 0; i < 26; i++) {
    palms.push({
      x: random.range(WORLD.BEACH_X + 20, WORLD.SEA_X - 30),
      y: random.range(80, WORLD.HEIGHT - 80),
    });
  }

  function isBlocked(x, y, r) {
    if (x < r || y < r || x > WORLD.WIDTH - r || y > WORLD.HEIGHT - r) return true;
    if (x > WORLD.SEA_X - r) return true; // the sea itself is not walkable
    for (const b of buildings) {
      if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
    }
    return false;
  }

  // Push a point out of any building it sits inside, to the nearest edge.
  // A car can end up inside a building when a collision shoves it there;
  // without this, the building check would revert every move and the car
  // could never escape. Never returns a point still inside a building.
  function resolveBlocked(x, y, r) {
    let px = x;
    let py = y;
    for (let guard = 0; guard < 8; guard++) {
      let moved = false;
      for (const b of buildings) {
        if (px > b.x - r && px < b.x + b.w + r && py > b.y - r && py < b.y + b.h + r) {
          const left = px - (b.x - r);
          const right = b.x + b.w + r - px;
          const top = py - (b.y - r);
          const bottom = b.y + b.h + r - py;
          const min = Math.min(left, right, top, bottom);
          if (min === left) px = b.x - r - 1;
          else if (min === right) px = b.x + b.w + r + 1;
          else if (min === top) py = b.y - r - 1;
          else py = b.y + b.h + r + 1;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    // The map border and the sea block movement too — keep the point
    // inside the drivable area, or the eject itself can strand the car
    // in a border strip where every move is reverted.
    px = Math.max(r + 1, Math.min(WORLD.WIDTH - r - 1, px));
    py = Math.max(r + 1, Math.min(WORLD.HEIGHT - r - 1, py));
    if (px > WORLD.SEA_X - r - 1) px = WORLD.SEA_X - r - 1;
    return { x: px, y: py };
  }

  function nearestRoadPoint(x, y) {
    // Snap a point to the closest road centreline (traffic spawns on roads).
    let best = null;
    let bestD = Infinity;
    for (const road of roads) {
      let px;
      let py;
      if (road.vertical) { px = road.axis; py = Math.max(0, Math.min(WORLD.HEIGHT, y)); }
      else { px = Math.max(0, Math.min(WORLD.WIDTH, x)); py = road.axis; }
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bestD) { bestD = d; best = { x: px, y: py, vertical: road.vertical }; }
    }
    return best;
  }

  return {
    width: WORLD.WIDTH,
    height: WORLD.HEIGHT,
    roads,
    buildings,
    palms,
    places: PLACES,
    isBlocked,
    resolveBlocked,
    nearestRoadPoint,
  };
}
