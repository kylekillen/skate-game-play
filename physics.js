// How the board moves. Three states: rolling on the ground, flying through
// the air, or locked onto a rail/ledge. Plus bailing.
import * as THREE from 'three';
import { TWEAKS as T } from './tweaks.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
const SIDES = [V(1, 0, 0), V(-1, 0, 0), V(0, 0, 1), V(0, 0, -1)];
const _o = V();
// The playable rectangle of each park (the fence line, or the far kerb before the buildings).
// A park can carry its own: park.bounds = {x0, x1, z0, z1}. Anything else uses the collision mesh's extent.
const PARK_BOUNDS = { skatepark: { x0: -73.6, x1: 73.6, z0: -55.6, z1: 55.6 }, plaza: { x0: -67, x1: 67, z0: -57, z1: 57 } };
const Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), QI = new THREE.Quaternion();
// turn the board's frame (up and forward together) toward a new up, by fraction k
function tilt(up, fwd, target, k) {
  Q2.setFromUnitVectors(up, target); Q.slerpQuaternions(QI, Q2, Math.min(1, k));
  up.applyQuaternion(Q).normalize(); fwd.applyQuaternion(Q); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
}
// One push stroke: how long it lasts (seconds), and the part of it (0..1) when the foot is on the ground.
// the body during a bail: a ball this big (metres); how long getting up takes (seconds)
export const BODY_R = 0.28, GETUP_TIME = 0.6;
export const PUSH_DUR = 0.72, PUSH_ON = 0.22, PUSH_OFF = 0.62;

// roll = full flips about the board's long axis (+ = kickflip way),
// yaw = half turns flat (+ = backside). A leading 'n:' on the name means nollie.
export const TRICKS = {
  ollie: { name: 'Ollie', pts: 50, dur: 0 },
  kickflip: { name: 'Kickflip', pts: 200, dur: 0.42, roll: 1 },
  heelflip: { name: 'Heelflip', pts: 200, dur: 0.42, roll: -1 },
  shuvit: { name: 'Pop Shuvit', pts: 150, dur: 0.38, yaw: 1 },
  fsshuvit: { name: 'FS Pop Shuvit', pts: 150, dur: 0.38, yaw: -1 },
  '360shuvit': { name: '360 Pop Shuvit', pts: 250, dur: 0.5, yaw: 2 },
  fs360shuvit: { name: 'FS 360 Pop Shuvit', pts: 250, dur: 0.5, yaw: -2 },
  varialkick: { name: 'Varial Kickflip', pts: 300, dur: 0.42, roll: 1, yaw: 1 },
  varialheel: { name: 'Varial Heelflip', pts: 300, dur: 0.42, roll: -1, yaw: -1 },
  hardflip: { name: 'Hardflip', pts: 350, dur: 0.42, roll: 1, yaw: -1 },
  inwardheel: { name: 'Inward Heelflip', pts: 350, dur: 0.42, roll: -1, yaw: 1 },
  '360flip': { name: '360 Flip', pts: 450, dur: 0.5, roll: 1, yaw: 2 },
  laserflip: { name: 'Laser Flip', pts: 500, dur: 0.5, roll: -1, yaw: -2 },
  '360hardflip': { name: '360 Hardflip', pts: 550, dur: 0.5, roll: 1, yaw: -2 },
  '360inwardheel': { name: '360 Inward Heelflip', pts: 550, dur: 0.5, roll: -1, yaw: 2 },
  // pitch = full turns end over end (the board wraps round the back foot, or the front foot for a nollie)
  impossible: { name: 'Impossible', pts: 450, dur: 0.44, pitch: 1 },
};
// Doubles: flick a flip and carry on rolling round the rim (input.js 'double'), or press the key twice.
// Two turns of flip in a little more time than one, so it needs a decent pop. Varial doubles have their own names.
const DOUBLES = { kickflip: ['Double Kickflip', 450], heelflip: ['Double Heelflip', 450], varialkick: ['Nightmare Flip', 600], varialheel: ['Daydream Flip', 600],
  hardflip: ['Double Hardflip', 650], inwardheel: ['Double Inward Heelflip', 650], '360flip': ['Double 360 Flip', 800], laserflip: ['Double Laser Flip', 850],
  '360hardflip': ['Double 360 Hardflip', 900], '360inwardheel': ['Double 360 Inward Heelflip', 900] };
for (const [k, [name, pts]] of Object.entries(DOUBLES)) { const d = TRICKS[k]; TRICKS['double' + k] = { name, pts, dur: Math.round(d.dur * 1.3 * 100) / 100, roll: d.roll * 2, ...(d.yaw ? { yaw: d.yaw } : {}) }; }
// The board's 360 shuv plus the body's 180 the same way = a bigspin (named when you land).
const BIGSPINS = { '360shuvit': 'Bigspin', fs360shuvit: 'FS Bigspin', '360flip': 'Bigspin Flip', laserflip: 'Bigspin Heelflip' };

// Grab names: which hand, then where the right stick is pushed while you hold it (8 ways: the diagonals are the
// fancier grabs). fwd = toward the nose, toe/heel = toward your toes/heels (goofy is mirrored in input.js).
const GRABS = {
  back: { base: 'Indy', fwd: 'Indy Nosebone', back: 'Indy Tailbone', heel: 'Tuck Knee', toe: 'Stiffy',
    fwdtoe: 'Crail', fwdheel: 'Christ Air', backheel: 'Stalefish', backtoe: 'Tailwalk' },
  front: { base: 'Backside Grab', fwd: 'Melon', back: 'Tweaked Backside Grab', heel: 'Method', toe: 'Crossbone',
    fwdtoe: 'Airwalk', fwdheel: 'Judo', backheel: 'Benihana', backtoe: 'Madonna' },
  both: { base: 'Double Grab', fwd: 'Tweaked Double Grab', back: 'Rocket Air', heel: 'Tweaked Double Grab', toe: 'Tweaked Double Grab',
    fwdtoe: 'Tweaked Double Grab', fwdheel: 'Tweaked Double Grab', backheel: 'Tweaked Double Grab', backtoe: 'Tweaked Double Grab' },
};
// Grabs that take a foot (or both) off the board. They score more, and the feet have to be back on before you
// land: let the right stick go (or the trigger) in time. Still off = slam, only half back = sketchy.
export const FEET_OFF = { 'Airwalk': 'both', 'Judo': 'front', 'Benihana': 'back', 'Madonna': 'front', 'Christ Air': 'both', 'Tailwalk': 'both' };
// how the board is held: [pitch (+ = nose down), yaw (+ = nose to the heels), roll (+ = deck turned to the toes)]
const TWEAK_POSE = { fwd: [0.3, 0, 0], back: [-0.3, 0, 0], heel: [0, 0.45, 0], toe: [0, -0.45, 0] };
const GRAB_BOARD = { 'Crail': [-0.32, 0, 0.1], 'Christ Air': [0, 0.15, -1.25], 'Stalefish': [-0.1, 0.25, 0.2], 'Tailwalk': [0.28, 0, 0],
  'Airwalk': [-0.3, 0, 0], 'Judo': [-0.18, 0, -0.12], 'Benihana': [-0.12, 0, 0], 'Madonna': [-0.32, 0, 0.12] };
export const grabBoard = (name, tw) => GRAB_BOARD[name] || TWEAK_POSE[tw] || [0, 0, 0];
const stickDir = (rs, min) => {
  const m = Math.hypot(rs.x, rs.y); if (m < min) return '';
  const ax = Math.abs(rs.x), ay = Math.abs(rs.y), v = rs.y > 0 ? 'back' : 'fwd', h = rs.x > 0 ? 'toe' : 'heel';
  if (Math.min(ax, ay) > 0.414 * Math.max(ax, ay)) return v + h;       // within 22.5 degrees of a diagonal
  return ay >= ax ? v : h;
};

// A popped trick's full name from the stance it was popped in and the spin it was landed with.
// spin is radians (+ = counter-clockwise from above). Frontside = toward your chest:
// counter-clockwise for a regular rider, clockwise for goofy (and the other way when riding switch).
export function trickName(e, spin) {
  const deg = Math.round(Math.abs(spin) / Math.PI) * 180;
  const fs = spin * ((T.stance === 'goofy') !== !!e.mirror ? -1 : 1) > 0;
  const stw = { regular: '', fakie: 'Fakie', switch: 'Switch', 'switch fakie': 'Fakie' }[e.stance] || '';
  if (deg === 180 && e.key) {
    const sameWay = e.key.includes('360') || e.key === 'laserflip' ? (TRICKS[e.key].yaw > 0) === !fs : false;   // board BS + body BS, or FS + FS
    let special = sameWay && BIGSPINS[e.key];
    if (!special && e.nollie && e.key === 'hardflip') special = 'Ghetto Bird';
    if (special) return [stw, e.nollie && special !== 'Ghetto Bird' ? 'Nollie' : '', special].filter(Boolean).join(' ');
  }
  if (deg && /fakie/.test(e.stance) && fs && !e.nollie && (deg === 180 || deg === 360)) return `${deg === 180 ? 'Half Cab' : 'Full Cab'}${e.base ? ' ' + e.base : ''}`;
  return [stw, e.nollie ? 'Nollie' : '', deg ? `${fs ? 'FS' : 'BS'} ${deg}` : '', e.base || (deg || e.nollie || stw ? (stw && !deg && !e.nollie ? 'Ollie' : '') : 'Ollie')].filter(Boolean).join(' ');
}

export class Physics {
  constructor(park) {
    this.park = park;
    this.pos = V(); this.fwd = V(); this.up = V(); this.vel = V();
    this.score = 0; this.fx = []; this.marker = null; this.lastCombo = null;
    const g = park.collider.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    this.feel = park.feel || {};          // a park can change the speed limits (the mega park goes faster)
    this.bounds = park.bounds || PARK_BOUNDS[park.which] || { x0: bb.min.x + 0.5, x1: bb.max.x - 0.5, z0: bb.min.z + 0.5, z1: bb.max.z - 0.5 };
    // rng and clock are the physics' own, so a run can be replayed exactly (test/clip.py swaps in a seeded rng)
    this.rng = Math.random; this.clock = 0;
    this.safe = V(); this.unclip = 0;      // last spot the skater was clear of everything; how many times we had to put him back there
    this.respawn(park.spawn);
  }

  respawn(s, walkedThere) {
    this.pos.copy(s.pos); this.fwd.copy(s.fwd).normalize(); this.up.set(0, 1, 0); this.safe.copy(this.pos); (this.safeUp ||= V()).set(0, 1, 0);
    if (!walkedThere) this.warp = (this.warp || 0) + 1;     // bumps on every teleport, so the camera knows to cut instead of swing
    this.speed = 0; this.vel.set(0, 0, 0); this.state = 'ground';
    this.trick = null; this.combo = []; this.grind = null; this.bail = null;
    this.pushT = 0; this.pushDur = PUSH_DUR; this.pushChain = 0; this.pushPhase = -1; this.pushHeld = false; this.pushDir = 1; this.airT = 0; this.spin = 0; this.noGrindT = 0;
    this.history = []; this.histT = 0; this.grab = false; this.crouch = false;
    this.watch = null; this.unclipRun = 0;     // the stuck watchdog starts over (watchStuck)
    this.manual = null; this.manLock = false; this.grabE = null; this.slide = 0; this.nollie = false;
    this.boardPose = { pitch: 0, yaw: 0, roll: 0 };
    this.feet = null;           // a grab with the feet off the board: {name, which: 'front'|'back'|'both', off: 0..1 (how far off), want}
    this.curv = 0; this.pumping = false; this.steep = false; this.transfer = false; this.vertAir = false;
    // ── state the skater view can read (names are stable) ──
    this.switchStance = false;  // true = feet swapped (riding the other way round from your natural stance)
    this.stanceName = 'regular'; // 'regular' | 'fakie' | 'switch' | 'switch fakie'
    this.revert = null;         // {t, dur, dir}: board pivoting 180 on the ground after a landing (dir +1 = FS, -1 = BS)
    this.bodyFlip = null;       // {dir, angle}: dir +1 = frontflip, -1 = backflip; angle = radians turned so far
    this.walk = null;           // off the board: {speed, sprint, vy, grounded, stride}; state is 'walk'
    this.hippie = null;         // {y, vy}: hippie jump, the skater's height above the board
    this.landing = null;        // last touchdown: {quality: 'clean'|'sketchy', q: 0..1, impact: 0..1, t}
    this.wobble = 0;            // speed wobbles / sketchy landing shake, 0..1
    this.lean = 0;              // carve lean, -1 (toward heels? left) .. 1, smoothed
    this.bump = 0;              // a jolt for the legs to soak up (cracks, small steps), decays fast
    this.popPower = 1;          // how big the last pop was (crouch time), ~0.8..1.1
    this.steerS = 0; this.wobT = 0; this.crackD = 0; this.surface = this.surface || 'concrete';
  }

  cast(o, d, far) {
    rc.set(o, d); rc.near = 0; rc.far = far;
    const h = rc.intersectObject(this.park.collider, false)[0];
    if (!h) return null;
    // the smooth (interpolated) normal, so curved ramps feel curved, not faceted
    const n = (h.normal || h.face.normal).clone(); if (n.dot(d) > 0) n.negate();
    const tr = !!(this.park.trFlags && this.park.trFlags[h.face.a]);
    const thin = !!(this.park.thinFlags && this.park.thinFlags[h.face.a]);     // a post, trunk or railing (colliders.js)
    return { point: h.point.clone(), normal: n, dist: h.distance, tr, thin, back: h.face.normal.dot(d) > 0.05 };
  }

  // ── keeping the skater out of the world's geometry ──
  // Is point p inside something solid? A ray from inside a closed shape hits the back of a face first.
  // Shapes overlap (a stair box sunk into a tier), so it takes a majority of six directions, not one ray.
  // (Every ray really votes: four of six must say 'inside'. It stops early once the answer is settled.)
  inside(p) {
    let n = (this.vote(p, UP) > 0) + (this.vote(p, DOWN) > 0), left = 4;
    for (const d of SIDES) { if (this.vote(p, d) > 0) n++; left--; if (n >= 4) return true; if (n + left < 4) return false; }
    return false;
  }
  vote(p, d) {
    rc.set(p, d); rc.near = 0; rc.far = 400;
    const h = rc.intersectObject(this.park.collider, false)[0];
    if (!h) return 0;
    const s = h.face.normal.dot(d);
    return s > 0.05 ? 1 : s < -0.05 ? -1 : 0;
  }
  // The edge of the map: outside the park's rectangle, or nothing under you at all (the void past the last slab).
  offMap(p) {
    const b = this.bounds;
    if (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1) return true;
    return !this.cast(_o.set(p.x, p.y + 3, p.z), DOWN, 90);
  }
  // which way is back into the map from p, heading along d (horizontal, pointing inward)
  mapNormal(p, d) {
    const n = V(), a = V(p.x + Math.sign(d.x) * 0.6, p.y, p.z), c = V(p.x, p.y, p.z + Math.sign(d.z) * 0.6);
    if (Math.abs(d.x) > 1e-3 && this.offMap(a)) n.x = -Math.sign(d.x);
    if (Math.abs(d.z) > 1e-3 && this.offMap(c)) n.z = -Math.sign(d.z);
    if (!n.lengthSq()) n.set(-d.x, 0, -d.z);
    return n.lengthSq() > 1e-8 ? n.normalize() : n.set(1, 0, 0);
  }
  // A body-height check: the board point, the hips and the chest all have to be out in the open.
  // (Three points, no gap taller than 0.45 m: a bench back or a railing can't slip between them.)
  clear(pos, up) {
    for (const k of [0.12, 0.5, 0.95]) if (this.inside(_o.copy(pos).addScaledVector(up, k))) return false;
    return !this.under(_o.copy(pos).addScaledVector(up, 0.12));
  }
  // Under the world: the underside of a surface overhead and no floor below (slipped through a bowl or a ramp,
  // which are open shells, so inside() can't see it).
  under(p) {
    const u = this.cast(p, UP, 40);
    return !!(u && u.back && !this.cast(p, DOWN, 80));
  }

  // ── what the skater view should draw: the board resting on its two trucks ──
  // On the ground the board's tilt comes from where its front and back wheels touch, so where a bank meets
  // the flat it rocks over across a wheelbase instead of snapping to the new slope in one step.
  // phys.renderPos / renderUp / renderQuat (basis x = up × fwd, y = up, z = fwd, like the board). Call once a frame.
  updateRenderPose() {
    const rp = this.renderPos || (this.renderPos = V()), ru = this.renderUp || (this.renderUp = V()), rq = this.renderQuat || (this.renderQuat = new THREE.Quaternion());
    rp.copy(this.pos); ru.copy(this.state === 'walk' ? UP : this.up);
    if (this.state === 'ground') {
      const up = this.up, dn = up.clone().negate(), half = T.wheelbase ? T.wheelbase / 2 : 0.4;
      const f = this.cast(this.pos.clone().addScaledVector(this.fwd, half).addScaledVector(up, 0.5), dn, 1.1);
      const b = this.cast(this.pos.clone().addScaledVector(this.fwd, -half).addScaledVector(up, 0.5), dn, 1.1);
      if (f && b && f.normal.dot(up) > 0.5 && b.normal.dot(up) > 0.5) {
        const axis = V().subVectors(f.point, b.point).normalize(), u = up.clone().addScaledVector(axis, -up.dot(axis));
        if (u.lengthSq() > 0.25 && u.normalize().dot(up) > 0.7) {
          ru.copy(u);
          const lift = V().addVectors(f.point, b.point).multiplyScalar(0.5).sub(this.pos).dot(ru);
          if (lift > 0) rp.addScaledVector(ru, Math.min(lift, 0.3));      // in a dip the trucks hold the deck up; over a lip it rests on the middle
        }
      }
    }
    const z = this.fwd.clone().addScaledVector(ru, -this.fwd.dot(ru)).normalize(), x = V().crossVectors(ru, z);
    rq.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, ru, z));
  }

  // Current velocity as a vector, whatever state we're in.
  getVel(out) {
    if (this.state === 'ground') return out.copy(this.fwd).multiplyScalar(this.speed);
    if (this.state === 'grind') return out.copy(this.grind.seg.dir).multiplyScalar(this.grind.speed);
    if (this.state === 'bail') return out.copy(this.bail.vel);
    return out.copy(this.vel);
  }

  update(dt, inp) {
    this.step(dt, inp);
    if (this.watchdog !== false) this.watchStuck(dt, inp);
  }

  // ── the stuck watchdog: the last safety net, so nobody ever has to reload the page ──
  // If he can't get anywhere for a few seconds while the player keeps pushing (or walking), or a state goes on far
  // longer than it ever can in play, he is put back on his board at the last open spot he was riding through (or,
  // failing that, clear ground nearby, or the park's start). phys.unstuck counts how often it had to; phys.watchdog =
  // false switches it off (test/stuck.py does, to find the causes underneath).
  watchStuck(dt, inp) {
    const w = this.watch || (this.watch = { t: 0, from: this.pos.clone(), st: this.state, stT: 0, ph: null, phT: 0, rec: 0 });
    const spots = this.goodSpots || (this.goodSpots = []);
    if (this.state !== w.st) { w.st = this.state; w.stT = 0; } else w.stT += dt;
    const ph = this.bail && this.bail.phase; if (ph !== w.ph) { w.ph = ph; w.phT = 0; } else w.phT += dt;
    // where he has been riding or walking freely: the spots to go back to
    if ((w.rec -= dt) <= 0) {
      w.rec = 0.5;
      const moving = this.state === 'ground' ? this.up.y > 0.9 && Math.abs(this.speed) > 0.8 : this.state === 'walk' && this.walk && this.walk.grounded && this.walk.speed > 0.5;
      if (moving && this.clear(this.pos, UP)) {
        spots.push({ pos: this.pos.clone(), fwd: V(this.fwd.x, 0, this.fwd.z).normalize().multiplyScalar(this.speed < 0 ? -1 : 1) });
        if (spots.length > 40) spots.shift();
      }
    }
    let why = null;
    const lim = { air: 9, grind: 15, bail: 15 }[this.state], plim = { getup: 3, fetch: 8 }[ph];
    if (lim && w.stT > lim) why = this.state + ' went on too long';
    else if (plim && w.phT > plim) why = 'bail ' + ph + ' went on too long';
    else if (this.unclipRun > 60) why = 'kept being put back out of the geometry';
    else {
      const trying = this.state === 'ground' ? inp.push && !inp.brake && !(inp.ly > 0.75)
        : this.state === 'walk' ? Math.abs(inp.ly || inp.walkY || 0) > 0.5 || Math.abs(inp.steer) > 0.5 : false;
      if (this.pos.distanceTo(w.from) > 0.6 || (!trying && w.t <= 0)) { w.from.copy(this.pos); w.t = 0; }
      else w.t = trying ? w.t + dt : Math.max(0, w.t - dt);
      if (w.t > (this.state === 'walk' ? 3.5 : 3)) why = `could not move (${this.state})`;
    }
    if (why) this.unstick(why);
  }
  unstick(why) {
    this.unstuck = (this.unstuck || 0) + 1; this.lastUnstuck = why;
    const here = (this.state === 'bail' ? this.bail.bodyPos : this.pos).clone(), spots = this.goodSpots || [];
    let to = null;
    while (spots.length && !to) {         // newest first; a spot right by where he got stuck is no good
      const s = spots.pop();
      if (s.pos.distanceTo(here) > 2 && !this.offMap(s.pos) && this.clear(s.pos, UP)) to = { pos: s.pos, fwd: s.fwd };
    }
    if (!to) { const q = this.safeSpot(here); if (q) to = { pos: q, fwd: this.fwd.clone().setY(0).normalize() }; }
    if (!to || to.fwd.lengthSq() < 0.5) to = to ? { pos: to.pos, fwd: this.park.spawn.fwd } : this.park.spawn;
    const wall = this.cast(to.pos.clone().add(V(0, 0.3, 0)), to.fwd, 2.5);
    this.respawn({ pos: to.pos, fwd: wall && wall.normal.y < 0.5 ? to.fwd.clone().negate() : to.fwd });
    this.fx.push('unstuck');
  }

  step(dt, inp) {
    this.clock += dt; this.noGrindT -= dt;
    this.bump *= Math.max(0, 1 - 10 * dt);
    if (this.landing) this.landing.age = (this.landing.age || 0) + dt;
    if (this.state === 'bail') return this.stepBail(dt, inp);
    if (inp.just && inp.just.board) { inp.just.board = false; if (this.state === 'walk') return this.boardOn(); if (this.state === 'ground') return this.boardOff(); }
    if (this.state === 'walk') { inp.tricks.length = 0; this.stepWalk(dt, inp); if (this.state === 'walk') this.guard(); return; }
    if (inp.hippie && this.state === 'ground' && !this.hippie && !this.manual && Math.abs(this.speed) > 1) {
      this.hippie = { y: 0, vy: T.hippieJump ?? 4.2 }; this.combo.push({ name: 'Hippie Jump', pts: 150 }); this.fx.push('jump');
    }
    while (inp.tricks.length) this.pop(inp.tricks.shift(), inp);
    this.crouch = (inp.loaded || (this.state === 'ground' && (inp.pump || (inp.push && this.curv > 0.05)) && this.curv < 0.2)) && this.state !== 'air';
    this.stepGrab(dt, inp);
    if (this.state === 'ground') this.stepGround(dt, inp);
    else if (this.state === 'air') this.stepAir(dt, inp);
    else this.stepGrind(dt, inp);
    this.stepHippie(dt);
    this.stepPose(dt);
    this.stanceName = this.switchStance ? (this.speed > 0.3 ? 'switch fakie' : 'switch') : (this.speed < -0.3 ? 'fakie' : 'regular');
    if (this.state !== 'bail') this.guard();
    if (this.pos.y < -30) this.respawn(this.park.spawn);
  }

  // ── hippie jump: the skater jumps, the board rolls on underneath ──
  stepHippie(dt) {
    const h = this.hippie; if (!h) return;
    h.vy -= T.gravity * dt; h.y += h.vy * dt;
    if (this.state !== 'ground') { this.hippie = null; return; }     // board left the ground under you
    if (h.y <= 0 && h.vy < 0) { this.hippie = null; this.fx.push('land'); this.landing = { quality: 'clean', q: 1, impact: 0.3, age: 0 }; this.bank(); }
  }

  // ── off the board: walk, sprint (X), jump (A); Y gets back on ──
  boardOff() {
    this.bank(); this.state = 'walk'; this.manual = null; this.slide = 0; this.revert = null; this.hippie = null;
    this.walk = { speed: Math.min(Math.abs(this.speed), 3), sprint: false, vy: 0, grounded: true, stride: 0 };
    this.up.set(0, 1, 0); this.fwd.y = 0; this.fwd.normalize();
    if (this.speed < 0) this.fwd.negate();
    this.speed = 0; this.fx.push('stepoff');
  }
  boardOn() {
    const w = this.walk; this.walk = null; this.state = 'ground';
    this.speed = w && w.grounded ? Math.min(w.speed, 4) : 0; this.switchStance = false; this.fx.push('stepon');
  }
  stepWalk(dt, inp) {
    const w = this.walk, cf = inp.camFwd || this.fwd;
    const f = V(cf.x, 0, cf.z).normalize(), r = V(-f.z, 0, f.x);
    const want = V().addScaledVector(f, -(inp.ly || inp.walkY || 0)).addScaledVector(r, inp.steer);
    const m = Math.min(1, want.length());
    w.sprint = !!inp.sprint && m > 0.3;
    const top = (w.sprint ? T.sprintSpeed ?? 4.6 : T.walkSpeed ?? 1.7) * m;
    if (m > 0.05) { want.normalize(); this.fwd.lerp(want, Math.min(1, 10 * dt)).normalize(); }
    w.speed += (top - w.speed) * Math.min(1, (top > w.speed ? 6 : 9) * dt);
    if (inp.jump && w.grounded) { w.vy = T.walkJump ?? 4; w.grounded = false; this.fx.push('jump'); }
    const step = this.fwd.clone().multiplyScalar(w.speed * dt);
    // bump into walls instead of walking through them: feelers at knee and chest height, and slide along
    // whatever they touch (twice, so walking into a corner stops you instead of pushing through one wall)
    for (let k = 0; k < 2 && step.lengthSq() > 1e-10; k++) {
      const len = step.length(), dir = step.clone().multiplyScalar(1 / len);
      let wall = null;
      for (const hy of [0.3, 1.0]) {
        const h = this.cast(this.pos.clone().add(V(0, hy, 0)), dir, len + 0.3);
        if (h && !h.back && h.normal.y < 0.5 && (!wall || h.dist < wall.dist)) wall = h;
      }
      if (!wall) break;
      const n = V(wall.normal.x, 0, wall.normal.z).normalize();
      if (step.dot(n) < 0) step.addScaledVector(n, -step.dot(n));
      if (wall.dist < 0.3) step.addScaledVector(n, Math.min(0.02, 0.3 - wall.dist));
    }
    // the edge of the map stops you like a wall
    if (this.offMap(this.pos.clone().addScaledVector(step, 1).addScaledVector(this.fwd, 0.3))) {
      const n = this.mapNormal(this.pos, this.fwd); if (step.dot(n) < 0) step.addScaledVector(n, -step.dot(n));
    }
    this.pos.add(step);
    w.vy -= T.gravity * dt; let ny = this.pos.y + w.vy * dt;
    const g = this.cast(this.pos.clone().add(V(0, 0.45, 0)), DOWN, 3);
    if (g && !g.back && ny <= g.point.y && g.normal.y > 0.5 && g.point.y - this.pos.y < 0.45) {
      if (!w.grounded && w.vy < -2) this.fx.push('walkland');
      ny = g.point.y; w.vy = 0; w.grounded = true;
    } else if (g && !g.back && ny <= g.point.y && g.point.y - this.pos.y < 0.45) {
      // too steep to stand on (a bowl wall): you slide down it, pushed off along its slope
      ny = g.point.y; w.vy = Math.max(w.vy, -2); w.grounded = false;
      this.pos.x += g.normal.x * 1.5 * dt; this.pos.z += g.normal.z * 1.5 * dt;
    } else w.grounded = false;
    this.pos.y = ny;
    if (w.grounded && w.speed > 0.3) {            // footsteps
      w.stride += w.speed * dt;
      const len = w.sprint ? 1.25 : 0.72;
      if (w.stride > len) { w.stride -= len; this.fx.push('step'); }
    }
    if (this.pos.y < -30) this.respawn(this.park.spawn);
  }

  // ── grabs: a trigger in the air grabs, the right stick tweaks it ──
  stepGrab(dt, inp) {
    const l = inp.grabL > 0.5, r = inp.grabR > 0.5, goofy = T.stance === 'goofy';
    const flipping = this.trick && this.trick.t < this.trick.def.dur;
    this.grab = this.state === 'air' && this.airT > 0.15 && !flipping && (l || r);
    if (!this.grab) { if (!l && !r) this.grabE = null; this.stepFeet(dt); return; }
    const hand = l && r ? 'both' : (goofy ? r : l) ? 'front' : 'back';   // your front hand is the one up the board
    if (!this.grabE || this.grabE.hand !== hand) {
      const entry = { name: GRABS[hand].base, pts: 100 };
      this.grabE = { hand, entry, tw: '' }; this.combo.push(entry);
    }
    const g = this.grabE, tw = stickDir(inp.rs, 0.6);
    if (tw && tw !== g.tw) {
      const name = GRABS[hand][tw], off = FEET_OFF[name];
      if (!g.tw) g.entry.pts += 100;
      if (off && !g.offPaid) { g.entry.pts += 250; g.offPaid = true; }        // a foot off the board is worth more
      g.tw = tw; g.name = g.entry.name = name;
    }
    // feet off: only while the stick is still held out in that grab's direction
    const off = FEET_OFF[g.name], holdOff = off && Math.hypot(inp.rs.x, inp.rs.y) > 0.5 && stickDir(inp.rs, 0.5) === g.tw;
    if (holdOff) this.feet = { name: g.name, which: off, off: this.feet && this.feet.name === g.name ? this.feet.off : 0, want: 1 };
    else if (this.feet) this.feet.want = 0;
    g.entry.pts += (off ? 260 : 150) * dt;
    this.stepFeet(dt);
  }

  // feet off the board for a grab: out in ~0.16 s, back on in ~0.22 s (T.feetOffTime / T.feetBackTime)
  stepFeet(dt) {
    const f = this.feet; if (!f) return;
    if (this.state !== 'air') { this.feet = null; return; }
    if (!this.grab) f.want = 0;
    f.off = f.want ? Math.min(1, f.off + dt / (T.feetOffTime ?? 0.16)) : Math.max(0, f.off - dt / (T.feetBackTime ?? 0.22));
    if (!f.want && f.off <= 0) this.feet = null;
  }

  // Extra board tilt/turn the skater model adds on top: manuals, grind styles, tweaks, slides.
  stepPose(dt) {
    let p = 0, y = 0, r = 0;
    if (this.state === 'ground' && this.manual) p = -0.24 * this.manual.dir + 0.07 * this.manual.bal;
    else if (this.state === 'ground' && this.slide) y = -1.25 * this.slide;
    else if (this.state === 'grind') { p = this.grind.pitch; y = this.grind.yaw; }
    else if (this.state === 'air') {
      if (this.nollie && this.popT < 0.22) p = 0.84 * Math.sin((this.popT / 0.22) * Math.PI);   // nose pops instead of tail
      if (this.grab && this.grabE && this.grabE.tw) {
        const t = grabBoard(this.grabE.name, this.grabE.tw);
        p += t[0]; y += t[1]; r += t[2];
      }
    }
    if (this.wobble > 0.01 && this.state === 'ground') y += this.wobble * 0.07 * Math.sin(this.clock * 24);
    const k = Math.min(1, 16 * dt), b = this.boardPose;
    b.pitch += (p - b.pitch) * k; b.yaw += (y - b.yaw) * k; b.roll = (b.roll || 0) + (r - (b.roll || 0)) * k;
    // revert: the board (and you) keep turning the last half-turn on the ground. revert.yaw = how far is still to go.
    if (this.revert) { const r = this.revert, e = Math.min(1, r.t / r.dur); r.yaw = -r.dir * Math.PI * (1 - e * e * (3 - 2 * e)); b.yaw = r.yaw; }
  }

  // ── manuals: balance on two wheels to keep a combo alive ──
  startManual(dir) {
    const entry = { name: dir > 0 ? 'Manual' : 'Nose Manual', pts: 50 };
    this.manual = { dir, bal: 0, grace: 0.4, entry }; this.combo.push(entry);
  }
  stepManual(dt, inp) {
    const m = this.manual, held = inp.manual === m.dir;
    if (inp.loaded) m.grace -= dt;            // crouching to pop out of it: a moment of slack
    else if (held) m.grace = 0.4;
    else m.grace -= dt * 2;
    // too far or not far enough on the stick and you tip over
    const err = held ? Math.abs(inp.rs.y) - T.manualSweet : 0;
    const over = Math.sign(err) * Math.max(0, Math.abs(err) - T.manualForgive);
    m.bal = over ? m.bal + over * T.manualTwitch * dt : m.bal * Math.max(0, 1 - 2 * dt);
    m.entry.pts += 60 * dt;
    if (m.grace <= 0 || Math.abs(m.bal) >= 1 || Math.abs(this.speed) < 0.6) { this.manual = null; this.manLock = true; this.bank(); }
  }

  // ── rolling ──
  stepGround(dt, inp) {
    const up = this.up, fwd = this.fwd;
    // powerslide: left stick pulled back kicks the board sideways and scrubs speed
    const sliding = inp.ly > 0.75 && Math.abs(this.speed) > (this.slide ? 0.3 : 1.5) && !this.manual;   // held, it slides you to a stop
    if (!sliding) this.slide = 0; else if (!this.slide) this.slide = inp.steer < 0 ? -1 : 1;
    if (this.slide) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), T.powerslidePower * dt);
    if (this.manual) this.stepManual(dt, inp);
    else if (!inp.manual) this.manLock = false;      // stick back to the middle before the next one
    else if (!this.manLock && Math.abs(this.speed) > 1 && up.y > 0.9) this.startManual(inp.manual);

    // weight: the board answers the stick a beat late, so carves build up instead of snapping
    const asp = Math.abs(this.speed);
    // (heavier the faster you go: at speed a carve takes a moment to lean into)
    this.steerS += (inp.steer - this.steerS) * Math.min(1, (T.steerResponse ?? 9) / (1 + asp * (T.steerHeavy ?? 0)) * dt);
    // speed wobbles: hold a bomb past wobbleSpeed and the trucks start to shimmy (brake, carve or crouch to calm them)
    const ws = this.feel.wobbleSpeed ?? T.wobbleSpeed ?? 13.5;
    if (asp > ws && !inp.loaded && !inp.brake && Math.abs(inp.steer) < 0.4) this.wobT += dt; else this.wobT = Math.max(0, this.wobT - 2 * dt);
    const wobTarget = Math.min(1, Math.max(0, (asp - ws) / 5) * Math.min(1, this.wobT / 1.2));
    this.wobble = Math.max(wobTarget, this.wobble - dt * 0.8);
    const shimmy = this.wobble * 0.22 * Math.sin(this.clock * 19) * Math.sin(this.clock * 7.1 + 1);
    // full-lock turn rate: tight at walking pace, and at speed no harder than the wheels can hold (carveGrip, sideways m/s²)
    let turn = T.turnRate / (1 + asp * T.turnSpeedFalloff);
    const grip = T.carveGrip ?? 0; if (grip > 0 && asp > 0.5 && !this.slide) { const c = grip / asp; turn = 1 / Math.sqrt(Math.sqrt(turn ** -4 + c ** -4)); }
    if (this.slide) turn *= 1.5;
    fwd.applyAxisAngle(up, -(this.steerS + shimmy) * turn * dt);
    // carving costs a little speed (wheels scrub), and leaning shows it
    if (!this.slide) this.speed -= Math.sign(this.speed) * Math.min(asp, Math.abs(this.steerS) * asp * (T.carveScrub ?? 0.035) * dt);
    this.lean += (this.steerS * Math.min(1, asp / 6) - this.lean) * Math.min(1, 8 * dt);
    if (this.revert && (this.revert.t += dt) >= this.revert.dur) { this.revert = null; this.bank(); }

    // pushing: each push is one smooth stroke. The speed comes in while the foot is on the
    // ground (the middle of the stroke), and a few pushes take you to top speed. At top
    // speed the skater just rides, even with the button held.
    // on a ramp you can't push; the push button (or left stick forward) pumps instead
    const onTranny = up.y < 0.94 || Math.abs(this.curv) > 0.12;
    const pumpIn = !!inp.pump || (inp.push && onTranny);
    this.pumping = pumpIn && this.curv > 0.08;
    if (this.pumping && Math.abs(this.speed) > 0.5) {
      // pumping = standing up against the pull of the curve: the tighter the curve and faster you go, the more it gives
      const gain = (T.pumpPower ?? 0.12) * Math.min(this.curv, 0.9) * this.speed * this.speed * dt;
      this.speed += Math.sign(this.speed) * Math.min(gain, 6 * dt);
    }
    this.pushT -= dt;
    // each push adds less the faster you already go (your foot has to move faster than the ground to add any):
    // pushTaper 0 = every push the same, 0.6 = the first push gives about four times what the last one before top speed does
    const top = T.maxPushSpeed, tp = T.pushTaper ?? 0, fresh = inp.push && !this.pushHeld;
    const gain = (top / (T.pushesToMax ?? 3) + 0.3) * (1 + tp - 2 * tp * Math.min(1, Math.abs(this.speed) / top));
    this.pushHeld = inp.push;
    // holding the button chains pushes back to back, each stroke quicker than the last (pushHoldFastest, pushHoldRamp)
    if (!inp.push || fresh) this.pushChain = 0;
    const room = Math.abs(this.speed) < top * 0.97;
    // pushing while rolling backwards: you turn round and ride switch (or back to your natural stance)
    const backwards = this.switchStance ? this.speed > 0.3 : this.speed < -0.3;
    if (fresh && backwards && !onTranny && Math.abs(this.speed) > 0.8 && !this.manual && !this.revert) { this.switchStance = !this.switchStance; this.fx.push('turn'); }
    if (inp.push && !onTranny && this.pushT <= (this.pushChain ? 0 : -0.1) && room && !this.manual && !this.slide && !this.revert && !this.hippie) {
      // pushing while rolling backwards: you turn round and ride switch (or back to your natural stance)
      this.pushDir = this.speed < -0.3 ? -1 : this.speed > 0.3 ? 1 : this.switchStance ? -1 : 1; 
      const k = Math.min(1, this.pushChain / (T.pushHoldRamp ?? 3)); this.pushChain++;
      this.pushDur = PUSH_DUR + (Math.min(PUSH_DUR, T.pushHoldFastest ?? 0.42) - PUSH_DUR) * k;
      this.pushT = this.pushDur; this.fx.push('push');
    }
    this.pushPhase = this.pushT > 0 ? 1 - this.pushT / this.pushDur : -1;
    const driving = this.pushPhase >= PUSH_ON && this.pushPhase < PUSH_OFF;
    if (driving && Math.abs(this.speed) < top) {
      const a = gain / ((PUSH_OFF - PUSH_ON) * this.pushDur);
      this.speed = Math.max(-top, Math.min(top, this.speed + this.pushDir * a * dt));
    }
    if (inp.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), T.brakePower * dt);

    // gravity along the slope, and slopes pull your nose downhill
    this.speed += -T.gravity * fwd.y * dt;
    const v2s = this.speed * this.speed;
    const side = V().crossVectors(up, fwd);
    const gs = -T.gravity * side.y;
    if (Math.abs(gs) > 0.01) {
      const s = Math.abs(this.speed) < 1.5 ? (this.speed < 0 ? -1.5 : 1.5) : this.speed;
      fwd.addScaledVector(side, gs * dt / s).normalize();
    }
    // rolling resistance plus air drag (grows with speed squared, so hills top out instead of running away)
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), ((driving ? 0 : T.rollFriction) + (this.feel.airDrag ?? T.airDrag ?? 0) * v2s + (this.park.soft && this.softAt(this.pos) ? 4 : 0)) * dt);
    const vmax = this.feel.maxSpeed ?? T.maxSpeed;
    this.speed = Math.max(-vmax, Math.min(vmax, this.speed));

    // walls: three feelers at shin height (middle and either side of the board), so a corner or a
    // post can't slip between them. The nearest wall-like hit wins.
    const sgn = this.speed < 0 ? -1 : 1, move = fwd.clone().multiplyScalar(sgn), reach = Math.abs(this.speed) * dt + 0.35;
    const sideV = V().crossVectors(up, fwd).normalize();
    let w = null;
    const shin = this.pos.clone().addScaledVector(up, 0.3);
    for (const o of [0, 0.2, -0.2]) {
      // a side feeler never starts behind a wall he is riding along (it would catch the wall's inside and pin him to it)
      let off = o;
      if (o) { const s = this.cast(shin, _o.copy(sideV).multiplyScalar(Math.sign(o)), 0.25); if (s && !s.back) off = Math.sign(o) * Math.max(0, s.dist - 0.05); }
      const h = this.cast(shin.clone().addScaledVector(sideV, off), move, reach);
      if (h && !h.back && h.normal.dot(up) < 0.35 && (!w || h.dist < w.dist)) w = h;
    }
    if (w) {
      const into = -move.dot(w.normal);
      if (Math.abs(this.speed) > T.bailWallSpeed && into > 0.6) return this.slam(null, { impact: Math.abs(this.speed) * into });
      this.hitWall(w.normal, into, w.dist, move, 0.8, w.thin);
    }
    // the edge of the map: an invisible wall that turns you back, never a slam
    const ahead = this.pos.clone().addScaledVector(move, reach);
    if (this.offMap(ahead)) {
      const n = this.mapNormal(this.pos, move);
      const into = -move.dot(n);
      if (into > 0.7) { fwd.addScaledVector(n, -2 * fwd.dot(n)).normalize(); this.speed *= 0.35; this.fx.push('bump'); }    // head on: bounced back the way you came
      else if (into > 0) this.hitWall(n, into, 1, move, 0.5);     // glancing: turn along the edge, no shove
    }

    const next = this.pos.clone().addScaledVector(fwd, this.speed * dt);
    const h = this.cast(next.clone().addScaledVector(up, 0.5), up.clone().negate(), 0.72);
    const ds = Math.abs(this.speed) * dt, v2 = this.speed * this.speed;
    if (h && !h.back && h.normal.dot(up) > 0.5) {
      if (h.dist < 0.5 - T.stepUp) {           // too tall to roll over
        if (Math.abs(this.speed) > T.bailWallSpeed) return this.slam();
        this.speed = 0; return;
      }
      // the ground falls away under you: off a step or ledge at speed you fly, you don't stair-bump
      const drop = h.dist - 0.5, ang = up.angleTo(h.normal);
      // surface curving away (convex): the bend has to be mostly along the way he is going. A ramp's foot beside
      // him, or a kink in a bowl floor's smoothed normals, tilts the normal sideways and is not a lip to fly off.
      const away = ang > 1e-4 && V().subVectors(h.normal, up).dot(move) > 0.3 * ang;
      // a sharp convex lip (a deck meeting a ramp, the top of a bank or a quarter): a point would fly off it at any
      // speed, but a skater's knees soak up the hop. So slow you roll over it (or drop in) glued, fast you still fly,
      // with the soaked-up part taken off the launch so the air grows smoothly with speed instead of popping on.
      if (away && ang > 0.12) {
        const vel = fwd.clone().multiplyScalar(this.speed), vp = vel.dot(h.normal);
        const dropIn = h.normal.y < up.y - 0.02;     // getting steeper (off a deck into a ramp), not cresting onto something flatter
        const soak = dropIn ? (T.dropInStick ?? 3.2) : (T.lipStick ?? 1.8);
        if (vp > soak) { this.pos.copy(next); this.vel.copy(vel).addScaledVector(h.normal, -soak); return this.goAir(); }
      } else if ((drop > 0.07 && Math.abs(this.speed) > 2.5) || (away && drop > -0.004 && ds > 1e-5 && v2 * ang / ds > T.gravity * Math.max(0.2, up.y) * 1.15 + 2 && ang > 0.03)) {
        // (drop > -0.004: the ground really does fall away ahead, not rise. A rising surface can't throw him off it,
        // and flying from one leaves him under its skin, where he could never land.)
        this.pos.copy(next); this.vel.copy(fwd).multiplyScalar(this.speed); return this.goAir();
      }
      if (ds > 1e-5) {     // how sharply the ground bends here (+ = curving up into a ramp)
        const k = (away ? -ang : ang) / ds;
        this.curv += (k - this.curv) * Math.min(1, 25 * dt);
      } else this.curv *= Math.max(0, 1 - 10 * dt);    // standing still the bend fades: a stale one turned every push into a pump (stuck at a ramp's foot)
      // cracks and small steps: a jolt for the legs to soak up, and a clack
      const jolt = Math.abs(h.dist - 0.5);
      if (up.y > 0.95 && h.normal.y > 0.95 && jolt > 0.025) { this.bump = Math.max(this.bump, Math.min(1, jolt * 9)); this.fx.push('bump'); }
      const J = T.crackSpacing ?? 3;
      if (J > 0 && up.y > 0.97 && this.surface === 'concrete' && ds > 1e-5 &&
          (Math.floor(h.point.x / J) !== Math.floor(this.pos.x / J) || Math.floor(h.point.z / J) !== Math.floor(this.pos.z / J))) { this.fx.push('crack'); this.bump = Math.max(this.bump, 0.18); }
      this.pos.copy(h.point); up.copy(h.normal);
      fwd.addScaledVector(up, -fwd.dot(up)).normalize();
      this.histT -= dt;
      if (this.histT <= 0 && up.y > 0.9) {
        this.histT = 0.25; this.history.push({ pos: this.pos.clone(), fwd: fwd.clone() });
        if (this.history.length > 12) this.history.shift();
      }
    } else {                                    // rolled off an edge
      // slow over a lip with a ramp falling away below it (bowl coping, a hip deck): lean in and roll down it, a drop-in
      if (up.y > 0.8 && Math.abs(this.speed) < 7.5) {
        const fh = V(fwd.x, 0, fwd.z).normalize().multiplyScalar(sgn);
        const w2 = this.cast(next.clone().add(V(0, -0.12, 0)).addScaledVector(fh, 0.05), fh.clone().negate(), 0.8);
        if (w2 && w2.tr && w2.normal.dot(fh) > 0.2) { this.pos.copy(w2.point); tilt(up, fwd, w2.normal, 1); this.fx.push('land'); return; }
      }
      this.pos.copy(next); this.vel.copy(fwd).multiplyScalar(this.speed); this.goAir();
    }
  }

  // glance off (or stop against) a wall with normal n: the board turns along it and loses the speed that went into it
  hitWall(nw, into, dist, move, keep = 0.8, thin = false) {
    const up = this.up, fwd = this.fwd, sgn = this.speed < 0 ? -1 : 1;
    const n = nw.clone().addScaledVector(up, -nw.dot(up));
    if (n.lengthSq() < 1e-6) return; n.normalize();
    // all but stopped and steering away from the wall (or past a post or a bin): the board pivots on the spot (a kick
    // turn) and the wall only stops it going in. Turning the nose back along the wall here would undo the steering
    // every step, and in a pocket (between a bin and a post) he could never turn out of it.
    if (Math.abs(this.speed) < 0.8 && Math.abs(this.steerS) > 0.3 && (thin || -this.steerS * V().crossVectors(up, fwd).dot(n) > 0)) {
      this.speed *= 1 - Math.min(1, into);
      const gap = 0.15 - dist * into; if (gap > 0) this.pos.addScaledVector(n, Math.min(gap, 0.02));
      return;
    }
    fwd.addScaledVector(n, -fwd.dot(n));
    if (fwd.lengthSq() < 0.04) { fwd.copy(move).multiplyScalar(sgn); this.speed = 0; } else fwd.normalize();
    this.speed *= 1 - Math.min(1, into) * keep;
    const gap = 0.15 - dist * into; if (gap > 0) this.pos.addScaledVector(n, Math.min(gap, 0.02));      // ease off the wall, never pop
  }

  pop(type, inp) {
    const power = typeof type === 'object' ? type.power ?? 1 : 1; if (typeof type === 'object') type = type.name;
    if (type === 'double' || type === 'impossible-up') return this.upgrade(type);
    const nollie = type.startsWith('n:'), key = nollie ? type.slice(2) : type, def = TRICKS[key];
    if (!def || this.state === 'bail' || this.hippie) return;
    if (this.state === 'air') return this.lateFlip(def);
    const v = V();
    if (this.state === 'grind') {
      const g = this.grind;
      v.copy(g.seg.dir).multiplyScalar(g.speed);
      const travel = g.seg.dir.clone().multiplyScalar(Math.sign(g.speed) || 1);
      v.addScaledVector(V().crossVectors(travel, UP).normalize(), inp.steer * 1.6);
      this.noGrindT = 0.35; this.up.set(0, 1, 0);
    } else v.copy(this.fwd).multiplyScalar(this.speed);
    const steep = this.up.y < 0.5;
    // pop height comes from how long you crouched (held the stick back) before the flick
    this.popPower = Math.max(0.75, Math.min(1.12, power));
    v.addScaledVector(steep ? this.up : UP, (steep ? T.popSpeed * 0.3 : T.popSpeed) * this.popPower);
    // the stance you popped from names the trick
    const st = this.state === 'grind' ? (this.switchStance ? 'switch' : 'regular') : this.stanceName;
    this.vel.copy(v); this.pos.addScaledVector(this.up, 0.04);
    this.revert = null;
    this.goAir(); this.nollie = nollie;
    const entry = { base: def.dur ? def.name : '', key, nollie, stance: st, mirror: this.switchStance, pts: def.pts + (nollie ? 50 : 0) + (st !== 'regular' ? 75 : 0) };
    entry.name = trickName(entry, 0);
    this.trick = def.dur ? { def, t: 0, key, entry } : null;
    this.combo.push(entry);
    this.lastPop = entry;
    this.popT = 0; this.fx.push('pop');
  }

  // a flip started after the pop, while already in the air (needs time to finish before you land)
  lateFlip(def) {
    if (!def.dur || this.trick || this.grab || this.bodyFlip || this.airT < 0.1) return;
    const entry = { name: `Late ${def.name}`, pts: Math.round(def.pts * 1.5) };
    this.trick = { def, t: 0, late: true, key: Object.keys(TRICKS).find((k) => TRICKS[k] === def), entry };
    this.combo.push(entry);
    this.fx.push('flick');
  }

  // a flick that carries on after the pop changes the trick in the first moment of the air (input.js 'follow'):
  // 'double' = carried on round the rim past the side (a flip becomes a double flip),
  // 'impossible-up' = flicked up and pulled straight back down (an ollie becomes an impossible, the board wrapping the foot)
  upgrade(kind) {
    const tr = this.trick, e = tr ? tr.entry : this.lastPop;
    if (this.state !== 'air' || !e || this.combo[this.combo.length - 1] !== e) return;
    if (kind === 'double') {
      const dk = tr && 'double' + tr.key, def = dk && TRICKS[dk];
      if (!def || tr.t > (T.doubleWindow ?? 0.25) || !tr.def.roll || Math.abs(tr.def.roll) > 1) return;
      const before = tr.late ? Math.round(tr.def.pts * 1.5) : tr.def.pts;
      tr.def = def; tr.key = dk;
      e.pts += (tr.late ? Math.round(def.pts * 1.5) : def.pts) - before;
      if (tr.late) e.name = `Late ${def.name}`; else { e.key = dk; e.base = def.name; e.name = trickName(e, 0); }
      this.fx.push('flick');
    } else if (kind === 'impossible-up') {
      if (tr || e.base || this.airT > 0.3) return;
      const def = TRICKS.impossible;
      this.trick = { def, t: this.airT, key: 'impossible', entry: e };
      e.key = 'impossible'; e.base = def.name; e.pts += def.pts - TRICKS.ollie.pts; e.name = trickName(e, 0);
      this.fx.push('flick');
    }
  }

  goAir() {
    this.state = 'air'; this.airT = 0; this.pushT = 0; this.pushPhase = -1; this.spin = 0; this.grind = null; this.popT = 1;
    this.manual = null; this.slide = 0; this.nollie = false; this.grabE = null; this.bodyFlip = null; this.revert = null; this.feet = null;
    this.steep = this.up.y < 0.5; this.transfer = false; this.vertAir = false; this.curv = 0;
    if (this.steep) {
      const nh = V(this.up.x, 0, this.up.z).normalize();       // points back into the ramp
      // what is over the lip? a ramp face falling away on the far side = a transfer (spine, hip);
      // anything else (a deck, nothing) = straight air that comes back down into the same ramp
      const far = this.cast(this.pos.clone().addScaledVector(nh, -0.35).add(V(0, 0.5, 0)), DOWN, 4);
      if (far && far.tr && far.normal.dot(nh) < -0.3 && far.point.y < this.pos.y - 0.05) {
        this.transfer = true; this.steep = false;
        const tAir = 2 * Math.max(0.3, this.vel.y) / T.gravity + 0.15;
        this.vel.addScaledVector(nh, -this.vel.dot(nh) - Math.min(2.5, Math.max(0.4, 0.45 / tAir)));
      } else {                // vert: go straight up and come back in instead of flying out
        this.vertAir = true;
        this.vel.addScaledVector(nh, -this.vel.dot(nh) + 0.35);
      }
    }
  }

  // ── flying ──
  stepAir(dt, inp) {
    this.airT += dt; this.popT += dt;
    this.vel.y -= T.gravity * dt;
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);

    const a = -inp.steer * T.airSpinRate * dt;
    this.fwd.applyAxisAngle(this.up, a); this.spin += a;
    // line the board up with whatever it is about to land on (a transition, the flat), like a skater spotting the landing
    let target = this.steep ? null : UP;
    const sp = this.vel.length();
    if (this.airT > 0.04 && sp > 0.5 && (this.vel.y < 0.5 || this.transfer)) {
      const look = this.cast(this.pos, this.vel.clone().multiplyScalar(1 / sp), sp * 0.32 + 0.6);
      if (look && (look.normal.y > 0.12 || look.tr) && -look.normal.dot(this.vel) < 0.85 * sp + 1) target = look.normal;
    }
    if (target) tilt(this.up, this.fwd, target, Math.min(1, (this.transfer ? 7 : 8) * dt));
    else this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up)).normalize();
    if (this.trick) { const was = this.trick.t; this.trick.t += dt; if (was < this.trick.def.dur && this.trick.t >= this.trick.def.dur) this.fx.push('catch'); }
    // body flips: hold a grab and push the left stick forward (frontflip) or pull it back (backflip)
    const bf = this.bodyFlip;
    if (!bf && this.grab && Math.abs(inp.ly) > 0.7 && this.airT > 0.12) this.bodyFlip = { dir: inp.ly < 0 ? 1 : -1, angle: 0 };
    else if (bf) {
      const full = Math.PI * 2, held = Math.abs(inp.ly) > 0.5 && Math.sign(-inp.ly) === bf.dir;
      // once started it carries round to the next full turn; keep holding for another
      if (held || bf.angle % full > 0.05) bf.angle += (T.bodyFlipRate ?? 7.2) * dt;
      if (!held && bf.angle % full < (T.bodyFlipRate ?? 7.2) * dt * 1.01 && bf.angle > 1) bf.angle = Math.round(bf.angle / full) * full;
    }

    if (this.noGrindT <= 0 && this.airT > 0.1 && this.vel.y < 2) {
      // lock-on assist: drifting down toward a rail you are travelling along pulls you onto it
      const hs = Math.hypot(this.vel.x, this.vel.z), R = T.grindAssist ?? 0.9;
      if (hs > 1.5 && this.vel.y < 1) {
        let best = null, bd = R;
        for (const s of this.park.rails) {
          const t = V().subVectors(this.pos, s.a).dot(s.dir);
          if (t < 0.2 || t > s.len - 0.2) continue;
          const c = s.a.clone().addScaledVector(s.dir, t), off = V(c.x - this.pos.x, 0, c.z - this.pos.z), d = off.length();
          if (d < bd && this.pos.y > c.y - 0.1 && this.pos.y < c.y + 1.6 && Math.abs(this.vel.x * s.dir.x + this.vel.z * s.dir.z) > 0.8 * hs * Math.hypot(s.dir.x, s.dir.z)) { bd = d; best = off; }
        }
        if (best && bd > 0.05) { const k = (T.grindMagnet ?? 5) * 4 * dt; this.vel.x += best.x * k; this.vel.z += best.z * k; }
      }
      for (const s of this.park.rails) {
        const t = V().subVectors(this.pos, s.a).dot(s.dir);
        if (t < 0.05 || t > s.len - 0.05) continue;
        const c = s.a.clone().addScaledVector(s.dir, t);
        if (this.pos.distanceTo(c) > T.grindSnap || this.pos.y < c.y - 0.2) continue;
        if (s.out && V().subVectors(this.pos, c).dot(s.out) < -0.08) continue;   // coping: only from the deck side
        const along = this.vel.dot(s.dir);
        if (Math.abs(along) > 1.2) return this.startGrind(s, t, c, along, inp);
      }
    }

    // the edge of the map: bounce back off an invisible wall (the board or the body leaning out over it)
    if (this.offMap(this.pos) || this.offMap(_o.copy(this.pos).addScaledVector(this.up, 0.95))) {
      const n = this.mapNormal(prev, this.vel), vn = this.vel.x * n.x + this.vel.z * n.z;
      if (vn < 0) { this.vel.x -= 1.3 * vn * n.x; this.vel.z -= 1.3 * vn * n.z; }
      this.pos.x = prev.x; this.pos.z = prev.z;
    }
    const d = V().subVectors(this.pos, prev), len = d.length();
    if (len < 1e-6) return;
    // the body (not just the board) sweeps through the air: a wall at chest height stops you too
    if (!this.vertAir && !this.transfer) {
      const hb = this.cast(prev.clone().add(V(0, 0.9, 0)), d.clone().multiplyScalar(1 / len), len + 0.25);
      if (hb && !hb.back && Math.abs(hb.normal.y) < 0.5 && !hb.tr) {
        const vIn = -this.vel.dot(hb.normal);
        if (vIn > T.bailWallSpeed) { this.pos.copy(prev); return this.slam(V(), { impact: vIn }); }
        if (vIn > 0) this.vel.addScaledVector(hb.normal, -vIn * 1.2);
        this.pos.x = prev.x; this.pos.z = prev.z;
        d.subVectors(this.pos, prev);
        if (d.lengthSq() < 1e-12) return;
      }
    }
    const len2 = d.length();
    const h = this.cast(prev, d.multiplyScalar(1 / len2), len2 + 0.03);
    // the back of a face is the surface you are leaving (a ray starting on a ramp grazes it from behind):
    // landing on it would turn the board upside down under the floor
    if (!h || h.back) {
      // ...but coming down a hair under a floor's skin (the toe of a ramp, a kink in a bowl), the ray starts under it
      // and can never hit it: he would fall forever in place, put back by guard() every step. Land on it instead.
      if (this.vel.y <= 0) {
        const s = this.cast(_o.copy(this.pos).add(V(0, 0.3, 0)), DOWN, 0.32);
        if (s && !s.back && s.normal.y > 0.5 && s.point.y > this.pos.y + 0.003) return this.land(s, inp);
      }
      return;
    }
    // touch down on anything floor-like, or on a ramp wall you're travelling along (vert re-entry)
    const vIn = -this.vel.dot(h.normal);
    if (h.normal.y > 0.12 || (h.tr && vIn < 0.6 * this.vel.length() + 0.5)) return this.land(h, inp);
    if (-this.vel.dot(h.normal) > T.bailWallSpeed) { this.pos.copy(h.point).addScaledVector(h.normal, 0.06); return this.slam(V()); }
    this.pos.copy(h.point).addScaledVector(h.normal, 0.06);       // bounced off a wall
    this.vel.addScaledVector(h.normal, -this.vel.dot(h.normal)).multiplyScalar(0.6);
  }

  // soft ground (the mega park's airbag): park.soft = [{x0, x1, z0, z1, y, absorb, grip}] boxes; absorb = share of the
  // drop the bag hands back to you as impact, grip = share of your speed left after it swallows you
  softAt(p) {
    const S = this.park.soft; if (!S) return null;
    for (const s of S) if (p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1 && p.y < s.y + 0.6) return s;
    return null;
  }

  land(h, inp) {
    const n = h.normal, soft = this.softAt(h.point), vn0 = this.vel.dot(n), vn = vn0 * (soft ? soft.absorb : 1);   // vn: the drop you feel
    const tan = this.vel.clone().addScaledVector(n, -vn0), ts = tan.length();
    this.pos.copy(h.point); this.up.copy(n);
    const f = this.fwd.clone().addScaledVector(n, -this.fwd.dot(n)).normalize();
    const holding = T.grabBailOnLand && this.grab;      // let go of the board before you land
    const done = this.trick ? this.trick.t / this.trick.def.dur : 1;
    const bf = this.bodyFlip, full = Math.PI * 2;
    const flipLeft = !bf ? 0 : bf.angle < Math.PI ? bf.angle : Math.min(bf.angle % full, full - bf.angle % full);
    const feetOff = this.feet ? this.feet.off : 0;          // a feet-off grab: the feet have to be back on the board
    const unfinished = holding || done < 0.82 || flipLeft > 0.7 || feetOff > (T.feetOffBail ?? 0.4);
    if (unfinished || -vn > T.bailImpact) { this.speed = ts; this.fwd.copy(f); return this.slam(soft ? tan.multiplyScalar(soft.grip) : tan, soft ? { impact: -vn } : undefined); }
    let align = 1;
    if (ts > 1.5) {
      align = f.dot(tan) / ts;
      if (Math.abs(align) < T.bailSidewaysLimit) { this.fwd.copy(f); return this.slam(tan); }
      this.speed = ts * Math.sign(align);
      this.fwd.copy(tan).multiplyScalar(Math.sign(align) / ts);
    } else { this.speed = f.dot(tan); this.fwd.copy(f); }
    // how clean was it? board lined up with where you're going, board caught in time, not too heavy a drop
    const angOff = Math.acos(Math.min(1, Math.abs(align))), impact = Math.min(1, -vn / T.bailImpact);
    let q = 1 - Math.max(0, angOff - 0.17) * 1.8 - Math.max(0, 1 - done) * 3 - Math.max(0, impact - 0.55) * 1.4 - flipLeft * 0.8 - feetOff * 2.2;
    q = Math.max(0, Math.min(1, q));
    const quality = q >= (T.cleanLanding ?? 0.6) ? 'clean' : 'sketchy';
    this.landing = { quality, q, impact, age: 0 };
    if (bf && bf.angle > Math.PI) {
      const nf = Math.round(bf.angle / full), word = bf.dir > 0 ? 'Frontflip' : 'Backflip';
      this.combo.push({ name: (nf > 1 ? ['', '', 'Double ', 'Triple '][Math.min(nf, 3)] : '') + word, pts: 700 * nf });
    }
    // the wheels only roll one way: the part of your speed going sideways to the board scrubs off, and a heavy
    // landing soaks up a little more through your knees
    this.speed *= (1 - (T.landSideScrub ?? 0) * (1 - Math.abs(align))) * (1 - (T.landImpactScrub ?? 0) * impact * impact);
    if (soft) this.speed *= soft.grip;           // the bag swallows most of your speed
    // sketchy costs speed on top, more the sketchier it was (sketchySpeedLoss = what a really bad one keeps)
    if (quality === 'sketchy') { const S = T.sketchySpeedLoss ?? 0.8; this.speed *= S + (1 - S) * 0.75 * q / (T.cleanLanding ?? 0.6); this.wobble = Math.max(this.wobble, 0.75); this.comboSketchy = true; }
    this.state = 'ground'; this.trick = null; this.grabE = null; this.bodyFlip = null; this.feet = null; this.fx.push(soft ? 'landSoft' : quality === 'sketchy' ? 'landSketchy' : 'land');
    this.steep = false; this.transfer = false; this.vertAir = false; this.curv = 0; this.lastLand = { n: n.clone(), speed: this.speed, t: performance.now() };
    // still holding the spin on the left stick as you land: revert (the board keeps coming round on the ground)
    if (inp && Math.abs(inp.steer) > 0.85 && Math.abs(this.spin) > 1.2 && Math.abs(this.speed) > 2 && n.y > 0.8) {
      this.addSpin();
      const dir = -Math.sign(inp.steer), fs = dir * (T.stance === 'goofy' !== this.switchStance ? -1 : 1) > 0;
      this.fwd.negate(); this.speed = -this.speed;
      this.revert = { t: 0, dur: T.revertTime ?? 0.38, dir, yaw: -dir * Math.PI };
      this.combo.push({ name: `${fs ? 'FS' : 'BS'} Revert`, pts: 150 }); this.fx.push('revert');
      return;
    }
    // land with the stick already held in the manual spot and the combo keeps going
    if (inp && inp.manual && Math.abs(this.speed) > 1 && n.y > 0.9) { this.addSpin(); this.startManual(inp.manual); }
    else this.bank();
  }

  // ── grinding ──
  // Which grind you get: how the board is turned when it touches the rail,
  // plus where the right stick is held (back = on the tail end, forward = on the nose end).
  startGrind(seg, t, c, along, inp) {
    const al = this.fwd.dot(seg.dir), rs = inp ? inp.rs : { x: 0, y: 0 };
    const end = rs.y > 0.3 ? 'back' : rs.y < -0.3 ? 'fwd' : '', lean = Math.abs(rs.x) > 0.4;
    // which side did we come from? rail on your toe side = frontside
    const right = V().crossVectors(seg.dir, UP).normalize().multiplyScalar(Math.sign(along) || 1);
    let lat = V().subVectors(c, this.pos).dot(right);
    if (Math.abs(lat) < 0.06) { const lv = this.vel.dot(right); lat = Math.abs(lv) > 0.4 ? lv : 0; }
    const fsbs = !lat ? '' : lat * (T.stance === 'goofy' ? -1 : 1) > 0 ? 'FS ' : 'BS ';
    let name, pts = 100, pitch = 0, yaw = 0;
    if (Math.abs(al) > 0.6) {               // board along the rail
      this.fwd.copy(seg.dir).multiplyScalar(Math.sign(al));
      if (end === 'back') { name = lean ? 'Smith' : '5-0'; pitch = lean ? 0.2 : -0.2; }
      else if (end === 'fwd') { name = lean ? 'Crooked' : 'Nosegrind'; pitch = 0.2; }
      else name = '50-50';
      if (end) { pts = lean ? 200 : 150; if (lean) yaw = -0.3 * Math.sign(rs.x); }
    } else {                                // board across the rail
      const nose = this.fwd.dot(right);     // + = nose pointing to the right of travel
      const side = V().crossVectors(UP, seg.dir).normalize();
      this.fwd.copy(side).multiplyScalar(Math.sign(this.fwd.dot(side)) || 1);
      if (end === 'back') { name = 'Tailslide'; pts = 200; pitch = -0.12; }
      else if (end === 'fwd') { name = 'Noseslide'; pts = 200; pitch = 0.12; }
      else if (lat && nose * lat < 0) { name = 'Lipslide'; pts = 200; }   // tail went over the rail
      else { name = 'Boardslide'; pts = 150; }                           // nose went over the rail
    }
    const entry = { name: fsbs + name, pts };
    this.addSpin(); this.combo.push(entry);
    // balance: a sloppy entry (board not lined up with the rail) starts you tipping; the left stick leans you back
    const off = Math.abs(al) > 0.6 ? 1 - Math.abs(al) : Math.abs(al);
    const drift = (this.rng() < 0.5 ? -1 : 1) * (0.05 + Math.min(1, off * 3) * (T.grindWobble ?? 1));
    this.grind = { seg, t, speed: along, entry, pitch, yaw, bal: 0, drift, mat: seg.mat || 'metal', across: Math.abs(al) <= 0.6 };
    this.state = 'grind'; this.trick = null; this.feet = null; this.pos.copy(c);
    this.up.copy(UP).addScaledVector(seg.dir, -seg.dir.y).normalize();
    this.fx.push('grind');
  }

  stepGrind(dt, inp) {
    const g = this.grind, s = g.seg;
    if (dt > 0) {
      g.bal += (g.drift + g.bal * 0.3 + (inp ? inp.steer : 0) * (T.grindBalance ?? 1.8)) * dt;
      if (Math.abs(g.bal) > 1) {                // leaned too far: slip off the side and land
        this.vel.copy(s.dir).multiplyScalar(g.speed).addScaledVector(V().crossVectors(s.dir, UP).normalize(), Math.sign(g.bal) * 1.4);
        this.up.set(0, 1, 0); this.noGrindT = 0.5; this.pos.y += 0.03; this.fx.push('slipoff');
        return this.goAir();
      }
    }
    g.speed += -T.gravity * s.dir.y * dt;
    g.speed -= Math.sign(g.speed) * Math.min(Math.abs(g.speed), T.grindFriction * (g.across ? T.slideFriction ?? 1 : 1) * dt);
    g.t += g.speed * dt; g.entry.pts += 120 * dt;
    // coping and curved rails are chains of short pieces: hop to the next piece round the bend
    const nx = g.t > s.len ? s.next : g.t < 0 ? s.prev : null;
    if (nx && nx.dir.dot(s.dir) > 0.8) {
      const over = g.t > s.len ? g.t - s.len : g.t;
      Q.setFromUnitVectors(s.dir, nx.dir); this.fwd.applyQuaternion(Q);
      g.seg = nx; g.t = over > 0 ? over : nx.len + over;
      return this.stepGrind(0, inp);
    }
    this.pos.copy(s.a).addScaledVector(s.dir, Math.max(0, Math.min(s.len, g.t)));
    const slow = Math.abs(g.speed) < 0.5;
    if (g.t < 0 || g.t > s.len || slow) {
      this.vel.copy(s.dir).multiplyScalar(g.speed);
      if (slow) this.vel.addScaledVector(V().crossVectors(UP, s.dir).normalize(), 0.9);
      this.up.set(0, 1, 0); this.noGrindT = 0.4; this.pos.y += 0.02;
      this.goAir();
    }
  }

  // ── scoring ──
  addSpin() {
    const deg = Math.round(Math.abs(this.spin) / Math.PI) * 180;
    // the trick you popped (not a grab or grind added after it) carries the spin in its name
    const pop = [...this.combo].reverse().find((c) => c.stance !== undefined);
    const last = this.combo[this.combo.length - 1];
    const fs = this.spin * ((T.stance === 'goofy') !== this.switchStance ? -1 : 1) > 0;
    if (deg && pop && !pop.spun) { pop.name = trickName(pop, this.spin); pop.spun = true; pop.pts += deg + (/\d/.test(pop.name) ? 0 : 200); }   // a bigspin / ghetto bird: named, and a bonus
    else if (deg && last && !last.spun) { last.name = `${fs ? 'FS' : 'BS'} ${deg} ${last.name}`; last.spun = true; last.pts += deg; }
    else if (deg) this.combo.push({ name: `${fs ? 'FS' : 'BS'} ${deg}`, pts: deg, spun: true });
    this.spin = 0;
  }
  bank() {
    this.addSpin();
    if (!this.combo.length) { this.comboSketchy = false; return; }
    const mult = this.combo.length, sketchy = !!this.comboSketchy;
    const pts = Math.round(this.combo.reduce((a, c) => a + c.pts, 0) * mult * (sketchy ? T.sketchyScore ?? 0.7 : 1));
    this.score += pts;
    this.lastCombo = { text: this.combo.map((c) => c.name).join(' + '), pts, ok: true, at: performance.now(), mult, quality: sketchy ? 'sketchy' : 'clean' };
    this.combo = []; this.comboSketchy = false;
  }

  // ── bailing ──
  // A slam throws the rider off as a simple physical body: a ball with momentum that tumbles, hits
  // the ground, slides on friction and settles, colliding with the world (never through it). The board
  // flies off on its own with its own bounce and spin. How hard you hit sets the severity: a big one
  // tumbles further and keeps you down longer. Then you get up (push/A to get up sooner) and are put
  // back on your board on clear, level ground right where you fell.
  //
  // For the skater view, phys.bail = {
  //   phase: 'tumble' (thrown, airborne or spinning) | 'slide' (on the ground, still moving) | 'settle' (lying still) | 'getup' | 'fetch' (walking to the board),
  //   t: seconds since the slam, pt: seconds in this phase, severity: 0..1,
  //   vel: Vector3 body velocity, spin: Vector3 body angular velocity (rad/s, world axis),
  //   bodyPos: Vector3 centre of the body (BODY_R above the ground when lying), bodyQuat: Quaternion body orientation
  //     (identity = standing upright facing +z; it starts as the rider's stance frame),
  //   boardPos: Vector3, boardQuat: Quaternion (same frame as the board at the slam: y = deck up, z = nose),
  //   boardVel: Vector3, boardSpin: Vector3, surfaceNormal: Vector3 the ground under the body,
  //   heading: Vector3 flat direction the rider was going }
  // phys.pos stays on the ground under the body (BODY_R below bodyPos), phys.state stays 'bail'.
  slam(v, o = {}) {
    this.feet = null;
    const vel = v ? v.clone() : this.getVel(V());
    if (vel.lengthSq() < 0.01) vel.copy(this.fwd).multiplyScalar(this.speed || 0);
    const sp = vel.length(), impact = o.impact ?? sp;
    const severity = Math.max(0.15, Math.min(1, impact / 12));
    const up = this.state === 'walk' ? UP : this.up.clone();
    const fwd = this.fwd.clone(), right = V().crossVectors(up, fwd).normalize();
    const heading = V(vel.x, 0, vel.z); if (heading.lengthSq() < 0.01) heading.set(fwd.x, 0, fwd.z); heading.normalize();
    // the body starts out in the open: above the board if there is room, else straight up, else the last clear spot
    let body = this.pos.clone().addScaledVector(up, BODY_R);
    for (const c of [this.pos.clone().add(V(0, BODY_R, 0)), this.pos.clone().add(V(0, 0.6, 0)), this.safe.clone().add(V(0, 0.5, 0))]) {
      if (!this.inside(body) && body.y > this.pos.y - 0.1) break;
      body = c;
    }
    let boardAt = this.pos.clone().addScaledVector(up, 0.06);
    if (this.inside(boardAt) || boardAt.y < this.pos.y - 0.05) boardAt = body.clone();
    // thrown forward and up a little; pitched over the nose (the faster, the harder)
    const bvel = vel.clone().multiplyScalar(0.85).add(V(0, 1.2 + 1.5 * severity, 0));
    const side = this.rng() < 0.5 ? -1 : 1;
    const spin = V().crossVectors(UP, heading).multiplyScalar(-(2 + 6 * severity)).add(V(0, side * (0.8 + 2 * severity * this.rng()), 0));
    const bq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    const boardVel = vel.clone().multiplyScalar(0.6).addScaledVector(right, side * (1 + 2 * severity)).add(V(0, 1 + 2.5 * severity * this.rng(), 0));
    this.bail = {
      phase: 'tumble', t: 0, pt: 0, severity, heading,
      vel: bvel, spin, bodyPos: body, bodyQuat: bq.clone(), surfaceNormal: up.clone(),
      boardPos: boardAt, boardQuat: bq.clone(), boardVel,
      boardSpin: V((this.rng() - 0.5) * 14 * severity, (this.rng() - 0.5) * 10, (this.rng() - 0.5) * 8 * severity),
      bodyGround: false, boardGround: false, still: 0,
    };
    this.bail.board = { pos: this.bail.boardPos, vel: this.bail.boardVel, R: 0.07, e: 0.35, mu: 0.25 };
    if (this.combo.length) this.lastCombo = { text: this.combo.map((c) => c.name).join(' + '), pts: 0, ok: false, at: performance.now() };
    this.combo = []; this.trick = null; this.grind = null; this.manual = null; this.grabE = null; this.slide = 0;
    this.revert = null; this.bodyFlip = null; this.hippie = null; this.wobble = 0; this.comboSketchy = false; this.walk = null;
    this.speed = 0; this.state = 'bail'; this.fx.push('bail');
  }

  // Move a ball (centre p, velocity v, radius R) for dt against the world: swept, so it can't tunnel, and it
  // slides along what it hits. e = bounce, mu = sliding friction. Returns the ground normal it rests on, or null.
  moveBall(p, v, R, dt, e, mu) {
    let rest = dt, ground = null;
    for (let k = 0; k < 4 && rest > 1e-6; k++) {
      const step = v.clone().multiplyScalar(rest), len = step.length();
      if (len < 1e-7) break;
      const dir = step.multiplyScalar(1 / len);
      const h = this.cast(p, dir, len + R);
      if (!h || h.back) { p.addScaledVector(dir, len); break; }
      const go = Math.max(0, h.dist - R);
      p.addScaledVector(dir, go); rest *= 1 - go / len;
      const n = h.normal, vn = v.dot(n);
      if (vn < 0) {
        v.addScaledVector(n, -vn * (1 + (-vn > 2 ? e : 0)));   // bounce only off a real hit, rest otherwise
      }
      if (n.y > 0.5) ground = n.clone();
    }
    // resting contact and friction: the ground under the ball
    const g = this.cast(_o.copy(p).add(V(0, 0.05, 0)), DOWN, R + 0.12);
    if (g && g.normal.y > 0.3) {
      ground = g.normal;
      const lift = R - (g.dist - 0.05); if (lift > 0) p.addScaledVector(UP, lift);
      if (lift > 0.05) v.multiplyScalar(0.55);       // knocked up a step or a kerb: a body doesn't slide up stairs
      const vn = v.dot(g.normal); if (vn < 0) v.addScaledVector(g.normal, -vn);
      const tv = v.clone().addScaledVector(g.normal, -v.dot(g.normal)), ts = tv.length();
      // friction scrubs the sliding speed; gravity along the slope keeps pulling
      const drop = Math.min(ts, mu * T.gravity * g.normal.y * dt);
      if (ts > 1e-6) v.addScaledVector(tv, -drop / ts);
    }
    // never left inside something: put it back up out of it
    if (this.inside(p)) {
      const u = this.cast(_o.copy(p).add(V(0, 4, 0)), DOWN, 4);
      if (u && !u.back) { p.y = u.point.y + R; v.y = Math.max(0, v.y); }
    }
    return ground;
  }

  stepBail(dt, inp) {
    const b = this.bail, B = b.board;
    b.t += dt; b.pt += dt;
    if (b.phase === 'fetch') { this.stepBailBoard(dt); return this.stepFetch(dt); }
    // the body
    b.vel.y -= T.gravity * dt;
    const mu = b.phase === 'tumble' ? 0.55 : 0.9;
    const was = b.bodyGround, vy0 = b.vel.y, body0 = b.bodyPos.clone(), board0 = B.pos.clone();
    const gn = this.moveBall(b.bodyPos, b.vel, BODY_R, dt, 0.25, mu);
    b.bodyGround = !!gn;
    if (gn) b.surfaceNormal.lerp(gn, Math.min(1, 12 * dt)).normalize();
    if (gn && !was && vy0 < -2) this.fx.push('slap');
    // map edge: the body stops there like everyone else
    if (this.offMap(b.bodyPos)) {
      const n = this.mapNormal(body0, b.vel), vn = b.vel.x * n.x + b.vel.z * n.z;
      if (vn < 0) { b.vel.x -= 1.2 * vn * n.x; b.vel.z -= 1.2 * vn * n.z; }
      b.bodyPos.x = body0.x; b.bodyPos.z = body0.z;
    }
    // the safety net for a bail: a body or board that ended a step inside something (or under the world) goes back
    if (b.bodyPos.y < -5 || this.inside(b.bodyPos)) { this.unclip++; b.bodyPos.copy(body0); b.vel.multiplyScalar(-0.2); }
    // tumbling: spin carries on in the air; on the ground it rolls out and lies down flat
    if (gn) {
      b.spin.multiplyScalar(Math.max(0, 1 - (b.phase === 'tumble' ? 3 : 7) * dt));
      const ax = V(0, 1, 0).applyQuaternion(b.bodyQuat), flat = ax.clone().addScaledVector(gn, -ax.dot(gn));
      if (flat.lengthSq() > 1e-4 && b.phase !== 'getup') {
        Q2.setFromUnitVectors(ax, flat.normalize()); Q.slerpQuaternions(QI, Q2, Math.min(1, 5 * dt));
        b.bodyQuat.premultiply(Q);
      }
    }
    const sl = b.spin.length();
    if (sl > 1e-4) { Q.setFromAxisAngle(_o.copy(b.spin).multiplyScalar(1 / sl), sl * dt); b.bodyQuat.premultiply(Q).normalize(); }
    this.stepBailBoard(dt);
    // phases
    const v = b.vel.length();
    if (b.phase === 'tumble' && b.bodyGround && b.pt > 0.25 && b.spin.length() < 4) { b.phase = 'slide'; b.pt = 0; }
    if (b.phase === 'slide' && b.bodyGround && v < 0.5) { b.phase = 'settle'; b.pt = 0; }
    if ((b.phase === 'tumble' || b.phase === 'slide') && b.t > 4.5) { b.phase = 'settle'; b.pt = 0; }      // never stuck tumbling
    if (b.phase === 'settle') {
      b.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
      // lie there a moment (longer after a bad one), or press push to get straight up
      const wantUp = inp && (inp.push || inp.jump) && b.pt > 0.15;
      if (b.pt > 0.35 + 0.65 * b.severity || wantUp) { b.phase = 'getup'; b.pt = 0; this.planFetch(); }
    }
    // phys.pos follows the body along the ground
    this.pos.copy(b.bodyPos).addScaledVector(b.surfaceNormal, -BODY_R);
    if (b.phase === 'getup' && b.pt >= GETUP_TIME) {
      if (!b.stand) return this.recover();
      b.phase = 'fetch'; b.pt = 0; this.pos.copy(b.stand); this.fwd.copy(b.face); this.up.set(0, 1, 0);
    }
  }

  // getting back on: he stands up where he fell, walks over to his board and steps on it (no board sliding back to him).
  // b.stand = where he stands up, b.boardSpot = clear level ground by the board, b.face = the way he walks; the skater view reads these.
  planFetch() {
    const b = this.bail, B = b.board, stand = this.safeSpot(b.bodyPos);
    if (!stand) return;
    const bp = B.pos.clone(); bp.y += BODY_R - B.R;
    let spot = this.safeSpot(bp);
    const d = spot ? V(spot.x - stand.x, 0, spot.z - stand.z) : V();
    if (!spot || d.length() > 9 || !this.clear(spot, UP)) { spot = stand.clone(); d.set(0, 0, 0); }
    const dist = d.length(), face = dist > 0.05 ? d.clone().multiplyScalar(1 / dist) : b.heading.clone();
    // he stops just short of the board and hooks it up with his foot
    let stop = Math.max(0, dist - 0.35);
    // only walk a straight, open path to clear ground; otherwise he stands where he got up and hooks the board over
    if (stop > 0 && (this.cast(stand.clone().add(V(0, 0.4, 0)), face, dist) || this.cast(stand.clone().add(V(0, 1.1, 0)), face, dist) || !this.clear(stand.clone().addScaledVector(face, stop), UP))) stop = 0;
    const speed = Math.min(3.4, Math.max(1.5, stop / 1.3));
    b.stand = stand; b.boardSpot = spot; b.face = face;
    b.fetch = { from: stand.clone(), dist: stop, speed, s: 0, v: 0, end: stand.clone().addScaledVector(face, stop) };
  }
  stepFetch(dt) {
    const b = this.bail, f = b.fetch;
    if (!f) return this.recover();
    // walk (or jog, if it is a way off) at a steady pace, easing in and out
    const rem = f.dist - f.s, want = Math.min(f.speed, Math.sqrt(Math.max(0, 2 * 3.5 * rem)));
    f.v += Math.max(-8 * dt, Math.min(4 * dt, want - f.v));
    f.s = Math.min(f.dist, f.s + f.v * dt);
    const p = f.from.clone().addScaledVector(b.face, f.s), g = this.cast(V(p.x, p.y + 1.2, p.z), DOWN, 3);
    if (g && !g.back && g.normal.y > 0.7) p.y = g.point.y;
    this.pos.copy(p); this.fwd.copy(b.face); this.up.set(0, 1, 0);
    if (f.s >= f.dist - 0.01 && f.v < 0.25) {     // there: step on, roll off the way he walked (unless that is into a wall)
      const head = b.face.clone(), w = this.cast(p.clone().add(V(0, 0.3, 0)), head, 2.5);
      if (w && w.normal.y < 0.5) head.negate();
      return this.respawn({ pos: this.clear(p, UP) ? p : b.stand, fwd: head }, true);
    }
  }

  stepBailBoard(dt) {
    const b = this.bail, B = b.board, board0 = B.pos.clone();
    // the board: its own ball, bouncier, rolls further, spins its own way
    B.vel.y -= T.gravity * dt;
    const bg = this.moveBall(B.pos, B.vel, B.R, dt, B.e, B.mu);
    if (bg && !b.boardGround && B.vel.lengthSq() > 4) this.fx.push('bump');
    b.boardGround = !!bg;
    if (this.offMap(B.pos)) { B.vel.x *= -0.3; B.vel.z *= -0.3; B.pos.x = board0.x; B.pos.z = board0.z; }
    if (B.pos.y < -5 || this.inside(B.pos)) { this.unclip++; B.pos.copy(board0); B.vel.multiplyScalar(-0.2); }
    if (bg) {
      b.boardSpin.multiplyScalar(Math.max(0, 1 - 6 * dt));
      // settle wheels-down or wheels-up, whichever is nearer
      const ax = V(0, 1, 0).applyQuaternion(b.boardQuat), tgt = bg.clone().multiplyScalar(ax.dot(bg) >= 0 ? 1 : -1);
      Q2.setFromUnitVectors(ax, tgt); Q.slerpQuaternions(QI, Q2, Math.min(1, 8 * dt)); b.boardQuat.premultiply(Q);
    }
    const bs = b.boardSpin.length();
    if (bs > 1e-4) { Q.setFromAxisAngle(_o.copy(b.boardSpin).multiplyScalar(1 / bs), bs * dt); b.boardQuat.premultiply(Q).normalize(); }
  }

  // back on the board on clear, level ground near where the body ended up
  recover() {
    const b = this.bail, at = this.safeSpot(b.bodyPos);
    const head = b.heading.clone();
    if (at) {
      // don't face straight into a wall
      const wall = this.cast(at.clone().add(V(0, 0.3, 0)), head, 2.5);
      if (wall && wall.normal.y < 0.5) head.negate();
      return this.respawn({ pos: at, fwd: head });
    }
    const hist = this.history, safe = hist[Math.max(0, hist.length - 6)] || this.park.spawn;
    this.respawn(safe);
  }
  // nearest spot to p that is level, open ground with room to stand and ride
  safeSpot(p) {
    // first look at the level the body came to rest on (not up on top of the bench or bleacher it hit), then anywhere
    for (const strict of [true, false]) for (const r of [0, 0.8, 1.6, 2.6, 4, 6]) {
      const n = r ? Math.max(8, Math.round(r * 5)) : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const g = this.cast(V(x, p.y + 2.5, z), DOWN, 9);
        if (!g || g.back || g.normal.y < 0.92) continue;
        const q = g.point;
        if (strict && q.y > p.y - BODY_R + 0.25) continue;
        if (this.offMap(q) || !this.clear(q, UP)) continue;
        let open = true;
        for (const d of SIDES) if (this.cast(q.clone().add(V(0, 0.35, 0)), d, 0.5)) { open = false; break; }
        if (open) return q.clone();
      }
    }
    return null;
  }

  // ── the safety net: after every step, the board and the body must be out in the open ──
  // If something let him into a wall or under the floor, put him back where he last was clear.
  guard() {
    const up = this.state === 'walk' ? UP : this.up;
    if (up.y > -0.2 && this.clear(this.pos, up)) { this.safe.copy(this.pos); this.safeUp.copy(up); this.unclipRun = 0; return; }
    this.unclip++; this.unclipRun = (this.unclipRun || 0) + 1;     // every step in a row: the watchdog steps in past 0.5 s
    this.pos.copy(this.safe);
    if (this.state !== 'walk') { tilt(this.up, this.fwd, this.safeUp, 1); }   // and the way up he was then, not upside down
    if (this.state === 'ground') {
      if (Math.abs(this.speed) > T.bailWallSpeed) return this.slam(null, { impact: Math.abs(this.speed) });
      this.speed *= -0.3;
    } else if (this.state === 'air') {
      this.vel.x *= -0.3; this.vel.z *= -0.3; if (this.vel.y > 0) this.vel.y *= 0.5;
    } else if (this.state === 'grind') {
      this.vel.copy(this.grind.seg.dir).multiplyScalar(this.grind.speed * -0.2); this.up.set(0, 1, 0); this.noGrindT = 0.4; this.goAir();
    } else if (this.state === 'walk' && this.walk) this.walk.speed = 0;
  }
}
