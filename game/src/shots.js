// The screenshot scenes behind ?shot=cover|rings|landing|menu. Each one plays the real
// rules forward from a fresh start for a fixed number of steps, steered by a simple
// autopilot (bank toward the next ring, pitch to hold altitude, throttle to hold speed),
// so the frame is what a real flight looks like and the same seed always gives the
// same frame. The scene paints twice and sets window.__shotReady for a screenshot.
const THREE = window.THREE;
import { MISSIONS, STEP } from './config.js';
import { heightAt } from './terrain.js';

const COVER_SECONDS = 20;
const RINGS_SECONDS = 34;
const LANDING_SECONDS = 48;

/** Steer toward `target` (a Vector3): bank into the turn, pitch to the target's altitude.
 * Heading increases turn the nose left, so a target to the left (positive heading
 * difference) needs negative bank: banking right turns the heading down. */
function autopilot(plane, target) {
  const dx = target.x - plane.pos.x;
  const dz = target.z - plane.pos.z;
  // Heading to the target, in our convention (0 faces +Z, PI/2 faces +X).
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - plane.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const bank = Math.max(-1, Math.min(1, -diff * 1.6));
  const altError = target.y - plane.pos.y;
  const pitch = Math.max(-1, Math.min(1, altError * 0.02));
  const throttleDelta = plane.speed < 44 ? 1 : plane.speed > 52 ? -1 : 0;
  return { bank, pitch, throttleDelta };
}

function flyFor(game, seconds, steer) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (game.over || game.plane.state.landed) break;
    const input = steer(game);
    game.stepFixed(input);
  }
}

/**
 * Set the game to the named scene and return the screen to draw over it.
 * `game` is the object main.js builds (plane, missions, camera, renderer, screens).
 */
export function stageShot(name, game) {
  const plane = game.plane;
  const missions = game.missions;
  if (name === 'menu') {
    game.startMission(MISSIONS[0], { airborne: true, silent: true });
    // Park the plane in a gentle cruise for the backdrop; the menu overlay covers it.
    // (Do not call showScreen('title'): it would reset the plane to the runway.)
    flyFor(game, 10, () => ({ bank: 0.15, pitch: 0.05, throttleDelta: 0 }));
    return { screen: 'title' };
  }
  if (name === 'landing') {
    game.startMission(MISSIONS[1], { airborne: true, silent: true });
    // Fly the guide rings, then turn back toward the runway for a final approach.
    flyFor(game, LANDING_SECONDS, (g) => {
      const m = g.missions.mission;
      if (m.ringIndex < m.rings.length) {
        return autopilot(g.plane.state, m.rings[m.ringIndex]);
      }
      // Final approach: aim at the runway threshold, descending gently.
      const target = new THREE.Vector3(-210, heightAt(-210, 120) + 16, 120);
      const input = autopilot(g.plane.state, target);
      input.pitch = Math.max(-1, Math.min(1, input.pitch - 0.2));
      return input;
    });
    return { screen: 'play' };
  }
  if (name === 'rings') {
    game.startMission(MISSIONS[0], { airborne: true, silent: true });
    flyFor(game, RINGS_SECONDS, (g) => {
      const m = g.missions.mission;
      const target = m.ringIndex < m.rings.length ? m.rings[m.ringIndex] : m.rings[m.rings.length - 1];
      return autopilot(g.plane.state, target);
    });
    return { screen: 'play' };
  }
  // cover: ring circuit, mid-flight, runway and lake in view.
  game.startMission(MISSIONS[0], { airborne: true, silent: true });
  flyFor(game, COVER_SECONDS, (g) => {
    const m = g.missions.mission;
    const target = m.ringIndex < m.rings.length ? m.rings[m.ringIndex] : m.rings[m.rings.length - 1];
    return autopilot(g.plane.state, target);
  });
  return { screen: 'play' };
}
