// The sound. Real CC0 recordings (assets/sfx, sources in assets/CREDITS.md) layered with sound
// made in code. Wheels and grinds are "granular" loops: short overlapping slices taken from random
// spots in a recording, so they never audibly repeat and their pitch follows your speed.
// Loudness knobs live in tweaks.js: volume, ambience.
import { TWEAKS as T } from './tweaks.js';

const SFX = './assets/sfx/';
const v3 = (n) => [0, 1, 2].map((i) => `${n}_00${i}`);
const FILES = {
  roll: ['roll'], grindMetal: ['grind_metal'], grindConcrete: ['grind_concrete'],
  snap: v3('impactPlank_medium'), thud: v3('impactWood_heavy'), tick: v3('impactWood_light'),
  clang: v3('impactMetal_medium'), ting: v3('impactMetal_light'), plate: v3('impactPlate_light'),
  punch: v3('impactPunch_heavy'), body: v3('impactSoft_heavy'), step: v3('footstep_concrete'),
};
// how each surface colours the wheel noise
const SURF = {
  concrete: { f: 'bandpass', hz: 650, q: 0.6, grit: 0.12, tone: 3200, gain: 1 },
  asphalt: { f: 'bandpass', hz: 1500, q: 0.5, grit: 0.55, tone: 5200, gain: 1.15 },
  wood: { f: 'lowpass', hz: 420, q: 1.6, grit: 0.05, tone: 1500, gain: 1.25 },
  metal: { f: 'bandpass', hz: 2300, q: 4, grit: 0.08, tone: 6000, gain: 0.9 },
  // skatelite over a wooden frame (the mega park's megaramp, landing and big quarter): smooth and quiet on top, a hollow
  // boom from the frame underneath. hollow = gain of the low drum resonance under the wheels.
  skatelite: { f: 'lowpass', hz: 950, q: 1.4, grit: 0.015, tone: 2300, gain: 0.95, hollow: 1 },
  soft: { f: 'lowpass', hz: 260, q: 0.5, grit: 0, tone: 700, gain: 0.35 },   // the airbag's vinyl
};

export class Sound {
  constructor() { this.ctx = null; this.buf = {}; }

  start() {
    if (this.ctx) return this.ctx.resume();
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const n = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    const br = c.createBuffer(1, c.sampleRate * 4, c.sampleRate), bd = br.getChannelData(0);   // brown noise: traffic rumble
    for (let i = 0, l = 0; i < bd.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = l * 3.5; }
    this.brown = br;
    // everything -> master (volume) -> gentle compressor -> speakers; hits also feed a small room reverb
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 3; this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = T.volume ?? 0.8; this.master.connect(this.comp);
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(1.1);
    const vg = c.createGain(); vg.gain.value = 0.22; this.verb.connect(vg); vg.connect(this.master);
    this.fxBus = c.createGain(); this.fxBus.connect(this.master); this.fxBus.connect(this.verb);
    const loop = (buf, type, freq, q, out = this.master) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(out); s.start(0, Math.random() * 1.5);
      return { s, f, g };
    };
    // wheels: recorded roll (granular) + a surface-coloured noise layer + a faint bearing hum
    this.rollBus = c.createBiquadFilter(); this.rollBus.type = 'lowpass'; this.rollBus.frequency.value = 3000;
    this.rollG = c.createGain(); this.rollG.gain.value = 0; this.rollBus.connect(this.rollG); this.rollG.connect(this.master);
    this.rollN = loop(this.noise, 'bandpass', 650, 0.6);
    this.hum = c.createOscillator(); this.hum.type = 'sine'; this.humG = c.createGain(); this.humG.gain.value = 0;
    this.hum.connect(this.humG); this.humG.connect(this.master); this.hum.start();
    this.drum = loop(this.brown, 'bandpass', 140, 3.5);               // the hollow ramp frame resonating under the wheels (wood, skatelite)
    this.slideN = loop(this.noise, 'bandpass', 900, 1.2);              // powerslide / revert scrub
    this.grindBus = c.createGain(); this.grindBus.gain.value = 0; this.grindBus.connect(this.master); this.grindBus.connect(this.verb);
    this.screech = loop(this.noise, 'bandpass', 2700, 6, this.grindBus); // metal ring on top of the recording
    this.wind = loop(this.noise, 'lowpass', 300, 0.3);
    // city ambience: traffic rumble, plus cars passing and birds now and then
    this.amb = c.createGain(); this.amb.gain.value = (T.ambience ?? 0.5) * 0.5; this.amb.connect(this.master);
    const rum = loop(this.brown, 'lowpass', 220, 0.4, this.amb); rum.g.gain.value = 0.5;
    this.ambT = 2; this.rollSurf = 'concrete'; this.grainT = { roll: 0, grind: 0 };
    for (const [k, list] of Object.entries(FILES)) {
      this.buf[k] = [];
      for (const f of list) fetch(SFX + f + '.mp3').then((r) => r.arrayBuffer()).then((a) => c.decodeAudioData(a)).then((b) => this.buf[k].push(b)).catch(() => {});
    }
  }

  impulse(sec) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return b;
  }

  // one recorded hit, a random take of it. o: gain, rate, lp (lowpass Hz), delay (s), dry (skip reverb)
  hit(name, o = {}) {
    const c = this.ctx, list = this.buf[name]; if (!c || !list || !list.length) return;
    const s = c.createBufferSource(); s.buffer = list[(Math.random() * list.length) | 0];
    s.playbackRate.value = (o.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const g = c.createGain(); g.gain.value = o.gain ?? 1;
    let node = s;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; s.connect(f); node = f; }
    node.connect(g); g.connect(o.dry ? this.master : this.fxBus); s.start(c.currentTime + (o.delay ?? 0));
  }
  burst(freq, dur, gain, type = 'lowpass', q = 0.7, delay = 0, sweepTo = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.fxBus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  tock(freq, dur, gain, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.fxBus); o.start(t); o.stop(t + dur);
  }
  // granular loop: keep slices of a recording scheduled ~100 ms ahead, each fading in and out
  grains(key, name, out, rate, len) {
    const c = this.ctx, list = this.buf[name]; if (!list || !list.length) return;
    const b = list[0], now = c.currentTime;
    if (this.grainT[key] < now) this.grainT[key] = now;
    while (this.grainT[key] < now + 0.1) {
      const t = this.grainT[key], s = c.createBufferSource(), g = c.createGain();
      s.buffer = b; s.playbackRate.value = rate;
      const dur = len * rate, off = Math.random() * Math.max(0, b.duration - dur - 0.01);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + len * 0.5); g.gain.linearRampToValueAtTime(0, t + len);
      s.connect(g); g.connect(out); s.start(t, off, dur + 0.01);
      this.grainT[key] += len * 0.5;
    }
  }
  ambience(dt) {
    if ((this.ambT -= dt) > 0) return;
    this.ambT = 2.5 + Math.random() * 6;
    const c = this.ctx, t = c.currentTime, r = Math.random();
    if (r < 0.55) {            // a car going past a block away: a swell of filtered noise sliding down in pitch
      const s = c.createBufferSource(); s.buffer = this.brown; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(260, t + 4);
      const g = c.createGain(), pk = 0.25 + Math.random() * 0.3;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + 1.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
      s.connect(f); f.connect(g); g.connect(this.amb); s.start(t, Math.random() * 3); s.stop(t + 4.3);
    } else if (r < 0.85) {     // birds: a few quick chirps
      for (let i = 0, n = 2 + (Math.random() * 3 | 0); i < n; i++) {
        const o = c.createOscillator(), g = c.createGain(), t0 = t + i * (0.09 + Math.random() * 0.08), f0 = 2600 + Math.random() * 1600;
        o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.4), t0 + 0.06);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
        o.connect(g); g.connect(this.amb); o.start(t0); o.stop(t0 + 0.1);
      }
    } else this.hit('snap', { gain: 0.06, rate: 0.9, lp: 1200, delay: 0.05 });   // someone else skating, far off
  }

  update(ph, dt = 1 / 60) {
    const c = this.ctx; if (!c) { ph.fx.length = 0; return; }
    const t = c.currentTime, sp = Math.abs(ph.speed), on = ph.state === 'ground', grinding = ph.state === 'grind';
    this.master.gain.setTargetAtTime(T.volume ?? 0.8, t, 0.1);
    const S = SURF[ph.surface] || SURF.concrete;
    // wheels: louder and brighter with speed; the surface sets the colour
    const rollAmt = on ? Math.min(1, sp / 9) : 0;
    if (on && sp > 0.3) this.grains('roll', 'roll', this.rollBus, 0.75 + Math.min(0.6, sp * 0.045), 0.16);
    this.rollG.gain.setTargetAtTime(rollAmt * 0.55 * S.gain * (ph.manual ? 0.7 : 1), t, 0.05);
    this.rollBus.frequency.setTargetAtTime(S.tone * (0.6 + rollAmt * 0.6), t, 0.1);
    if (this.rollSurf !== ph.surface) { this.rollSurf = ph.surface; this.rollN.f.type = S.f; this.rollN.f.Q.value = S.q; }
    this.rollN.f.frequency.setTargetAtTime(S.hz * (0.8 + rollAmt * 0.6), t, 0.08);
    const grit = on && Math.random() < S.grit * rollAmt * 0.5;   // asphalt chatter
    this.rollN.g.gain.setTargetAtTime(rollAmt * 0.16 * S.gain * (grit ? 1.8 : 1), t, grit ? 0.005 : 0.05);
    this.drum.g.gain.setTargetAtTime(rollAmt * 0.5 * (S.hollow ?? 0), t, 0.06);
    this.drum.f.frequency.setTargetAtTime(110 + sp * 5, t, 0.1);
    this.hum.frequency.setTargetAtTime(180 + sp * 38, t, 0.1);
    this.humG.gain.setTargetAtTime(on ? Math.min(0.012, sp * 0.0012) : 0, t, 0.1);
    // powerslide and revert scrub
    const scrub = on && (ph.slide || ph.revert) ? Math.min(0.45, 0.12 + sp * 0.03) : 0;
    this.slideN.g.gain.setTargetAtTime(scrub, t, 0.03);
    this.slideN.f.frequency.setTargetAtTime(700 + sp * 60, t, 0.05);
    // grinds: the recording for the material, plus a ring on metal
    const gm = grinding && ph.grind ? ph.grind.mat : null, gs = grinding && ph.grind ? Math.abs(ph.grind.speed) : 0;
    if (gm) this.grains('grind', gm === 'metal' ? 'grindMetal' : 'grindConcrete', this.grindBus, 0.8 + Math.min(0.5, gs * 0.05), 0.12);
    this.grindBus.gain.setTargetAtTime(gm ? Math.min(0.9, 0.35 + gs * 0.06) : 0, t, 0.02);
    this.screech.g.gain.setTargetAtTime(gm === 'metal' ? 0.05 + Math.min(0.08, gs * 0.008) : gm ? 0.015 : 0, t, 0.03);
    this.screech.f.frequency.setTargetAtTime(gm === 'metal' ? 2400 + gs * 70 : 1100, t, 0.05);
    // air rushing past
    const air = Math.hypot(ph.vel.x, ph.vel.y, ph.vel.z);
    this.wind.g.gain.setTargetAtTime(ph.state === 'air' ? Math.min(0.2, 0.03 + air * 0.012) : 0.01 + Math.min(0.06, sp * sp * 0.0004), t, 0.12);
    this.wind.f.frequency.setTargetAtTime(250 + (ph.state === 'air' ? air : sp) * 40, t, 0.15);
    this.amb.gain.setTargetAtTime((T.ambience ?? 0.5) * 0.5, t, 0.3);
    this.ambience(dt);

    const L = ph.landing, imp = L ? L.impact : 0.5, power = ph.popPower ?? 1;
    for (const e of ph.fx) {
      if (e === 'pop') {           // tail slapping the ground: wood snap + a click, then the flip whoosh if there is one
        this.hit('snap', { gain: 0.55 * power, rate: 1.15 }); this.tock(240, 0.06, 0.35 * power); this.burst(3200, 0.04, 0.3, 'highpass');
        const tr = ph.trick && ph.trick.def;
        if (tr) this.burst(900, tr.dur * 0.9, 0.12 + 0.05 * Math.abs(tr.roll || 0), 'bandpass', 2.5, 0.04, 2600);
      } else if (e === 'flick') this.burst(900, 0.3, 0.14, 'bandpass', 2.5, 0, 2600);
      else if (e === 'catch') this.hit('tick', { gain: 0.35, rate: 1.4 });
      else if (e === 'land') {     // four wheels and the deck coming down: thump plus clack
        this.hit('thud', { gain: 0.45 + imp * 0.5, rate: 1.05 }); this.tock(95, 0.14, 0.35 + imp * 0.4); this.burst(1400, 0.07, 0.25 + imp * 0.2, 'bandpass', 0.8);
        if (ph.surface === 'metal') this.hit('ting', { gain: 0.3 }); else if (ph.surface === 'wood') this.tock(150, 0.2, 0.3, 0.005);
        else if (ph.surface === 'skatelite') { this.tock(105, 0.32, 0.35 + imp * 0.35, 0.005); this.burst(240, 0.3, 0.2 + imp * 0.25, 'lowpass', 1.5, 0.01); this.hit('snap', { gain: 0.2, rate: 0.7, lp: 900, delay: 0.01 }); }
      } else if (e === 'landSoft') {    // into the airbag: a deep whump, air rushing out, the vinyl creaking
        this.burst(160, 0.45, 0.6, 'lowpass', 0.8); this.burst(1100, 0.7, 0.16, 'bandpass', 0.7, 0.05, 300);
        this.hit('body', { gain: 0.3, rate: 0.75, lp: 700 }); this.tock(70, 0.3, 0.4);
      } else if (e === 'landSketchy') {   // heavier, off-balance: a double hit and the wheels skidding
        this.hit('thud', { gain: 0.7 + imp * 0.3, rate: 0.95 }); this.hit('thud', { gain: 0.35, rate: 1.1, delay: 0.06 }); this.tock(80, 0.18, 0.6);
        this.burst(1100, 0.38, 0.28, 'bandpass', 1.2, 0.03, 600);
      } else if (e === 'grind') {
        const m = ph.grind ? ph.grind.mat : 'metal';
        if (m === 'metal') { this.hit('clang', { gain: 0.5 }); this.burst(4200, 0.08, 0.3, 'highpass'); }
        else { this.hit('tick', { gain: 0.5, rate: 0.75 }); this.burst(2000, 0.1, 0.35, 'bandpass', 1); }
      } else if (e === 'slipoff') this.hit('ting', { gain: 0.4 });
      else if (e === 'push') {     // sneaker sole scuffing the ground
        this.burst(700, 0.2, 0.07, 'bandpass', 0.9, 0.12, 1300); this.hit('step', { gain: 0.25, rate: 1.1, delay: 0.14, dry: true });
      } else if (e === 'crack') { const k = Math.min(1, sp / 8); this.tock(170, 0.05, 0.22 * k); this.burst(2400, 0.03, 0.2 * k, 'bandpass', 1.5); }
      else if (e === 'bump') { this.tock(120, 0.08, 0.3); this.burst(1200, 0.05, 0.2); }
      else if (e === 'bail') {     // body hits, then the board clattering away
        this.hit('punch', { gain: 0.8 }); this.hit('body', { gain: 0.6, delay: 0.05 });
        for (let i = 0; i < 4; i++) this.hit('tick', { gain: 0.5 - i * 0.1, rate: 0.9 + Math.random() * 0.4, delay: 0.12 + i * (0.12 + Math.random() * 0.1) });
      } else if (e === 'slap') this.hit('body', { gain: 0.55, rate: 0.9 });
      else if (e === 'step') this.hit('step', { gain: 0.45 });
      else if (e === 'jump') this.hit('step', { gain: 0.5, rate: 0.9 });
      else if (e === 'walkland') this.hit('body', { gain: 0.25, rate: 1.2 });
      else if (e === 'stepoff' || e === 'stepon') { this.hit('tick', { gain: 0.45, rate: 0.85 }); this.hit('step', { gain: 0.3, delay: 0.08 }); }
      else if (e === 'revert') this.burst(1000, 0.35, 0.22, 'bandpass', 1, 0, 600);
    }
    ph.fx.length = 0;
  }
}
