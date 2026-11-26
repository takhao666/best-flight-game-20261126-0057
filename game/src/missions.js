// Missions: ring layouts, progress, scoring. A ring is passed when the plane crosses
// its plane within the ring's radius. Landing quality is scored on touchdown.
const THREE = window.THREE;
import { MISSIONS, RING, RUNWAY } from './config.js';
import { faceRing, heightAt, makeRing } from './terrain.js';

function ringPos(x, z, altAboveGround) {
  return new THREE.Vector3(x, heightAt(x, z) + altAboveGround, z);
}

function ringLayouts() {
  return {
    rings: [
      ringPos(260, -140, 110),
      ringPos(560, -420, 130),
      ringPos(420, -760, 150),
      ringPos(-40, -820, 140),
      ringPos(-520, -640, 150),
      ringPos(-700, -180, 130),
      ringPos(-420, 260, 120),
      ringPos(-60, 420, 110),
    ],
    landing: [
      ringPos(430, -60, 100),
      ringPos(300, -320, 120),
      ringPos(-120, -420, 110),
    ],
    dash: [
      ringPos(-760, 620, 90),
      ringPos(-560, 760, 80),
      ringPos(-300, 820, 95),
      ringPos(-40, 780, 85),
      ringPos(220, 700, 100),
      ringPos(460, 560, 90),
      ringPos(640, 320, 110),
      ringPos(720, 40, 100),
      ringPos(620, -220, 120),
      ringPos(420, -420, 110),
    ],
  };
}

const LAYOUTS = ringLayouts();

export function createMissions(scene) {
  let ringGroup = null;
  const mission = {
    def: MISSIONS[0],
    rings: [],
    ringIndex: 0,
    phase: 'idle', // idle | fly | done | failed
    score: 0,
    time: 0,
    message: '',
    messageUntil: 0,
    landedQuality: 0,
    ringsPassed: 0,
  };

  function clearRings() {
    if (ringGroup) {
      scene.remove(ringGroup);
      ringGroup = null;
    }
  }

  function showRings() {
    clearRings();
    ringGroup = new THREE.Group();
    const layout = LAYOUTS[mission.def.id];
    mission.rings = layout;
    for (let i = 0; i < layout.length; i += 1) {
      const from = i === 0 ? new THREE.Vector3(RUNWAY.x - 150, 60, RUNWAY.z) : layout[i - 1];
      const ring = makeRing(layout[i], i === mission.ringIndex);
      faceRing(ring, from);
      ringGroup.add(ring);
    }
    scene.add(ringGroup);
  }

  function start(def) {
    mission.def = def;
    mission.ringIndex = 0;
    mission.phase = 'fly';
    mission.score = 0;
    mission.time = 0;
    mission.ringsPassed = 0;
    mission.landedQuality = 0;
    showRings();
    setMessage(def.id === 'landing' ? 'Full throttle — rotate at 90 knots!' : 'Fly through the green ring!');
  }

  function setMessage(text, seconds = 4) {
    mission.message = text;
    mission.messageUntil = mission.time + seconds;
  }

  /** Check ring crossings this step. `prev` is the plane position before the step. */
  function step(dt, plane, prevPos) {
    if (mission.phase !== 'fly') return;
    mission.time += dt;
    if (mission.def.timeLimit > 0 && mission.time > mission.def.timeLimit) {
      mission.phase = 'failed';
      setMessage("Time's up!", 6);
      return;
    }
    const layout = mission.rings;
    if (mission.ringIndex >= layout.length) return;
    const ring = layout[mission.ringIndex];
    // Ring faces its approach direction: use the ring mesh's normal (local +Z after lookAt).
    const mesh = ringGroup.children[mission.ringIndex];
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    const dPrev = prevPos.clone().sub(ring).dot(normal);
    const dNow = plane.pos.clone().sub(ring).dot(normal);
    if ((dPrev < 0 && dNow >= 0) || (dPrev > 0 && dNow <= 0)) {
      const dist = plane.pos.distanceTo(ring);
      if (dist < RING.radius + 4) {
        mission.ringIndex += 1;
        mission.ringsPassed += 1;
        mission.score += 100;
        setMessage(`Ring ${mission.ringsPassed}/${layout.length} — +100`, 2.5);
        // Recolour: passed rings dim, the next one lights green.
        for (let i = 0; i < ringGroup.children.length; i += 1) {
          const child = ringGroup.children[i];
          const mat = child.userData.material;
          if (mat) {
            mat.color.setHex(i === mission.ringIndex ? 0x2fe6a8 : i < mission.ringIndex ? 0x5a6b7a : 0xff9f2e);
            mat.opacity = i < mission.ringIndex ? 0.35 : 0.95;
          }
          // Drop the beacon pillar once the ring is no longer next.
          if (i !== mission.ringIndex && child.children.length > 2) child.remove(child.children[2]);
        }
        if (mission.ringIndex >= layout.length) {
          if (mission.def.id === 'landing') {
            setMessage('Now bring her home — land on runway 09!', 6);
          } else {
            mission.phase = 'done';
            const timeBonus = Math.max(0, Math.round(1200 - mission.time * 8));
            mission.score += timeBonus;
            setMessage(`Course complete! Time bonus +${timeBonus}`, 6);
          }
        }
      } else if (Math.abs(dNow) < 30) {
        setMessage('Missed the ring — turn back for it!', 2.5);
      }
    }
  }

  /** Called on a runway touchdown during the landing mission. */
  function onLanding(plane) {
    if (mission.def.id !== 'landing' || mission.phase !== 'fly') return 0;
    const softness = Math.max(0, 1 - Math.abs(plane.verticalSpeed) / 5.5);
    const speedOk = Math.max(0, 1 - Math.max(0, plane.speed - 30) / 18);
    const quality = Math.round((softness * 0.7 + speedOk * 0.3) * 500);
    mission.landedQuality = quality;
    mission.score += quality;
    if (mission.ringIndex >= mission.rings.length) {
      mission.phase = 'done';
      setMessage(`Landed! Quality +${quality}`, 6);
    } else {
      setMessage(`Nice touchdown (+${quality}) — but the rings come first!`, 5);
      mission.phase = 'fly';
    }
    return quality;
  }

  function abort() {
    mission.phase = 'idle';
    clearRings();
  }

  return { mission, start, step, onLanding, abort, setMessage };
}
