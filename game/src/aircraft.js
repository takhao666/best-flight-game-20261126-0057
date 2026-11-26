// The aircraft: a low-poly courier plane built from primitives (fuselage, wings, tail,
// spinning propeller, nav lights), and the arcade flight model that flies it.
// The model is deliberately forgiving: bank to turn, pitch to climb or dive, throttle
// to set speed — but slow flight sinks, hard banks bleed speed, and the ground is real.
const THREE = window.THREE;
import { PALETTE, PLANE, RUNWAY, WORLD } from './config.js';
import { heightAt } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_CRASH = 1;
export const EVENT_LANDED = 2;
export const EVENT_ROUGH = 4;
export const EVENT_TOUCHDOWN = 8;

function buildMesh() {
  const group = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: PALETTE.planeOrange });
  const white = new THREE.MeshLambertMaterial({ color: PALETTE.planeWhite });
  const dark = new THREE.MeshLambertMaterial({ color: PALETTE.planeDark });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2f42, emissive: 0x0a1a28 });

  // Fuselage: a tapered cylinder along Z, nose forward (-Z in model space... we use +Z forward).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.55, 7.2, 12), orange);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.6, 12), white);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 4.4;
  group.add(nose);
  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), glass);
  canopy.scale.set(0.85, 0.62, 1.7);
  canopy.position.set(0, 0.85, 1.1);
  group.add(canopy);
  // Main wings.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.22, 2.1), white);
  wing.position.set(0, -0.1, 0.6);
  wing.castShadow = true;
  group.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 2.1), orange);
  wingTipL.position.set(-6.6, -0.1, 0.6);
  group.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 6.6;
  group.add(wingTipR);
  // Tail: horizontal stabiliser + vertical fin.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 1.4), white);
  stab.position.set(0, 0.25, -3.4);
  group.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 1.9), orange);
  fin.position.set(0, 1.15, -3.4);
  group.add(fin);
  // Propeller (spins) + spinner.
  const prop = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.4, 0.12), bladeMat);
    blade.rotation.z = a;
    prop.add(blade);
  }
  prop.position.z = 5.35;
  group.add(prop);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 10), orange);
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = 5.3;
  group.add(spinner);
  // Nav lights: red left, green right, white tail — emissive so they read as lit.
  const navL = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  navL.position.set(-6.7, -0.05, 0.6);
  group.add(navL);
  const navR = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x22ff66 }),
  );
  navR.position.set(6.7, -0.05, 0.6);
  group.add(navR);
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  strobe.position.set(0, 0.35, -3.9);
  group.add(strobe);

  group.userData.prop = prop;
  group.userData.strobe = strobe;
  return group;
}

export function createAircraft(scene) {
  const mesh = buildMesh();
  scene.add(mesh);

  const state = {
    pos: new THREE.Vector3(RUNWAY.x - 150, 0, RUNWAY.z),
    heading: Math.PI / 2, // facing +X, down runway 09
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    damage: 0,
    onGround: true,
    crashed: false,
    landed: false,
    verticalSpeed: 0,
    time: 0,
  };
  state.pos.y = heightAt(state.pos.x, state.pos.z) + 1.2;

  function reset(airborne, altitude) {
    state.pos.set(RUNWAY.x - 150, 0, RUNWAY.z);
    state.pos.y = heightAt(state.pos.x, state.pos.z) + 1.2;
    state.heading = Math.PI / 2;
    state.pitch = 0;
    state.roll = 0;
    state.throttle = 0;
    state.fuel = 100;
    state.damage = 0;
    state.onGround = true;
    state.crashed = false;
    state.landed = false;
    state.verticalSpeed = 0;
    if (airborne) {
      state.pos.set(-420, heightAt(-420, -260) + (altitude ?? 130), -260);
      state.heading = Math.PI / 2.6;
      state.speed = 42;
      state.throttle = 0.65;
      state.onGround = false;
    } else {
      state.speed = 0;
    }
  }

  /**
   * One fixed step. `input` is { bank, pitch, throttleDelta } in [-1, 1].
   * Returns event flags: crash, landing, rough touchdown.
   */
  function step(dt, input, fuelBurn) {
    if (state.crashed || state.landed) return EVENT_NONE;
    state.time += dt;

    // Throttle: W/S nudge it; it stays where you leave it.
    state.throttle = Math.max(0, Math.min(1, state.throttle + input.throttleDelta * dt * 0.55));
    if (state.fuel <= 0) state.throttle = 0;
    if (fuelBurn !== false) {
      state.fuel = Math.max(0, state.fuel - (0.1 + state.throttle * 0.42) * dt);
    }

    // Bank and pitch ease toward the commanded values.
    const targetRoll = input.bank * (PLANE.maxBankDeg * Math.PI / 180);
    const targetPitch = input.pitch * (PLANE.maxPitchDeg * Math.PI / 180);
    const rollRate = state.onGround ? 6 : 2.6;
    state.roll += (targetRoll - state.roll) * Math.min(1, rollRate * dt);
    state.pitch += (targetPitch - state.pitch) * Math.min(1, 2.2 * dt);

    // Turning comes from bank; more bank and more speed, tighter turn.
    const speedFactor = Math.min(1, state.speed / 40);
    state.heading -= Math.sin(state.roll) * PLANE.turnRate * speedFactor * dt;

    // Speed chases the throttle's target; hard banks and climbs bleed it.
    const targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    let accel = PLANE.accel;
    if (Math.abs(state.roll) > 0.5) accel -= 2.5;
    if (state.pitch > 0.2) accel -= 2;
    state.speed += Math.max(-9, Math.min(accel, targetSpeed - state.speed)) * dt;
    if (state.speed < 0) state.speed = 0;

    // Vertical speed: pitch converts speed to climb; below stall speed the wing gives up.
    let vspeed = Math.sin(state.pitch) * state.speed;
    if (state.speed < PLANE.stallSpeed && !state.onGround) {
      vspeed -= (PLANE.stallSpeed - state.speed) * PLANE.climbSink;
    }
    state.verticalSpeed = vspeed;

    const dir = new THREE.Vector3(
      Math.sin(state.heading) * Math.cos(state.pitch),
      Math.sin(state.pitch),
      Math.cos(state.heading) * Math.cos(state.pitch),
    );
    // Heading convention: heading 0 faces +Z, PI/2 faces +X. Forward is (sin h, ., cos h).
    state.pos.addScaledVector(dir, state.speed * dt);

    // Keep the plane inside the valley; the ridges push back gently.
    const lim = WORLD.half - 40;
    if (Math.abs(state.pos.x) > lim) state.pos.x = Math.sign(state.pos.x) * lim;
    if (Math.abs(state.pos.z) > lim) state.pos.z = Math.sign(state.pos.z) * lim;

    // Ground contact.
    const ground = heightAt(state.pos.x, state.pos.z);
    const clearance = state.pos.y - ground;
    if (clearance <= 1.2) {
      state.pos.y = ground + 1.2;
      const onRunway =
        Math.abs(state.pos.x - RUNWAY.x) < RUNWAY.length / 2 &&
        Math.abs(state.pos.z - RUNWAY.z) < RUNWAY.width / 2;
      const aligned = Math.abs(Math.sin(state.heading - Math.PI / 2)) < 0.35 || Math.abs(Math.sin(state.heading + Math.PI / 2)) < 0.35;
      if (state.onGround) {
        // Rolling on the ground: light rolling resistance; pitch does nothing.
        state.speed = Math.max(0, state.speed - 1.5 * dt);
        state.pitch = 0;
        state.roll *= 0.9;
        if (state.speed > 24) {
          // Rotate: fast enough to lift off, with a gentle climb attitude so the
          // plane leaves the ground instead of skimming along it.
          state.onGround = false;
          state.pitch = 0.12;
          return EVENT_TOUCHDOWN;
        }
        return EVENT_NONE;
      }
      if (onRunway && vspeed > -5.5 && state.speed < 48 && Math.abs(state.roll) < 0.3 && aligned) {
        state.onGround = true;
        state.landed = true;
        state.pitch = 0;
        state.roll = 0;
        return EVENT_LANDED;
      }
      if (vspeed > -2) {
        // Level flight a metre off the ground: a low pass, not an impact. The plane
        // skims on, following the terrain, instead of crashing for flying low.
        state.pos.y = ground + 1.3;
        return EVENT_NONE;
      }
      if (vspeed > -7 && state.speed < 32) {
        // A rough touchdown off the strip: damage, and a bounce.
        state.damage = Math.min(100, state.damage + 22);
        state.pos.y = ground + 4;
        state.verticalSpeed = 3;
        state.speed *= 0.55;
        if (state.damage >= 100) {
          state.crashed = true;
          return EVENT_CRASH;
        }
        return EVENT_ROUGH;
      }
      state.crashed = true;
      return EVENT_CRASH;
    }
    return EVENT_NONE;
  }

  /** Paint the mesh where the state is; propeller spins with throttle, strobe blinks. */
  function syncMesh() {
    mesh.position.copy(state.pos);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = state.heading;
    mesh.rotation.x = -state.pitch;
    mesh.rotation.z = -state.roll;
    mesh.userData.prop.rotation.z += (2 + state.throttle * 40) * (1 / 60);
    const blink = Math.floor(state.time * 1.4) % 2 === 0;
    mesh.userData.strobe.material.color.setHex(blink ? 0xffffff : 0x334455);
  }

  return { state, mesh, reset, step, syncMesh };
}
