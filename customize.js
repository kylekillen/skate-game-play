// The Skater screen: pick his top, bottoms, hat and colours, mix and match. Opens from the title screen (Skater button,
// Y on the controller, Tab on the keyboard) and in the game (LB + Y, Tab, or the Skater button in the help panel).
// Every change is put on him straight away (SkaterView.redress) and saved in the browser (localStorage), so it is there
// next time. The named outfits in skater.js are the "Start from" choices. Controller: up/down picks a row, left/right
// changes it, A = next / Done, B = back. Mouse: click the arrows or a colour. Keyboard: arrows, Enter, Esc.
import { TWEAKS as T } from './tweaks.js';
import { OUTFITS, SLOTS, presetLook, savedLook, LOOK_KEY } from './skater.js';

const NAMES = { hoodie: 'Hoodie', crew: 'Crewneck', tee: 'Tee', none: 'None', sun: 'Sun', wave: 'Wave', pants: 'Pants', shorts: 'Shorts',
  beanie: 'Beanie', cap: 'Ballcap', capback: 'Ballcap backwards', night: 'Night', sunday: 'Sunday' };
const label = (v) => NAMES[v] || v;
// rows: [key, title, choices, kind]   kind 'pick' = words, 'colour' = swatches
const ROWS = [
  ['preset', 'Start from', Object.keys(OUTFITS), 'pick'],
  ['top', 'Top', SLOTS.top, 'pick'],
  ['topC', 'Top colour', SLOTS.topC, 'colour'],
  ['print', 'Print', SLOTS.print, 'pick'],
  ['bottom', 'Bottoms', SLOTS.bottom, 'pick'],
  ['bottomC', 'Bottoms colour', SLOTS.bottomC, 'colour'],
  ['socks', 'Socks', SLOTS.socks, 'colour'],
  ['hat', 'Hat', SLOTS.hat, 'pick'],
  ['hatC', 'Hat colour', SLOTS.hatC, 'colour'],
  ['skin', 'Skin', SLOTS.skin, 'colour'],
  ['hair', 'Hair', SLOTS.hair, 'colour'],
  ['done', 'Done', null, 'done'],
];
export const CHOICES = Object.fromEntries(ROWS.filter((r) => r[2]).map((r) => [r[0], r[2]]));   // for tests: every option of every slot
const lum = (c) => { const n = parseInt(c.slice(1), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };

export class Closet {
  constructor(skater, onClose) {
    this.skater = skater; this.onClose = onClose; this.open = false; this.row = 1; this.look = savedLook(); this.prev = []; this.rep = { k: null, t: 0 };
    this.closedAt = -1e9; this.spin = 0;
    const el = this.el = document.createElement('div'); el.id = 'closet'; el.className = 'hidden';
    el.innerHTML = `<div class="ct">Skater</div><div class="rows"></div>
      <p class="kh">D-pad / stick: up-down pick, left-right change · A next · B back<br>Mouse: click · Keyboard: arrows, Enter, Esc</p>`;
    document.body.appendChild(el);
    this.rowsEl = el.querySelector('.rows');
    this.render();
    addEventListener('keydown', (e) => {
      if (!this.open) { if (e.code === 'Tab') { e.preventDefault(); this.show(); } return; }
      const k = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
        Enter: 'ok', Space: 'ok', Escape: 'back', Tab: 'back', Backspace: 'back' }[e.code];
      if (k) { e.preventDefault(); e.stopImmediatePropagation(); this.act(k); }
    }, true);
    addEventListener('keyup', (e) => { if (this.open || performance.now() - this.closedAt < 400) e.stopImmediatePropagation(); }, true);   // Space on Done is not an ollie
    el.addEventListener('click', (e) => e.stopPropagation());
  }
  render() {
    this.rowsEl.innerHTML = '';
    ROWS.forEach(([key, title, ch, kind], i) => {
      const r = document.createElement('div'); r.className = 'row' + (i === this.row ? ' on' : '') + (kind === 'done' ? ' done' : '');
      if (this.off(key)) r.classList.add('off');
      r.dataset.i = i;
      if (kind === 'done') r.textContent = 'Done';
      else {
        const v = this.look[key];
        const body = kind === 'colour'
          ? ch.map((c) => `<span class="sw${c === v ? ' sel' : ''}${c === 'none' ? ' no' : ''}" data-v="${c}" style="background:${c === 'none' ? 'transparent' : c}"></span>`).join('')
          : `<span class="ar" data-d="-1">‹</span><span class="val">${label(v)}</span><span class="ar" data-d="1">›</span>`;
        r.innerHTML = `<span class="lb">${title}</span><span class="ch">${body}</span>`;
      }
      r.addEventListener('mousemove', () => { if (this.row !== i) { this.row = i; this.mark(); } });
      r.addEventListener('click', (e) => {
        this.row = i; const t = e.target;
        if (kind === 'done') return this.hide();
        if (t.dataset.v) this.set(key, t.dataset.v);
        else if (t.dataset.d) this.step(+t.dataset.d);
        else if (kind === 'pick') this.step(1);
        else this.mark();
      });
      this.rowsEl.appendChild(r);
    });
  }
  mark() { [...this.rowsEl.children].forEach((r, i) => r.classList.toggle('on', i === this.row)); }
  set(key, v) {
    if (this.off(key)) return;
    if (key === 'preset') this.look = presetLook(v);
    else {
      this.look[key] = v;
      if (key === 'topC') this.look.ink = lum(v) > 0.55 ? '#1f2a3a' : '#f1ead8';   // the print reads on any colour
      if (key === 'hatC') this.look.hatC2 = lum(v) > 0.55 ? '#2a2a2e' : '#e8e2d2';  // the cap's button and peak underside
    }
    this.render(); this.apply();
  }
  step(d) {
    const [key, , ch] = ROWS[this.row]; if (!ch) return;
    const i = ch.indexOf(this.look[key]);
    this.set(key, ch[((i < 0 ? 0 : i + d) + ch.length) % ch.length]);
  }
  apply() {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify({ from: T.outfit, look: this.look })); } catch (e) { console.warn('could not save the look', e); }
    clearTimeout(this.tm); this.tm = setTimeout(() => this.skater.redress({ ...this.look }), 90);   // quick clicks: dress once, for the last one
  }
  act(k) {
    const n = ROWS.length;
    if (k === 'up') { do this.row = (this.row - 1 + n) % n; while (this.disabled(this.row)); this.mark(); }
    else if (k === 'down') { do this.row = (this.row + 1) % n; while (this.disabled(this.row)); this.mark(); }
    else if (k === 'left') this.step(-1);
    else if (k === 'right') this.step(1);
    else if (k === 'ok') { if (ROWS[this.row][3] === 'done') this.hide(); else if (ROWS[this.row][3] === 'pick') this.step(1); else this.act('down'); }
    else if (k === 'back') this.hide();
  }
  disabled(i) { return this.off(ROWS[i][0]); }
  off(key) { return (key === 'socks' && this.look.bottom !== 'shorts') || (key === 'hatC' && this.look.hat === 'none'); }   // greyed out: nothing to colour
  show() {
    if (this.open) return;
    this.open = true; this.look = savedLook(); this.row = 1; this.render(); this.el.classList.remove('hidden'); this.prev = this.pads(); this.spin = 0;
    document.body.classList.add('closet');
  }
  hide() {
    if (!this.open) return;
    this.open = false; this.el.classList.add('hidden'); this.closedAt = performance.now(); document.body.classList.remove('closet');
    if (this.onClose) this.onClose();
  }
  pads() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected) : [];
    const p = pads.find((q) => q.mapping === 'standard') || pads[0];
    if (!p) return [];
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed), ax = (i) => p.axes[i] || 0;
    return { a: b(0), b: b(1), y: b(3), lb: b(4), up: b(12) || ax(1) < -0.6, down: b(13) || ax(1) > 0.6, left: b(14) || ax(0) < -0.6, right: b(15) || ax(0) > 0.6 };
  }
  // every frame (main.js): controller buttons (with key-repeat on the d-pad/stick), and opening it with the controller
  poll(dt, { title }) {
    const s = this.pads(), pv = this.prev || {}; this.prev = s;
    if (!this.open) {
      if (performance.now() - this.closedAt < 400) return;
      if (s.y && !pv.y && (title || s.lb)) this.show();
      return;
    }
    if (s.a && !pv.a) this.act('ok');
    if (s.b && !pv.b) this.act('back');
    for (const k of ['up', 'down', 'left', 'right']) {
      if (s[k] && !pv[k]) { this.act(k); this.rep = { k, t: 0.38 }; }
      else if (s[k] && this.rep.k === k && (this.rep.t -= dt) <= 0) { this.act(k); this.rep.t = 0.13; }
    }
  }
  // the camera walks slowly round him while the screen is open; he stands on the right, the menu on the left
  camera(cam, pos, dt) {
    this.spin += dt * 0.32;
    const a = this.spin + Math.PI * 0.15, R = 2.15, c = { x: pos.x + Math.sin(a) * R, y: pos.y + 1.2, z: pos.z + Math.cos(a) * R };
    cam.position.set(c.x, c.y, c.z);
    const rx = Math.cos(a), rz = -Math.sin(a), off = -0.5;           // shift the aim to his right so he stands clear of the menu
    cam.lookAt(pos.x + rx * off, pos.y + 0.9, pos.z + rz * off);
  }
}
