// Collision for the props that dress the parks: benches, bins, bleachers, lamp posts, bollards,
// fences, trees, parked cars, buildings. Their pictures stay exactly as park.js draws them; this
// adds a simple invisible shape (a box or a post) for each one to the collision mesh, so riding,
// walking or bailing into them stops you or turns you, and their tops can be ridden.
// Benches, bleachers and tree planters also get grind lines along their edges, like ledges.
//
// How it hooks in (kept tiny so park.js stays about the look):
//   propColliders(kit)        once, right after buildPark makes its kit: wraps kit.tree, kit.quarter
//                             and kit.box, and adds kit.barrier(a, b, h) for a see-through railing
//   propsFor(kit, cityProps)  wraps the street furniture cityKit returns (lamp, bin, seat, cars, ...)
// kit.solid(geometry, thin) puts a shape in the collision mesh. thin = see-through or skinny (posts,
// trunks, chain-link): the camera looks past those instead of zooming in on them.
// If a prop changes size in park.js, change its numbers here to match.
import * as THREE from 'three';
import { STYLES, carStyle, carBoxes } from './cars.js';

const Y = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const local = (p, x, y, z, ry) => p.applyAxisAngle(Y, ry).add(V(x, y, z));
const POST = 0.12;          // thinnest post we collide with (radius, metres): the wall feelers sit 0.2 m apart

// box: centre (x, z) in the prop's own frame (ox, oz along its local axes), bottom y0, top y1
function boxAt(kit, x, y, z, ry, ox, oz, w, d, y0, y1, thin = false) {
  const g = new THREE.BoxGeometry(w, y1 - y0, d), c = local(V(ox, 0, oz), x, 0, z, ry);
  g.rotateY(ry); g.translate(c.x, y + (y0 + y1) / 2, c.z); kit.solid(g, thin);
}
function post(kit, x, y, z, r, h, thin = true) {
  const g = new THREE.CylinderGeometry(Math.max(r, POST), Math.max(r, POST), h, 10);
  g.translate(x, y + h / 2, z); kit.solid(g, thin);
}
// a grind line along an edge, in the prop's own frame
function edge(kit, x, y, z, ry, ax, az, bx, bz, h) {
  kit.seg(local(V(ax, h, az), x, y, z, ry), local(V(bx, h, bz), x, y, z, ry));
}
// a see-through barrier (railing, chain-link) from ground point a to b, h tall
function barrier(kit, a, b, h, t = 0.08) {
  const d = V().subVectors(b, a); d.y = 0; const len = d.length(); if (len < 1e-3) return;
  const g = new THREE.BoxGeometry(len, h, t); g.rotateY(-Math.atan2(d.z, d.x));
  g.translate((a.x + b.x) / 2, Math.min(a.y, b.y) + h / 2, (a.z + b.z) / 2); kit.solid(g, true);
}

export function propColliders(kit) {
  const { tree, quarter, box, add } = kit;
  let lastBox = null;
  // anything drawn through kit.add can be watched (propsFor uses it to find the buildings' bulk)
  kit.add = (g, ...r) => { if (kit.onAdd) kit.onAdd(g); return add(g, ...r); };
  kit.barrier = (a, b, h) => barrier(kit, a, b, h);
  kit.box = (x, y, z, w, h, d, mat, o = {}) => { lastBox = { x, y, z, w, h, d, ry: o.ry || 0, grind: o.grind, collide: o.collide !== false }; return box(x, y, z, w, h, d, mat, o); };
  // a tree: the trunk is a post. Planted in a raised box (a planter)? its top edges become grindable.
  kit.tree = (x, y, z, s = 1) => {
    const r = tree(x, y, z, s);
    post(kit, x, y, z, 0.17 * s, 2.4 * s);
    const b = lastBox;
    if (b && b.collide && y > 0.2 && Math.abs(b.y + b.h - y) < 0.02) {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.ry), sn = Math.sin(b.ry);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;          // the tree in the box's own frame
      if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) {
        const hw = b.w / 2, hd = b.d / 2;
        if (b.grind !== 'x') for (const s2 of [-1, 1]) edge(kit, b.x, b.y, b.z, b.ry, -hw + 0.05, s2 * hd, hw - 0.05, s2 * hd, b.h);
        if (b.grind !== 'z') for (const s2 of [-1, 1]) edge(kit, b.x, b.y, b.z, b.ry, s2 * hw, -hd + 0.05, s2 * hw, hd - 0.05, b.h);
      }
    }
    lastBox = null;
    return r;
  };
  // quarter pipes with a deck: the safety railing along the back of the deck is solid
  kit.quarter = (x, z, w, ry, mat, o = {}) => {
    const r = quarter(x, z, w, ry, mat, o);
    const R = o.R ?? 2.6, tm = (o.maxDeg ?? 78) * Math.PI / 180, deck = o.deck ?? 2.5, y0 = o.y0 ?? 0;
    if (o.fence !== false && deck > 0) {
      const H = R * (1 - Math.cos(tm)), z2 = R * Math.sin(tm) + deck - 0.06;
      barrier(kit, local(V(-w / 2, H, z2), x, y0, z, ry), local(V(w / 2, H, z2), x, y0, z, ry), 1.05);
    }
    return r;
  };
}

// The street furniture from cityKit, each with its collision shape. Sizes match cityKit in park.js.
export function propsFor(kit, P) {
  const wrap = (name, fn) => { const draw = P[name]; if (draw) P[name] = (...a) => { const r = draw(...a); fn(...a); return r; }; };
  wrap('lamp', (x, y, z) => post(kit, x, y, z, 0.15, 6.2));
  wrap('bin', (x, y, z) => post(kit, x, y, z, 0.31, 0.95));
  wrap('bollard', (x, y, z) => post(kit, x, y, z, 0.08, 0.95));
  wrap('hydrant', (x, y, z) => post(kit, x, y, z, 0.16, 0.65));
  wrap('signPost', (x, y, z, ry, sign, h = 3.1) => post(kit, x, y, z, 0.04, h));
  wrap('floodlight', (x, y, z) => { post(kit, x, y, z, 0.32, 0.35); post(kit, x, y, z, 0.2, 11); });
  wrap('bikeRack', (x, y, z, ry = 0) => { for (let i = -1; i <= 1; i++) boxAt(kit, x, y, z, ry, i * 0.8, 0, 0.1, 0.9, 0, 0.84, true); });
  // a bench: solid seat you can ride onto and grind along the front, a back you bump into
  wrap('seat', (x, y, z, ry = 0) => {
    boxAt(kit, x, y, z, ry, 0, 0, 1.9, 0.46, 0, 0.455);
    boxAt(kit, x, y, z, ry, 0, -0.29, 1.9, 0.08, 0.455, 0.92);
    edge(kit, x, y, z, ry, -0.93, 0.23, 0.93, 0.23, 0.455);
  });
  wrap('shelter', (x, y, z, ry) => {
    for (const [sx, sz] of [[-1.9, -0.6], [1.9, -0.6], [-1.9, 0.6], [1.9, 0.6]]) { const p = local(V(sx, 0, sz), x, 0, z, ry); post(kit, p.x, y, p.z, 0.04, 2.5); }
    boxAt(kit, x, y, z, ry, 0, 0, 4.2, 1.7, 2.5, 2.58);
    boxAt(kit, x, y, z, ry, 0, -0.6, 3.8, 0.06, 0.35, 2.25, true);
    boxAt(kit, x, y, z, ry, 0, -0.3, 3, 0.35, 0, 0.47);
    edge(kit, x, y, z, ry, -1.45, -0.125, 1.45, -0.125, 0.47);
  });
  // bleachers: three solid steps; the front of each plank is a grindable edge
  wrap('bleacher', (x, y, z, len, ry) => {
    for (let k = 0; k < 3; k++) {
      const top = 0.47 + k * 0.42, front = -k * 0.7 + 0.16;
      boxAt(kit, x, y, z, ry, 0, front - 0.35, len, 0.7, 0, top);
      edge(kit, x, y, z, ry, -len / 2 + 0.05, front, len / 2 - 0.05, front, top);
    }
  });
  wrap('fence', (a, b, h = 2.1) => barrier(kit, a, b, h + 0.05));
  // parked cars: the body and the cabin as two boxes per car (you can land on the bonnet and the roof).
  // Sizes come from cars.js (the same table that draws them), so the two never drift apart.
  const carB = STYLES.map(carBoxes);
  wrap('cars', (list) => { for (const [x, y, z, ry] of list) for (const [ox, l, w, y0, y1] of carB[carStyle(x, z)]) boxAt(kit, x, y, z, ry, ox, 0, l, w, y0, y1); });
  // buildings: the glass core of each near building becomes a solid block (caught as row() draws it)
  if (P.row) {
    const row = P.row, bb = new THREE.Box3();
    P.row = (...a) => {
      const blocks = [];
      kit.onAdd = (g) => { g.computeBoundingBox(); bb.copy(g.boundingBox); if (bb.max.y - bb.min.y > 4 && (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z) > 20 && bb.min.y < 0.5) blocks.push(bb.clone()); };
      try { return row(...a); } finally {
        kit.onAdd = null;
        for (const k of blocks) {
          const c = k.getCenter(V()), s = k.getSize(V());
          if (Math.hypot(c.x, c.z) > 140) continue;          // far skyline: nobody gets there
          const g = new THREE.BoxGeometry(s.x, s.y, s.z); g.translate(c.x, c.y, c.z); kit.solid(g, false);
        }
      }
    };
  }
  return P;
}
