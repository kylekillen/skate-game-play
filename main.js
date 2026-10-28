import * as THREE from 'three';
import { createGfx } from './gfx.js';
import { TWEAKS as T } from './tweaks.js';
import { buildPark, MAT } from './park.js';
import { Physics } from './physics.js';
import { SkaterView } from './skater.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Closet, CHOICES } from './customize.js';

const $ = (id) => document.getElementById(id);
$('title').textContent = T.gameName; document.title = T.gameName;

// ── renderer, sky, light, lens (all in gfx.js) ──
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(T.cameraFov, 1, 0.12, 3000);
const gfx = createGfx(scene, camera, T);

// ── world ──
// which park: ?park=plaza in the address wins, then the tweak
const PARKS = { skatepark: 'Skatepark', plaza: 'Plaza', mega: 'Mega Park' }, PARK_IDS = Object.keys(PARKS);
const params = new URLSearchParams(location.search);
let parkId = params.get('park') || T.park;
if (!PARKS[parkId]) parkId = 'skatepark';
function pickPark(id) {
  if (id === parkId) return;
  params.set('park', id); location.search = params.toString();
}
const park = buildPark(scene, parkId);
for (const b of document.querySelectorAll('#parks button')) {
  b.classList.toggle('on', b.dataset.park === parkId);
  b.addEventListener('click', (e) => { e.stopPropagation(); pickPark(b.dataset.park); });
}
const phys = new Physics(park);

// ── what the wheels are rolling on (for the sound): wood, asphalt, metal, or concrete by default ──
const surfKind = new Map(), surfMeshes = [];
const kind = (m, k) => { if (m) surfKind.set(m, k); };
kind(MAT.wood, 'wood'); kind(MAT.planks, 'wood'); kind(MAT.asphalt, 'asphalt');
for (const m of [MAT.metal, MAT.plate, MAT.coping, MAT.grate, MAT.darkMetal, ...Object.values(MAT.railPaint || {})]) kind(m, 'metal');
// a park can tag its own materials (material.userData.surface = 'skatelite', 'wood', 'soft'...), so the same look can sound
// different in different parks (the mega park's skatelite megaramp is wood underneath; the skatepark's mini ramp is not tagged)
let surfTagged = false;
scene.traverse((o) => { if (o.isMesh && o.material.userData && o.material.userData.surface) { kind(o.material, o.material.userData.surface); surfTagged = true; } });
scene.traverse((o) => { if (o.isMesh && surfKind.has(o.material)) { o.geometry.computeBoundsTree(); surfMeshes.push(o); } });
const srfRay = new THREE.Raycaster(); srfRay.firstHitOnly = true;
const sv1 = new THREE.Vector3(), sv2 = new THREE.Vector3();
function surfaceUnder(p, up, reach = 0.6) {
  srfRay.set(sv1.copy(p).addScaledVector(up, 0.3), sv2.copy(up).negate()); srfRay.near = 0; srfRay.far = reach;
  const h = srfRay.intersectObjects(surfMeshes, false)[0];
  if (!h) return 'concrete';
  const g = phys.cast(sv1, sv2, reach);                       // something nearer on top of it? (a ledge on asphalt)
  return !g || h.distance <= g.dist + 0.04 ? surfKind.get(h.object.material) : 'concrete';
}
// rails and ledges: coping and pipe rails are metal, the rest is concrete/stone ledge
for (const sg of park.rails) {
  const mid = sg.a.clone().lerp(sg.b, 0.5).add(new THREE.Vector3(0, 0.05, 0));
  sg.mat = sg.coping ? 'metal' : surfaceUnder(mid, new THREE.Vector3(0, 1, 0), 0.5);
  if (sg.mat === 'asphalt') sg.mat = 'concrete';
}
let surfT = 0, dropI = 0;
const showMsg = (t) => { $('cam').textContent = t; $('cam').classList.remove('hidden'); camMsgT = 1.6; };
const skater = new SkaterView(scene);
const input = new Input();
const sound = new Sound();
// the Skater screen (customize.js): Skater button / Y on the title, LB + Y or Tab in the game. The game waits while it is open.
let waitRelease = false;
const closet = new Closet(skater, () => { waitRelease = true; });
for (const b of document.querySelectorAll('.open-closet')) b.addEventListener('click', (e) => { e.stopPropagation(); closet.show(); });

// session marker (D-pad down to drop, up to return)
const markerMesh = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 24),
  new THREE.MeshBasicMaterial({ color: 0x39d0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
markerMesh.rotation.x = -Math.PI / 2; markerMesh.visible = false; scene.add(markerMesh);

// contact shadow: a soft dark smudge on the ground right under the board, the bit of shade the shadow map is too coarse to
// draw (and the only grounding on 'low', which has no contact shading). It spreads and fades as the board rises.
const contact = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, "rgba(255,255,255,0.6)"); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.renderOrder = 1; m.frustumCulled = false; scene.add(m); return m;
})();
const _cd = new THREE.Vector3(0, -1, 0), _co = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cu = new THREE.Vector3(0, 1, 0), _cf = new THREE.Vector3();
function updateContact() {
  const k = T.contactShadow ?? 0.4, on = k > 0 && (phys.state === 'ground' || phys.state === 'air' || phys.state === 'grind');
  contact.visible = on; if (!on) return;
  const p = phys.renderPos || phys.pos, h = phys.cast(_co.copy(p).add(_cu.set(0, 0.3, 0)), _cd, 2.5);
  if (!h || h.normal.y < 0.3) { contact.visible = false; return; }
  const ht = Math.max(0, p.y - h.point.y), f = Math.max(0, 1 - ht / 1.6);
  contact.material.opacity = k * f * f;
  contact.position.copy(h.point).addScaledVector(h.normal, 0.004);
  _cq.setFromUnitVectors(_cu.set(0, 1, 0), h.normal); contact.quaternion.copy(_cq);
  _cf.copy(phys.fwd).applyQuaternion(_cq.invert()); contact.rotateY(Math.atan2(_cf.x, _cf.z));
  const sp = 1 + ht * 0.8; contact.scale.set(0.3 * sp, 1, 0.86 * sp);
}

// ── start screen ──
let started = false;
function start() { if (started || closet.open || waitRelease) return; started = true; $('start').classList.add('hidden'); sound.start(); }
$('start').addEventListener('click', start);
addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') start(); });

// ── camera: pick an angle (Back button or C), zoom it (d-pad left/right or [ ]) ──
// back/side/height are metres from the skater; ahead = how far in front of them the camera aims.
const VIEWS = {
  filmer:   { name: 'Filmer', back: T.cameraDistance, side: T.cameraSide ?? 0, height: T.cameraHeight, fov: T.cameraFov, ahead: 0.8, aimY: 0.7, fisheye: 1, dof: 1, shake: 1 },
  follow:   { name: 'Follow', back: 4.2, side: 0, height: 1.9, fov: 64, ahead: 1.5, aimY: 0.9, fisheye: 0.25, dof: 0.6, shake: 0.5 },
  wide:     { name: 'Wide', back: 8, side: 0, height: 3.6, fov: 55, ahead: 2, aimY: 0.8, fisheye: 0, dof: 0.3, shake: 0.2 },
  side:     { name: 'Side-on', back: 0.4, side: 5, height: 1.1, fov: 55, ahead: 0.6, aimY: 0.8, fisheye: 0.15, dof: 0.8, shake: 0.6 },
  board:    { name: 'Board cam', back: -0.42, side: 0, height: 0.3, fov: 92, ahead: 6, aimY: 0.5, fisheye: 1.2, dof: 0, shake: 0.4, stiff: 40, noZoom: true },
  overhead: { name: 'Overhead', back: 2.5, side: 0, height: 13, fov: 50, ahead: 1, aimY: 0, fisheye: 0, dof: 0, shake: 0 },
};
const VIEW_IDS = Object.keys(VIEWS);
// your last pick is remembered, until the starting angle in tweaks.js is changed
const saved = JSON.parse(localStorage.getItem('skate-camera') || 'null');
let viewId = new URLSearchParams(location.search).get('cam') || (saved && saved.from === T.cameraView ? saved.id : T.cameraView);
if (!VIEWS[viewId]) viewId = 'filmer';
let zoom = saved && saved.from === T.cameraView ? saved.zoom ?? 1 : 1, camMsgT = 0;
function setView(id, z) {
  viewId = id; zoom = Math.max(0.6, Math.min(2.5, z));
  localStorage.setItem('skate-camera', JSON.stringify({ from: T.cameraView, id: viewId, zoom }));
  $('cam').textContent = `Camera · ${VIEWS[viewId].name}`; $('cam').classList.remove('hidden'); camMsgT = 1.6;
}
// the camera's own ray: it looks past posts, trunks and see-through railings (thin props) instead of zooming in on them
const camO = new THREE.Vector3();
function camCast(o, d, far) {
  camO.copy(o); let gone = 0;
  for (let i = 0; i < 6; i++) {
    const h = phys.cast(camO, d, far - gone);
    if (!h || !h.thin) { if (h) h.dist += gone; return h; }
    const step = h.dist + 0.02; camO.addScaledVector(d, step); gone += step;
    if (gone >= far) return null;
  }
  return null;
}
const camDir = new THREE.Vector3(1, 0, 0), vel = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3();
const focus = new THREE.Vector3(), side = new THREE.Vector3(), eye = new THREE.Vector3(), toCam = new THREE.Vector3(), camV = new THREE.Vector3();
const lookS = new THREE.Vector3(), DOWNV = new THREE.Vector3(0, -1, 0), tv = new THREE.Vector3();
let camT = 0, camRoll = 0, kick = 0, lastLandAge = 99, camGround = 0, offInit = false, lastWarp = -1, pullIn = 99;
const offS = new THREE.Vector3(), lastPos = new THREE.Vector3(), warpOff = new THREE.Vector3(), push = new THREE.Vector3();
const AROUND = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0.7, 0, 0.7], [-0.7, 0, 0.7], [0.7, 0, -0.7], [-0.7, 0, -0.7]].map((a) => new THREE.Vector3(...a));
camera.position.copy(phys.pos).add(new THREE.Vector3(-4, 2, 0)); lookS.copy(phys.pos);
// Filmer cam (after the skate-video filmer the series is known for): low and close behind on a
// fisheye, riding a spring so it lags a touch and catches up, a handheld wobble, a kick on hard
// landings, rising over whatever is under it and never letting a wall get between it and the skater.
function updateCamera(dt) {
  const v = VIEWS[viewId], z = v.noZoom ? 1 : zoom, walking = phys.state === 'walk';
  gfx.view = v;
  // a teleport (respawn, reset, getting up after a bail): a short hop blends over, a long one is a clean cut. Never a whip pan.
  let cut = false;
  if (phys.warp !== lastWarp) {
    if (lastWarp >= 0 && lastPos.distanceTo(phys.pos) < 4) { warpOff.add(tv.subVectors(lastPos, phys.pos)); lookS.sub(tv); }
    else { cut = true; warpOff.set(0, 0, 0); camDir.set(phys.fwd.x, 0, phys.fwd.z); if (camDir.lengthSq() < 1e-4) camDir.set(1, 0, 0); camDir.normalize(); }
    lastWarp = phys.warp;
  }
  lastPos.copy(phys.pos);
  if (camMsgT > 0 && (camMsgT -= dt) <= 0) $('cam').classList.add('hidden');
  phys.getVel(vel); if (walking) vel.copy(phys.fwd).multiplyScalar(phys.walk.speed + 0.01);
  vel.y = 0;
  const sp = vel.length();
  // heading follows travel; slower to swing round in the air so spins don't whip the camera
  if (sp > (walking ? 0.2 : 1.2)) camDir.lerp(vel.multiplyScalar(1 / sp), 1 - Math.exp(-(phys.state === 'air' ? 1.2 : walking ? 2.5 : 3.2) * dt)).normalize();
  side.set(-camDir.z, 0, camDir.x);
  const back = (walking ? Math.max(v.back, 2.6) : v.back) * z + (v.back > 1 ? Math.min(0.6, sp * 0.035) : 0);
  // the filmer runs on the ground: in the air they stay low and tilt up, rising only part way
  const gUnder = camCast(tv.copy(phys.pos).setY(phys.pos.y + 0.5), DOWNV, 30);
  const hAbove = phys.state === 'air' && gUnder ? Math.max(0, phys.pos.y - gUnder.point.y) : 0;
  const baseY = phys.state === 'air' && gUnder ? gUnder.point.y : phys.pos.y;
  want.copy(phys.pos).setY(baseY).addScaledVector(camDir, -back).addScaledVector(side, v.side * z);
  want.y += (walking ? Math.max(v.height, 1.25) : v.height * (v.height > 1 ? z : 1)) + hAbove * (v.back > 1 ? 0.45 : 0.9);
  // rise over obstacles under the camera (a ledge, a ramp, a bowl wall)
  const g = camCast(tv.set(want.x, want.y + 3, want.z), DOWNV, 8);
  if (g) { camGround = g.point.y; want.y = Math.max(want.y, g.point.y + (v.back < 0 ? 0.2 : 0.42)); }
  // keep the skater in sight: if a wall is between them and the camera, come in closer
  eye.copy(phys.pos).y += 0.8; toCam.subVectors(want, eye); const dl = toCam.length();
  if (dl > 0.3) { const hit = camCast(eye, toCam.multiplyScalar(1 / dl), dl + 0.2); if (hit) want.copy(eye).addScaledVector(toCam, Math.max(0.35, hit.dist - 0.35)); }
  // critically damped spring on the camera's offset from the skater (not its world position, which
  // would trail further behind the faster you go): smooth swings, a little lag, no overshoot
  const w = v.stiff ?? (phys.state === 'air' ? 5 : 6.5);
  tv.subVectors(want, phys.pos);
  if (offS.distanceToSquared(tv) > 100 || !offInit || cut) { offS.copy(tv); camV.set(0, 0, 0); offInit = true; pullIn = 99; }
  camV.addScaledVector(tv.sub(offS), w * w * dt).multiplyScalar(Math.max(0, 1 - 2 * w * dt));
  offS.addScaledVector(camV, dt);
  phys.getVel(tv); if (walking) tv.set(0, 0, 0);
  warpOff.multiplyScalar(Math.exp(-9 * dt));
  camera.position.copy(phys.pos).add(offS).addScaledVector(tv, -0.025).add(warpOff);    // a touch of lag behind fast moves
  // never end up inside something: re-check the line from the skater. A wall in the way pulls the lens in
  // at once; when it clears, the lens eases back out instead of popping.
  toCam.subVectors(camera.position, eye); const d2 = toCam.length();
  if (d2 > 0.3) {
    toCam.multiplyScalar(1 / d2);
    const hit = camCast(eye, toCam, d2 + 0.15), lim = hit ? Math.max(0.3, hit.dist - 0.3) : d2;
    pullIn = lim < pullIn ? lim : pullIn + (lim - pullIn) * (1 - Math.exp(-4 * dt));
    if (pullIn < d2) camera.position.copy(eye).addScaledVector(toCam, pullIn);
  }
  // keep the lens a hand's width off any wall, ceiling or floor around it (so the near plane never cuts into one)
  push.set(0, 0, 0);
  for (const d of AROUND) { const h = phys.cast(camera.position, d, 0.32); if (h) push.addScaledVector(d, -(0.32 - h.dist)); }
  camera.position.add(push);
  const gc = camCast(tv.copy(camera.position).setY(camera.position.y + 1.5), DOWNV, 1.5 + 0.2);
  if (gc && camera.position.y < gc.point.y + 0.18) camera.position.y = gc.point.y + 0.18;
  // aim: just ahead of the skater, low enough to frame the board
  look.copy(phys.pos).addScaledVector(camDir, v.ahead); look.y += walking ? 1.0 : v.aimY - Math.min(0.25, hAbove * 0.1);
  if (cut) lookS.copy(look); else lookS.lerp(look, 1 - Math.exp(-(phys.state === 'air' ? 9 : 14) * dt));
  look.copy(lookS);
  // handheld: slow wander, a rattle that grows with speed and wobbles, and a kick on landings
  const L = phys.landing;
  if (L && L.age < lastLandAge) kick = Math.max(kick, 0.25 + L.impact * (L.quality === 'sketchy' ? 1.1 : 0.7));
  lastLandAge = L ? L.age : 99; kick *= Math.exp(-7 * dt);
  camT += dt; const sh = (T.cameraShake ?? 1) * v.shake * (0.35 + Math.min(1, sp / 9) * 0.65 + phys.wobble * 1.5), n = (f, o) => Math.sin(camT * f + o) * Math.sin(camT * f * 0.37 + o * 2.1);
  look.x += n(1.9, 0) * 0.035 * sh; look.y += n(2.3, 1.7) * 0.03 * sh + n(13, 0.4) * 0.006 * sh * sp / 9 - kick * 0.09 * v.shake; look.z += n(1.7, 4.2) * 0.035 * sh;
  look.addScaledVector(side, n(21, 0.3) * 0.02 * phys.wobble * v.shake);
  camera.lookAt(look);
  camRoll += ((-(phys.lean ?? 0) * 0.05 * v.shake + n(0.9, 2.2) * 0.008 * sh + n(17, 1) * kick * 0.012) - camRoll) * (1 - Math.exp(-4 * dt));
  camera.rotateZ(camRoll);
  camera.fov += (v.fov + Math.min(10, sp * 0.7) - camera.fov) * (1 - Math.exp(-3 * dt));
  camera.updateProjectionMatrix();
}

// ── HUD ──
let padShown, hudPts = -1;
const comboPts = () => Math.round(phys.combo.reduce((a, c) => a + c.pts, 0));
function updateHud() {
  $('score').textContent = phys.score.toLocaleString();
  $('speed').textContent = phys.state === 'walk' ? 'on foot · Y to ride' : `${Math.round(Math.abs(phys.speed) * 2.237)} mph${phys.stanceName && phys.stanceName !== 'regular' ? ' · ' + phys.stanceName : ''}`;
  const live = phys.combo.length ? phys.combo.map((c) => c.name).join(' + ') : '';
  const lc = phys.lastCombo, el = $('trick'), sub = $('trickpts');
  if (live) {
    el.textContent = live; el.className = 'live';
    sub.textContent = `${comboPts().toLocaleString()}  ×${phys.combo.length}`; sub.className = 'live';
  } else if (lc && performance.now() - lc.at < 2400) {
    el.textContent = lc.ok ? lc.text : `${lc.text}  — bailed`; el.className = lc.ok ? (lc.quality === 'sketchy' ? 'sk' : 'ok') : 'bad';
    sub.textContent = lc.ok ? `${lc.quality === 'sketchy' ? 'Sketchy' : 'Clean'}  +${lc.pts.toLocaleString()}` : ''; sub.className = el.className;
  } else { el.className = 'off'; sub.className = 'off'; }
  // balance meter for manuals and grinds
  const m = $('meter'), bal = phys.manual ? phys.manual.bal : phys.state === 'grind' && phys.grind ? phys.grind.bal : null;
  if (bal === null || bal === undefined) m.className = 'off';
  else { m.className = Math.abs(bal) > 0.7 ? 'warn' : ''; $('needle').style.left = `${50 + Math.max(-1, Math.min(1, bal)) * 48}%`; }
  if (input.padName !== padShown) {
    padShown = input.padName;
    $('pad').textContent = padShown ? 'Controller connected' : 'No controller — press any button on it, or use the keyboard';
    $('pad').className = padShown ? 'on' : '';
  }
}

// ── main loop ──
const STEP = 1 / 120, clock = new THREE.Clock(), held = { jump: false, hippie: false };
// the skater is drawn from the board's resting pose (on its two trucks), not the raw contact point (physics.js updateRenderPose)
const shown = new Proxy(phys, { get: (t, k) => (k === 'up' ? t.renderUp || t.up : k === 'pos' ? t.renderPos || t.pos : t[k]) });
let acc = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (window.game) window.game.simTime += dt;   // game clock (the clamped time input and physics are fed); tests hold inputs by it, not by frames
  const inp = input.poll(dt); input.last = inp;
  inp.camFwd = camDir;                     // walking is relative to where the camera looks
  closet.poll(dt, { title: !started });
  if (waitRelease && !inp.push && !inp.jump && !inp.tricks.length && performance.now() - closet.closedAt > 250) waitRelease = false;   // the button that closed it is not also a push
  if (closet.open || waitRelease) { inp.tricks.length = 0; for (const k in inp.just) delete inp.just[k]; inp.push = false; inp.jump = false; }
  if (!started && (inp.just.camOut || inp.just.camIn)) {     // d-pad left/right on the start screen picks the park
    const i = PARK_IDS.indexOf(parkId) + (inp.just.camIn ? 1 : -1);
    pickPark(PARK_IDS[(i + PARK_IDS.length) % PARK_IDS.length]);
  }
  if (!started && (inp.push || inp.tricks.length)) start();
  if (closet.open) { /* the game waits */ } else if (started) {
    const j = inp.just;
    if (j.reset) phys.respawn(park.spawn);
    if (j.respawn && phys.history.length) phys.respawn(phys.history[0]);
    if (j.marker && phys.state === 'ground') {
      phys.marker = { pos: phys.pos.clone(), fwd: phys.fwd.clone() };
      markerMesh.position.copy(phys.pos).y += 0.03; markerMesh.visible = true;
    }
    if (j.teleport && phys.marker) phys.respawn(phys.marker);
    if (j.help) $('help').classList.toggle('hidden');
    // drop points (d-pad up, or P): the tops of the big ramps, in turn
    if (j.drop && park.drops) { dropI = (dropI + 1) % park.drops.length; phys.respawn(park.drops[dropI]); showMsg(park.drops[dropI].name); }
    if (j.camera) setView(VIEW_IDS[(VIEW_IDS.indexOf(viewId) + 1) % VIEW_IDS.length], zoom);
    if (j.camOut) setView(viewId, zoom * 1.15);
    if (j.camIn) setView(viewId, zoom / 1.15);
    acc += dt;
    if ((surfT -= dt) <= 0 && phys.state === 'ground') { surfT = 0.12; phys.surface = surfaceUnder(phys.pos, phys.up); }
    // a fast screen (or a hitch) can give a frame with no physics step: a press made in it waits for the next step
    if (held.jump) inp.jump = true; if (held.hippie) inp.hippie = true;
    // lifts: stop on a glowing pad (or walk onto it) and it takes you up
    if (park.lifts && (phys.state === 'walk' || (phys.state === 'ground' && Math.abs(phys.speed) < 2.5))) for (const l of park.lifts) {
      if (Math.hypot(phys.pos.x - l.at.x, phys.pos.z - l.at.z) < l.r && Math.abs(phys.pos.y - l.at.y) < 0.5) { phys.respawn(l.to); showMsg(l.label); break; }
    }
    let steps = 0;
    const unstuck0 = phys.unstuck || 0;
    while (acc >= STEP) { phys.update(STEP, inp); acc -= STEP; steps++; }
    if ((phys.unstuck || 0) > unstuck0) showMsg('Stuck? Back on your board');     // the watchdog put him back (physics.js watchStuck)
    if (surfTagged && phys.fx.some((e) => e.startsWith('land'))) { surfT = 0.12; phys.surface = surfaceUnder(phys.pos, phys.up); }   // tagged parks: the landing sounds like what you landed on (the airbag, the skatelite)
    held.jump = !steps && inp.jump; held.hippie = !steps && inp.hippie;
    if (!steps && inp.just.board) { for (const k in inp.just) if (k !== 'board') delete inp.just[k]; }
    else for (const k in inp.just) delete inp.just[k];
  } else { inp.tricks.length = 0; for (const k in inp.just) delete inp.just[k]; }
  phys.updateRenderPose(); updateContact();
  skater.update(dt, shown);
  const fc = window.game?.freeCam;         // console trick: game.freeCam = {pos:[x,y,z], look:[x,y,z]} parks the camera
  if (fc) { camera.position.fromArray(fc.pos); camera.lookAt(...fc.look); } else if (closet.open) closet.camera(camera, phys.renderPos || phys.pos, dt); else updateCamera(dt);
  sound.update(phys, dt);
  updateHud();
  focus.copy(phys.pos); focus.y += 0.8;
  gfx.render(dt, focus);
  if (window.game && !window.game.ready) window.game.ready = true;   // first frame drawn: tests wait on this
}
frame();

// handy for poking at the game from the browser console
window.game = { closet, closetSlots: CHOICES, simTime: 0, sound, surfaceUnder, phys, park, parkId, input, T, camera, scene, start, gfx, skater, VIEWS, setView, get view() { return viewId; } };
