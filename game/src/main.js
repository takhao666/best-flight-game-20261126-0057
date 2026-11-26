// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused, over, plus a
// mission-complete overlay. ?shot=cover|rings|landing|menu (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
const THREE = window.THREE;
import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildWorld, heightAt } from './terrain.js';
import { EVENT_CRASH, EVENT_LANDED, EVENT_ROUGH, EVENT_TOUCHDOWN, createAircraft } from './aircraft.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_VIEW, createInput } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
void createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d9);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 5000);

buildWorld(scene);
const plane = createAircraft(scene);
const missions = createMissions(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(canvas);

let screen = 'title';
let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
} catch {
  best = 0;
}
let over = false;
let completeShown = false;
let viewMode = 'chase'; // chase | cockpit
let camPos = new THREE.Vector3();
let camLook = new THREE.Vector3();
let lastFov = 62;

const titleEl = document.getElementById('screen-title');
const overEl = document.getElementById('screen-over');
const pauseEl = document.getElementById('screen-pause');
const doneEl = document.getElementById('screen-done');
const hudEl = document.getElementById('hud');

function show(el) {
  el.classList.remove('hidden');
}
function hide(el) {
  el.classList.add('hidden');
}

function announce(message) {
  status.textContent = message;
}

function setBest(value) {
  best = value;
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
  document.getElementById('title-best').textContent = `Best score: ${best}`;
}

/** Start a mission. `airborne` puts the plane in the air; the landing mission starts on the runway. */
function startMission(def, opts = {}) {
  const airborne = opts.airborne ?? def.id !== 'landing';
  plane.reset(airborne, 130);
  plane.state.fuel = def.fuelStart;
  missions.start(def);
  over = false;
  completeShown = false;
  screen = 'play';
  hide(titleEl);
  hide(overEl);
  hide(pauseEl);
  hide(doneEl);
  if (!opts.silent) {
    audio.unlock();
    announce(`${def.name}. ${def.tag}`);
  }
  // Snap the camera behind the plane so the first frame is already framed.
  snapCamera();
}

function showScreen(name) {
  screen = name;
  titleEl.classList.toggle('hidden', name !== 'title');
  pauseEl.classList.toggle('hidden', name !== 'paused');
  overEl.classList.toggle('hidden', name !== 'over');
  if (name === 'title') {
    plane.reset(false);
    missions.abort();
    setBest(best);
  }
}

function endGame(reason) {
  over = true;
  screen = 'over';
  const score = missions.mission.score;
  if (score > best) setBest(score);
  document.getElementById('over-title').textContent = reason === 'crash' ? 'Crashed!' : "Time's up!";
  document.getElementById('over-cause').textContent =
    reason === 'crash'
      ? plane.state.damage >= 100
        ? 'The airframe gave out after too many hard knocks.'
        : 'You hit the ground too hard. Mind the descent rate and the terrain.'
      : 'The clock ran out before the course was finished.';
  document.getElementById('over-score').textContent = `Score ${score} · Best ${best}`;
  show(overEl);
  audio.crash();
  announce(`Crashed. Score ${score}. Best ${best}.`);
}

function showComplete() {
  completeShown = true;
  const m = missions.mission;
  const t = m.time;
  document.getElementById('done-score').textContent =
    `Score ${m.score} · Time ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · Best ${best}`;
  show(doneEl);
  announce(`Course complete. Score ${m.score}.`);
}

/** One fixed step of the live game. Returns nothing; screens change as a side effect. */
function stepFixed(steering) {
  if (screen !== 'play' || over) return;
  const prevPos = plane.state.pos.clone();
  const ringsBefore = missions.mission.ringsPassed;
  const events = plane.step(STEP, steering, true);
  missions.step(STEP, plane.state, prevPos);
  if (missions.mission.ringsPassed > ringsBefore) audio.ring();
  if (events & EVENT_CRASH) {
    endGame('crash');
    return;
  }
  if (events & EVENT_LANDED) {
    missions.onLanding(plane.state);
    audio.land();
    if (missions.mission.phase === 'done' && !completeShown) showComplete();
  }
  if (events & EVENT_ROUGH) {
    missions.setMessage('Rough touchdown — 22% damage!', 3);
    audio.crash();
  }
  if (events & EVENT_TOUCHDOWN) {
    missions.setMessage('Airborne — pull up ↑ to climb!', 3);
  }
  if (missions.mission.phase === 'failed') {
    endGame('time');
    return;
  }
  if (missions.mission.phase === 'done' && !completeShown) {
    if (missions.mission.score > best) setBest(missions.mission.score);
    showComplete();
  }
}

function snapCamera() {
  const p = plane.state;
  const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
  if (viewMode === 'cockpit') {
    // Ahead of the canopy and just above it: the nose sits below the frame and the
    // view ahead is clear (the camera used to sit inside the canopy glass).
    camPos.copy(p.pos).addScaledVector(fwd, 2.6);
    camPos.y += 1.5;
    camLook.copy(p.pos).addScaledVector(fwd, 60);
    camLook.y += Math.sin(p.pitch) * 30;
  } else {
    const right = new THREE.Vector3(-Math.cos(p.heading), 0, Math.sin(p.heading));
    camPos.copy(p.pos).addScaledVector(fwd, -15).addScaledVector(right, 4.5);
    camPos.y += 5;
    camLook.copy(p.pos).addScaledVector(fwd, 24);
    camLook.y += 1;
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function updateCamera(dt) {
  const p = plane.state;
  const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
  const want = new THREE.Vector3();
  const look = new THREE.Vector3();
  if (screen === 'title') {
    // Slow orbit around the parked plane for the menu backdrop.
    const t = performance.now() / 1000;
    const cx = p.pos.x + Math.cos(t * 0.08) * 26;
    const cz = p.pos.z + Math.sin(t * 0.08) * 26;
    want.set(cx, p.pos.y + 9, cz);
    look.copy(p.pos);
    look.y += 1;
  } else if (viewMode === 'cockpit') {
    want.copy(p.pos).addScaledVector(fwd, 2.6);
    want.y += 1.5;
    look.copy(p.pos).addScaledVector(fwd, 60);
    look.y += Math.sin(p.pitch) * 30 - 2;
  } else {
    // Chase view, offset to the plane's right so the frame is a three-quarter view
    // of the aircraft instead of a dead-behind shot of its tail.
    const right = new THREE.Vector3(-Math.cos(p.heading), 0, Math.sin(p.heading));
    want.copy(p.pos).addScaledVector(fwd, -15).addScaledVector(right, 4.5);
    want.y += 5.2;
    look.copy(p.pos).addScaledVector(fwd, 24);
    look.y += 1.2;
  }
  const k = screen === 'title' ? 1 - Math.exp(-dt * 1.2) : 1 - Math.exp(-dt * 7);
  camPos.lerp(want, k);
  camLook.lerp(look, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const fov = 62 + Math.min(14, p.speed * 0.22);
  if (Math.abs(fov - lastFov) > 0.4) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    lastFov = fov;
  }
}

function draw() {
  plane.syncMesh();
  hudEl.classList.toggle('hidden', screen === 'title');
  hud.update(plane.state, missions.mission, screen);
  renderer.render(scene, camera);
}

function runShot(name) {
  const game = { plane, missions, stepFixed, startMission, showScreen, get over() { return over; } };
  const staged = stageShot(name, game);
  screen = staged.screen;
  if (staged.screen === 'title') show(titleEl); // menu shot: overlay over the flying backdrop
  if (staged.screen === 'play') {
    // A staged flight can finish a mission (or land) mid-flight: keep the frame clean.
    hide(doneEl);
    hide(overEl);
  }
  plane.syncMesh();
  snapCamera();
  let painted = 0;
  function paint() {
    draw();
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      missions.setMessage(muted ? 'Sound off (M to turn on)' : 'Sound on', 2);
    }
    if (actions & ACTION_VIEW && screen === 'play') {
      viewMode = viewMode === 'chase' ? 'cockpit' : 'chase';
      missions.setMessage(viewMode === 'cockpit' ? 'Cockpit view (C to switch)' : 'Chase view (C to switch)', 2);
      snapCamera();
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === 'title') startMission(MISSIONS[0]);
      else if (screen === 'over') showScreen('title');
      else if (screen === 'paused') {
        screen = 'play';
        hide(pauseEl);
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') {
        screen = 'paused';
        show(pauseEl);
        announce('Paused.');
      } else if (screen === 'paused') {
        screen = 'play';
        hide(pauseEl);
        announce('Playing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dt;
    last = now;
    handleActions();
    if (screen === 'play') {
      while (accumulator >= STEP && screen === 'play' && !over) {
        stepFixed(input.steering());
        accumulator -= STEP;
      }
      if (over) accumulator = 0;
      audio.update(plane.state.throttle, plane.state.speed, screen === 'play' && !plane.state.onGround);
    } else {
      accumulator = 0;
      // The title screen still drifts the plane gently for its backdrop.
      if (screen === 'title') plane.state.time += 1 / 60;
    }
    updateCamera(dt);
    draw();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      show(pauseEl);
      announce('Paused.');
    }
  });

  // Mission buttons on the title screen.
  document.querySelectorAll('[data-mission]').forEach((button) => {
    button.addEventListener('click', () => {
      const def = MISSIONS.find((m) => m.id === button.dataset.mission);
      if (def) startMission(def);
    });
  });
  document.getElementById('over-restart').addEventListener('click', () => showScreen('title'));
  document.getElementById('pause-resume').addEventListener('click', () => {
    screen = 'play';
    hide(pauseEl);
    announce('Playing.');
  });
  document.getElementById('done-continue').addEventListener('click', () => hide(doneEl));
  document.getElementById('done-menu').addEventListener('click', () => showScreen('title'));
  window.addEventListener('keydown', (event) => {
    if (screen === 'title' && ['1', '2', '3'].includes(event.key)) {
      startMission(MISSIONS[Number(event.key) - 1]);
    }
  });

  setBest(best);
  snapCamera(); // Start framed on the parked plane instead of lerping in from the origin.
  announce('Ridge Runner. Pick a mission to fly.');
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// A small read-only handle for automated checks (screenshots, local verification).
window.__ridge = {
  get screen() {
    return screen;
  },
  get score() {
    return missions.mission.score;
  },
  get ringsPassed() {
    return missions.mission.ringsPassed;
  },
  get phase() {
    return missions.mission.phase;
  },
  get plane() {
    const p = plane.state;
    return {
      speed: p.speed,
      altitude: p.pos.y,
      heading: p.heading,
      fuel: p.fuel,
      damage: p.damage,
      onGround: p.onGround,
      crashed: p.crashed,
      landed: p.landed,
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
    };
  },
  get camera() {
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z, viewMode };
  },
  startMission(id) {
    const def = MISSIONS.find((m) => m.id === id);
    if (def) startMission(def);
  },
};

if (shot) runShot(shot);
else runGame();
