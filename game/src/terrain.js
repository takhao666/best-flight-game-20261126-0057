// The valley: one height function shared by the mesh and the flight model, so the
// ground the plane can hit is exactly the ground the player sees. A flat apron is
// carved around the runway, a lake sits in the south-west, and ridges rise at the edges.
// three.min.js is loaded as a classic script by index.html before this module runs,
// so the global THREE is available here.
const THREE = window.THREE;
import { PALETTE, RUNWAY, WORLD } from './config.js';
import { createNoise2D, createRandom } from './random.js';

const fbm = createNoise2D(WORLD.seed);
const rand = createRandom(WORLD.seed + 7);

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Distance from (x, z) to the runway rectangle, in metres. */
function runwayDistance(x, z) {
  const dx = Math.max(Math.abs(x - RUNWAY.x) - RUNWAY.length / 2, 0);
  const dz = Math.max(Math.abs(z - RUNWAY.z) - RUNWAY.width / 2, 0);
  return Math.hypot(dx, dz);
}

/** Ground height in metres at (x, z). Pure function of the seed. */
export function heightAt(x, z) {
  const nx = x / 420;
  const nz = z / 420;
  // Rolling hills, stronger toward the edges so the valley is ringed by ridges.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half;
  let h = 14 + fbm(nx, nz) * 26 + fbm(nx * 2.7 + 5, nz * 2.7 - 3) * 10;
  h += smoothstep(0.55, 1.0, edge) * 95 * (0.6 + 0.4 * fbm(nx * 1.3, nz * 1.3 + 9));
  // The lake basin in the south-west.
  const lakeD = Math.hypot((x + 560) / 260, (z + 420) / 200);
  h -= smoothstep(1.0, 0.35, lakeD) * 22;
  // Flat apron around the runway.
  const flat = 1 - smoothstep(60, 260, runwayDistance(x, z));
  return h * (1 - flat) + 6 * flat;
}

/** Slope (0 flat .. 1 steep) at (x, z), from finite differences. */
function slopeAt(x, z) {
  const e = 6;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.min(1, Math.hypot(dx, dz));
}

const cGrass = new THREE.Color(PALETTE.grass);
const cDry = new THREE.Color(PALETTE.grassDry);
const cRock = new THREE.Color(PALETTE.rock);
const cSnow = new THREE.Color(PALETTE.snow);
const cSand = new THREE.Color(PALETTE.sand);

function groundColor(x, z, h, slope) {
  const n = fbm(x / 90 + 11, z / 90 - 4) * 0.5 + 0.5;
  const c = cGrass.clone().lerp(cDry, clamp01(n * 0.9));
  if (slope > 0.45) c.lerp(cRock, smoothstep(0.45, 0.8, slope));
  if (h > 78) c.lerp(cSnow, smoothstep(78, 105, h));
  if (h < WORLD.waterLevel + 2.5) c.lerp(cSand, smoothstep(WORLD.waterLevel + 2.5, WORLD.waterLevel + 0.4, h));
  return c;
}

function buildTerrainMesh(scene) {
  const segments = 160;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const c = groundColor(x, z, h, slopeAt(x, z));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(560, 420, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(geo, mat);
  water.position.set(-560, WORLD.waterLevel, -420);
  scene.add(water);
}

function buildRunway(scene) {
  const group = new THREE.Group();
  const groundY = heightAt(RUNWAY.x, RUNWAY.z);
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.length, RUNWAY.width),
    new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, groundY + 0.15, RUNWAY.z);
  strip.receiveShadow = true;
  group.add(strip);

  // Centreline dashes and threshold bars.
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayLine });
  for (let x = -RUNWAY.length / 2 + 24; x < RUNWAY.length / 2 - 12; x += 28) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(RUNWAY.x + x, groundY + 0.25, RUNWAY.z);
    group.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(RUNWAY.x + end * (RUNWAY.length / 2 - 14), groundY + 0.25, RUNWAY.z + k * 5.4);
      group.add(bar);
    }
  }
  // Runway numbers "09" / "27" as simple white blocks.
  const numMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayLine });
  for (const end of [-1, 1]) {
    const num = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), numMat);
    num.rotation.x = -Math.PI / 2;
    num.position.set(RUNWAY.x + end * (RUNWAY.length / 2 - 34), groundY + 0.25, RUNWAY.z);
    group.add(num);
  }
  // Edge lights.
  const lightGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let x = -RUNWAY.length / 2 + 10; x <= RUNWAY.length / 2 - 10; x += 30) {
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(RUNWAY.x + x, groundY + 0.6, RUNWAY.z + side * (RUNWAY.width / 2 + 2));
      group.add(light);
    }
  }
  scene.add(group);

  // Windsock beside the runway.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.3, 9, 8),
    new THREE.MeshLambertMaterial({ color: 0xdddddd }),
  );
  pole.position.set(RUNWAY.x + 60, groundY + 4.5, RUNWAY.z - RUNWAY.width / 2 - 14);
  scene.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.5, 10, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xe8622a, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2.4;
  sock.position.set(RUNWAY.x + 62, groundY + 8.6, RUNWAY.z - RUNWAY.width / 2 - 14);
  scene.add(sock);
}

function buildAirfield(scene) {
  const groundY = heightAt(RUNWAY.x, RUNWAY.z);
  const hangarMat = new THREE.MeshLambertMaterial({ color: PALETTE.hangar });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5d6b7a });
  const positions = [
    { x: -40, z: RUNWAY.z - 58, w: 34, h: 12, d: 24 },
    { x: 8, z: RUNWAY.z - 62, w: 26, h: 10, d: 20 },
    { x: 150, z: RUNWAY.z - 55, w: 22, h: 9, d: 18 },
  ];
  for (const p of positions) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), hangarMat);
    box.position.set(p.x, groundY + p.h / 2, p.z);
    box.castShadow = true;
    scene.add(box);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(p.d / 2, p.d / 2, p.w, 12, 1, false, 0, Math.PI), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(p.x, groundY + p.h, p.z);
    roof.scale.set(1, 0.45, 1);
    scene.add(roof);
  }
  // A few houses in the village north of the field.
  const houseMat = new THREE.MeshLambertMaterial({ color: PALETTE.building });
  const houseRoof = new THREE.MeshLambertMaterial({ color: 0x9e4f3a });
  for (let i = 0; i < 9; i += 1) {
    const hx = -260 + (i % 3) * 55 + rand() * 18;
    const hz = RUNWAY.z - 150 - Math.floor(i / 3) * 48 + rand() * 14;
    const hy = heightAt(hx, hz);
    const house = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 12), houseMat);
    house.position.set(hx, hy + 3.5, hz);
    house.castShadow = true;
    scene.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(10, 5, 4), houseRoof);
    roof.position.set(hx, hy + 9.5, hz);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
  }
}

function buildTrees(scene) {
  // Instanced pines, kept clear of the runway apron and the lake.
  const spots = [];
  let guard = 0;
  while (spots.length < 220 && guard < 4000) {
    guard += 1;
    const x = (rand() * 2 - 1) * (WORLD.half - 60);
    const z = (rand() * 2 - 1) * (WORLD.half - 60);
    const h = heightAt(x, z);
    if (h < WORLD.waterLevel + 1) continue;
    if (runwayDistance(x, z) < 120) continue;
    if (Math.hypot(x + 560, z + 420) < 260) continue;
    if (slopeAt(x, z) > 0.6) continue;
    spots.push({ x, z, h, s: 0.7 + rand() * 0.9 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk });
  const coneGeo = new THREE.ConeGeometry(3.2, 9, 8);
  const coneMat = new THREE.MeshLambertMaterial({ color: PALETTE.tree });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < spots.length; i += 1) {
    const p = spots[i];
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    s.set(p.s, p.s, p.s);
    v.set(p.x, p.h + 1.5 * p.s, p.z);
    m.compose(v, q, s);
    trunks.setMatrixAt(i, m);
    v.set(p.x, p.h + (3 + 4.5) * p.s, p.z);
    m.compose(v, q, s);
    cones.setMatrixAt(i, m);
  }
  trunks.castShadow = true;
  cones.castShadow = true;
  scene.add(trunks);
  scene.add(cones);
}

function buildClouds(scene) {
  // Flat-white cartoon puffs: several overlapping near-spheres read as a cloud from
  // any angle, where a single flattened sphere reads as a grey saucer.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const puffGeo = new THREE.SphereGeometry(1, 12, 10);
  for (let i = 0; i < 14; i += 1) {
    const group = new THREE.Group();
    const cx = (rand() * 2 - 1) * 1000;
    const cz = (rand() * 2 - 1) * 1000;
    const cy = 200 + rand() * 90;
    const puffs = 6 + Math.floor(rand() * 4);
    for (let k = 0; k < puffs; k += 1) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      const r = 12 + rand() * 14;
      puff.scale.set(r * 1.5, r * 0.85, r * 1.1);
      puff.position.set((rand() * 2 - 1) * 22, (rand() * 2 - 1) * 5, (rand() * 2 - 1) * 12);
      group.add(puff);
    }
    group.position.set(cx, cy, cz);
    scene.add(group);
  }
}

/** Build the whole static world. Returns the THREE.Group holding the rings (rebuilt per mission). */
export function buildWorld(scene) {
  buildTerrainMesh(scene);
  buildWater(scene);
  buildRunway(scene);
  buildAirfield(scene);
  buildTrees(scene);
  buildClouds(scene);

  // Lighting: warm sun + sky fill, fog for depth.
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
  sun.position.set(500, 700, -300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.far = 2200;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ee, 0x5d6b4a, 0.75));
  scene.fog = new THREE.Fog(PALETTE.fog, 700, 2100);
}

/** A glowing ring gate. `next` marks the ring the player must fly through now. */
export function makeRing(position, isNext) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: isNext ? PALETTE.ringNext : PALETTE.ringOther,
    transparent: true,
    opacity: isNext ? 0.95 : 0.75,
  });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(18, 1.1, 10, 40), mat);
  group.add(torus);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(18, 0.35, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
  );
  group.add(inner);
  // A thin beacon pillar so the next ring can be spotted from far away.
  if (isNext) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 260, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.ringNext, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
    );
    beam.position.y = -120;
    group.add(beam);
  }
  group.position.copy(position);
  group.userData.material = mat;
  return group;
}

/** Point the ring's face at the direction the plane approaches from. */
export function faceRing(group, fromPosition) {
  group.lookAt(fromPosition.x, group.position.y, fromPosition.z);
}
