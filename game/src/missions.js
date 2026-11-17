// The story: four missions that pay, then free roam. Each mission is a list
// of steps; a step is done when its check passes, or when its timer runs
// out (a survive step completes on timeout, a delivery step fails on it).
// Rewards land the moment the last step completes.

import { PLACES } from './world.js';

function nearPlace(state, key, radius) {
  const p = PLACES[key];
  const dx = state.player.x - p.x;
  const dy = state.player.y - p.y;
  return dx * dx + dy * dy < radius * radius;
}

export const MISSION_DEFS = [
  {
    name: 'Borrowed Keys',
    reward: 250,
    steps: [
      { text: 'Steal a car — press E near a parked car', done: (s) => s.flags.carStolen },
      { text: "Drive to Rico's Garage", place: 'garage', done: (s) => nearPlace(s, 'garage', 130) },
    ],
  },
  {
    name: 'Sunset Delivery',
    reward: 400,
    steps: [
      { text: 'Pick up the package at the Marina', place: 'marina', done: (s) => nearPlace(s, 'marina', 130) },
      {
        text: 'Deliver to Hotel Solana before the clock runs out',
        place: 'hotel', timer: 75, onTimeout: 'fail',
        done: (s) => nearPlace(s, 'hotel', 130),
      },
    ],
  },
  {
    name: 'Heat Wave',
    reward: 500,
    steps: [
      { text: 'Get the cops on you — steal a car or hit one', done: (s) => s.police.wanted >= 1 },
      {
        text: 'Outrun the heat — survive 60 seconds',
        timer: 60, survive: true,
        tick: (s) => s.police.wanted >= 1,
        done: () => false,
      },
    ],
  },
  {
    name: 'Keys to the City',
    reward: 1000,
    steps: [
      { text: 'Pick up the crew at Plaza Marisol', place: 'plaza', done: (s) => nearPlace(s, 'plaza', 130) },
      { text: 'Drive the crew to the Lighthouse', place: 'lighthouse', done: (s) => nearPlace(s, 'lighthouse', 150) },
      { text: 'Lose the tail and reach the Hideout', place: 'hideout', done: (s) => nearPlace(s, 'hideout', 130) },
    ],
  },
];

export function createMissions() {
  return { index: 0, step: 0, timer: 0 };
}

export function currentMission(missions) {
  return MISSION_DEFS[missions.index] || null;
}

export function currentStep(missions) {
  const mission = currentMission(missions);
  return mission ? mission.steps[missions.step] : null;
}

export function currentObjective(missions) {
  const mission = currentMission(missions);
  if (!mission) return 'Free roam — Marisol Bay is yours';
  const step = mission.steps[missions.step];
  return `${mission.name}: ${step.text}`;
}

function banner(state, text, sub) {
  state.banners.push({ text, sub: sub || '', t: 0, dur: 3 });
}

export function stepMissions(state, dt) {
  const missions = state.missions;
  const mission = currentMission(missions);
  if (!mission) return;
  const step = mission.steps[missions.step];
  if (!step) return;

  // Start a step timer the first frame the step is active.
  if (step.timer !== undefined && missions.timer <= 0 && missions.stepTimerFor !== missions.step) {
    missions.timer = step.timer;
    missions.stepTimerFor = missions.step;
  }
  if (step.timer !== undefined) {
    const ticking = step.tick ? step.tick(state) : true;
    if (ticking) missions.timer -= dt;
    if (missions.timer <= 0) {
      if (step.survive) {
        completeStep(state, mission);
        return;
      }
      if (step.onTimeout === 'fail') {
        missions.step = 0;
        missions.timer = 0;
        missions.stepTimerFor = -1;
        banner(state, 'TOO SLOW', 'The delivery fell through — try again');
        return;
      }
    }
  }

  if (step.done(state)) completeStep(state, mission);
}

function completeStep(state, mission) {
  const missions = state.missions;
  missions.step += 1;
  missions.timer = 0;
  missions.stepTimerFor = -1;
  if (missions.step >= mission.steps.length) {
    state.money += mission.reward;
    state.stats.earned += mission.reward;
    banner(state, `${mission.name.toUpperCase()} COMPLETE`, `+$${mission.reward}`);
    state.flags.missionJingle = true;
    missions.index += 1;
    missions.step = 0;
    if (missions.index >= MISSION_DEFS.length) {
      banner(state, 'MARISOL BAY IS YOURS', 'All missions done — free roam');
    }
  }
}
