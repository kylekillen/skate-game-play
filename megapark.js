// ─────────────────────────────────────────────────────────────────────
//  SKYHOOK MEGA PARK. Meters. x = east/west, z = north/south, y = up.
//  An original giant-transition park out in open hill country:
//   - the MEGARAMP along the north side: a 24 m roll-in tower, a long steep roll-in on scaffolding,
//     a kicker, a 14 m gap over the ground, a long landing ramp and a 9 m vert quarter pipe at the end
//   - THE MID DECK (4 m up) in the west: stairs, a bank and a roll-in down, ledges and rails on top
//   - a deep bowl, a big spine, a big hip, giant quarter pipes, oversized kickers, street ledges and rails
//  Lifts (glowing pads) at the foot of the tower and the deck carry you to the top.
//  Every obstacle is one line, built from the same kit as skatepark.js.
//
//  ramp(x, z, width, profile, material, { sideMat, ry, rails }) — a solid ramp following a profile
//  profile = prof(y0, [['line', length], ['arc', radius, toDegrees], ...])  (degrees: + = rising)
// ─────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

// a 2D centre-line from x = 0 at height y0: straight runs and arcs, sampled every ~0.2 m, with true normals
export function prof(y0, parts, step = 0.2) {
  const pts = [{ x: 0, y: y0, a: 0 }]; let x = 0, y = y0, a = 0;
  for (const p of parts) {
    if (p[0] === 'line') { const n = Math.max(1, Math.ceil(p[1] / step)); for (let i = 1; i <= n; i++) pts.push({ x: x + Math.cos(a) * p[1] * i / n, y: y + Math.sin(a) * p[1] * i / n, a }); x += Math.cos(a) * p[1]; y += Math.sin(a) * p[1]; }
    else if (p[0] === 'flatTo') { const L = p[1] - x; if (L > 0) { const n = Math.ceil(L / step); for (let i = 1; i <= n; i++) pts.push({ x: x + L * i / n, y, a: 0 }); x = p[1]; } }
    else if (p[0] === 'downTo') {           // a straight run at the current angle until the height reaches p[1]
      const L = (p[1] - y) / Math.sin(a); const n = Math.max(1, Math.ceil(L / step)); for (let i = 1; i <= n; i++) pts.push({ x: x + Math.cos(a) * L * i / n, y: y + Math.sin(a) * L * i / n, a });
      x += Math.cos(a) * L; y = p[1];
    } else {                                   // arc to a new angle; radius R
      const R = p[1], a1 = p[2] * Math.PI / 180, s = a1 > a ? 1 : -1;   // s = +1 turning up (concave), -1 turning down (convex)
      const cx = x - s * R * Math.sin(a), cy = y + s * R * Math.cos(a), n = Math.max(2, Math.ceil(R * Math.abs(a1 - a) / step));
      for (let i = 1; i <= n; i++) { const t = a + (a1 - a) * i / n; pts.push({ x: cx + s * R * Math.sin(t), y: cy - s * R * Math.cos(t), a: t }); }
      x = cx + s * R * Math.sin(a1); y = cy - s * R * Math.cos(a1); a = a1;
    }
  }
  pts.end = { x, y, a }; return pts;
}

const rnd = (k) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const cc = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
// original banner logos (a 2x2 sheet, each 2:1). Made-up brands, shapes only.
let BANNERS = null;
function bannerMat() {
  if (BANNERS) return BANNERS;
  const t = cc(2048, 1024, (g) => {
    const W = 1024, H = 512, cell = (i, bg, draw) => { g.save(); g.translate((i % 2) * W, (i >> 1) * H); g.fillStyle = bg; g.fillRect(0, 0, W, H); draw(); g.restore(); };
    const txt = (s, x, y, px, fill, line, italic = '') => { g.font = `${italic}900 ${px}px 'Arial Black', Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; if (line) { g.lineWidth = px * 0.12; g.strokeStyle = line; g.strokeText(s, x, y); } g.fillStyle = fill; g.fillText(s, x, y); };
    // 0: SKYHOOK — a hook through a cloud, red on cream
    cell(0, '#f4ecdc', () => { g.fillStyle = '#d2402e'; g.fillRect(0, 0, W, 34); g.fillRect(0, H - 34, W, 34);
      g.fillStyle = '#2b4677'; for (const [x, y, r] of [[170, 250, 70], [240, 210, 85], [320, 250, 66]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      g.strokeStyle = '#d2402e'; g.lineWidth = 34; g.lineCap = 'round'; g.beginPath(); g.moveTo(245, 90); g.lineTo(245, 300); g.arc(195, 300, 50, 0, Math.PI, false); g.stroke();
      txt('SKYHOOK', 660, 220, 150, '#2b4677'); txt('MEGA PARK', 660, 350, 74, '#d2402e'); });
    // 1: UPDRAFT — sunburst, black on yellow
    cell(1, '#ffc93c', () => { g.fillStyle = '#1b1b1b'; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; g.beginPath(); g.moveTo(190, 256); g.arc(190, 256, 230, a, a + 0.12); g.fill(); }
      g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(190, 256, 92, 0, 7); g.fill(); g.fillStyle = '#d2402e'; g.beginPath(); g.arc(190, 256, 64, 0, 7); g.fill();
      txt('UPDRAFT', 660, 230, 160, '#1b1b1b', null, 'italic '); txt('WHEELS', 660, 360, 70, '#d2402e'); });
    // 2: GRAVITY CO. — a falling arrow, white on teal
    cell(2, '#1f8f8a', () => { g.fillStyle = '#f4ecdc'; g.beginPath(); g.moveTo(130, 90); g.lineTo(250, 90); g.lineTo(250, 300); g.lineTo(320, 300); g.lineTo(190, 440); g.lineTo(60, 300); g.lineTo(130, 300); g.closePath(); g.fill();
      txt('GRAVITY CO.', 660, 230, 120, '#f4ecdc', '#0f4f4c'); txt('RAMP BUILDERS', 660, 350, 60, '#ffc93c'); });
    // 3: HIGH NOON — checker band and a star, navy
    cell(3, '#2b4677', () => { for (let x = 0; x < W; x += 48) for (let y = 0; y < 96; y += 48) { g.fillStyle = ((x + y) / 48) % 2 ? '#f4ecdc' : '#1b1b1b'; g.fillRect(x, y + H - 96, 48, 48); }
      g.fillStyle = '#ffc93c'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 50 : 120; g.lineTo(170 + Math.cos(a) * r, 200 + Math.sin(a) * r); } g.fill();
      txt('HIGH NOON', 640, 200, 140, '#f4ecdc', '#1b1b1b'); txt('SKATE SUPPLY', 640, 320, 64, '#ffc93c'); });
  });
  BANNERS = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  BANNERS.userData.noShadow = true;
  return BANNERS;
}

export function megapark(kit, ck) {
  const { box, wedge, quarter, rail, decal, bowl, hipBox, stairs, hubba, slab, mural, tube, add, MAT, PI, V } = kit;
  const { lamp, bin, seat, fence, floodlight, bleacher, tag } = ck;
  const { deckOf: deck, transOf: trans, ledgeOf: ledge, steelOf: steel, bowlOf, tileOf, floorPaint, stripe, paintedPly: ply } = MAT;
  const off = { collide: false };
  const X0 = -100, X1 = 100, Z0 = -70, Z1 = 62;
  const Y = V(0, 1, 0), loc = (x, y, z, ox, oy, oz, ry) => V(ox, oy, oz).applyAxisAngle(Y, ry).add(V(x, y, z));
  const scaffoldMat = MAT.metal, frame = MAT.darkMetal;
  const BAN = bannerMat();
  // the megaramp's riding surfaces sound like what they are: skatelite sheet over a hollow wooden frame (main.js reads userData.surface).
  // Copies, so the skatepark's own skatelite mini ramp and plywood kicker keep their sound.
  const tagged = (m, surface) => { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; c.userData = { ...m.userData, surface }; return c; };
  const LITE = tagged(MAT.skatelite, 'skatelite'), KICK = tagged(MAT.rampPly, 'wood');

  // a banner: one of the four logos on an upright panel facing ry
  const banner = (x, y, z, w, h, ry, which) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, cu = (which % 2) / 2, cv = 1 - ((which >> 1) + 1) / 2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 2, cv + uv.getY(i) / 2);
    g.rotateY(ry); g.translate(x, y, z); add(g, BAN, false);
  };

  // RAMP: a solid ramp whose riding surface follows profile pts (local x along ry's direction), width w.
  // Sides are vertical panels down to the ground (or to yb), ends closed, so there is no hollow under it.
  function ramp(x, z, w, pts, mat, { sideMat = mat, ry = 0, yb = 0, rails = false, railFrom = 0, railTo = Infinity, endCap = true, startCap = true } = {}) {
    const top = [], side = [], a = w / 2;
    const P = (px, py, pz) => loc(x, py, z, px, 0, pz, ry).setY(py);
    const N = (ang, s) => V(-Math.sin(ang), Math.cos(ang), 0).applyAxisAngle(Y, ry);
    const pos = [], nor = [], uv = [], sp = [], sn = [], su = [];
    let s0 = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], ds = Math.hypot(q.x - p.x, q.y - p.y), np = N(p.a), nq = N(q.a);
      const A = P(p.x, p.y, -a), B = P(p.x, p.y, a), C = P(q.x, q.y, a), D = P(q.x, q.y, -a);
      // faces up, wound counter-clockwise seen from above the surface
      for (const [v, n, u] of [[A, np, [-a, s0]], [D, nq, [-a, s0 + ds]], [C, nq, [a, s0 + ds]], [A, np, [-a, s0]], [C, nq, [a, s0 + ds]], [B, np, [a, s0]]]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uv.push(u[0] / 2, u[1] / 2); }
      for (const sz of [-a, a]) {           // side panels
        const n = V(0, 0, Math.sign(sz)).applyAxisAngle(Y, ry), a0 = P(p.x, p.y, sz), a1 = P(q.x, q.y, sz), b0 = P(p.x, yb, sz), b1 = P(q.x, yb, sz);
        const quad = sz < 0 ? [a0, b0, b1, a0, b1, a1] : [a0, a1, b1, a0, b1, b0];
        for (const v of quad) { sp.push(v.x, v.y, v.z); sn.push(n.x, n.y, n.z); su.push(V().subVectors(v, P(0, 0, sz)).applyAxisAngle(Y, -ry).x / 2, v.y / 2); }
      }
      s0 += ds;
    }
    const caps = [];
    if (startCap) caps.push([pts[0], -1]); if (endCap) caps.push([pts[pts.length - 1], 1]);
    for (const [p, s] of caps) if (p.y - yb > 0.01) {
      const n = V(s, 0, 0).applyAxisAngle(Y, ry), A = P(p.x, p.y, -a), B = P(p.x, p.y, a), C = P(p.x, yb, a), D = P(p.x, yb, -a);
      const quad = s > 0 ? [A, B, C, A, C, D] : [A, C, B, A, D, C];
      for (const v of quad) { sp.push(v.x, v.y, v.z); sn.push(n.x, n.y, n.z); su.push(V().subVectors(v, P(0, 0, 0)).applyAxisAngle(Y, -ry).z / 2, v.y / 2); }
    }
    // wind every triangle so its face points the way its normal does (the physics reads front/back from the winding)
    const fix = (p, n, u) => { for (let k = 0; k < p.length; k += 9) {
      const e1 = [p[k + 3] - p[k], p[k + 4] - p[k + 1], p[k + 5] - p[k + 2]], e2 = [p[k + 6] - p[k], p[k + 7] - p[k + 1], p[k + 8] - p[k + 2]];
      const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (c[0] * n[k] + c[1] * n[k + 1] + c[2] * n[k + 2] < 0) for (const [arr, m] of [[p, 3], [n, 3], [u, 2]]) { const j = k / 3 * m; for (let q = 0; q < m; q++) { const t = arr[j + m + q]; arr[j + m + q] = arr[j + 2 * m + q]; arr[j + 2 * m + q] = t; } } } };
    fix(pos, nor, uv); fix(sp, sn, su);
    const mk = (p, n, u) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); return g; };
    add(mk(pos, nor, uv), mat, true, true);
    add(mk(sp, sn, su), sideMat);
    // railings along both sides where it is high enough to fall off: posts, a top rail, and a solid see-through barrier
    if (rails) for (const sz of [-a - 0.05, a + 0.05]) {
      let last = null;
      for (let i = 0; i < pts.length; i += 10) {
        const p = pts[i]; if (p.x < railFrom || p.x > railTo) { last = null; continue; }
        const g0 = P(p.x, p.y, sz);
        tube(g0, g0.clone().add(V(0, 1.1, 0)), 0.03, 0.03, steel('ochre'), false, 6);
        if (last) { tube(last.clone().add(V(0, 1.1, 0)), g0.clone().add(V(0, 1.1, 0)), 0.03, 0.03, steel('ochre'), false, 6); tube(last.clone().add(V(0, 0.55, 0)), g0.clone().add(V(0, 0.55, 0)), 0.02, 0.02, steel('ochre'), false, 6);
          const lo = last.y < g0.y ? last : g0, hi = last.y < g0.y ? g0 : last;
          const gb = new THREE.BoxGeometry(lo.distanceTo(V(hi.x, lo.y, hi.z)) + 0.1, 1.1 + (hi.y - lo.y), 0.08); gb.rotateY(-Math.atan2(hi.z - lo.z, hi.x - lo.x)); gb.translate((lo.x + hi.x) / 2, lo.y + (1.1 + hi.y - lo.y) / 2, (lo.z + hi.z) / 2);
          kit.solid(gb, true); }
        last = g0;
      }
    }
    return pts;
  }
  // coping along the top edge of a profile point (a lip): a steel tube and a grind line
  const lipCoping = (x, z, w, p, ry, mat = MAT.coping, out = 1) => {
    const a = loc(x, p.y - 0.01, z, p.x, 0, -w / 2, ry), b = loc(x, p.y - 0.01, z, p.x, 0, w / 2, ry);
    tube(a, b, 0.05, 0.05, mat, false, 14);
    kit.seg(a.clone().setY(p.y + 0.03), b.clone().setY(p.y + 0.03), { out: V(out, 0, 0).applyAxisAngle(Y, ry) });
  };
  // scaffolding: a grid of steel tube frames standing beside a structure (scenery; the ramp itself is solid)
  function scaffold(x0, x1, z, y0, topAt, gap = 2.5, lift = 2.2) {
    for (let x = x0; x <= x1 + 1e-6; x += gap) {
      const h = topAt(x); if (h - y0 < 0.6) continue;
      tube(V(x, y0, z), V(x, h, z), 0.045, 0.045, scaffoldMat, false, 6);
      if (x + gap <= x1 + 1e-6) {
        const h2 = topAt(x + gap);
        for (let y = y0 + lift; y < Math.min(h, h2) - 0.3; y += lift) tube(V(x, y, z), V(x + gap, y, z), 0.035, 0.035, scaffoldMat, false, 6);
        for (let y = y0; y + lift < Math.min(h, h2); y += lift * 2) tube(V(x, y, z), V(x + gap, y + lift, z), 0.03, 0.03, scaffoldMat, false, 6);
      }
    }
  }

  // AIRBAG: an inflated stunt bag filling a gap from x0 to x1 across the megaramp. Its top is soft ground (physics.softAt):
  // a landing in it hands back only `absorb` of the drop as impact and keeps `grip` of your speed, so a short jump is a soft
  // landing, not a slam. Rounded sides you can roll up onto (slowly: rolling on it drags hard).
  function airbag(x0, x1) {
    const BH = 2.6, BZ = 15, BW = x1 - x0 - 0.3, c55 = 1 - Math.cos(55 * PI / 180);
    const rise = [['arc', 1.2, 55], ['downTo', BH - 1.0 * c55], ['arc', 1.0, 0]], half = prof(0, rise).end.x;
    const pts = prof(0, [...rise, ['flatTo', BZ - half], ['arc', 1.0, -55], ['downTo', 1.2 * c55], ['arc', 1.2, 0]]);
    const tex = cc(512, 512, (g, w) => {        // one tile = 2 x 2 m: four puffed vinyl panels, stitched seams, scuffs
      g.fillStyle = '#1a3f86'; g.fillRect(0, 0, w, w);
      const gr = g.createRadialGradient(w / 2, w * 0.46, 20, w / 2, w / 2, w * 0.72); gr.addColorStop(0, 'rgba(110,150,230,0.22)'); gr.addColorStop(0.7, 'rgba(40,80,170,0.05)'); gr.addColorStop(1, 'rgba(5,12,40,0.5)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.fillStyle = 'rgba(6,14,40,0.8)'; g.fillRect(0, 0, 5, w); g.fillRect(0, 0, w, 5);
      g.fillStyle = 'rgba(205,215,235,0.55)'; for (let t = 4; t < w; t += 16) for (const o of [9, w - 11]) { g.fillRect(o, t, 2, 8); g.fillRect(t, o, 8, 2); }
      g.fillStyle = 'rgba(240,190,40,0.9)'; g.fillRect(0, w * 0.47, w, w * 0.06);    // a yellow strap band across each panel
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(20,20,25,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * w, 2 + Math.random() * 20, 1 + Math.random() * 3); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0, envMapIntensity: 0.7 });
    mat.userData.surface = 'soft';
    ramp((x0 + x1) / 2, MZ + BZ / 2, BW, pts, mat, { ry: PI / 2, startCap: false, endCap: false });
    // the blower that keeps it up: a box fan on the ground beside it, its hose running into the bag's side
    const bx = (x0 + x1) / 2 + 3, bz = MZ - BZ / 2 - 2.2;
    box(bx, 0, bz, 1.2, 0.9, 1, MAT.plate, off); tube(V(bx, 0.45, bz + 0.5), V(bx, 0.45, MZ - BZ / 2 + 0.2), 0.28, 0.32, steel('charcoal'), false, 12);
    return { x0, x1, z0: MZ - BZ / 2, z1: MZ + BZ / 2, y: BH, absorb: 0.32, grip: 0.3 };
  }

  // ── THE GROUND: a big poured slab with coloured zones, then hills all round ──
  const rect = (x0, z0, x1, z1) => [V(x0, 0, z0), V(x1, 0, z0), V(x1, 0, z1), V(x0, 0, z1)];
  const bowlHole = [];
  // ── THE BOWL: deep end with vert in the east, a shallower end in the west. Teal with sand tiles. ──
  const ease = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return 0.5 - 0.5 * Math.cos(t * PI); };
  const bw = bowl(18, -40, 17, 11, 7.5, 0, (x) => 2.6 + 2.2 * ease(x, 8, 26), (D) => 2.6 + 0.25 * D, bowlOf('teal'), { tileMat: tileOf('sand', 'navy'), copingMat: steel('red') });
  decal(28, -4.8, -40, 0.6, 0.6, MAT.grate); decal(28, -4.8, -40, 5, 4, MAT.stain, { ry: 0.6, cell: [1, 2] });
  const zMega = rect(-96, 30, 66, 56), zBowl = rect(-4, -56, 40, -24), zStreet = rect(42, -64, 96, -28);
  // the deck is laid in big pours (each its own tone and finish, wide sealed joints between them, saw cuts inside), with damp
  // and oily patches here and there: MAT.pourOf in park.js
  slab(rect(X0 - 2, Z0 - 2, X1 + 2, Z1 + 2), 0, MAT.pourOf('park'), [zMega, zBowl, zStreet]);
  slab(zMega, 0, MAT.pourOf('#c9ccd0', [13.5, 13]));
  slab(zBowl, 0, MAT.pourOf('sand', [11, 16]), [bw]);
  slab(zStreet, 0, MAT.pourOf('charcoal', [13.5, 12]));

  // ── THE MEGARAMP (north side, runs west to east along z = 43) ──
  const MZ = 43, MW = 12, TOP = 24, YB = 5.2;
  // the roll-in tower: a 24 m deck to start from, with railings and the flags
  const TX0 = -96, LIP = -84;
  box((TX0 + LIP) / 2, 0, MZ, LIP - TX0, TOP - 0.05, MW + 4, ply('navy'));
  box((TX0 + LIP) / 2, TOP - 0.05, MZ, LIP - TX0, 0.05, MW + 4, LITE);
  const rollPts = prof(TOP, [['arc', 14, -35], ['downTo', YB + 16 * (1 - Math.cos(35 * PI / 180))], ['arc', 16, 0], ['line', 5], ['arc', 30, 20]]);
  ramp(LIP, MZ, MW, rollPts, LITE, { sideMat: ply('red'), startCap: false, rails: true, railFrom: 0, railTo: rollPts.end.x - 16 });
  const KL = LIP + rollPts.end.x, KY = rollPts.end.y;          // the kicker's lip
  lipCoping(KL, MZ, MW, { x: 0, y: KY }, 0, steel('charcoal'), -1);
  // tower railings: three sides of the start deck
  for (const [a, b] of [[V(TX0 + 0.3, TOP, MZ - 7.7), V(LIP - 0.3, TOP, MZ - 7.7)], [V(TX0 + 0.3, TOP, MZ + 7.7), V(LIP - 0.3, TOP, MZ + 7.7)], [V(TX0 + 0.3, TOP, MZ - 7.7), V(TX0 + 0.3, TOP, MZ + 7.7)]]) {
    const n = Math.ceil(a.distanceTo(b) / 2);
    for (let i = 0; i <= n; i++) { const p = V().lerpVectors(a, b, i / n); tube(p, p.clone().add(V(0, 1.1, 0)), 0.035, 0.035, steel('ochre'), false, 8); }
    for (const hh of [0.55, 1.1]) tube(a.clone().add(V(0, hh, 0)), b.clone().add(V(0, hh, 0)), 0.03, 0.03, steel('ochre'), false, 8);
    kit.barrier(a, b, 1.1);
  }
  for (const s of [-1, 1]) {             // the start-deck rails along the roll-in lip's sides
    const a = V(LIP - 0.3, TOP, MZ + s * 7.7), b = V(LIP - 0.3, TOP, MZ + s * 6.05);
    tube(a.clone().add(V(0, 1.1, 0)), b.clone().add(V(0, 1.1, 0)), 0.03, 0.03, steel('ochre'), false, 8); kit.barrier(a, b, 1.1);
  }
  box(LIP - 4, TOP, MZ - 5, 5, 0.45, 0.7, ledge('cream'), { grind: 'x', edge: steel('red') });           // a little ledge up top
  // flags on the tower corners and a big banner on each face
  const flags = [];
  for (const [x, z, c] of [[TX0 + 0.4, MZ - 7.6, 0], [TX0 + 0.4, MZ + 7.6, 1], [LIP - 0.6, MZ - 7.6, 3], [LIP - 0.6, MZ + 7.6, 2]]) { tube(V(x, TOP, z), V(x, TOP + 7, z), 0.05, 0.04, MAT.plate, false, 8); flags.push([x, TOP + 6.9, z, c]); }
  for (const s of [-1, 1]) { banner((TX0 + LIP) / 2, TOP - 3.2, MZ + s * (MW / 2 + 2.02), 11, 5.5, s > 0 ? 0 : PI, s > 0 ? 0 : 2); banner((TX0 + LIP) / 2, TOP - 10, MZ + s * (MW / 2 + 2.02), 11, 5.5, s > 0 ? 0 : PI, s > 0 ? 3 : 1); }
  banner(TX0 - 0.02, TOP - 4, MZ, 14, 7, -PI / 2, 0);
  // scaffolding up both sides of the roll-in and round the tower
  const rollTop = (x) => { const lx = x - LIP; let best = rollPts[0]; for (const p of rollPts) if (Math.abs(p.x - lx) < Math.abs(best.x - lx)) best = p; return best.y - 0.4; };
  for (const s of [-1, 1]) { scaffold(LIP + 1, KL - 4, MZ + s * (MW / 2 + 0.25), 0, rollTop); scaffold(TX0, LIP, MZ + s * (MW / 2 + 2.25), 0, () => TOP - 0.3); }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const x = LIP + 6 + i * 9, y = rollTop(x) * 0.5; banner(x, Math.max(1.6, y), MZ + s * (MW / 2 + 0.03), 7, 3.5, s > 0 ? 0 : PI, (i + (s > 0 ? 0 : 2)) % 4); }
  // the gap: 14 m, filled with an airbag, so coming up short lands you in the bag instead of on the concrete
  const GAP = 14, LX = KL + GAP, HL = KY;
  const soft = airbag(KL, LX);
  // the landing: a short deck, a rounded knuckle, a long down-slope, then the transition to the flat
  const landPts = prof(HL, [['line', 5], ['arc', 10, -18], ['downTo', 20 * (1 - Math.cos(18 * PI / 180))], ['arc', 20, 0]]);
  ramp(LX, MZ, MW, landPts, LITE, { sideMat: ply('teal'), endCap: false });
  for (const s of [-1, 1]) { const lt = (x) => { const lx = x - LX; let b = landPts[0]; for (const p of landPts) if (Math.abs(p.x - lx) < Math.abs(b.x - lx)) b = p; return b.y - 0.3; };
    scaffold(LX + 0.5, LX + landPts.end.x - 4, MZ + s * (MW / 2 + 0.25), 0, lt); banner(LX + 9, 3, MZ + s * (MW / 2 + 0.03), 7, 3.5, s > 0 ? 0 : PI, s > 0 ? 1 : 3); }
  banner(LX - 0.03, HL / 2, MZ, 10, 5, -PI / 2, 2);
  // knuckle coping on the landing deck front edge (a grindable lip, like the real ones)
  lipCoping(LX, MZ, MW, { x: 0, y: HL }, 0, steel('charcoal'), 1);
  // the run-out and the giant quarter pipe at the end
  const QX = LX + landPts.end.x + 22;
  const qR = 9, qDeck = 4;
  quarter(QX, MZ, MW + 4, PI / 2, LITE, { R: qR, maxDeg: 90, deck: qDeck, sideMat: ply('ochre'), copingMat: steel('red'), N: 120 });
  scaffold(QX + 0.5, QX + qR + qDeck - 0.5, MZ - (MW + 4) / 2 - 0.25, 0, (x) => { const u = Math.min(qR, x - QX); return u >= qR ? qR - 0.2 : qR - Math.sqrt(qR * qR - u * u) - 0.2; });
  banner(QX + qR + qDeck + 0.03, qR / 2, MZ, 12, 6, PI / 2, 1);
  decal(QX - 10, 0, MZ, 8, 8, floorPaint('ochre'), { cell: [3, 2] });
  for (const s of [-1, 1]) decal((LX + QX) / 2, 0, MZ + s * 5.6, QX - LX, 0.18, stripe('red'), { tile: 1.3 });

  // ── THE MID DECK: a raised level 4 m up in the west, with a stair set, a long bank, a roll-in and ledges ──
  const DH = 4, DX0 = -96, DX1 = -60, DZ0 = -30, DZ1 = 8;
  box((DX0 + DX1) / 2, 0, (DZ0 + DZ1) / 2, DX1 - DX0, DH, DZ1 - DZ0, deck('terracotta'));
  const st = stairs(-72, DZ0, 6, 20, 0.2, 0.36, -1, MAT.parkLedge);                                         // 20 stairs down the south side
  for (const sx of [-75.4, -68.6]) rail(V(sx, DH + 0.95, DZ0 + 0.3), V(sx, 0.7, DZ0 - st.run - 0.3), [[0.03, 0.95], [0.97, 0.7]], 0.035, MAT.railPaint.yellow);
  hubba(-79, DZ0, DH + 0.5, DZ0 - st.run, 0.5, 0.9, ledge('charcoal'));
  wedge(-90, DZ0 - 14, 10, 14, DH, 0, trans('sage'));                                                        // the long bank up the south side
  quarter(DX1 + 6 * Math.sin(Math.acos(1 - DH / 6)), -18, 12, -PI / 2, trans('ochre'), { R: 6, maxDeg: Math.acos(1 - DH / 6) * 180 / PI, deck: 0, fence: false, copingMat: steel('navy') });   // roll in to the flat (4 m)
  wedge(DX1 + 12, -2, 9, 12, DH, -PI / 2, trans('blue'));                                                          // bank down to the east
  box(-84, DH, -6, 12, 0.5, 0.8, ledge('cream'), { grind: 'x', edge: steel('red') });                       // ledges and a rail up top
  box(-84, DH, 2, 10, 0.3, 3, ledge('lilac'), { grind: 'x', edge: steel('charcoal') });
  rail(V(-90, DH + 0.4, -14), V(-78, DH + 0.4, -14), [[0.03, null], [0.5, null], [0.97, null]], 0.035, MAT.railPaint.red);
  box(-70, DH, -22, 0.8, 0.45, 9, ledge('charcoal'), { grind: 'z', edge: steel('ochre') });
  for (const [a, b] of [[V(DX0 + 0.3, DH, DZ0 + 0.3), V(DX0 + 0.3, DH, DZ1 - 0.3)], [V(DX0 + 0.3, DH, DZ1 - 0.3), V(DX1 - 0.3, DH, DZ1 - 0.3)]]) {
    const n = Math.ceil(a.distanceTo(b) / 2.5); for (let i = 0; i <= n; i++) { const p = V().lerpVectors(a, b, i / n); tube(p, p.clone().add(V(0, 1.05, 0)), 0.03, 0.03, steel('teal'), false, 8); }
    tube(a.clone().add(V(0, 1.05, 0)), b.clone().add(V(0, 1.05, 0)), 0.03, 0.03, steel('teal'), false, 8); kit.barrier(a, b, 1.05);
  }
  mural(-84, DH / 2, DZ0 - 0.01, 8, 3.6, PI, 5); mural(DX0 + 22, DH / 2, DZ1 + 0.01, 10, 3.6, 0, 1); mural(-93, DH / 2, DZ0 - 0.01, 5, 3.6, PI, 3);
  decal(-84, DH, -20, 5, 5, floorPaint('cream'), { cell: [0, 2] });

  // ── TRANSITION FIELD ──
  hipBox(-20, 6, 12, 0, 0, 4.2, 5.2, trans('coral'), { copingMat: steel('navy') });                          // the big spine (4.2 m)
  hipBox(-36, -26, 6, 5, 0.8, 3, 4.2, trans('blue'), { deckMat: deck('cream'), copingMat: steel('ochre') });  // the big hip box
  box(-36, 3, -26, 6, 0.4, 0.7, ledge('red'), { grind: 'x', edge: steel('charcoal') });
  quarter(82, -6, 26, PI / 2, trans('teal'), { R: 6, maxDeg: 88, deck: 3.5, copingMat: steel('red') });       // giant quarters on the east edge
  quarter(56, 22, 22, 0, trans('lilac'), { R: 5, maxDeg: 84, deck: 3, copingMat: steel('ochre') });          // and one facing south, by the megaramp run-out
  quarter(-50, -55, 24, PI, trans('ochre'), { R: 5.5, maxDeg: 86, deck: 3, copingMat: steel('teal') });      // a big one on the south edge, facing north
  // oversized kickers: a steep plywood kicker to a landing ramp, and a pair of kicker-to-kicker hips
  quarter(-6, -12, 4, PI / 2, KICK, { R: 6, maxDeg: 30, deck: 0, fence: false, coping: false, sideMat: ply('red') });
  box(6, 0, -12, 4, 1.5, 5, deck('charcoal')); wedge(14, -12, 5, 6, 1.5, -PI / 2, trans('charcoal'));
  // big roller bumps for pumping speed
  [['ochre', 2], ['teal', 12], ['coral', 22]].forEach(([c, x]) => hipBox(x, 18, 0, 3.5, 0, 0.8, 5, trans(c), { coping: false }));

  // ── STREET CORNER (south-east, dark slab): oversized ledges, rails, a manual pad and a gap ──
  box(60, 0, -36, 14, 0.6, 1, ledge('red'), { grind: 'x', edge: steel('cream') });
  box(60, 0, -46, 14, 0.4, 0.9, ledge('cream'), { grind: 'x', edge: steel('red') });
  rail(V(48, 0.5, -56), V(66, 0.5, -56), [[0.03, null], [0.33, null], [0.66, null], [0.97, null]], 0.035, MAT.railPaint.blue);
  box(80, 0, -40, 8, 0.25, 4, ledge('ochre'), { grind: 'x', edge: steel('charcoal') });
  const tier = 1.8; box(84, 0, -58, 24, tier, 12, deck('blue'));                                            // a raised block with a 9-stair and a rail
  const s9 = stairs(80, -52, 6, 9, tier / 9, 0.38, 1, MAT.parkLedge);
  rail(V(76.7, tier + 0.85, -52.3), V(76.7, 0.75, -52 + s9.run + 0.3), [[0.03, tier + 0.85], [0.97, 0.75]], 0.032, MAT.railPaint.red);
  wedge(90, -46, 6, 6, tier, PI, trans('charcoal'));
  rail(V(52, 0.38, -30), V(58, 0.38, -30), [[0.04, null], [0.96, null]], 0.03, MAT.railPaint.black);

  // ── EDGES: a low wall all round (the map edge is an invisible wall just inside it), floodlights, dressing ──
  for (const s of [-1, 1]) { box(0, 0, s > 0 ? Z1 + 0.5 : Z0 - 0.5, X1 - X0 + 2, 0.7, 1, ledge('cream')); box(s > 0 ? X1 + 0.5 : X0 - 0.5, 0, (Z0 + Z1) / 2, 1, 0.7, Z1 - Z0 + 2, ledge('cream')); }
  for (const s of [-1, 1]) { fence(V(X0, 0.7, s > 0 ? Z1 + 0.5 : Z0 - 0.5), V(X1, 0.7, s > 0 ? Z1 + 0.5 : Z0 - 0.5), 1.6); fence(V(s > 0 ? X1 + 0.5 : X0 - 0.5, 0.7, Z0), V(s > 0 ? X1 + 0.5 : X0 - 0.5, 0.7, Z1), 1.6); }
  for (const [x, z, r] of [[X0 + 2, Z0 + 2, PI / 4], [X1 - 2, Z0 + 2, -PI / 4], [X1 - 2, Z1 - 2, -3 * PI / 4], [-20, Z1 - 2, PI], [40, Z0 + 2, 0], [X1 - 2, 20, -PI / 2], [-40, -8, PI / 2]]) floodlight(x, 0, z, r);
  for (let x = -40; x <= 32; x += 24) lamp(x, 0, 26, 0);
  bleacher(30, 0, -18, 14, 0); bleacher(-6, 0, -58, 12, 0);
  for (const [x, z, r] of [[-50, 20, 0], [44, -20, PI / 2], [70, 8, PI]]) seat(x, 0, z, r);
  for (const [x, z] of [[-48, 21], [45, -22], [-30, 24]]) bin(x, 0, z);
  tag(-72, 2.6, DZ0 - 0.01, 1.4, PI, 2); tag(-60.02, 2.2, -10, 1.2, PI / 2, 6); tag(84, 0.9, -51.99, 1.3, 0, 4);
  for (const [x, z] of [[-30, -10], [10, -2], [50, -8], [-10, 30], [70, -50]]) decal(x, 0, z, 4, 3, MAT.stain, { ry: x, cell: [Math.abs(x) % 4, 2] });
  for (const [x, z, r] of [[-10, -6, 0.3], [40, 30, 1.2], [60, -42, 2], [-50, -40, 0.8]]) decal(x, 0, z, 3.4, 1.8, MAT.skid, { ry: r, tile: 3 });
  kit.weedLine(V(X0 + 0.6, 0, Z1 - 0.05), V(X1 - 0.6, 0, Z1 - 0.05), 120, 0.25); kit.weedLine(V(X0 + 0.6, 0, Z0 + 0.05), V(X1 - 0.6, 0, Z0 + 0.05), 120, 0.25);

  // ── GROUND DRESSING: what years of skating and weather do to a big concrete park (all scenery, painted on top of the pours) ──
  {
    const dmat = (o) => { const m = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.9, ...o }); m.userData.noShadow = true; return m; };
    const alpha = (w, h, draw) => { const t = cc(w, h, draw); t.colorSpace = THREE.NoColorSpace; return t; };
    // shade at the foot of the big structures: the ground under a 24 m tower and its scaffolding hardly sees the sky
    const T_SHADE = alpha(16, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#888'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const shade = dmat({ color: 0x050505, alphaMap: T_SHADE, opacity: 0.5 });
    // a strip along a wall from a to b (x or z aligned); the dark side is against the wall, `out` = which way the open ground is
    const shadeStrip = (cx, cz, len, wide, ry) => decal(cx, 0.001, cz, len, wide, shade, { ry });
    const sw = 3.4;
    for (const s of [-1, 1]) {
      shadeStrip((LIP + QX + qR + qDeck) / 2, MZ + s * (MW / 2 + sw / 2), QX + qR + qDeck - LIP, sw, s > 0 ? PI : 0);   // along both sides of the megaramp
      shadeStrip((TX0 + LIP) / 2, MZ + s * (MW / 2 + 2 + sw / 2), LIP - TX0, sw * 1.4, s > 0 ? PI : 0);              // round the tower
    }
    shadeStrip((DX0 + DX1) / 2, DZ0 - 1.6, DX1 - DX0, 3.2, 0);                                                    // the mid deck's south wall
    shadeStrip(DX1 + 1.6, (DZ0 + DZ1) / 2, DZ1 - DZ0, 3.2, -PI / 2);                                              // and its east wall
    // worn lines: where everyone rides, the concrete is polished and grey-black with rubber
    const T_PATH = alpha(64, 512, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const x = w / 2 + (Math.random() + Math.random() + Math.random() - 1.5) * w * 0.5, a = 0.05 + Math.random() * 0.18;
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.02 + i) * 2, y); g.stroke(); }
      const fade = g.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.15, 'rgba(0,0,0,0)'); fade.addColorStop(0.85, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = fade; g.fillRect(0, 0, w, h); });
    const path = dmat({ color: 0x1c1a18, alphaMap: T_PATH, opacity: 0.55, roughness: 0.55 });
    const wornLine = (x0, z0, x1, z1, wide = 2.4) => decal((x0 + x1) / 2, 0.002, (z0 + z1) / 2, wide, Math.hypot(x1 - x0, z1 - z0), path, { ry: Math.atan2(x1 - x0, z1 - z0) });
    wornLine(LX + landPts.end.x - 2, MZ, QX - 1, MZ, 6);                 // the megaramp run-out into the giant quarter
    wornLine(-56, -18, -20, -14, 3); wornLine(-20, -14, 12, -12, 3);     // the roll-in off the mid deck, across to the kickers
    wornLine(-30, 18, 30, 18, 3.5);                                      // the roller line
    wornLine(-72, -38, -60, -48, 2.6); wornLine(-60, -48, -30, -50, 2.6); // out of the 20-stair, round to the south quarter
    wornLine(46, -24, 76, -40, 2.4); wornLine(30, -2, 70, -6, 3);        // into the street corner; across to the east quarters
    wornLine(-34, -8, -20, 0, 2.2);
    // skid and slide marks where people stop, land and revert
    for (const [x, z, r] of [[-12, 40, 0.2], [0, 46, 1.4], [8, 38, 2.4], [-8, 24, 0.8], [26, 30, 2.2], [-52, -12, 0.4], [-44, -22, 1.8], [-24, -34, 2.6],
      [18, -6, 0.9], [62, -16, 2.0], [70, 0, 1.1], [-30, -48, 0.3], [-60, -44, 2.4], [52, -60, 1.0], [86, -32, 2.8], [-60, 0, 1.6], [12, 2, 2.9], [36, 10, 0.5]])
      decal(x, 0, z, 3.6, 2.2, MAT.skid, { ry: r, tile: 3 });
    // oil and old drink stains, darker damp ground round the drains (with a puddle where it pools)
    for (const [x, z, sz] of [[-44, 14, 3.2], [40, -12, 2.6], [70, 20, 3], [-6, -30, 2.4], [-52, -60, 3], [66, -60, 2.2], [-70, 22, 2.8]]) {
      decal(x, 0, z, 0.6, 0.6, MAT.grate); decal(x, 0, z, sz * 1.6, sz * 1.3, MAT.stain, { ry: x * 0.7, cell: [Math.abs(z) % 4, 2] });
      decal(x + 0.4, 0, z - 0.2, sz * 0.7, sz * 0.5, MAT.puddle, { ry: x });
    }
    for (const [x, z] of [[-14, -20], [24, -8], [56, 0], [-48, 28], [8, 30], [-70, 14], [78, 14], [-22, -46]]) decal(x, 0, z, 2.6, 2, MAT.stain, { ry: z, cell: [Math.abs(x) % 4, 2] });
    // painted concrete under the features (worn through by wheels), each with a cream border line
    const pad = (c, op) => dmat({ color: c, alphaMap: MAT.stripe('red').alphaMap, opacity: op, roughness: 0.62 });
    const border = dmat({ color: 0xd8d2c4, alphaMap: MAT.stripe('red').alphaMap, opacity: 0.6, roughness: 0.6 });
    const padArea = (x, z, w, d, c, op = 0.7) => {
      decal(x, 0.0005, z, w, d, pad(c, op), { tile: 3 });
      for (const s of [-1, 1]) { decal(x, 0.001, z + s * d / 2, w, 0.12, border, { tile: 1.3 }); decal(x + s * w / 2, 0.001, z, 0.12, d, border, { tile: 1.3 }); }
    };
    padArea(12, 18, 32, 10, '#2b4677', 0.55);        // the roller line
    padArea(4, -12, 28, 9, '#d8704a', 0.5);    // kicker to the landing box
    padArea(-36, -25, 16, 13, '#2fa6a0', 0.45);      // round the big hip
    decal(70, 0, -6, 9, 9, floorPaint('cream'), { cell: [3, 2] });   // a starburst in front of the east quarters
    // curbs, planters and grass islands round the edges, where nobody rides
    const curb = ledge('cream');
    const island = (x0, z0, x1, z1, trees) => {
      const h = 0.24, t = 0.3, gh = 0.2;
      box((x0 + x1) / 2, 0, z0 + t / 2, x1 - x0, h, t, curb, { grind: 'x' }); box((x0 + x1) / 2, 0, z1 - t / 2, x1 - x0, h, t, curb, { grind: 'x' });
      box(x0 + t / 2, 0, (z0 + z1) / 2, t, h, z1 - z0 - 2 * t, curb, { grind: 'z' }); box(x1 - t / 2, 0, (z0 + z1) / 2, t, h, z1 - z0 - 2 * t, curb, { grind: 'z' });
      box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0 - 2 * t, gh, z1 - z0 - 2 * t, MAT.hills());   // the same meadow as the hills
      for (const [tx, tz, sc] of trees) kit.tree(tx, gh, tz, sc);
      const n = Math.round((x1 - x0 + z1 - z0) * 1.6);
      kit.weedLine(V(x0 + t + 0.1, gh, z0 + t + 0.1), V(x1 - t - 0.1, gh, z0 + t + 0.1), n / 4, 0.3); kit.weedLine(V(x0 + t + 0.1, gh, z1 - t - 0.1), V(x1 - t - 0.1, gh, z1 - t - 0.1), n / 4, 0.3);
      kit.weedLine(V(x0 + t + 0.1, gh, z0 + t), V(x0 + t + 0.1, gh, z1 - t), n / 4, 0.3); kit.weedLine(V(x1 - t - 0.1, gh, z0 + t), V(x1 - t - 0.1, gh, z1 - t), n / 4, 0.3);
      for (let i = 0; i < n; i++) kit.weeds(x0 + 1 + rnd(i + x0) * (x1 - x0 - 2), gh, z0 + 1 + rnd(i * 3 + z0) * (z1 - z0 - 2), 0.8 + rnd(i + 5) * 0.8);
    };
    island(72, 38, 97, 58, [[78, 44, 1.5], [88, 50, 1.8], [93, 42, 1.3], [80, 54, 1.2]]);
    island(76, 18, 95, 32, [[82, 25, 1.4], [90, 27, 1.1]]);
    island(-98, -67, -84, -49, [[-92, -60, 1.6], [-88, -54, 1.2]]);
    island(-60, 53, -40, 60, [[-55, 57, 1.2], [-46, 56.5, 1.4]]);
    // raised planters with a tree (their top edges grind, like the skatepark's)
    for (const [x, z, w, d] of [[-34, 19, 3.2, 3.2], [48, 2, 2.6, 2.6], [-6, 54, 4, 2.4]]) { box(x, 0, z, w, 0.45, d, ledge('charcoal')); box(x, 0.45, z, w - 0.3, 0.02, d - 0.3, MAT.soil, off); kit.tree(x, 0.45, z, 1.1); }
  }

  // ── LIFTS: glowing pads at the foot of each level; stop on one (or walk onto it) and it takes you up ──
  const lifts = [];
  const liftMat = new THREE.MeshStandardMaterial({ color: 0x39d0ff, emissive: 0x1ab0ff, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }); liftMat.userData.noShadow = true;
  const liftPad = (x, z, to, fwd, label) => {
    const g = new THREE.RingGeometry(1.1, 1.4, 40); g.rotateX(-PI / 2); g.translate(x, 0.02, z); add(g, liftMat, false);
    const d = new THREE.CircleGeometry(1.1, 40); d.rotateX(-PI / 2); d.translate(x, 0.015, z); add(d, MAT.floorPaint('navy'), false);
    tube(V(x + 1.8, 0, z), V(x + 1.8, 3.2, z), 0.06, 0.06, frame, true, 8); box(x + 1.8, 3.2, z, 0.2, 1.2, 2.4, liftMat, off);
    lifts.push({ at: V(x, 0, z), r: 1.3, to: { pos: to, fwd }, label });
  };
  liftPad(-80, 30, V(-91, TOP, MZ), V(1, 0, 0), 'Megaramp tower');
  liftPad(-56, 12, V(-80, DH, -10), V(0, 0, -1), 'Mid deck');
  liftPad(QX - 6, MZ - 8, V(QX + qR + 2, qR, MZ), V(-1, 0, 0), 'Giant quarter deck');

  // ── THE LANDSCAPE: open hill country all round, mountains far off (scenery) ──
  // ground height outside the park: flat for a few metres past the wall, then rolling hills, then a ring of mountains
  const hillY = (x, z) => {
    const dx = Math.max(0, Math.abs(x) - (X1 + 6)), dz = Math.max(0, z < 0 ? Z0 - 6 - z : z - Z1 - 6), d = Math.hypot(dx, dz);
    const k = Math.min(1, d / 160), hills = (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013) * 0.5 + 0.5) * 22 + Math.sin(x * 0.031 + z * 0.023) * 5;
    const swell = Math.min(1, d / 30) * (Math.sin(x * 0.07 + 1.1) * Math.sin(z * 0.061 + 0.4) + 1) * 0.9;   // small swells, so the near meadow isn't a table
    const th = Math.atan2(z, x), mtn = Math.min(1, Math.max(0, Math.hypot(x, z) - 480) / 400), ridge = 0.55 + 0.3 * Math.sin(th * 5 + 0.5) + 0.15 * Math.sin(th * 13 + 2);
    return (d > 0 ? -0.08 : -0.15) + k * k * hills + swell + mtn * mtn * 110 * ridge;
  };
  {
    const S = 1800, n = 200, g = new THREE.PlaneGeometry(S, S, n, n); g.rotateX(-PI / 2);
    const P = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      const inBowl = x > -14 && x < 50 && z > -64 && z < -16;      // under the slab: sunk well down so it never shows through the bowl
      P.setY(i, inBowl ? -8 : hillY(x, z));
      uv.setXY(i, x / 4.5, z / 4.5);                                // one grass photo repeat = 4.5 m (MAT.hills breaks the repeat up)
    }
    g.computeVertexNormals();
    add(g, MAT.hills(), false);
  }
  // trees dotted over the near hills, a few in loose clumps
  for (let i = 0; i < 90; i++) {
    const a = rnd(i) * PI * 2, r = 125 + rnd(i + 99) * 110, x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.85;
    if (Math.abs(x) < X1 + 12 && z > Z0 - 12 && z < Z1 + 12) continue;
    const n = rnd(i + 31) < 0.3 ? 3 : 1;
    for (let j = 0; j < n; j++) { const tx = x + (j ? (rnd(i * 7 + j) - 0.5) * 12 : 0), tz = z + (j ? (rnd(i * 5 + j + 2) - 0.5) * 12 : 0); kit.tree(tx, hillY(tx, tz) - 0.2, tz, 1.4 + rnd(i + 7 + j) * 1.1); }
  }
  // the meadow just outside the wall: grass tufts thick near the wall and thinning out, and some half-buried rocks
  if (document.documentElement.dataset.quality !== 'low') {
    const ring = (i, near, far) => {      // a point outside the park, between near and far metres from the wall
      const side = rnd(i * 3 + 1), o = near + Math.pow(rnd(i * 3 + 2), 1.6) * (far - near), t = rnd(i * 3 + 3);
      if (side < 0.3) return [X0 - 1 + t * (X1 - X0 + 2), Z1 + 1.2 + o]; if (side < 0.6) return [X0 - 1 + t * (X1 - X0 + 2), Z0 - 1.2 - o];
      if (side < 0.8) return [X1 + 1.2 + o, Z0 - 1 + t * (Z1 - Z0 + 2)]; return [X0 - 1.2 - o, Z0 - 1 + t * (Z1 - Z0 + 2)];
    };
    for (let i = 0; i < 5000; i++) { const [x, z] = ring(i, 0, i < 3500 ? 14 : 45); kit.weeds(x, hillY(x, z), z, 1 + rnd(i + 0.5) * 1.5); }
    const rg = [], rock = new THREE.IcosahedronGeometry(1, 1), rp = rock.attributes.position;
    for (let i = 0; i < 46; i++) {
      const [x, z] = ring(i + 5000, 2, 70), sc = 0.35 + Math.pow(rnd(i + 77), 2) * 1.6, g = rock.clone(), q = g.attributes.position;
      for (let k = 0; k < q.count; k++) { const vx = rp.getX(k), vy = rp.getY(k), vz = rp.getZ(k), f = 0.75 + 0.5 * rnd(Math.floor((vx * 13 + vy * 7 + vz * 5) * 10) + i); q.setXYZ(k, vx * f * 1.3, vy * f * 0.7, vz * f); }
      g.rotateY(rnd(i + 3) * 6.28); g.scale(sc, sc, sc); g.translate(x, hillY(x, z) - sc * 0.25, z); g.deleteAttribute('uv'); rg.push(g.toNonIndexed());
    }
    const rm = new THREE.MeshStandardMaterial({ color: 0x6a655b, roughness: 0.95, flatShading: true });
    for (const g of rg) { g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); add(g, rm, false); }
  }

  // waving flags (their own small shader wave)
  const flagT = { value: 0 };
  for (const [x, y, z, c] of flags) {
    const g = new THREE.PlaneGeometry(4.2, 2.1, 16, 4), uv = g.attributes.uv, cu = (c % 2) / 2, cv = 1 - ((c >> 1) + 1) / 2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 2, cv + uv.getY(i) / 2);
    g.translate(2.1, -1.05, 0);
    const m = new THREE.MeshStandardMaterial({ map: BAN.map, side: THREE.DoubleSide, roughness: 0.8 });
    m.onBeforeCompile = (s) => { s.uniforms.uT = flagT; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat k = position.x / 4.2; transformed.z += sin(position.x * 1.7 - uT * 5.0 + position.y * 0.6) * 0.35 * k; transformed.y -= k * k * 0.25;'); };
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.rotation.y = z < MZ ? 0.35 : -0.35; mesh.onBeforeRender = () => { flagT.value = performance.now() / 1000; };
    mesh.castShadow = true; kit.extra(mesh);
  }

  return {
    spawn: { pos: V(-87.5, TOP, MZ), fwd: V(1, 0, 0) },
    bounds: { x0: X0 + 0.4, x1: X1 - 0.4, z0: Z0 + 0.4, z1: Z1 - 0.4 },
    feel: { maxSpeed: 30, wobbleSpeed: 26, airDrag: 0.0003 },   // tucked on a megaramp: far less drag than the street-park default
    drops: [
      { name: 'Megaramp tower', pos: V(-87.5, TOP, MZ), fwd: V(1, 0, 0) },
      { name: 'Mid deck', pos: V(-80, DH, -10), fwd: V(0, 0, -1) },
      { name: 'Giant quarter deck', pos: V(QX + qR + 2, qR, MZ), fwd: V(-1, 0, 0) },
      { name: 'Hip box', pos: V(-36, 3, -22.5), fwd: V(1, 0, 0) },
      { name: 'Bowl', pos: V(18, 0, -26), fwd: V(0, 0, -1) },
    ],
    lifts, soft: [soft],
    mega: { lip: KL, lipY: KY, landX: LX, landY: HL, quarterX: QX, quarterH: qR, z: MZ, top: TOP, rollIn: LIP },
  };
}
