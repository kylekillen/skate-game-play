// Controller + keyboard. The right stick is your feet: pull it back to
// crouch, flick it up to pop. Where you start and where the flick ends
// picks the trick. Full table: docs/controls-reference.md
import { TWEAKS as T } from './tweaks.js';

const dz = (v) => (Math.abs(v) < 0.16 ? 0 : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const RIM = 0.7;      // stick counts as "pushed all the way" past this
const DEG = Math.PI / 180;

// Standard gamepad button numbers (same for Xbox and PlayStation pads in Chrome).
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// Trick picked by [how much the board spins][which way][where the flick ends].
// Ends: 0 = heel side, 1 = straight, 2 = toe side.
const TABLE = {
  0: { bs: ['kickflip', 'ollie', 'heelflip'], fs: ['kickflip', 'ollie', 'heelflip'] },
  1: { bs: ['varialkick', 'shuvit', 'inwardheel'], fs: ['hardflip', 'fsshuvit', 'varialheel'] },
  2: { bs: ['360flip', '360shuvit', '360inwardheel'], fs: ['360hardflip', 'fs360shuvit', 'laserflip'] },
};

// Pop power from crouch time: a snap flick still pops, holding the crouch a moment longer pops higher.
// T.popCrouchTime = seconds of crouch for a full-height pop.
export function popPower(crouch) {
  const k = Math.max(0, Math.min(1, crouch / (T.popCrouchTime ?? 0.3)));
  return (T.popMin ?? 0.86) + ((T.popMax ?? 1.08) - (T.popMin ?? 0.86)) * k * (2 - k);
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.tricks = [];   // queued trick names, consumed by physics
    this.just = {};     // one-shot buttons, consumed by main
    this.prev = [];
    this.loaded = false;
    this.set = null;    // the flick in progress
    this.follow = null; // just after a flick: {name, t, side} watches for the stick carrying on (double flip, impossible)
    this.ready = true;  // stick has been back to the middle since the last trick
    this.manT = 0; this.manual = 0;
    this.padName = null;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const k = { KeyJ: 'kickflip', KeyL: 'heelflip', KeyK: 'shuvit', KeyU: '360flip', KeyI: 'varialkick', KeyO: 'hardflip', KeyP: 'impossible', KeyN: 'laserflip', KeyV: '360shuvit' }[e.code];
      if (k) {
        // the same flip key again straight away = double it (Double Kickflip, Nightmare Flip, ...)
        const now = performance.now();
        if (this.lastKey && this.lastKey.k === k && now - this.lastKey.t < 250) { this.tricks.push('double'); this.lastKey = null; }
        else { this.tricks.push((e.shiftKey ? 'n:' : '') + k); this.lastKey = { k, t: now }; }
      }
      if (e.code === 'Space') this.spaceT = performance.now();
      if (e.code === 'KeyG') this.hippieK = true;
      const j = { KeyR: 'reset', KeyM: 'marker', KeyT: 'teleport', KeyH: 'help', KeyY: 'board', KeyB: 'respawn', KeyP: 'drop', KeyC: 'camera', BracketLeft: 'camOut', BracketRight: 'camIn' }[e.code];
      if (j) this.just[j] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      // the longer Space was held (crouched), the higher the pop
      if (e.code === 'Space') this.tricks.push({ name: e.shiftKey ? 'n:ollie' : 'ollie', power: popPower((performance.now() - (this.spaceT || 0)) / 1000) });
    });
    addEventListener('blur', () => this.keys.clear());
  }

  poll(dt) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    const pad = pads.find((p) => p.mapping === 'standard') || pads[0];
    this.padName = pad ? pad.id : null;
    let steer = 0, ly = 0, push = false, brake = false, rsx = 0, rsy = 0, grabL = 0, grabR = 0, hippie = false, sprint = false, jump = false;

    if (pad) {
      const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const hit = (i) => b(i) && !this.prev[i];
      steer = dz(pad.axes[0] || 0);
      ly = dz(pad.axes[1] || 0);
      rsx = dz(pad.axes[2] || 0);
      rsy = dz(pad.axes[3] || 0);
      push = b(B.A) || b(B.X);
      sprint = b(B.X); jump = hit(B.A);
      // A and X together = hippie jump (the board rolls on underneath you)
      if (b(B.A) && b(B.X) && (hit(B.A) || hit(B.X))) hippie = true;
      brake = b(B.B);
      grabL = pad.buttons[B.LT] ? pad.buttons[B.LT].value : 0;
      grabR = pad.buttons[B.RT] ? pad.buttons[B.RT].value : 0;
      if (b(B.LB) && hit(B.DOWN)) this.just.marker = true;      // hold LB + d-pad down: drop marker
      if (b(B.LB) && hit(B.UP)) this.just.teleport = true;      // hold LB + d-pad up: go back to it
      if (hit(B.Y)) this.just.board = true;                       // Y: step off the board / back on
      if (hit(B.START)) this.just.help = true;
      if (hit(B.BACK)) this.just.camera = true;                 // Back / View button: next camera angle
      if (!b(B.LB) && hit(B.UP)) this.just.drop = true;          // d-pad up: next drop point (parks that have them)
      if (!b(B.LB) && hit(B.LEFT)) this.just.camOut = true;     // d-pad left / right: camera further / closer
      if (!b(B.LB) && hit(B.RIGHT)) this.just.camIn = true;
      this.prev = pad.buttons.map((x) => x.pressed);
    }

    const k = this.keys, kGrab = k.has('KeyQ') || k.has('KeyE');   // holding a grab key: the arrows tweak it (8 ways) instead of steering
    if (k.has('KeyA') || (k.has('ArrowLeft') && !kGrab)) steer -= 1;
    if (k.has('KeyD') || (k.has('ArrowRight') && !kGrab)) steer += 1;
    if (k.has('KeyW')) push = true;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) sprint = true;
    if (this.hippieK) { hippie = true; jump = true; this.hippieK = false; }
    if (k.has('KeyS')) brake = true;
    if (k.has('KeyX')) ly = 1;                         // powerslide
    if (k.has('KeyQ')) grabL = 1;
    if (k.has('KeyE')) grabR = 1;
    if (k.has('ArrowDown')) rsy = T.manualSweet;       // arrows = a gentle right stick
    if (k.has('ArrowUp')) rsy = -T.manualSweet;
    if (kGrab && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => k.has(c))) {
      rsy = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
      rsx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);       // like the stick: right = your toes when regular
    }

    // Goofy mirrors the stick, so "toe side" is always +x from here on.
    const rs = { x: rsx * (T.stance === 'goofy' ? -1 : 1), y: rsy };
    this.flick(rs.x, rs.y, dt);

    return {
      walkY: k.has('KeyW') ? -1 : k.has('KeyS') ? 1 : 0,     // on foot, W/S walk forward/back on the keyboard
      steer: Math.max(-1, Math.min(1, steer)), ly, push, pump: ly < -0.5, brake, grabL, grabR, rs, hippie, sprint, jump,
      loaded: this.loaded || k.has('Space'), manual: this.manual,
      tricks: this.tricks, just: this.just,
    };
  }

  // Right-stick trick reader. x is + toward your toes, y is + when pulled back.
  flick(x, y, dt) {
    const mag = Math.hypot(x, y);
    this.manual = 0;
    if (!this.set) {
      this.loaded = false;
      if (this.follow && this.followThrough(x, y, mag, dt)) return;
      if (mag < 0.2) { this.ready = true; this.manT = 0; return; }
      // a gentle pull (not all the way) and hold = manual; gentle push = nose manual
      if (mag < RIM && Math.abs(y) > 0.2 && Math.abs(x) < 0.35) {
        this.manT += dt;
        if (this.manT > 0.1) this.manual = Math.sign(y);
      } else this.manT = 0;
      if (mag < 0.8 || !this.ready) return;
      // all the way out: set up. Back half = ollie (tail), front half = nollie (nose).
      const nollie = y < -0.15, a = Math.atan2(x, nollie ? -y : y);
      // started out to the side? wait to see which way the scoop goes before calling it ollie or nollie
      this.set = { nollie, a0: a, cur: a, raw: a, min: a, max: a, dip: false, relT: 0, side: Math.abs(y) < 0.3 ? x : 0, age: 0 };
      this.loaded = true; this.ready = false;
      return;
    }

    const s = this.set;
    s.age += dt;
    if (s.side && mag >= RIM && Math.abs(y) > 0.4 && x * s.side > 0) {
      s.nollie = y < 0; s.a0 = s.cur = s.raw = s.min = s.max = Math.atan2(s.side, 0); s.side = 0;
    }
    const vy = s.nollie ? -y : y;
    if (mag < 0.3) {                        // let go: a scoop round the edge is a shuvit
      s.relT += dt; s.dip = true;
      if (s.relT > 0.09) this.sweep(s);
      return;
    }
    s.relT = 0;
    if (mag < 0.45) { s.dip = true; return; }
    if (mag < RIM) return;
    const a = Math.atan2(x, vy), da = wrap(a - s.raw);
    s.raw = a;
    if (vy < -0.45 && (s.dip || Math.abs(da) > 60 * DEG)) {   // snapped across to the far side: pop
      const end = Math.atan2(x, -vy), slop = T.flickDiagonal * DEG;
      const toe = Math.max(0, s.max), heel = Math.max(0, -s.min), big = Math.max(toe, heel);
      const rot = big < 28 * DEG ? 0 : big < 66 * DEG ? 1 : 2;
      this.fire(s, TABLE[rot][toe >= heel ? 'bs' : 'fs'][end < -slop ? 0 : end > slop ? 2 : 1], end < -slop ? -1 : end > slop ? 1 : 0);
      return;
    }
    s.dip = false;
    s.cur += da; s.min = Math.min(s.min, s.cur); s.max = Math.max(s.max, s.cur);
    if (Math.abs(s.cur) > 115 * DEG) this.sweep(s);           // scooped round the edge to the far side
  }

  sweep(s) {
    const net = s.cur - s.a0, big = Math.abs(net) > 155 * DEG;
    if (Math.abs(net) < 50 * DEG) { this.set = null; this.loaded = false; return; }   // just stood back up
    this.fire(s, net < 0 ? (big ? '360shuvit' : 'shuvit') : (big ? 'fs360shuvit' : 'fsshuvit'));
  }

  fire(s, name, end = 0) {
    this.tricks.push({ name: (s.nollie ? 'n:' : '') + name, power: popPower(s.age) });
    this.set = null; this.loaded = false;
    this.follow = { name, t: 0, nollie: s.nollie, side: Math.sign(end) };
  }

  // The flick carries on after the pop. Measured in seconds (T.doubleWindow), so it works at any frame rate.
  //  - a flip whose flick keeps rolling round the rim past the side, into the bottom half = double flip
  //  - an ollie flicked up and pulled straight back down to the bottom = impossible (the board wraps round your foot)
  followThrough(x, y, mag, dt) {
    const f = this.follow; f.t += dt;
    if (f.t > (T.doubleWindow ?? 0.25)) { this.follow = null; return false; }
    if (mag < RIM) return false;
    const vy = f.nollie ? -y : y, a = Math.atan2(x, -vy);     // 0 = the flick's far end (up), +-180 = back where it started
    const roll = /flip|heel|kick/.test(f.name);               // shuvits don't double
    if (roll && f.side && Math.sign(a) === f.side && Math.abs(a) > 105 * DEG) { this.tricks.push('double'); this.follow = null; this.ready = false; return true; }
    if (f.name === 'ollie' && f.t <= (T.impossibleWindow ?? 0.16) && vy > 0.75 && Math.abs(x) < 0.45) { this.tricks.push('impossible-up'); this.follow = null; this.ready = false; return true; }
    return false;
  }
}
