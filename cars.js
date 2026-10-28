// Parked cars, built in code: four original body styles (saloon, hatchback, SUV, pickup with a
// tonneau cover), each a smooth lofted body with real wheel arches, a glasshouse with painted
// pillars, door shut lines, lamps, number plates, mirrors, tyres and five-spoke rims.
// One InstancedMesh per style and material, so ~150 cars cost ~20 draw calls.
//
// Prior art (surveyed 2026-10-15): no realistic CC0 car fits the brief. Poly Haven has no vehicles;
// Quaternius and Kenney cars are stylised/toy-like; the Khronos glTF ToyCar is literally a toy; the
// realistic sedans on Sketchfab/CGTrader/RenderHub are paid or CC-BY/branded. So the body is lofted
// here the way procedural-vehicle generators do it (a superellipse cross-section swept along
// side-profile and plan curves, as in Blender's "lofted car" workflow and Houdini vehicle rigs).
//
// STYLES is the one source of car sizes: colliders.js reads collide boxes from here, and both
// sides pick a car's style with carStyle(x, z), so the picture and the collision always agree.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
// Catmull-Rom through [x, y] points sorted by x
function curve(pts) {
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    const n = pts.length - 1; if (x >= pts[n][0]) return pts[n][1];
    let i = 0; while (pts[i + 1][0] < x) i++;
    const p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(n, i + 2)][1];
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
}

// The styles. x runs rear (-L/2) to front (+L/2), y up from the ground, z across.
// top/sill/hw: side-profile hood-and-deck line, sill line (before arches), plan half-width.
// gh: the glasshouse — ws = windscreen base & top, rr = rear-glass top & base, roof height, inset of the roof sides.
// pillars: x ranges of the side windows painted over (C/D pillars), bpill: B-pillar centre.
// doors: x of door shut lines. axles: wheel centres. R: tyre radius.
export const STYLES = [
  { name: 'saloon', L: 4.75, W: 1.83, R: 0.33, axles: [1.42, -1.38], weight: 0.34,
    top: [[-2.375, 0.84], [-2.25, 0.95], [-1.9, 1.0], [-1.2, 1.0], [0.9, 0.96], [1.6, 0.88], [2.15, 0.79], [2.375, 0.68]],
    sill: [[-2.375, 0.44], [-2.15, 0.27], [-1.8, 0.23], [1.9, 0.23], [2.2, 0.27], [2.375, 0.36]],
    hw: [[-2.375, 0.78], [-2.2, 0.88], [-1.8, 0.915], [1.8, 0.915], [2.2, 0.875], [2.375, 0.76]],
    gh: { ws: [0.98, -0.02], rr: [-1.05, -1.78], roof: 1.45, inset: 0.17 }, pillars: [[-1.9, -1.08]], bpill: -0.42, doors: [0.86, -0.42, -1.2] },
  { name: 'hatch', L: 4.15, W: 1.77, R: 0.32, axles: [1.27, -1.33], weight: 0.22,
    top: [[-2.075, 0.9], [-1.98, 1.0], [-1.85, 1.02], [0.8, 0.95], [1.4, 0.86], [1.9, 0.77], [2.075, 0.67]],
    sill: [[-2.075, 0.42], [-1.85, 0.26], [-1.6, 0.23], [1.6, 0.23], [1.9, 0.27], [2.075, 0.36]],
    hw: [[-2.075, 0.8], [-1.9, 0.87], [-1.6, 0.885], [1.6, 0.885], [1.9, 0.85], [2.075, 0.74]],
    gh: { ws: [0.82, -0.1], rr: [-1.62, -1.97], roof: 1.48, inset: 0.16 }, pillars: [[-2.0, -1.38]], bpill: -0.5, doors: [0.72, -0.5, -1.3] },
  { name: 'suv', L: 4.65, W: 1.9, R: 0.37, axles: [1.38, -1.42], weight: 0.29, clad: true,
    top: [[-2.325, 1.0], [-2.24, 1.1], [-2.0, 1.13], [0.95, 1.1], [1.6, 1.03], [2.1, 0.95], [2.325, 0.84]],
    sill: [[-2.325, 0.52], [-2.1, 0.38], [-1.85, 0.36], [1.85, 0.36], [2.15, 0.4], [2.325, 0.5]],
    hw: [[-2.325, 0.83], [-2.15, 0.93], [-1.8, 0.95], [1.8, 0.95], [2.15, 0.92], [2.325, 0.8]],
    gh: { ws: [1.0, 0.08], rr: [-1.96, -2.2], roof: 1.72, inset: 0.15 }, pillars: [[-2.3, -1.88]], bpill: -0.38, doors: [0.92, -0.38, -1.42] },
  { name: 'pickup', L: 5.3, W: 1.95, R: 0.39, axles: [1.75, -1.6], weight: 0.15, clad: true, bed: -0.82,
    top: [[-2.65, 1.12], [-2.6, 1.17], [-0.9, 1.18], [1.15, 1.16], [1.8, 1.12], [2.4, 1.04], [2.65, 0.9]],
    sill: [[-2.65, 0.6], [-2.5, 0.48], [-2.2, 0.45], [2.1, 0.45], [2.45, 0.48], [2.65, 0.56]],
    hw: [[-2.65, 0.92], [-2.5, 0.97], [-2.2, 0.975], [2.2, 0.975], [2.45, 0.95], [2.65, 0.84]],
    gh: { ws: [1.2, 0.38], rr: [-0.66, -0.76], roof: 1.86, inset: 0.15 }, pillars: [], bpill: -0.18, doors: [1.1, -0.18, -0.74] },
];

// which style sits at (x, z): a hash, so park.js and colliders.js agree without passing anything
export function carStyle(x, z) {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, r = v - Math.floor(v);
  let acc = 0; for (let i = 0; i < STYLES.length; i++) { acc += STYLES[i].weight; if (r < acc) return i; }
  return 0;
}
// collision boxes in the car's own frame: [centre x, length, width, bottom, top]
export function carBoxes(s) {
  const belt = curve(s.top)(0) - 0.03, [wb, wt] = s.gh.ws, [rt, rb] = s.gh.rr;
  const c0 = (rt + rb) / 2, c1 = (wb + wt) / 2;          // the cabin box runs from mid rear glass to mid windscreen
  return [[0, s.L, s.W, 0, belt], [(c0 + c1) / 2, c1 - c0, s.W - 2 * s.gh.inset, belt, s.gh.roof]];
}

// ── geometry ──
// a triangle soup bucket: positions + normals (+ optional colours)
class Bucket {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, na, nb, nc, col) {
    // keep the winding facing the way the normals point
    const e1 = new THREE.Vector3().subVectors(b, a), e2 = new THREE.Vector3().subVectors(c, a), fn = e1.cross(e2);
    if (fn.dot(new THREE.Vector3().add(na).add(nb).add(nc)) < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; }
    for (const v of [a, b, c]) this.p.push(v.x, v.y, v.z);
    for (const v of [na, nb, nc]) this.n.push(v.x, v.y, v.z);
    if (col) for (let k = 0; k < 3; k++) this.c.push(col[0], col[1], col[2]);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}
// a grid of points P[i][j] (i along the car, j round the section) into buckets, with smooth normals.
// pick(i, j) -> bucket for the quad (i..i+1, j..j+1); closed = the section loops.
function gridToBuckets(P, closed, pick, centre) {
  const ni = P.length, nj = P[0].length, N = P.map(() => []);
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const ip = P[Math.min(ni - 1, i + 1)][j], im = P[Math.max(0, i - 1)][j];
    const jp = P[i][closed ? (j + 1) % nj : Math.min(nj - 1, j + 1)], jm = P[i][closed ? (j - 1 + nj) % nj : Math.max(0, j - 1)];
    const n = new THREE.Vector3().subVectors(ip, im).cross(new THREE.Vector3().subVectors(jp, jm));
    if (n.lengthSq() < 1e-12) n.set(Math.sign(P[i][j].x) || 1, 0, 0);
    n.normalize();
    if (n.dot(new THREE.Vector3().subVectors(P[i][j], centre(i))) < 0) n.negate();
    N[i][j] = n;
  }
  for (let i = 0; i < ni - 1; i++) for (let j = 0; j < (closed ? nj : nj - 1); j++) {
    const b = pick(i, j); if (!b) continue;
    const j2 = (j + 1) % nj, a = P[i][j], c = P[i + 1][j], d = P[i + 1][j2], e = P[i][j2];
    b.tri(a, c, d, N[i][j], N[i + 1][j], N[i + 1][j2]); b.tri(a, d, e, N[i][j], N[i + 1][j2], N[i][j2]);
  }
}
const sgnPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

function buildStyle(s) {
  const h = s.L / 2, top = curve(s.top), sill = curve(s.sill), hwC = curve(s.hw), rA = s.R + 0.075, axY = s.R;
  const B = { paint: new Bucket(), glass: new Bucket(), trim: new Bucket(), rim: new Bucket(), lamp: new Bucket() };
  // the lower body's section at x: bottom (sill or arch), top, half-width
  const arch = (x) => { let y = -1; for (const a of s.axles) { const d = x - a; if (Math.abs(d) < rA) y = Math.max(y, axY + Math.sqrt(rA * rA - d * d) * 1.02); } return y; };
  const flare = (x) => { let f = 0; for (const a of s.axles) { const d = Math.abs(x - a) / (rA + 0.15); if (d < 1) f = Math.max(f, 0.018 * (1 - d * d)); } return f; };
  const sect = (x) => ({ yb: Math.max(sill(x), arch(x)), yt: top(x), hw: hwC(x) + flare(x) });
  const M = 40;
  function ring(x) {
    const { yb, yt, hw } = sect(x), mid = (yb + yt) / 2, hh = (yt - yb) / 2;
    const d = h - Math.abs(x), er = 0.11, sc = d < er ? Math.sqrt(Math.max(0, 1 - (1 - d / er) ** 2)) : 1;
    const out = [];
    for (let j = 0; j < M; j++) {
      const th = (j / M) * 2 * PI, c = Math.cos(th), sn = Math.sin(th);
      const yn = sn > 0 ? sgnPow(sn, 2 / 5) : sgnPow(sn, 2 / 9);
      const taper = 1 - 0.075 * Math.max(0, yn) ** 2 - 0.05 * Math.max(0, -yn) ** 4;
      out.push(new THREE.Vector3(x, mid + hh * yn * sc, hw * sgnPow(c, 2 / 8) * taper * sc));
    }
    out.yn = (j) => { const sn = Math.sin((j + 0.5) / M * 2 * PI); return sn > 0 ? sgnPow(sn, 2 / 5) : sgnPow(sn, 2 / 9); };
    return out;
  }
  // stations: dense round the arches and the ends
  const xs = [];
  for (let x = -h; x < h;) { xs.push(x); const nearA = s.axles.some((a) => Math.abs(x - a) < rA + 0.06), nearE = h - Math.abs(x) < 0.16;
    x += nearE ? 0.022 : nearA ? 0.03 : 0.09; }
  xs.push(h);
  const P = xs.map(ring), yn = P[0].yn;
  gridToBuckets(P, true, (i, j) => {
    const y = yn(j), x = (xs[i] + xs[i + 1]) / 2, py = (P[i][j].y + P[i + 1][(j + 1) % M].y) / 2;
    if (y < -0.75) return B.trim;                                   // underbody
    if (s.clad && (py < sill(x) + 0.13 || py < sect(x).yb + 0.07)) return B.trim;   // SUV/pickup: black sill and arch mouldings
    if (s.bed != null && x < s.bed && y > 0.86) return B.trim;      // pickup: tonneau cover over the bed
    return B.paint;
  }, (i) => { const { yb, yt } = sect(xs[i]); return new THREE.Vector3(xs[i], (yb + yt) / 2, 0); });
  // shut lines: a thin dark strip just proud of the side, from sill to belt, at each door edge (and the bed on a pickup)
  const shut = (x, lo, hi) => {
    const r = ring(x), r2 = ring(x + 0.008);
    for (let j = 0; j < M; j++) { const y = yn(j); if (y < lo || y > hi) continue;
      for (const [A, Bq] of [[r, r2]]) { const j2 = (j + 1) % M, nA = new THREE.Vector3(0, A[j].y - (A[j].y + A[j2].y) / 2, A[j].z).normalize();
        const o = (v) => v.clone().addScaledVector(nA, 0.0025);
        B.trim.tri(o(A[j]), o(Bq[j]), o(Bq[j2]), nA, nA, nA); B.trim.tri(o(A[j]), o(Bq[j2]), o(A[j2]), nA, nA, nA); } }
  };
  for (const x of s.doors) shut(x, s.clad ? -0.25 : -0.7, 0.8);
  if (s.bed != null) shut(s.bed, -0.25, 0.95);

  // the glasshouse
  const g = s.gh, belt = (x) => top(x) - 0.025;
  const ghTop = (x) => {
    const [wb, wt] = g.ws, [rt, rb] = g.rr;
    if (x >= wt) { const t = (wb - x) / (wb - wt); return belt(x) + (g.roof - 0.02 - belt(x)) * (1 - (1 - Math.max(0, t)) ** 1.5); }
    if (x <= rt) { const t = (x - rb) / (rt - rb); return belt(x) + (g.roof - 0.02 - belt(x)) * (1 - (1 - Math.max(0, t)) ** 1.25); }
    const t = (x - rt) / (wt - rt); return g.roof - 0.02 + 0.02 * Math.sin(t * PI);
  };
  const gx = []; for (let x = g.rr[1]; x < g.ws[0]; x += 0.04) gx.push(x); gx.push(g.ws[0]);
  const tags = [];
  const GP = gx.map((x) => {
    const yb = belt(x), yt = Math.max(yb + 0.002, ghTop(x)), H = yt - yb;
    const hwB = hwC(x) - 0.06, hwT = hwB - g.inset * Math.min(1, H / (g.roof - belt(x) || 1)), rc = Math.min(0.09, H * 0.45);
    const pts = []; tags.length = 0;
    const side = (sgn, rev) => { const a = [];
      for (let k = 0; k <= 3; k++) { const t = k / 3, y = yb + (H - rc) * t; a.push([sgn * (hwB + (hwT - hwB) * (y - yb) / Math.max(H, 1e-3)), y, k === 0 ? 'seal' : 'side']); }
      return rev ? a.reverse() : a; };
    const corner = (sgn) => { const a = []; for (let k = 1; k <= 4; k++) { const t = k / 4 * PI / 2, zc = sgn * (hwT - rc * 0.5);
      a.push([zc + sgn * rc * 0.5 * Math.cos(t), yt - rc + rc * Math.sin(t), 'rail']); } return sgn > 0 ? a.reverse() : a; };
    for (const p of side(-1)) pts.push(p);
    for (const p of corner(-1)) pts.push(p);
    for (let k = 1; k < 8; k++) { const z = -hwT + rc * 0.5 + (2 * hwT - rc) * k / 8; pts.push([z, yt + 0.025 * (1 - (z / hwT) ** 2) * Math.min(1, H / 0.3), 'roof']); }
    for (const p of corner(1)) pts.push(p);
    for (const p of side(1, true)) pts.push(p);
    for (const p of pts) tags.push(p[2]);
    return pts.map(([z, y]) => new THREE.Vector3(x, y, z));
  });
  const T = tags.slice();
  gridToBuckets(GP, false, (i, j) => {
    const x = (gx[i] + gx[i + 1]) / 2, a = T[j], b = T[j + 1];
    const isSide = (a === 'side' || a === 'seal') && (b === 'side' || b === 'seal');
    if (a === 'seal' || b === 'seal') return isSide ? B.trim : B.paint;            // the rubber seal along the belt
    if (a === 'rail' || b === 'rail') return B.paint;                               // A-pillars and roof rails
    if (isSide) {
      if (Math.abs(x - s.bpill) < 0.06) return B.trim;                              // B-pillar
      if (s.pillars.some(([p0, p1]) => x > p0 && x < p1)) return B.paint;           // C/D pillar
      if (x > g.ws[0] - 0.12 || x < g.rr[1] + 0.06) return B.paint;
      return B.glass;
    }
    return x < g.ws[1] - 0.02 && x > g.rr[0] + 0.02 ? B.paint : B.glass;            // roof, or the screens
  }, (i) => new THREE.Vector3(gx[i], belt(gx[i]) - 0.3, 0));

  // the nose and tail: find where the body surface is at height y, side z, scanning in from the end
  const inside = (x, y, z) => { const { yb, yt, hw } = sect(x); return y > yb + 0.02 && y < yt - 0.02 && Math.abs(z) < hw * 0.97; };
  const endAt = (y, z, dir) => { for (let x = dir * h; Math.abs(x) > 0.5; x -= dir * 0.01) if (inside(x, y, z)) return x; return dir * (h - 0.1); };
  const boxOn = (bucket, dir, y, z, w, ht, depth, yaw, col) => {
    const x = endAt(y, z, dir), b = new THREE.BoxGeometry(depth, ht, w).toNonIndexed();
    b.rotateY(yaw); b.translate(x - dir * depth * 0.25, y, z);
    const p = b.attributes.position, n = b.attributes.normal, v = (k, A) => new THREE.Vector3(A.getX(k), A.getY(k), A.getZ(k));
    for (let k = 0; k < p.count; k += 3) bucket.tri(v(k, p), v(k + 1, p), v(k + 2, p), v(k, n), v(k + 1, n), v(k + 2, n), col);
  };
  const yH = top(h - 0.25) - 0.1, yT = top(-h + 0.2) - 0.12;
  const HEAD = [0.85, 0.87, 0.9], TAIL = [0.5, 0.012, 0.01], AMBER = [0.9, 0.38, 0.02], PLATE = [0.82, 0.83, 0.8], REV = [0.75, 0.75, 0.75];
  for (const sg of [-1, 1]) {
    const zh = sg * (hwC(h - 0.2) - 0.24);
    boxOn(B.lamp, 1, yH, zh, 0.34, 0.1, 0.16, sg * 0.18, HEAD);                     // headlamps
    boxOn(B.lamp, 1, yH - 0.09, sg * (hwC(h - 0.2) - 0.12), 0.12, 0.035, 0.12, sg * 0.3, AMBER);
    const zt = sg * (hwC(-h + 0.2) - 0.22);
    boxOn(B.lamp, -1, yT, zt, 0.36, 0.13, 0.14, -sg * 0.15, TAIL);                 // tail lamps
    boxOn(B.lamp, -1, yT - 0.08, zt, 0.12, 0.03, 0.13, -sg * 0.15, REV);
  }
  const yG = (yH + sill(h - 0.1)) / 2 + 0.03;
  boxOn(B.trim, 1, yG, 0, s.W * 0.4, Math.min(0.2, yH - yG + 0.02), 0.08, 0, null);   // grille
  boxOn(B.lamp, 1, Math.max(sill(h - 0.1) + 0.16, yG - 0.17), 0, 0.52, 0.11, 0.05, 0, PLATE);                     // number plates
  boxOn(B.lamp, -1, yT - 0.2, 0, 0.52, 0.11, 0.05, 0, PLATE);
  boxOn(B.trim, 1, sill(h - 0.1) + 0.06, 0, s.W * 0.55, 0.06, 0.06, 0, null);   // lower intake
  // door mirrors and handles
  const add = (bucket, geo, col) => { const b = geo.toNonIndexed(), p = b.attributes.position, n = b.attributes.normal, v = (k, A) => new THREE.Vector3(A.getX(k), A.getY(k), A.getZ(k));
    for (let k = 0; k < p.count; k += 3) bucket.tri(v(k, p), v(k + 1, p), v(k + 2, p), v(k, n), v(k + 1, n), v(k + 2, n), col); };
  for (const sg of [-1, 1]) {
    const mx = g.ws[0] - 0.2, mz = sg * (hwC(mx) - 0.02);
    add(B.trim, new THREE.BoxGeometry(0.06, 0.05, 0.1).translate(mx, belt(mx) + 0.06, mz + sg * 0.05));
    add(B.paint, new THREE.BoxGeometry(0.1, 0.12, 0.2).translate(mx - 0.02, belt(mx) + 0.12, mz + sg * 0.14));
    add(B.glass, new THREE.PlaneGeometry(0.17, 0.09).rotateY(-PI / 2).translate(mx - 0.073, belt(mx) + 0.12, mz + sg * 0.14));
    for (const dx of [s.doors[0] - 0.22, s.doors[1] - 0.22]) { const hz = sg * (hwC(dx) - 0.035);
      add(B.trim, new THREE.BoxGeometry(0.2, 0.035, 0.03).translate(dx, top(dx) - 0.14, hz)); }
  }
  // wheels: tyre (lathed), dark wheel well liner, five-spoke rim
  const tw = s.R * 0.66, rimR = s.R * 0.66;
  const prof = [[rimR, -tw / 2 + 0.01], [s.R - 0.045, -tw / 2], [s.R - 0.012, -tw / 2 + 0.02], [s.R, -tw / 2 + 0.05], [s.R, tw / 2 - 0.05], [s.R - 0.012, tw / 2 - 0.02], [s.R - 0.045, tw / 2], [rimR, tw / 2 - 0.01]];
  const tyreG = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28); tyreG.rotateX(PI / 2);
  const spokes = [];
  spokes.push(new THREE.TorusGeometry(rimR - 0.012, 0.016, 6, 28));                                  // rim lip
  spokes.push(new THREE.CylinderGeometry(rimR * 0.26, rimR * 0.3, 0.05, 14).rotateX(PI / 2));         // hub
  for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(0.05, rimR * 0.78, 0.035); sp.translate(0, rimR * 0.5, -0.005); sp.rotateZ(k * 2 * PI / 5); spokes.push(sp); }
  const rimG = mergeGeometries(spokes.map((q) => q.index ? q.toNonIndexed() : q)); rimG.translate(0, 0, tw / 2 - 0.03);
  const dishG = new THREE.CircleGeometry(rimR - 0.01, 24).translate(0, 0, tw / 2 - 0.07);          // the dark barrel behind the spokes
  const linerG = new THREE.CylinderGeometry(rA - 0.01, rA - 0.01, 1, 20, 1, true, PI / 2, PI).rotateX(PI / 2);
  for (const a of s.axles) {
    for (const sg of [-1, 1]) {
      const z = sg * (hwC(a) - tw / 2 - 0.035), m = new THREE.Matrix4().makeTranslation(a, axY, z);
      if (sg < 0) m.multiply(new THREE.Matrix4().makeRotationY(PI));
      add(B.trim, tyreG.clone().applyMatrix4(m)); add(B.rim, rimG.clone().applyMatrix4(m)); add(B.trim, dishG.clone().applyMatrix4(m));
    }
    const l = linerG.clone(); l.scale(1, 1, 2 * hwC(a) - 0.08); l.translate(a, axY, 0);
    const p = l.attributes.position; for (let k = 0; k < p.count; k++) { if (p.getY(k) < axY) p.setY(k, axY); }
    l.computeVertexNormals(); for (const v of [l.attributes.normal]) for (let k = 0; k < v.count; k++) v.setXYZ(k, -v.getX(k), -v.getY(k), -v.getZ(k));
    const li = l.toNonIndexed(), lp = li.attributes.position, ln = li.attributes.normal, vv = (k, A) => new THREE.Vector3(A.getX(k), A.getY(k), A.getZ(k));
    for (let k = 0; k < lp.count; k += 3) B.trim.tri(vv(k, lp), vv(k + 1, lp), vv(k + 2, lp), vv(k, ln), vv(k + 1, ln), vv(k + 2, ln));
  }
  return { paint: B.paint.geo(), glass: B.glass.geo(), trim: B.trim.geo(), rim: B.rim.geo(), lamp: B.lamp.geo() };
}

// realistic paint mix: mostly white, black, greys and silver, some blues and reds, a few others
const PAINTS = [[0xe4e5e3, 0.15], [0x0d0e10, 0.17], [0x55595e, 0.14], [0x8f9398, 0.11], [0x1d2d4f, 0.08], [0x7e1514, 0.07],
  [0x2c3136, 0.07], [0x36597e, 0.05], [0x283a2f, 0.04], [0xb7a88c, 0.04], [0x6a1b2a, 0.02], [0xc0561d, 0.015], [0x8a6a3b, 0.015]];
function paintFor(r) { let a = 0; for (const [c, w] of PAINTS) { a += w; if (r < a) return c; } return PAINTS[0][0]; }

let shadowTex = null;
function blobTex() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 128, 64); x.filter = 'blur(7px)'; x.fillStyle = '#fff';
  x.beginPath(); x.roundRect(16, 14, 96, 36, 14); x.fill();
  shadowTex = new THREE.CanvasTexture(c); return shadowTex;
}

// list = [[x, y, z, ry], ...]; rnd = the park's seeded random (one draw per car, for the paint)
export function buildCars(list, rnd) {
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x07090b, metalness: 0, roughness: 0.03, ior: 2.0, envMapIntensity: 1.6 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.82, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb4b8bd, roughness: 0.28, metalness: 1 }),
    lamp: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15 }),
  };
  const groups = STYLES.map(() => []);
  list.forEach((c) => groups[carStyle(c[0], c[2])].push([c, paintFor(rnd())]));
  const out = [], M4 = new THREE.Matrix4(), col = new THREE.Color();
  STYLES.forEach((s, si) => {
    const G = groups[si]; if (!G.length) return;
    const geo = buildStyle(s);
    for (const k of Object.keys(geo)) {
      if (!geo[k].attributes.position.count) continue;
      const im = new THREE.InstancedMesh(geo[k], mats[k], G.length);
      G.forEach(([[x, y, z, ry], paint], i) => { im.setMatrixAt(i, M4.makeRotationY(ry).setPosition(x, y, z)); if (k === 'paint') im.setColorAt(i, col.setHex(paint)); });
      im.computeBoundingSphere(); out.push(im);
    }
  });
  // soft contact shadow under every car (the sun's shadow map is too coarse to darken the tyres' footprint)
  const blobM = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex(), transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  blobM.userData.noShadow = true;
  const blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), blobM, list.length);
  list.forEach(([x, y, z, ry], i) => { const s = STYLES[carStyle(x, z)]; blob.setMatrixAt(i, M4.makeRotationY(ry).scale(new THREE.Vector3(s.L * 1.2, 1, s.W * 1.45)).setPosition(x, y + 0.01, z)); });
  out.push(blob);
  return out;
}
