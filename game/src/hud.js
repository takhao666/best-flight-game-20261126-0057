// The HUD: DOM gauges over the 3D view, plus a small artificial-horizon canvas.
// Numbers are rebuilt only when they change, so a frame allocates nothing.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const speedEl = el('hud-speed');
  const altEl = el('hud-alt');
  const hdgEl = el('hud-hdg');
  const thrEl = el('hud-throttle-fill');
  const fuelEl = el('hud-fuel-fill');
  const dmgEl = el('hud-damage-fill');
  const fuelText = el('hud-fuel-text');
  const objEl = el('hud-objective');
  const timerEl = el('hud-timer');
  const scoreEl = el('hud-score');
  const msgEl = el('hud-message');
  const warnEl = el('hud-warning');
  const canvas = el('hud-attitude');
  const actx = canvas.getContext('2d');

  let lastSpeed = -1;
  let lastAlt = -1;
  let lastHdg = -1;
  let lastThr = -1;
  let lastFuel = -1;
  let lastDmg = -1;
  let lastObj = '';
  let lastTimer = '';
  let lastScore = -1;
  let lastMsg = '';
  let lastWarn = '';

  function setText(node, value, last) {
    if (value !== last) node.textContent = value;
    return value;
  }

  function drawAttitude(pitch, roll) {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 4;
    actx.clearRect(0, 0, w, h);
    actx.save();
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.clip();
    // Sky / ground halves, rotated by roll and shifted by pitch.
    actx.translate(cx, cy);
    actx.rotate(roll);
    const shift = pitch * 70;
    actx.fillStyle = '#3f7ec2';
    actx.fillRect(-r, -r + shift, r * 2, r - shift);
    actx.fillStyle = '#7a5a34';
    actx.fillRect(-r, shift, r * 2, r - shift + 2);
    actx.strokeStyle = '#ffffff';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.moveTo(-r, shift);
    actx.lineTo(r, shift);
    actx.stroke();
    actx.restore();
    // Fixed aircraft symbol.
    actx.strokeStyle = '#ffd23f';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(cx - 26, cy);
    actx.lineTo(cx - 8, cy);
    actx.moveTo(cx + 8, cy);
    actx.lineTo(cx + 26, cy);
    actx.moveTo(cx, cy);
    actx.lineTo(cx, cy + 8);
    actx.stroke();
    actx.strokeStyle = 'rgba(255,255,255,0.85)';
    actx.lineWidth = 1.5;
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.stroke();
  }

  const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  function update(plane, mission, screen) {
    if (screen !== 'play') return;
    const speedKt = Math.round(plane.speed * 1.944);
    const altFt = Math.round((plane.pos.y - 6) * 3.281);
    // Heading: 0 = north (+Z is south in our map, so flip). Keep it simple: 0..360 from heading.
    let hdg = Math.round(((plane.heading * 180) / Math.PI) % 360);
    if (hdg < 0) hdg += 360;
    const hdgText = `${String(hdg).padStart(3, '0')}° ${CARDINALS[Math.round(hdg / 22.5) % 16]}`;

    lastSpeed = setText(speedEl, `${speedKt}`, lastSpeed);
    lastAlt = setText(altEl, `${altFt}`, lastAlt);
    lastHdg = setText(hdgEl, hdgText, lastHdg);
    const thr = Math.round(plane.throttle * 100);
    if (thr !== lastThr) {
      thrEl.style.width = `${thr}%`;
      lastThr = thr;
    }
    const fuel = Math.round(plane.fuel);
    if (fuel !== lastFuel) {
      fuelEl.style.width = `${fuel}%`;
      fuelEl.classList.toggle('low', fuel < 25);
      fuelText.textContent = `${fuel}%`;
      lastFuel = fuel;
    }
    const dmg = Math.round(plane.damage);
    if (dmg !== lastDmg) {
      dmgEl.style.width = `${dmg}%`;
      lastDmg = dmg;
    }
    const obj =
      mission.phase === 'done'
        ? 'Course complete!'
        : mission.phase === 'failed'
          ? 'Out of time'
          : `${mission.def.name} · Ring ${Math.min(mission.ringIndex + 1, mission.rings.length)}/${mission.rings.length}`;
    lastObj = setText(objEl, obj, lastObj);
    const t = mission.time;
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60);
    const timerText = mission.def.timeLimit > 0 ? `${mm}:${String(ss).padStart(2, '0')} / ${Math.floor(mission.def.timeLimit / 60)}:${String(mission.def.timeLimit % 60).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
    lastTimer = setText(timerEl, timerText, lastTimer);
    lastScore = setText(scoreEl, `${mission.score}`, lastScore);
    const msg = mission.time < mission.messageUntil ? mission.message : '';
    lastMsg = setText(msgEl, msg, lastMsg);

    let warn = '';
    if (plane.fuel <= 0) warn = 'FUEL EMPTY — GLIDING';
    else if (plane.fuel < 20) warn = 'LOW FUEL';
    else if (plane.speed < 21 && !plane.onGround) warn = 'STALL — LOWER THE NOSE';
    else if (plane.damage >= 60) warn = 'HEAVY DAMAGE';
    lastWarn = setText(warnEl, warn, lastWarn);

    drawAttitude(plane.pitch, plane.roll);
  }

  return { update };
}
