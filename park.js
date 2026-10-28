// The skatepark. Everything is built from a few helpers (box, wedge,
// quarter, rail) so new obstacles are one line each — see layout() below.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { skatepark } from './skatepark.js';
import { megapark } from './megapark.js';
import { propColliders, propsFor } from './colliders.js';
import { buildCars } from './cars.js';
import { TWEAKS } from './tweaks.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const TILE = 2; // one texture repeat = 2 meters

// Seeded random so the park is the same every load.
let seed = 1337;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ── Textures. The big surfaces use photo-scanned CC0 sets from Poly Haven
//    (see assets/CREDITS.md); small things like signs and stains are painted here. ──
const loader = new THREE.TextureLoader();
let cs = 4242;                                   // separate seeded random for painted textures
const cr = () => { cs = (cs * 1664525 + 1013904223) >>> 0; return cs / 4294967296; };
function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; return t;
}
// photo texture set: colour + bumps + roughness. size = metres covered by one repeat.
function pbr(name, size, o = {}) {
  const get = (suf, srgb) => {
    const t = loader.load(`./assets/tex/${name}_${suf}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(TILE / size, TILE / size); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const arm = get('arm', false);
  const m = new THREE.MeshStandardMaterial({ map: get('diff', true), normalMap: get('nor', false), roughnessMap: arm, aoMap: arm, roughness: 1, metalness: 0, ...o });
  if (o.metalness) m.metalnessMap = arm;
  return m;
}
// soft blotchy noise, used to stop big surfaces looking like wallpaper
const T_NOISE = canvasTex(256, 256, (g, s) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const x = cr() * s, y = cr() * s, r = 6 + cr() * cr() * 60, d = cr() > 0.5 ? 255 : 0, a = 0.04 + cr() * 0.07;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${d},${d},${cr() > 0.5 ? 255 : 0},${a})`); gr.addColorStop(1, `rgba(${d},${d},${d},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}, { srgb: false, repeat: true });
// black wheel and skid marks: long thin arcs of rubber, a few heavy, most faint
const T_SKID = canvasTex(512, 512, (g, s) => {
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = cr() * s, y = cr() * s, r = 90 + cr() * 300, a0 = cr() * 6.28, sw = 0.15 + cr() * 0.5, heavy = cr() < 0.15;
    g.strokeStyle = `rgba(0,0,0,${heavy ? 0.35 + cr() * 0.3 : 0.08 + cr() * 0.16})`; g.lineWidth = heavy ? 2 + cr() * 3 : 1 + cr() * 2;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { g.beginPath(); g.arc(x + ox, y + oy, r, a0, a0 + sw); g.stroke(); }
  }
}, { srgb: false, repeat: true });
// Break up tiling with large-scale light/dark patches, and paint in the wear a real park has.
//   joint  = saw-cut slab size (m): thin dark expansion joints, each slab a slightly different shade
//   trowel = swirly burnished trowel marks (concrete)     skid = black wheel/skid marks
//   ply    = plywood sheets: seams and rows of screws     rust = orange streaks running down from a coping at height 0 (bowls)
//   pour   = [x, z] size (m) of the big concrete pours: each pour its own tone and finish, with a wide sealed joint between pours
//   wet    = dark damp / oil-soaked patches here and there, glossier than the dry concrete round them
function vary(m, { amt = 0.2, joint = 0, trowel = 0, skid = 0, ply = 0, rust = 0, matte = 0.04, pour = null, wet = 0 } = {}) {
  const f = (v) => v.toFixed(3);
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: T_NOISE }; s.uniforms.uSkid = { value: T_SKID };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec2 vUm;')
      .replace('#include <project_vertex>', `#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vUm = uv * ${f(TILE)};`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec2 vUm; uniform sampler2D uNoise, uSkid; float dRgh = 0.0;\nfloat h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\nfloat vn21(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 gN = normalize(cross(dFdx(vWp), dFdy(vWp)));
        vec2 q = abs(gN.y) > 0.5 ? vWp.xz : vec2(vWp.x + vWp.z, vWp.y), um = vUm;
        float n1 = texture2D(uNoise, q * 0.019).r, n2 = texture2D(uNoise, q * 0.083 + 0.37).g;
        float mv = mix(1.0 - ${f(amt)}, 1.0 + ${f(amt * 0.45)}, n1) * mix(0.93, 1.05, n2);
        float fw = max(fwidth(um.x), fwidth(um.y));
        ${joint ? `if (gN.y > 0.9) {
          float J = ${f(joint)}; vec2 jc = vWp.xz / J, g2 = abs(fract(jc - 0.5) - 0.5) * J;
          float jl = (1.0 - smoothstep(0.003, 0.009 + fw, min(g2.x, g2.y))) * clamp(0.02 / (0.01 + fw), 0.0, 1.0);
          mv *= (0.965 + 0.06 * h21(floor(jc))) * (1.0 - 0.36 * jl);
          dRgh += 0.15 * jl;
        }` : ''}
        ${pour ? `if (gN.y > 0.9) {
          vec2 PS = vec2(${f(pour[0])}, ${f(pour[1])}), pc = (vWp.xz + vec2(3.3, 1.7)) / PS, pid = floor(pc);
          float ph = h21(pid + 7.13), ph2 = h21(pid + 3.31), ph3 = h21(pid + 9.77);
          vec3 tint = mix(vec3(1.07, 1.0, 0.9), vec3(0.92, 0.98, 1.07), ph2);       // warm or cool cement in each pour
          diffuseColor.rgb *= tint * (0.8 + 0.34 * ph);
          dRgh += (ph3 - 0.5) * 0.3;                                                // broom-finished (rough) or steel-trowelled (smoother)
          vec2 pg = abs(fract(pc - 0.5) - 0.5) * PS;
          float pj = (1.0 - smoothstep(0.012, 0.02 + fw * 0.6, min(pg.x, pg.y))) * clamp(0.04 / (0.015 + fw), 0.0, 1.0);
          float edge = 1.0 - smoothstep(0.02, 0.35, min(pg.x, pg.y));                // the pour edge is a touch darker (tooled edge, dirt in the joint)
          mv *= (1.0 - 0.6 * pj) * (1.0 - 0.06 * edge);
          dRgh += 0.25 * pj;
        }` : ''}
        ${wet ? `if (gN.y > 0.9) {
          vec2 wq = mat2(0.8, 0.6, -0.6, 0.8) * vWp.xz;
          float wn = vn21(wq * 0.09 + 3.1) * 0.6 + vn21(wq * 0.31 + 7.7) * 0.28 + vn21(wq * 1.3) * 0.12;
          float wt = smoothstep(0.7, 0.76, wn) * ${f(wet)};                        // damp patches, a few metres across
          float on = vn21(wq * 0.37 + 11.0) * 0.7 + vn21(wq * 1.7 + 2.0) * 0.3;
          float oil = smoothstep(0.79, 0.84, on) * ${f(wet)};                        // oil and old drink stains, smaller and darker
          mv *= (1.0 - 0.24 * wt) * (1.0 - 0.32 * oil);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 0.9, 0.86), oil);
          dRgh -= 0.45 * wt + 0.25 * oil;
        }` : ''}
        ${trowel ? `{ vec2 w = um * 1.4 + (texture2D(uNoise, um * 0.07).rg - 0.5) * 3.0;
          float tm = smoothstep(0.6, 1.0, sin(w.x * 7.0 + sin(w.y * 2.1) * 3.0 + n2 * 4.0)) * smoothstep(0.35, 0.7, texture2D(uNoise, um * 0.21 + 0.5).b);
          mv *= 1.0 - tm * ${f(0.04 * trowel)}; dRgh -= tm * ${f(0.07 * trowel)}; }` : ''}
        ${skid ? `{ float sk = texture2D(uSkid, um * vec2(0.16, 0.23)).a * smoothstep(0.3, 0.6, n1 + 0.15);
          mv *= 1.0 - sk * ${f(0.45 * skid)}; dRgh += sk * 0.1; }` : ''}
        ${ply ? `{ vec2 P = vec2(2.44, 1.22), pc = um / P, g = abs(fract(pc - 0.5) - 0.5) * P;
          float seam = (1.0 - smoothstep(0.0015, 0.004 + fw, min(g.x, g.y))) * clamp(0.012 / (0.006 + fw), 0.0, 1.0);
          mv *= (0.9 + 0.16 * h21(floor(pc))) * (1.0 - 0.6 * seam);
          float ry = (fract(um.y / 0.305) - 0.5) * 0.305, rx = (fract(um.x / 0.305) - 0.5) * 0.305, g3 = abs(fract(um.x / 0.61 - 0.5) - 0.5) * 0.61;
          float sd = min(min(length(vec2(abs(g.x - 0.03), ry)), length(vec2(abs(g.y - 0.03), rx))), length(vec2(g3, ry)));
          float scr = (1.0 - smoothstep(0.004, 0.007 + fw, sd)) * clamp(0.01 / (0.004 + fw), 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.19, 0.18), scr * 0.8); dRgh -= scr * 0.5; }` : ''}
        ${rust ? `if (vWp.y < -0.04 && gN.y < 0.8) {
          float st = smoothstep(0.45, 0.8, texture2D(uNoise, vec2(um.x * 0.9, vWp.y * 0.05)).r + 0.25 * texture2D(uNoise, vec2(um.x * 3.1, 0.3)).g);
          float rz = st * smoothstep(-1.1 - n1 * 0.6, -0.12, vWp.y) * ${f(rust)};
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.62, 0.36), rz * 0.8); }` : ''}
        if (gN.y < 0.5 && vWp.y > -0.02) {    // grime: dirt and wheel-scuff splashed up the foot of every wall, ledge and ramp side
          float gh = vWp.y * (1.0 + 0.8 * (n2 - 0.5)), gr = (1.0 - smoothstep(0.0, 0.32, gh)) * (0.6 + 0.6 * n1);
          mv *= 1.0 - 0.3 * gr; dRgh += 0.08 * gr;
        }
        diffuseColor.rgb *= mv;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (n1 - 0.5) * 0.3 + dRgh, ${f(matte)}, 1.0);`);
  };
  m.customProgramCacheKey = () => `vary2_${amt}_${joint}_${trowel}_${skid}_${ply}_${rust}_${matte}_${pour}_${wet}`;
  return m;
}
// bare steel that has rusted where nobody grinds and stays polished where they do (coping, rails)
function rusty(m, amt = 1) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: T_NOISE };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn; uniform sampler2D uNoise; float rz = 0.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float rn = texture2D(uNoise, vWp.xz * 0.9 + vWp.y * 0.7).r * 0.6 + texture2D(uNoise, (vWp.xz + vWp.y) * 4.3).g * 0.4;
        rz = smoothstep(0.42, 0.66, rn) * (1.0 - smoothstep(0.35, 0.8, vWn.y)) * ${amt.toFixed(2)};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.13, 0.05), rz);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, rz);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.15, rz);');
  };
  m.customProgramCacheKey = () => `rusty_${amt}`;
  return m;
}
// see-through painted layers that sit on top of a surface (stains, lines, wax)
const decalMat = (o) => { const m = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.9, ...o }); m.userData.noShadow = true; return m; };
const T_STAIN = canvasTex(512, 512, (g, s) => {       // 2x2 sheet of soft dark blotches
  for (let c = 0; c < 4; c++) { const cx = (c % 2 + 0.5) * s / 2, cy = ((c >> 1) + 0.5) * s / 2;
    for (let i = 0; i < 26; i++) { const a = cr() * 6.28, d = cr() * cr() * s * 0.13, r = 12 + cr() * 46, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(18,16,14,${0.1 + cr() * 0.22})`); gr.addColorStop(1, 'rgba(18,16,14,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }
});
const T_CRACK = canvasTex(512, 512, (g, s) => {       // 2x2 sheet of hairline cracks
  g.lineCap = 'round';
  for (let c = 0; c < 4; c++) { const ox = (c % 2) * s / 2, oy = (c >> 1) * s / 2;
    const walk = (x, y, a, n, w) => { g.beginPath(); g.moveTo(ox + x, oy + y);
      for (let k = 0; k < n; k++) { a += (cr() - 0.5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9;
        if (x < 14 || y < 14 || x > s / 2 - 14 || y > s / 2 - 14) break; g.lineTo(ox + x, oy + y);
        if (cr() < 0.07 && w > 0.8) { g.stroke(); walk(x, y, a + (cr() > 0.5 ? 0.9 : -0.9), n / 2, w * 0.6); g.beginPath(); g.moveTo(ox + x, oy + y); } }
      g.strokeStyle = `rgba(20,18,16,${0.5 + w * 0.15})`; g.lineWidth = w; g.stroke(); };
    walk(30 + cr() * 40, 40 + cr() * 170, (cr() - 0.5) * 0.8, 26, 1.7); }
});
const T_WEAR = canvasTex(256, 256, (g, s) => {        // patchy mask so paint looks scuffed
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 46; i++) { const x = cr() * s, y = cr() * s, r = 8 + cr() * 34, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,40,40,0.75)'); gr.addColorStop(1, 'rgba(40,40,40,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  for (let i = 0; i < 1500; i++) { const v = cr() * 120 | 0; g.fillStyle = `rgba(${v},${v},${v},${cr() * 0.5})`; g.fillRect(cr() * s, cr() * s, 1 + cr() * 9, 1 + cr() * 3); }
}, { srgb: false, repeat: true });
const T_GRATE = canvasTex(128, 128, (g, s) => {
  g.fillStyle = '#3d3f41'; g.fillRect(0, 0, s, s); g.fillStyle = '#050505';
  for (let i = 0; i < 6; i++) g.fillRect(12, 12 + i * 18.5, s - 24, 9);
  g.strokeStyle = '#1c1c1c'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
});
const T_LEAF = canvasTex(512, 512, (g, s) => {        // 2x2 sheet of leafy sprigs
  for (let c = 0; c < 4; c++) { const cx = (c % 2 + 0.5) * s / 2, cy = ((c >> 1) + 0.5) * s / 2;
    for (let i = 0; i < 70; i++) { const a = cr() * 6.28, d = Math.sqrt(cr()) * s * 0.2, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      g.save(); g.translate(x, y); g.rotate(cr() * 6.28);
      const l = 22 + cr() * 20 | 0; g.fillStyle = `hsl(${78 + cr() * 30},${26 + cr() * 18}%,${l}%)`;
      g.beginPath(); g.ellipse(0, 0, 9 + cr() * 9, 4 + cr() * 4, 0, 0, 6.29); g.fill();
      g.strokeStyle = `hsla(95,40%,${l + 14}%,0.6)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.stroke(); g.restore(); } }
});
const T_WINDOWS = canvasTex(512, 512, (g, s) => {     // 8x8 sheet: every window a bit different
  const c = s / 8;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = 70 + cr() * cr() * 150 | 0, k = cr();
    g.fillStyle = `rgb(${v * 0.92 | 0},${v * 0.97 | 0},${v})`; g.fillRect(x * c, y * c, c, c);
    if (k < 0.3) { g.fillStyle = 'rgba(225,220,205,0.5)'; const hgt = c * (0.25 + cr() * 0.6); for (let b = 0; b < hgt; b += 3) g.fillRect(x * c, y * c + b, c, 1.6); }
    else if (k < 0.42) { g.fillStyle = 'rgba(200,190,170,0.45)'; g.fillRect(x * c, y * c, c * (0.2 + cr() * 0.25), c); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x * c, y * c + c * 0.72, c, c * 0.28);
    g.fillStyle = '#14171a'; g.fillRect(x * c, y * c, c, 2); g.fillRect(x * c, y * c, 2, c); g.fillRect(x * c + c / 2 - 1, y * c, 2, c);
  }
});
// Shop and street signs. All names are made up for this game.
const SIGNS = [['KESTREL COFFEE', '#20352c', '#efe6d2'], ['LOW TIDE RECORDS', '#e9e2d0', '#1d2a44'], ['MOTH & LANTERN BOOKS', '#3a2430', '#f1d9a6'],
  ['TINSMITH HARDWARE', '#b6452c', '#f6efe0'], ['ORBIT NOODLE BAR', '#141414', '#f2b705'], ['QUARTER MOON BAKERY', '#f0e4cf', '#7a3b23'],
  ['NORTHLINE LAUNDRY', '#2c5d8a', '#ffffff'], ['ALDER ST. BARBER', '#f4f1ea', '#a12a2a'], ['PAPER KITE PRINT SHOP', '#e3a72f', '#22201c'],
  ['FERNWICK PHARMACY', '#ffffff', '#1f7a4d'], ['SALT FLAT CYCLES', '#26282b', '#e9e9e4'], ['DOVETAIL FRAMING', '#6b7f5c', '#f3efe2'],
  ['ALDER ST', '#1e5a3a', '#ffffff'], ['9TH AVE', '#1e5a3a', '#ffffff'], ['LINE 7 · HARBOR LOOP', '#f3f3ef', '#1b3a66'], ['PLAZA CLOSES AT DUSK', '#f3f3ef', '#222222']];
const T_SIGNS = canvasTex(1024, 1024, (g) => {
  SIGNS.forEach(([txt, bg, fg], i) => { const x = (i % 2) * 512, y = (i >> 1) * 128;
    g.fillStyle = bg; g.fillRect(x, y, 512, 128); g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3; g.strokeRect(x + 9, y + 9, 494, 110); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let px = 58; do { g.font = `${i % 3 === 1 ? 'italic ' : ''}700 ${px}px ${i % 2 ? 'Georgia, serif' : "'Helvetica Neue', Arial, sans-serif"}`; px -= 3; } while (g.measureText(txt).width > 450);
    g.fillText(txt, x + 256, y + 66); });
});

const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const noShadow = (m) => { m.userData.noShadow = true; return m; };
const wallKinds = () => [vary(pbr('brick', 1.15)), vary(pbr('brick', 1.15, { color: 0x9a9da2 })), vary(pbr('wall', 3.2)),
  vary(pbr('plaster', 3, { color: 0xe2d6c0 })), vary(pbr('plaster', 3, { color: 0xb59a86 })), vary(pbr('wall', 3.2, { color: 0xb3b6b8 }))];
// Whole-facade photo sets for the distant towers (ambientCG, CC0: see CREDITS.md). fl = storeys in one
// texture repeat, so floors come out 3.4 m tall. Interiors that are lit glow faintly through the glass.
const FACADES = [['glass', 10, 0], ['office', 16, 0.5], ['brick', 6, 0.35], ['ribbon', 8, 0], ['slab', 8, 0.45], ['grid', 32, 0.5], ['loft', 6, 0.3], ['mill', 6, 0.3], ['teal', 20, 0]];
function facadeMat([name, fl, glow]) {
  const ld = (suf, srgb) => { const t = loader.load(`./assets/tex/fac_${name}_${suf}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  if (document.documentElement.dataset.quality === 'low') {          // slow computers: the colour photo only
    const m = new THREE.MeshStandardMaterial({ map: ld('diff', true), roughness: 0.75, metalness: 0 }); m.userData.noShadow = true; m.userData.S = fl * 3.4; return m;
  }
  const arm = ld('arm');
  const m = new THREE.MeshStandardMaterial({ map: ld('diff', true), normalMap: ld('nor'), roughnessMap: arm, metalnessMap: arm, aoMap: arm, roughness: 1, metalness: 1, envMapIntensity: 1.25 });
  if (glow) Object.assign(m, { emissiveMap: ld('emi', true), emissive: new THREE.Color(1, 0.88, 0.7), emissiveIntensity: glow });
  m.userData.noShadow = true; m.userData.S = fl * 3.4; return m;
}
// Windows for the near buildings: real glass (sky reflections that grow at a glancing angle) over a
// fake room behind every pane ("interior mapping", van Dongen 2008): back wall, side walls, floor and
// ceiling found by a ray cast in the shader, so rooms shift with parallax as you skate past. Each room
// gets its own wall colour, blinds, curtains and lights on or off. Ground-floor rooms are lit shops.
// uv * 8 = window cell (one per bay per floor), as building() lays them out.
function windowsMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.05, metalness: 0, envMapIntensity: 0.5 });
  const cheap = () => document.documentElement.dataset.quality === 'low';
  m.onBeforeCompile = (s) => {
    if (cheap()) s.fragmentShader = '#define CHEAP_ROOMS\n' + s.fragmentShader;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn; varying vec2 vCell;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal); vCell = uv * 8.0;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp; varying vec3 vWn; varying vec2 vCell; vec3 roomGlow = vec3(0.0); float frameK = 0.0, paneR = 0.0;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
      vec3 room(vec2 id, vec2 f, vec3 N) {
        // ray from the eye in (cell u, cell v, metres deep) space
        vec3 dp1 = dFdx(vWp), dp2 = dFdy(vWp); vec2 du1 = dFdx(vCell), du2 = dFdy(vCell);
        vec3 p2 = cross(dp2, N), p1 = cross(N, dp1);
        vec3 Tg = p2 * du1.x + p1 * du2.x, Bg = p2 * du1.y + p1 * du2.y;
        float det = dot(dp1, p2); det = abs(det) < 1e-12 ? 1e-12 : det; Tg /= det; Bg /= det;
        vec3 V = normalize(vWp - cameraPosition);
        vec3 r = vec3(dot(V, Tg), dot(V, Bg), max(-dot(V, N), 0.05));
        float k1 = h1(id), k2 = h1(id + 17.3), k3 = h1(id + 41.9), D = 2.5 + 3.0 * k2;
        float tx = r.x > 0.0 ? (1.0 - f.x) / r.x : -f.x / min(r.x, -1e-5);
        float ty = r.y > 0.0 ? (1.0 - f.y) / r.y : -f.y / min(r.y, -1e-5);
        float tz = D / r.z, t = min(min(tx, ty), tz), z = t * r.z / D;
        bool shop = id.y < -0.5, lit = shop || k1 < 0.22;
        vec3 wall = mix(vec3(0.75, 0.72, 0.66), vec3(0.55, 0.6, 0.62), k3) * (0.6 + 0.4 * k2), c;
        if (t == tz) c = wall * (0.8 + 0.2 * fract((f.x + r.x * t) * 3.0 + k1 * 5.0) * step(0.6, k3));   // back wall, the odd shelf
        else if (t == ty) c = r.y > 0.0 ? vec3(0.5) * (lit ? 1.5 : 0.6) * (0.8 + 0.4 * step(0.5, fract((f.x + r.x * t) * 2.0)) * float(lit)) : vec3(0.32, 0.27, 0.22) * (0.7 + 0.6 * k3);   // ceiling / floor
        else c = wall * 0.8;
        float light = mix(1.0, 0.3, z) * (lit ? 1.0 : 0.45);   // daylight from the window falls off into the room
        vec3 tint = lit ? (k2 > 0.5 ? vec3(1.0, 0.86, 0.66) : vec3(0.92, 0.96, 1.0)) : vec3(0.85, 0.9, 1.0);
        c *= light * tint * (shop ? 0.5 : 0.22);
        // blinds part-way down, or curtains drawn at the sides, sitting right behind the glass
        float bl = k3 < 0.35 && !shop ? 1.0 - k1 * 2.5 : 2.0;
        if (f.y > bl) c = vec3(0.62, 0.6, 0.55) * (0.75 + 0.25 * step(0.5, fract(f.y * 28.0))) * 0.2 * (lit ? 1.3 : 1.0);
        if (k2 > 0.8 && !shop && abs(f.x - 0.5) > 0.28) c = mix(vec3(0.45, 0.32, 0.26), vec3(0.3, 0.36, 0.42), k3) * 0.14;
        return c;
      }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 id = floor(vCell), f = fract(vCell); vec3 N = normalize(vWn);
          float fw = max(length(fwidth(vCell)), 1e-4);
          vec2 e = min(f, 1.0 - f); float mul = abs(f.x - 0.5);
          frameK = 1.0 - smoothstep(0.035, 0.035 + fw, min(e.x, e.y));
          frameK = max(frameK, (1.0 - smoothstep(0.012, 0.012 + fw, mul)) * step(-0.5, id.y));   // a centre mullion above street level
          frameK = mix(frameK, 0.18, smoothstep(0.15, 0.4, fw));                             // far away: just an average
          #ifdef CHEAP_ROOMS
            roomGlow = vec3(0.04, 0.042, 0.045) * (0.5 + h1(id + (N.x + 2.0 * N.z) * 7.0)) * (1.0 - frameK);
          #else
            roomGlow = room(id + (N.x + 2.0 * N.z) * 7.0, f, N) * (1.0 - frameK);
          #endif
          paneR = (h1(id + 3.1) - 0.5) * 0.06;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.105, 0.11), frameK);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor + paneR + 0.03, 0.45, frameK);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += roomGlow;');
  };
  m.customProgramCacheKey = () => 'windows2' + (cheap() ? 'c' : '');
  return m;
}
const glassKind = (color = 0xb4c2cc) => new THREE.MeshStandardMaterial({ map: T_WINDOWS, color, roughness: 0.12, metalness: 0.7, envMapIntensity: 1.3, emissive: 0x161b20, emissiveMap: T_WINDOWS });
export const MAT = {
  concrete: vary(pbr('concrete', 3, { color: new THREE.Color(1.4, 1.39, 1.36) }), { amt: 0.2, joint: 3 }),          // plaza slabs
  smooth: vary(pbr('stone', 1.6, { color: 0xd4d1cb, roughness: 0.75 }), { amt: 0.1 }), // polished ledge stone
  asphalt: vary(pbr('asphalt', 3.5, { color: 0xb9b9b9 }), { amt: 0.28 }),
  wood: vary(pbr('plywood', 2.4, { roughness: 0.9 }), { amt: 0.16 }),   // ramp surface
  brick: vary(pbr('brick', 1.15), { amt: 0.18 }),
  metal: rusty(new THREE.MeshStandardMaterial({ color: 0xc3c7cc, roughness: 0.3, metalness: 1 }), 0.35),   // rails and coping
  planks: vary(pbr('planks', 1.6), { amt: 0.12 }),
  paving: vary(pbr('paving', 2.4), { amt: 0.2 }),
  plate: pbr('metal', 1.2, { metalness: 1, color: 0x9aa0a6 }),          // bins, boxes
  darkMetal: flat(0x23262a, { roughness: 0.45, metalness: 0.85 }),      // lamp posts, frames
  trunk: pbr('bark', 1.1),
  leaf: new THREE.MeshStandardMaterial({ map: T_LEAF, alphaTest: 0.5, alphaToCoverage: true, vertexColors: true, roughness: 0.8 }),
  grate: new THREE.MeshStandardMaterial({ map: T_GRATE, roughness: 0.55, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  stain: decalMat({ map: T_STAIN, color: 0x2a2622, opacity: 0.34 }), crack: decalMat({ map: T_CRACK, opacity: 0.8 }),
  wax: decalMat({ color: 0x12110f, alphaMap: T_WEAR, opacity: 0.78, roughness: 0.62 }),
  paint: decalMat({ color: 0xcfcec8, alphaMap: T_WEAR, opacity: 0.8, roughness: 0.7 }),
  paintYellow: decalMat({ color: 0xd9a81e, alphaMap: T_WEAR, opacity: 0.9, roughness: 0.7 }),
  sign: new THREE.MeshStandardMaterial({ map: T_SIGNS, roughness: 0.55 }),
  lamp: flat(0xfff3d6, { emissive: 0xfff0cc, emissiveIntensity: 0.35 }),
  hydrant: flat(0xb3261e, { roughness: 0.5 }),
  // striped canvas awnings, sun-faded
  awnings: [['#7c2f2a', '#e8e0cf'], ['#2f4f43', '#e3dccb'], ['#30405c', '#d9d4c8'], ['#b0965f', '#efe7d6']].map(([a, b]) => new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * w / 8, 0, w / 8, h); }
    g.fillStyle = 'rgba(255,250,235,0.12)'; g.fillRect(0, 0, w, h * 0.6); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${cr() * 0.08})`; g.fillRect(cr() * w, cr() * h, 2 + cr() * 8, 1); } }) })),
  signalRed: flat(0xff2a1a, { emissive: 0xff2010, emissiveIntensity: 2.2 }), signalOff: flat(0x1a1c1e, { roughness: 0.3 }), signalGreen: flat(0x18ff90, { emissive: 0x10ff80, emissiveIntensity: 2.2 }),
  soil: flat(0x2c241c, { roughness: 1 }), roof: flat(0x4a4b4d, { roughness: 1 }),
  walls: wallKinds(), glass: glassKind(), windows: windowsMat(), facades: null,   // built on first use (cityKit), once the quality level is known
  trim: vary(pbr('wall', 2.5, { color: 0xd8d2c6 }), { amt: 0.15 }), farTrim: noShadow(vary(pbr('wall', 2.5, { color: 0xb9b4aa }), { amt: 0.15 })),
  farWalls: wallKinds().map(noShadow), farGlass: noShadow(glassKind()), farRoof: noShadow(flat(0x4a4b4d)),
  ground: noShadow(flat(0x4b4c4e, { roughness: 1 })),
};
MAT.stone = MAT.smooth;
// leaves: mipmapping averages the leaf cutouts' alpha toward grey, so past ~40 m every card fell under the alpha test and the
// trees went bare. Scale alpha up with the mip level (Ben Golus, "Anti-aliased Alpha Test: The Esoteric Alpha To Coverage", 2017).
MAT.leaf.onBeforeCompile = (s) => {
  s.fragmentShader = s.fragmentShader.replace('#include <alphatest_fragment>', `{ vec2 lt = vMapUv * 512.0; float lod = max(0.0, 0.5 * log2(max(dot(dFdx(lt), dFdx(lt)), dot(dFdy(lt), dFdy(lt)))));
      diffuseColor.a *= 1.0 + lod * 0.3; }
    #include <alphatest_fragment>`);
};
MAT.leaf.customProgramCacheKey = () => 'leafMip';
// ── skatepark materials ──
// painted rails: paint colour with scuffs worn through to bare steel (the steel shows where the grinds go)
function paintedRail(hex) {
  let ps = parseInt(hex.slice(1), 16) % 977 + 11; const pr = () => { ps = (ps * 1664525 + 1013904223) >>> 0; return ps / 4294967296; };
  const scuffs = [];
  for (let i = 0; i < 260; i++) { const band = pr() < 0.7, u = band ? (pr() < 0.5 ? 0.25 : 0.75) + (pr() - 0.5) * 0.16 : pr(); scuffs.push([u, pr(), 1 + pr() * (band ? 10 : 3), 2 + pr() * (band ? 40 : 10)]); }
  const draw = (steel, paint) => (g, w, h) => { g.fillStyle = paint; g.fillRect(0, 0, w, h); g.fillStyle = steel;
    for (const [u, v, sw, sh] of scuffs) g.fillRect(u * w - sw / 2, v * h, sw, sh); };
  const map = canvasTex(64, 256, (g, w, h) => { draw('#8d9196', hex)(g, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${pr() * 0.12})`; g.fillRect(pr() * w, pr() * h, 1 + pr() * 3, 1 + pr() * 6); } }, { repeat: true });
  const mr = canvasTex(64, 256, draw('rgb(0,90,255)', 'rgb(0,150,40)'), { srgb: false, repeat: true });   // g = roughness, b = metal
  return new THREE.MeshStandardMaterial({ map, roughnessMap: mr, metalnessMap: mr, roughness: 1, metalness: 1 });
}
MAT.railPaint = { yellow: paintedRail('#e0a91c'), red: paintedRail('#a8281f'), black: paintedRail('#1d1f22'), blue: paintedRail('#2c5d8a'), green: paintedRail('#2f5a3f') };
MAT.coping = rusty(new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 1 }), 0.75);
MAT.parkDeck = vary(pbr('concrete', 4, { color: new THREE.Color(1.58, 1.57, 1.53) }), { amt: 0.16, joint: 5, trowel: 0.6, skid: 0.35 });     // flat park concrete, saw-cut slabs
MAT.parkTrans = vary(pbr('concrete', 2.6, { color: new THREE.Color(1.12, 1.11, 1.07), roughness: 1 }), { amt: 0.18, trowel: 1, skid: 0.8 });
MAT.bowlTrans = vary(pbr('concrete', 2.6, { color: new THREE.Color(1.26, 1.24, 1.19), roughness: 1 }), { amt: 0.2, trowel: 1, skid: 1, rust: 1 });   // bowls: rust runs down from the coping
MAT.rampPly = vary(pbr('plywood', 2.4, { roughness: 0.85, color: 0xcabfb0 }), { amt: 0.14, ply: 1, skid: 0.3 });   // ramp sheets, screwed down  // trowelled transition concrete
MAT.parkLedge = vary(pbr('concrete', 2, { color: new THREE.Color(1.25, 1.24, 1.2) }), { amt: 0.12, skid: 0.25 });
MAT.parkLedge.userData.waxy = true; MAT.parkDeck.userData.waxy = true;
const T_TILE = canvasTex(256, 64, (g, w, h) => {          // a band of glazed pool tiles under the coping
  g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const v = cr(); g.fillStyle = `hsl(${192 + v * 14},${38 + v * 14}%,${30 + cr() * 9}%)`; g.fillRect(i * 64 + 3, 3, 58, h - 6);
    g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(i * 64 + 6, 6, 52, 8); }
}, { repeat: true });
T_TILE.repeat.set(TILE / 0.6, 1);
MAT.poolTile = new THREE.MeshStandardMaterial({ map: T_TILE, roughness: 0.22, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
MAT.copingWear = decalMat({ color: 0x15130f, alphaMap: T_WEAR, opacity: 0.55, roughness: 0.5 });
MAT.grass = vary(pbr('grass', 5, { color: new THREE.Color(0.78, 1.12, 0.52) }), { amt: 0.3 });   // watered city-park green, not hay
MAT.dirt = vary(flat(0x6a5a46, { roughness: 1 }), { amt: 0.35 });
// Open hill country (the mega park's landscape). One photo grass texture can't cover a square kilometre
// without showing a grid, so this shader:
//  - samples the grass photo with a different random offset in each smoothly-varying patch and blends
//    between them (Inigo Quilez's "texture repetition" technique 3, iquilezles.org/articles/texturerepetition),
//    at two scales, the second rotated, so neither the tile nor its rotation repeats
//  - lets the photo's fine contrast fade out with distance (from far away grass is a colour, not a pattern)
//  - paints the colour from big value-noise fields: lush green in the hollows, dry straw on the ridges
//    and sunny slopes, worn dirt and bare rock on the steepest ground, grey-green scree up the mountains
// The photo supplies the detail as a relative brightness; the colour comes from the fields.
MAT.hills = () => once('hills', () => {
  const ld = (suf, srgb) => { const t = loader.load(`./assets/tex/grass_${suf}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const m = new THREE.MeshStandardMaterial({ map: ld('diff', true), normalMap: ld('nor'), roughness: 0.95, metalness: 0 });
  m.userData.noShadow = true;
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp; float hDist = 0.0, hFade = 0.0, hRough = 0.0; vec2 hOa, hOb; float hMix;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, t = 0.0; for (int i = 0; i < 4; i++) { t += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 5.3; a *= 0.5; } return t / 0.9375; }
      // which two random offsets this patch uses, and how far between them (shared by colour and normal samples)
      void hPick(vec2 uv) { float l = vn(mat2(0.8, 0.6, -0.6, 0.8) * uv * 0.23) * 8.0; float ia = floor(l); hMix = fract(l); hOa = sin(vec2(3.0, 7.0) * ia); hOb = sin(vec2(3.0, 7.0) * (ia + 1.0)); }
      vec3 hTex(sampler2D t, vec2 uv) { vec2 dx = dFdx(uv), dy = dFdy(uv);
        vec3 a = textureGrad(t, uv + hOa, dx, dy).rgb, b = textureGrad(t, uv + hOb, dx, dy).rgb;
        return mix(a, b, smoothstep(0.2, 0.8, hMix - 0.1 * dot(a - b, vec3(1.0)))); }`)
      .replace('#include <map_fragment>', `
      vec2 wq = vWp.xz;
      hDist = length(vWp - cameraPosition);
      hFade = smoothstep(25.0, 220.0, hDist);
      vec2 uvA = vMapUv; hPick(uvA);
      vec3 dA = hTex(map, uvA);
      vec2 uvB = mat2(0.8, 0.6, -0.6, 0.8) * vMapUv * 0.29 + 0.37;
      vec3 dB = textureGrad(map, uvB, dFdx(uvB), dFdy(uvB)).rgb;
      vec3 avg = textureLod(map, vec2(0.5), 12.0).rgb;
      float la = max(dot(avg, vec3(0.3, 0.55, 0.15)), 1e-3);
      float rel = dot(mix(dA, dB, 0.4), vec3(0.3, 0.55, 0.15)) / la;           // the photo's detail, as brightness about 1
      rel = mix(1.0 + (rel - 1.0) * 1.35, 1.0, hFade * 0.8);
      vec3 hue = mix(mix(dA, dB, 0.4) / max(avg, vec3(1e-3)), vec3(rel), 0.5 + 0.5 * hFade);   // a little of the photo's own hue variation
      // the fields
      vec3 gN = normalize(cross(dFdx(vWp), dFdy(vWp)));
      float slope = 1.0 - gN.y;
      vec2 wr = mat2(0.8, 0.6, -0.6, 0.8) * wq; float big = fbm(wq * 0.0045), med = fbm(wr * 0.019 + 17.0), sml = vn(wr * 0.09 + 3.0);
      float sunny = clamp(dot(gN.xz, vec2(0.45, -0.6)) * 3.0, 0.0, 1.0);          // slopes facing the sun dry out first
      float dPark = length(max(abs(wq) - vec2(106.0, 68.0), 0.0));
      float hollow = (1.0 - smoothstep(-0.5, 9.0, vWp.y - 6.0 * (big - 0.5))) * smoothstep(20.0, 110.0, dPark);
      float dry = smoothstep(0.5, 0.8, big * 0.55 + med * 0.35 + sml * 0.1 + sunny * slope * 1.4 + smoothstep(10.0, 40.0, vWp.y) * 0.15 - hollow * 0.25 + (1.0 - smoothstep(10.0, 60.0, dPark)) * 0.08);
      vec3 lush = vec3(0.055, 0.085, 0.030), green = vec3(0.098, 0.118, 0.050), straw = vec3(0.200, 0.160, 0.072), dirt = vec3(0.16, 0.125, 0.085), rock = vec3(0.20, 0.195, 0.18);
      vec3 col = mix(green, lush, smoothstep(0.35, 0.75, med) * 0.7 + hollow * 0.5);
      col = mix(col, straw, dry * 0.8);
      float tiny = vn(wq * 0.31 + 9.0) * 0.6 + vn(wq * 0.93) * 0.4;
      col = mix(col, col * vec3(0.8, 0.86, 0.72), smoothstep(0.5, 0.8, sml) * 0.55);     // clumps a shade darker
      col = mix(col, mix(straw, green, 0.5), smoothstep(0.62, 0.85, tiny) * 0.4 * (1.0 - hFade));   // tufts of seed heads and dry blades up close
      float bare = smoothstep(0.22, 0.42, slope + (med - 0.5) * 0.25);                  // steep ground: worn dirt, then rock
      col = mix(col, dirt, bare * 0.6);
      float mtn = smoothstep(40.0, 110.0, vWp.y + 20.0 * (med - 0.5));
      col = mix(col, mix(rock, vec3(0.12, 0.14, 0.08), smoothstep(0.4, 0.6, med) * 0.6), mtn * 0.85);
      col = mix(col, rock, smoothstep(0.38, 0.6, slope + sml * 0.15) * 0.7);
      hRough = dry * 0.05 - hollow * 0.08;
      diffuseColor.rgb = col * mix(vec3(rel), hue, 0.3);`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', 'vec3 mapN = hTex(normalMap, vNormalMapUv).xyz * 2.0 - 1.0; mapN.xy *= 1.0 - hFade;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + hRough, 0.5, 1.0);');
  };
  m.customProgramCacheKey = () => 'hills1';
  return m;
});
// original graffiti: made-up words in a spray-can hand, a 4x2 sheet. No real crew or artist names.
const TAGS = [['ZORPO', '#e8e2d4', '#151515'], ['KELP!', '#2f9fd6', '#f4f0e6'], ['VANTA', '#121212', '#d93a2b'], ['MOSS', '#7bc043', '#1a1a1a'],
  ['RIPT', '#f2b705', '#1d1d1d'], ['OKAY OK', '#ec6fa5', '#ffffff'], ['LOOMS', '#ffffff', '#3349a6'], ['FIZZ', '#ff7a1a', '#101010']];
const T_TAGS = canvasTex(1024, 512, (g) => {
  TAGS.forEach(([txt, fill, line], i) => {
    const x = (i % 4) * 256 + 128, y = (i >> 2) * 256 + 132; g.save(); g.translate(x, y); g.rotate((cr() - 0.5) * 0.35);
    let px = 96; do { g.font = `${i % 2 ? 'italic ' : ''}900 ${px}px 'Marker Felt', 'Impact', 'Arial Black', sans-serif`; px -= 4; } while (g.measureText(txt).width > 220);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.shadowColor = fill; g.shadowBlur = 6;                                   // overspray
    g.lineWidth = 14; g.strokeStyle = line; g.strokeText(txt, 0, 0); g.shadowBlur = 0;
    g.fillStyle = fill; g.fillText(txt, 0, 0);
    g.lineWidth = 2.5; g.strokeStyle = line;
    for (let k = 0; k < 5; k++) { const dx = (cr() - 0.5) * 200, l = 10 + cr() * 40; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(dx, 18); g.lineTo(dx, 18 + l); g.stroke(); }   // drips
    g.restore(); g.globalAlpha = 1;
  });
});
// chain-link fence: a diamond wire mesh with see-through holes
const T_FENCE = canvasTex(128, 128, (g, s) => {
  g.clearRect(0, 0, s, s); g.strokeStyle = 'rgba(190,195,198,1)'; g.lineWidth = 5;
  for (const o of [-s, 0, s]) { g.beginPath(); g.moveTo(o, 0); g.lineTo(o + s, s); g.moveTo(o + s, 0); g.lineTo(o, s); g.stroke(); }
}, { repeat: true });
// a soft blob for puddles
const T_BLOB = canvasTex(256, 256, (g, s) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9; i++) { const x = s / 2 + (cr() - 0.5) * s * 0.4, y = s / 2 + (cr() - 0.5) * s * 0.3, r = s * (0.12 + cr() * 0.16);
    const gr = g.createRadialGradient(x, y, r * 0.55, x, y, r); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
}, { srgb: false });
MAT.tag = decalMat({ map: T_TAGS, roughness: 0.6, opacity: 0.92 });
// ── colour: pigmented concrete, painted steel, murals and floor paint (all made here, all original) ──
// pigment(hex): a concrete tint. The photo concrete is mid grey, so the tint is scaled up to read as the colour.
const GREY = new THREE.Color(0.55, 0.55, 0.55);
// The 'sim' look (the default; ?look=arcade in the address brings back the old one, see LOOKS in gfx.js) mixes a lot
// more cement grey and a little grime brown into every pigment: weathered, sun-faded park paint instead of candy colour.
const SIM = (new URLSearchParams(location.search).get('look') || TWEAKS.look) !== 'arcade', DIRT = new THREE.Color(0.5, 0.46, 0.4);
// fade(hex, amt): sun-faded paint: toward its own grey (keeping its brightness), then a hint of dust. A no-op on 'arcade'.
const fade = (hex, amt = 0.42) => {
  const c = new THREE.Color(PAINT[hex] || hex);
  if (!SIM) return c;
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  return c.lerp(new THREE.Color(l, l, l), amt).lerp(DIRT.clone().multiplyScalar(l / 0.46), amt * 0.3);
};
MAT.fade = fade;
const pigment = (hex, k = 2.3, soft = 0.22) => fade(hex).lerp(GREY, soft).multiplyScalar(k);   // soft: a little cement grey in the mix, so colours read as concrete, not plastic
export const PAINT = { teal: '#2fa6a0', terracotta: '#d8704a', sand: '#efe8dc', charcoal: '#7c8088', blue: '#3b7fd0', ochre: '#f2b83a',
  coral: '#e8707a', sage: '#86b487', cream: '#f4eee2', red: '#d2402e', navy: '#2b4677', mint: '#7fd1bd', lilac: '#9c8bd6' };
const cache = new Map(), once = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
// flat park deck, transition concrete and ledge stone in any pigment
MAT.deckOf = (c) => once('d' + c, () => { const m = vary(pbr('concrete', 4, { color: pigment(PAINT[c] || c, 2.5) }), { amt: 0.14, joint: 5, trowel: 0.6, skid: 0.3 }); m.userData.waxy = true; return m; });
// a big park's flat ground: the deck concrete laid in big pours of different tones and finishes, with damp and oily patches
MAT.pourOf = (c, size = [17, 13]) => once('pour' + c + size, () => { const m = vary(pbr('concrete', 4, { color: c === 'park' ? new THREE.Color(1.5, 1.49, 1.45) : pigment(PAINT[c] || c, 2.5) }), { amt: 0.16, joint: 5, trowel: 0.6, skid: 0.4, pour: size, wet: 1 }); m.userData.waxy = true; return m; });
MAT.transOf = (c) => once('t' + c, () => vary(pbr('concrete', 2.6, { color: pigment(PAINT[c] || c, 2.3), roughness: 1 }), { amt: 0.16, trowel: 1, skid: 0.7 }));
MAT.bowlOf = (c) => once('b' + c, () => vary(pbr('concrete', 2.6, { color: pigment(PAINT[c] || c, 2.35), roughness: 1 }), { amt: 0.18, trowel: 1, skid: 0.9, rust: 0.6, matte: 0.68 }));   // matte: painted pool concrete has no big glossy sheen
MAT.ledgeOf = (c) => once('l' + c, () => { const m = vary(pbr('concrete', 2, { color: pigment(PAINT[c] || c, 2.4) }), { amt: 0.1, skid: 0.25 }); m.userData.waxy = true; return m; });
MAT.plasterOf = (c) => once('p' + c, () => vary(pbr('plaster', 3, { color: pigment(PAINT[c] || c, 1.25) }), { amt: 0.12 }));
// painted steel (coping, edging, rails): the paint is ground off along the top where the trucks hit, showing bright steel
function paintedSteel(hex) {
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.15 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNoise = { value: T_NOISE };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn; uniform sampler2D uNoise; float bare = 0.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wn = texture2D(uNoise, (vWp.xz + vWp.y) * 2.7).r * 0.65 + texture2D(uNoise, (vWp.xz - vWp.y) * 11.0).g * 0.35;
        bare = smoothstep(0.3, 0.85, vWn.y) * smoothstep(0.38, 0.55, wn) + smoothstep(0.66, 0.74, wn) * 0.6;
        bare = clamp(bare, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.9, 1.05, wn), vec3(0.62, 0.64, 0.67), bare);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, bare);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, bare);');
  };
  m.customProgramCacheKey = () => 'paintedSteel';
  return m;
}
MAT.skatelite = vary(pbr('concrete', 3, { color: pigment('#4a4a4e', 2.0), roughness: 0.6 }), { amt: 0.1, ply: 1, skid: 0.35 });   // dark ramp sheet, screwed down
MAT.paintedPly = (c) => once('pp' + c, () => vary(pbr('plywood', 2.4, { color: pigment(PAINT[c] || c, 3.1, 0.06) }), { amt: 0.12, ply: 1 }));
// painted plaster walls for the city (appended to the brick and concrete kinds): sage, ochre, clay, slate: the city stays real, the park keeps the bright colour
for (const c of ['#7f9e94', '#cfae6a', '#b98272', '#93a7b6']) { MAT.walls.push(vary(pbr('plaster', 3, { color: pigment(c, 1.3, 0.25) }), { amt: 0.12 })); MAT.farWalls.push(noShadow(vary(pbr('plaster', 3, { color: pigment(c, 1.3, 0.25) }), { amt: 0.12 }))); }
MAT.farGlasses = [MAT.farGlass, noShadow(glassKind(0x8fb5d6)), noShadow(glassKind(0xa8c9c0))];
MAT.steelOf = (c) => once('s' + c, () => paintedSteel(fade(c, 0.3)));
// glazed pool tiles in any two colours: a, b alternate, with a pale grout
MAT.tileOf = (a, b) => once('tile' + a + b, () => {
  const t = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ece6d6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const c = fade(i % 2 ? b : a, 0.25), v = 0.9 + cr() * 0.18;
      g.fillStyle = `rgb(${c.r * 255 * v | 0},${c.g * 255 * v | 0},${c.b * 255 * v | 0})`; g.fillRect(i * 64 + 3, 3, 58, h - 6);
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(i * 64 + 6, 6, 52, 8); }
  }, { repeat: true });
  t.repeat.set(TILE / 0.6, 1);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.18, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
});
// floor paint: a 2x2 sheet of shapes (ring, chevrons, hatching, starburst), scuffed by wheels. Tinted per material.
const T_FLOOR = canvasTex(1024, 1024, (g, s) => {
  const h = s / 2; g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.fillStyle = g.strokeStyle = '#fff';
  g.lineWidth = 34; g.beginPath(); g.arc(h / 2, h / 2, h * 0.4, 0, 7); g.stroke(); g.lineWidth = 12; g.beginPath(); g.arc(h / 2, h / 2, h * 0.29, 0, 7); g.stroke();
  for (let i = 0; i < 3; i++) { const y = 70 + i * 130; g.beginPath(); g.moveTo(h + 60, y); g.lineTo(h + h / 2, y + 90); g.lineTo(s - 60, y); g.lineTo(s - 60, y + 50); g.lineTo(h + h / 2, y + 140); g.lineTo(h + 60, y + 50); g.closePath(); g.fill(); }
  g.save(); g.beginPath(); g.rect(14, h + 14, h - 28, h - 28); g.clip(); g.lineWidth = 30; g.strokeRect(14, h + 14, h - 28, h - 28);
  for (let k = -h; k < h; k += 70) { g.beginPath(); g.moveTo(k, s); g.lineTo(k + h, h); g.lineWidth = 26; g.stroke(); } g.restore();
  g.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? h * 0.18 : h * 0.46; g.lineTo(h + h / 2 + Math.cos(a) * r, h + h / 2 + Math.sin(a) * r); } g.closePath(); g.fill();
  g.globalCompositeOperation = 'multiply';                                  // wheel wear
  for (let i = 0; i < 2600; i++) { const v = 90 + cr() * 165 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(cr() * s, cr() * s, 2 + cr() * 14, 1 + cr() * 4); }
  for (let i = 0; i < 70; i++) { const x = cr() * s, y = cr() * s, r = 10 + cr() * 50, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(60,60,60,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
}, { srgb: false });
MAT.floorPaint = (c) => once('fp' + c, () => decalMat({ color: fade(c, 0.35), alphaMap: T_FLOOR, opacity: 0.92, roughness: 0.6 }));
MAT.stripe = (c) => once('st' + c, () => decalMat({ color: fade(c, 0.3), alphaMap: T_WEAR, opacity: 0.9, roughness: 0.6 }));
// murals: eight original paintings on a 2x4 sheet (each 2:1). Shapes only — no real artist, crew, brand or game.
const T_MURAL = canvasTex(2048, 2048, (g) => {
  const W = 1024, H = 512, P = PAINT;
  const cell = (i, draw) => { g.save(); g.translate((i % 2) * W, (i >> 1) * H); g.beginPath(); g.rect(0, 0, W, H); g.clip(); draw(); g.restore(); };
  const lin = (y0, y1, stops) => { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach((c, k) => gr.addColorStop(k / (stops.length - 1), c)); return gr; };
  const poly = (pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); g.fill(); };
  // 0: sunset over rolling waves
  cell(0, () => { g.fillStyle = lin(0, H, ['#ff8a4c', '#ffb85c', '#ffd98a']); g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff5e5b'; g.beginPath(); g.arc(W * 0.62, H * 0.62, 170, 0, 7); g.fill();
    g.fillStyle = '#ffb85c'; for (let k = 0; k < 5; k++) g.fillRect(0, H * 0.5 + k * 30, W, 8 + k * 3);
    [['#2f9c97', 0.62], ['#1f6f8b', 0.72], ['#183a5a', 0.84]].forEach(([c, y], j) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) g.lineTo(x, H * y + Math.sin(x / (70 + j * 25) + j * 2) * (22 + j * 6)); g.lineTo(W, H); g.fill(); }); });
  // 1: layered mountains at dusk with pines
  cell(1, () => { g.fillStyle = lin(0, H, ['#3b3f8f', '#9c6fc4', '#f2a07b']); g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(W * 0.28, H * 0.36, 60, 0, 7); g.fill();
    [['#7b5ea7', 0.45, 0.9], ['#4e4a8c', 0.58, 0.7], ['#2b2d5a', 0.72, 1.3]].forEach(([c, y, f]) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 64) g.lineTo(x, H * y - Math.abs(Math.sin(x * 0.006 * f + y * 9)) * 150); g.lineTo(W, H); g.fill(); });
    g.fillStyle = '#16183a'; for (let x = 10; x < W; x += 34 + (x * 7) % 30) { const t = 60 + (x * 13) % 70; poly([[x, H], [x + 18, H - t], [x + 36, H]], '#16183a'); } });
  // 2: bright memphis shapes on cream
  cell(2, () => { g.fillStyle = '#f4ead5'; g.fillRect(0, 0, W, H);
    const cols = ['#ff5e7a', '#ffc93c', '#2f80ed', '#14b8a6', '#1b1b1b'];
    for (let i = 0; i < 46; i++) { const x = cr() * W, y = cr() * H, c = cols[i % 5], k = i % 4, r = 20 + cr() * 50; g.fillStyle = g.strokeStyle = c; g.lineWidth = 12;
      if (k === 0) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      else if (k === 1) poly([[x, y - r], [x + r, y + r], [x - r, y + r]], c);
      else if (k === 2) { g.beginPath(); for (let t = 0; t < 5; t++) g.lineTo(x - 70 + t * 35, y + (t % 2 ? -22 : 22)); g.stroke(); }
      else { for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) { g.beginPath(); g.arc(x + a * 20, y + b2 * 20, 5, 0, 7); g.fill(); } } } });
  // 3: chunky block letters (an invented phrase) on yellow with halftone dots
  cell(3, () => { g.fillStyle = '#ffd23f'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(255,140,40,0.55)';
    for (let y = 0; y < H; y += 22) for (let x = (y / 22 % 2) * 11; x < W; x += 22) { g.beginPath(); g.arc(x, y, 3 + 6 * (y / H), 0, 7); g.fill(); }
    g.font = "900 230px 'Arial Black', Impact, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (let k = 14; k > 0; k -= 2) { g.fillStyle = '#1b1b1b'; g.fillText('PUSH', W / 2 + k, H / 2 + k); }
    g.lineWidth = 16; g.strokeStyle = '#1b1b1b'; g.strokeText('PUSH', W / 2, H / 2); g.fillStyle = '#ff5e5b'; g.fillText('PUSH', W / 2, H / 2);
    g.fillStyle = '#fff'; g.fillRect(W / 2 - 300, H / 2 - 60, 40, 12); });
  // 4: giant daisies on teal
  cell(4, () => { g.fillStyle = '#1f8f8a'; g.fillRect(0, 0, W, H);
    for (const [x, y, r] of [[200, 260, 170], [620, 180, 120], [860, 380, 150], [430, 470, 90]]) { g.fillStyle = '#fff6e5';
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.17, a, 0, 7); g.fill(); }
      g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(x, y, r * 0.3, 0, 7); g.fill(); g.fillStyle = '#e8892d'; g.beginPath(); g.arc(x, y, r * 0.16, 0, 7); g.fill(); } });
  // 5: retro rainbow arcs on cream
  cell(5, () => { g.fillStyle = '#f4ead5'; g.fillRect(0, 0, W, H); g.lineWidth = 44;
    ['#d2402e', '#e8892d', '#ffc93c', '#86b487', '#2f9c97', '#2b4677'].forEach((c, k) => { g.strokeStyle = c; for (const cx of [260, 780]) { g.beginPath(); g.arc(cx, H + 30, 400 - k * 46, Math.PI, 0); g.stroke(); } }); });
  // 6: checkerboard band with lightning
  cell(6, () => { g.fillStyle = '#2b4677'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 64) for (let y = 160; y < 352; y += 64) { g.fillStyle = ((x + y) / 64) % 2 ? '#f4ead5' : '#1b1b1b'; g.fillRect(x, y, 64, 64); }
    for (const x of [180, 520, 860]) poly([[x - 40, 40], [x + 60, 40], [x + 10, 220], [x + 80, 220], [x - 70, 480], [x - 20, 280], [x - 90, 280]], '#ffd23f'); });
  // 7: harlequin diamonds with a big circle
  cell(7, () => { const cs2 = ['#e8707a', '#9c8bd6', '#7fd1bd', '#ffc93c'];
    for (let y = -64; y < H + 64; y += 64) for (let x = -64; x < W + 64; x += 128) { const o = (y / 64) % 2 ? 64 : 0;
      poly([[x + o, y], [x + o + 64, y + 64], [x + o, y + 128], [x + o - 64, y + 64]], cs2[((x + o) / 64 + y / 64 & 3 + 4) % 4]); }
    g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(W * 0.7, H * 0.5, 180, 0, 7); g.fill(); g.fillStyle = '#f4ead5'; g.beginPath(); g.arc(W * 0.7, H * 0.5, 130, 0, 7); g.fill();
    g.fillStyle = '#d2402e'; g.beginPath(); g.arc(W * 0.7, H * 0.5, 70, 0, 7); g.fill(); });
  // weathering over everything: sun-faded patches and scuffs near the bottom
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 9000; i++) { const v = 170 + cr() * 85 | 0; g.fillStyle = `rgb(${v},${v},${v - 6})`; g.fillRect(cr() * 2048, cr() * 2048, 1 + cr() * 6, 1 + cr() * 3); }
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(255,250,235,0.07)'; g.fillRect(0, 0, 2048, 2048);   // a little sun fade
  // age: rain streaks from the top, grime splashed up from the ground, and paint flaking off to show the wall
  for (let i = 0; i < 8; i++) {
    const ox = (i % 2) * W, oy = (i >> 1) * H;
    g.save(); g.beginPath(); g.rect(ox, oy, W, H); g.clip();
    for (let k = 0; k < 60; k++) { const x = ox + cr() * W, l = H * (0.15 + cr() * 0.6); const gr = g.createLinearGradient(0, oy, 0, oy + l);
      gr.addColorStop(0, `rgba(40,36,30,${0.06 + cr() * 0.12})`); gr.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = gr; g.fillRect(x, oy, 1 + cr() * 4, l); }
    const gb = g.createLinearGradient(0, oy + H, 0, oy + H * 0.72); gb.addColorStop(0, 'rgba(70,58,44,0.4)'); gb.addColorStop(1, 'rgba(70,58,44,0)'); g.fillStyle = gb; g.fillRect(ox, oy + H * 0.7, W, H * 0.3);
    for (let k = 0; k < 7 + cr() * 7; k++) {                                       // flaking: ragged patches, mostly low down and near the edges
      const edge = cr() < 0.5, cx = ox + (edge ? (cr() < 0.5 ? cr() * 60 : W - cr() * 60) : cr() * W), cy = oy + H * (1 - cr() * cr() * 0.8), r = 3 + cr() * cr() * 24, n = 18, pts = [];
      for (let j = 0; j < n; j++) { const a = j / n * 6.283, rr = r * (0.3 + cr() * cr() * 1.4); pts.push([cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr]); }
      const path = () => { g.beginPath(); pts.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); };
      g.save(); g.translate(1.5, 1.5); path(); g.fillStyle = 'rgba(25,22,18,0.35)'; g.fill(); g.restore();   // the lifted paint edge's shadow
      path(); const v = 128 + cr() * 22 | 0; g.fillStyle = `rgb(${v},${v - 3},${v - 9})`; g.fill();
      for (let q = 0; q < r * 3; q++) { const a = cr() * 6.28, d = r * (1 + cr() * 0.8); const v2 = 120 + cr() * 30 | 0; g.fillStyle = `rgba(${v2},${v2 - 3},${v2 - 9},${0.5 + cr() * 0.5})`; g.fillRect(cx + Math.cos(a) * d * 1.4, cy + Math.sin(a) * d, 1 + cr() * 2.5, 1 + cr() * 2); }
    }
    for (let k = 0; k < 220; k++) { const v = 140 + cr() * 40 | 0; g.fillStyle = `rgb(${v},${v},${v - 8})`; g.fillRect(ox + cr() * W, oy + H * (0.5 + 0.5 * cr()), 1 + cr() * 3, 1 + cr() * 2); }   // chips
    g.restore();
  }
});
const T_MURAL_NOR = loader.load('./assets/tex/wall_nor.jpg'); T_MURAL_NOR.wrapS = T_MURAL_NOR.wrapT = THREE.RepeatWrapping; T_MURAL_NOR.repeat.set(8, 16);
MAT.mural = new THREE.MeshStandardMaterial({ map: T_MURAL, normalMap: T_MURAL_NOR, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
MAT.mural.userData.noShadow = true;
MAT.muralFaded = MAT.mural.clone(); MAT.muralFaded.color.setRGB(0.8, 0.78, 0.75);   // old murals on the shop fronts: sun-bleached
MAT.muralFaded.userData.noShadow = true;

// weeds: tufts of grass and leafy weeds that grow in cracks, joints and at the foot of walls
const T_TUFT = canvasTex(256, 256, (g, s) => {
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x0 = s / 2 + (cr() - 0.5) * 50, lean = (cr() - 0.5) * 1.6, len = s * (0.35 + cr() * 0.6), w = 2 + cr() * 4;
    g.strokeStyle = `hsl(${62 + cr() * 40},${30 + cr() * 30}%,${18 + cr() * 22}%)`; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, s); g.quadraticCurveTo(x0 + lean * len * 0.2, s - len * 0.6, x0 + lean * len * 0.55, s - len); g.stroke();
  }
  for (let i = 0; i < 5; i++) { g.save(); g.translate(s / 2 + (cr() - 0.5) * 70, s - 8); g.rotate((cr() - 0.5) * 2.2);   // a few broad leaves
    g.fillStyle = `hsl(${85 + cr() * 25},${35 + cr() * 20}%,${20 + cr() * 14}%)`; g.beginPath(); g.ellipse(0, -34, 12, 36, 0, 0, 6.29); g.fill(); g.restore(); }
}, { repeat: false });
const WIND = { value: 0 };
MAT.tuft = new THREE.MeshStandardMaterial({ map: T_TUFT, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85 });
MAT.tuft.onBeforeCompile = (s) => {
  s.uniforms.uWind = WIND;
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float ph = ip.x * 0.37 + ip.z * 0.53;
        float k = position.y * position.y * 1.6; transformed.x += sin(uWind * 2.1 + ph) * 0.05 * k; transformed.z += cos(uWind * 1.7 + ph) * 0.04 * k; }`);
};
MAT.fence = new THREE.MeshStandardMaterial({ map: T_FENCE, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.45, color: 0xa9adb0 });
MAT.puddle = decalMat({ color: 0x15161a, alphaMap: T_BLOB, opacity: 0.85, roughness: 0.03, metalness: 0.1, envMapIntensity: 1.4 });
MAT.skid = decalMat({ color: 0x0c0c0c, alphaMap: T_SKID, opacity: 0.8 });

// ── Geometry helpers ──
function boxGeo(w, h, d, tile = TILE) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const s = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i; uv.setXY(k, uv.getX(k) * s[f][0] / tile, uv.getY(k) * s[f][1] / tile);
  }
  return g.toNonIndexed();
}
// Triangle soup builder that fixes winding from the normal you intend.
class Buf {
  constructor() { this.p = []; this.n = []; this.u = []; }
  tri(a, b, c, n, uvs) {
    const ns = Array.isArray(n) ? n : [n, n, n];
    const gn = V().subVectors(b, a).cross(V().subVectors(c, a));
    let vs = [a, b, c], nn = ns, uu = uvs;
    if (gn.dot(ns[0]) < 0) { vs = [a, c, b]; nn = [ns[0], ns[2], ns[1]]; if (uvs) uu = [uvs[0], uvs[2], uvs[1]]; }
    const m = ns[0];
    for (let i = 0; i < 3; i++) {
      const v = vs[i]; this.p.push(v.x, v.y, v.z); this.n.push(nn[i].x, nn[i].y, nn[i].z);
      if (uu) this.u.push(uu[i][0], uu[i][1]);
      else if (Math.abs(m.y) > 0.5) this.u.push(v.x / TILE, v.z / TILE);
      else if (Math.abs(m.x) > Math.abs(m.z)) this.u.push(v.z / TILE, v.y / TILE);
      else this.u.push(v.x / TILE, v.y / TILE);
    }
  }
  quad(a, b, c, d, n, uvs) {
    const ns = Array.isArray(n) ? n : [n, n, n, n];
    this.tri(a, b, c, [ns[0], ns[1], ns[2]], uvs && [uvs[0], uvs[1], uvs[2]]);
    this.tri(a, c, d, [ns[0], ns[2], ns[3]], uvs && [uvs[0], uvs[2], uvs[3]]);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    return g;
  }
}
const M = new THREE.Matrix4();
function place(geo, x, y, z, ry = 0) { M.makeRotationY(ry).setPosition(x, y, z); geo.applyMatrix4(M); return geo; }
const local = (p, x, y, z, ry) => p.applyAxisAngle(Y, ry).add(V(x, y, z));

export function buildPark(scene, which = 'skatepark') {
  const byMat = new Map(), solids = [], rails = [], extras = [], PI = Math.PI;
  seed = 1337;
  // tr = a transition (ramp curve, bowl wall): the board may touch down on it even where it is steep
  const add = (geo, mat, collide = true, tr = false) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
    if (collide) solids.push({ g, tr });
  };
  // a grindable line. o.out = which way the deck is, for coping (so you only lock on from the deck side)
  const seg = (a, b, o = {}) => { const s = { a, b, dir: V().subVectors(b, a).normalize(), len: a.distanceTo(b), ...o }; rails.push(s); return s; };

  // decal: a flat painted patch lying on a surface. cell = [which, perRow] picks one picture from a sheet.
  function decal(x, y, z, w, d, mat, { ry = 0, cell = null, tile = 0 } = {}) {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-PI / 2); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      if (cell) uv.setXY(i, (cell[0] % cell[1] + uv.getX(i)) / cell[1], (Math.floor(cell[0] / cell[1]) + uv.getY(i)) / cell[1]);
      else if (tile) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
    }
    add(place(g, x, y + 0.006, z, ry), mat, false);
  }
  // plate: an upright flat panel facing direction ry. sign = which name from the SIGNS list.
  function plate(x, y, z, w, h, ry, mat, sign = null) {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    if (sign != null) for (let i = 0; i < uv.count; i++) uv.setXY(i, (sign % 2 + uv.getX(i)) / 2, 1 - ((sign >> 1) + 1 - uv.getY(i)) / 8);
    add(place(g, x, y, z, ry), mat, false);
  }
  function tube(a, b, r1, r2, mat, collide = false, n = 8) {
    const d = V().subVectors(b, a), g = new THREE.CylinderGeometry(r2, r1, d.length(), n);
    g.applyMatrix4(new THREE.Matrix4().compose(V().addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()), V(1, 1, 1)));
    add(g, mat, collide);
  }

  // box: x,z = center, y = bottom. grind: 'x' or 'z' makes the long top edges grindable.
  function box(x, y, z, w, h, d, mat, { ry = 0, grind = null, collide = true, tile = TILE, edge = null } = {}) {
    add(place(boxGeo(w, h, d, tile), x, y + h / 2, z, ry), mat, collide);
    if (!grind) return;
    const e = grind === 'x'
      ? [[-w / 2, -d / 2, w / 2, -d / 2], [-w / 2, d / 2, w / 2, d / 2]]
      : [[-w / 2, -d / 2, -w / 2, d / 2], [w / 2, -d / 2, w / 2, d / 2]];
    for (const [ax, az, bx, bz] of e) seg(local(V(ax, h, az), x, y, z, ry), local(V(bx, h, bz), x, y, z, ry));
    // grind edges get used: stone gets dark wax marks, brick and wood get a steel edge
    const stone = mat === MAT.smooth || mat === MAT.concrete || mat.userData.waxy, gx = grind === 'x';
    for (const s of [-1, 1]) {
      if (edge) {             // painted steel angle along the edge, like a modern concrete park
        const p = local(gx ? V(0, h - 0.032, s * (d / 2 - 0.022)) : V(s * (w / 2 - 0.022), h - 0.032, 0), x, y, z, ry);
        add(place(boxGeo(gx ? w + 0.008 : 0.05, 0.07, gx ? 0.05 : d + 0.008), p.x, p.y, p.z, ry), edge, false);
      } else if (stone) {
        const p = local(gx ? V(0, h, s * (d / 2 - 0.07)) : V(s * (w / 2 - 0.07), h, 0), x, y, z, ry);
        decal(p.x, p.y, p.z, gx ? w : 0.14, gx ? 0.14 : d, MAT.wax, { ry, tile: 0.7 });
      } else {
        const p = local(gx ? V(0, h - 0.037, s * (d / 2 - 0.016)) : V(s * (w / 2 - 0.016), h - 0.037, 0), x, y, z, ry);
        add(place(boxGeo(gx ? w + 0.006 : 0.04, 0.04, gx ? 0.04 : d + 0.006), p.x, p.y + 0.02, p.z, ry), MAT.metal, false);
      }
    }
  }
  // wedge: starts at (x,z) on the ground and rises to height h over length l,
  // going in direction ry (0 = toward +z, PI/2 = toward +x).
  function wedge(x, z, w, l, h, ry, mat, y0 = 0) {
    const b = new Buf(), a = w / 2;
    const A = V(-a, 0, 0), B = V(a, 0, 0), C = V(a, h, l), D = V(-a, h, l), E = V(-a, 0, l), F = V(a, 0, l);
    b.quad(A, B, C, D, V(0, l, -h).normalize());
    b.quad(E, F, C, D, V(0, 0, 1));
    b.tri(A, E, D, V(-1, 0, 0)); b.tri(B, F, C, V(1, 0, 0));
    add(place(b.geo(), x, y0, z, ry), mat);
  }
  // quarter pipe: curve starts at (x,z) and rises in direction ry.
  function quarter(x, z, w, ry, mat, { R = 2.6, maxDeg = 78, deck = 2.5, N = 20, fence = true, coping = true, y0 = 0, sideMat = mat, copingMat = MAT.coping } = {}) {
    const b = new Buf(), cb = new Buf(), a = w / 2, tm = maxDeg * Math.PI / 180;
    N = Math.max(N, Math.ceil(R * tm / 0.12));
    const P = (i) => { const t = i / N * tm; return { z: R * Math.sin(t), y: R * (1 - Math.cos(t)), n: V(0, Math.cos(t), -Math.sin(t)), s: R * t }; };
    for (let i = 0; i < N; i++) {
      const p = P(i), q = P(i + 1);
      cb.quad(V(-a, p.y, p.z), V(a, p.y, p.z), V(a, q.y, q.z), V(-a, q.y, q.z), [p.n, p.n, q.n, q.n],
        [[-a / TILE, p.s / TILE], [a / TILE, p.s / TILE], [a / TILE, q.s / TILE], [-a / TILE, q.s / TILE]]);
      for (const sx of [-a, a]) b.quad(V(sx, p.y, p.z), V(sx, q.y, q.z), V(sx, 0, q.z), V(sx, 0, p.z), V(Math.sign(sx), 0, 0));
    }
    const top = P(N), H = top.y, z1 = top.z, z2 = top.z + deck;
    if (deck > 0) {
      b.quad(V(-a, H, z1), V(a, H, z1), V(a, H, z2), V(-a, H, z2), V(0, 1, 0));
      for (const sx of [-a, a]) b.quad(V(sx, H, z1), V(sx, H, z2), V(sx, 0, z2), V(sx, 0, z1), V(Math.sign(sx), 0, 0));
    }
    b.quad(V(-a, 0, z2), V(a, 0, z2), V(a, H, z2), V(-a, H, z2), V(0, 0, 1));
    add(place(b.geo(), x, y0, z, ry), sideMat);
    add(place(cb.geo(), x, y0, z, ry), mat, true, true);
    if (coping) {
      const ca = local(V(-a, H - 0.012, z1 - 0.012), x, y0, z, ry), cbp = local(V(a, H - 0.012, z1 - 0.012), x, y0, z, ry);
      tube(ca, cbp, 0.05, 0.05, copingMat, false, 14);
      seg(local(V(-a, H + 0.03, z1), x, y0, z, ry), local(V(a, H + 0.03, z1), x, y0, z, ry), { out: V(0, 0, 1).applyAxisAngle(Y, ry) });
    }
    if (!fence || deck <= 0) return;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {       // a safety rail along the back of the deck
      const p = local(V(-a + t * w, H, z2 - 0.06), x, y0, z, ry); tube(p, p.clone().add(V(0, 1, 0)), 0.025, 0.025, MAT.darkMetal);
    }
    for (const hh of [0.55, 1]) tube(local(V(-a, H + hh, z2 - 0.06), x, y0, z, ry), local(V(a, H + hh, z2 - 0.06), x, y0, z, ry), 0.022, 0.022, MAT.darkMetal);
  }
  // rail from a to b. posts: [[t along 0..1, post height], ...]. mat = MAT.metal or one of MAT.railPaint.
  function rail(a, b, posts = [[0.04, null], [0.5, null], [0.96, null]], r = 0.03, mat = MAT.metal) {
    seg(a, b);
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 14, 1, false), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * a.distanceTo(b));      // paint wear the same size on every rail
    g.applyMatrix4(new THREE.Matrix4().compose(V().addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, V().subVectors(b, a).normalize()), V(1, 1, 1)));
    add(g, mat, false);
    for (const [t, h] of posts) {
      const p = V().lerpVectors(a, b, t), ph = h == null ? p.y : h;
      add(place(new THREE.CylinderGeometry(r * 0.8, r * 0.8, ph, 10), p.x, p.y - ph / 2, p.z), mat, false);
      add(place(new THREE.CylinderGeometry(r * 2.4, r * 2.4, 0.012, 10), p.x, p.y - ph + 0.006, p.z), MAT.metal, false);   // bolted foot
    }
  }
  // tree: a trunk, a few branches, and a few hundred little leafy cards.
  function tree(x, y, z, s = 1) {
    const H = (2.5 + rnd() * 0.8) * s, top = V(x, y + H, z), lobes = [[V(x, y + H + 0.9 * s, z), 1.25 * s]];
    tube(V(x, y, z), top, 0.17 * s, 0.085 * s, MAT.trunk);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + rnd() * 0.8, len = (1.1 + rnd() * 0.8) * s, base = V(x, y + H * (0.72 + 0.07 * i), z);
      const tip = base.clone().add(V(Math.cos(a) * 0.75, 0.62, Math.sin(a) * 0.75).multiplyScalar(len));
      tube(base, tip, 0.06 * s, 0.025 * s, MAT.trunk, false, 6); lobes.push([tip, (0.95 + rnd() * 0.45) * s]);
    }
    const mid = V(x, y + H + 0.5 * s, z), b = new Buf(), col = [];
    for (const [c, R] of lobes) for (let i = 0; i < 110; i++) {
      const dir = V(rnd() - 0.5, (rnd() - 0.5) * 0.8, rnd() - 0.5).normalize();
      const p = c.clone().addScaledVector(dir, R * (0.5 + 0.5 * rnd()));
      const f = dir.clone().add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)).normalize();
      const u = V().crossVectors(f, Y).normalize(), v = V().crossVectors(u, f), k = (0.26 + rnd() * 0.22) * s;
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i2, j2]) => p.clone().addScaledVector(u, i2 * k).addScaledVector(v, j2 * k));
      const n = p.clone().sub(mid).normalize().add(V(0, 0.45, 0)).normalize(), ci = Math.floor(rnd() * 4), cu = (ci % 2) / 2, cv = (ci >> 1) / 2;
      const uvs = [[cu, cv], [cu + 0.5, cv], [cu + 0.5, cv + 0.5], [cu, cv + 0.5]], sh = 0.7 + rnd() * 0.5;
      for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) {   // both faces, same shading normal
        for (const ix of [i0, i1, i2]) { b.p.push(q[ix].x, q[ix].y, q[ix].z); b.n.push(n.x, n.y, n.z); b.u.push(...uvs[ix]); col.push(sh * 0.95, sh, sh * 0.85); }
      }
    }
    const g = b.geo(); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); add(g, MAT.leaf, false);
    if (y < 0.2) decal(x, y, z, 1.3, 1.3, MAT.grate); else decal(x, y, z, 1.7, 1.7, MAT.stain, { cell: [1, 2] });
    for (let i = 0; i < (y < 0.2 ? 3 : 9); i++) { const a = rnd() * 6.28, r = 0.3 + rnd() * (y < 0.2 ? 0.35 : 0.6); weeds(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.6 + rnd() * 0.7); }
  }

  // ── transitions: bowls, rolled hips and spines all come from one recipe. An outline is a
  //    rounded rectangle stored as (corner centre, outward direction) pairs; a profile says how the
  //    wall curves away from the lip. Every vertex gets its true curved normal, so the board
  //    rides it smoothly instead of clicking from flat facet to flat facet. ──
  function outline(cx, cz, hx, hz, rc, step = 0.45, arcN = 20) {
    const C = [[hx - rc, hz - rc], [-(hx - rc), hz - rc], [-(hx - rc), -(hz - rc)], [hx - rc, -(hz - rc)]], out = [];
    for (let k = 0; k < 4; k++) {
      const a0 = k * PI / 2, [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4];
      for (let j = 0; j < arcN; j++) { const a = a0 + j / arcN * PI / 2; out.push({ c: V(cx + ax, 0, cz + az), n: V(Math.cos(a), 0, Math.sin(a)) }); }
      const len = Math.hypot(bx - ax, bz - az), m = len < 1e-6 ? 0 : Math.max(1, Math.ceil(len / step)), a = a0 + PI / 2, n = V(Math.round(Math.cos(a)), 0, Math.round(Math.sin(a)));
      for (let j = 0; j < m; j++) out.push({ c: V(cx + ax + (bx - ax) * j / m, 0, cz + az + (bz - az) * j / m), n });
    }
    return out;
  }
  const lipAt = (p, rc, y) => p.c.clone().addScaledVector(p.n, rc).setY(y);
  // a curved wall rows[] from bottom to top: s = sideways offset from the lip along the outline's outward direction
  // (bowls go inward, so negative), y = height from the lip, (nh, ny) = the wall normal, v = distance up the wall.
  function bowlWall(D, R, N = 26) {
    const tm = D >= R ? PI / 2 : Math.acos(1 - D / R), inset = R * Math.sin(tm), vert = Math.max(0, D - R * (1 - Math.cos(tm))), L = R * tm + vert, rows = [];
    for (let j = 0; j <= N; j++) {
      const l = j / N * L;
      if (l <= R * tm) { const t = l / R; rows.push({ s: -inset + R * Math.sin(t), y: -D + R * (1 - Math.cos(t)), nh: -Math.sin(t), ny: Math.cos(t), v: l }); }
      else rows.push({ s: 0, y: -vert + (l - R * tm), nh: -1, ny: 0, v: l });
    }
    rows.inset = inset; return rows;
  }
  function riseWall(H, R, N = 22) {           // a transition rising up onto a raised deck (hips, spines)
    const tm = Math.acos(1 - H / R), inset = R * Math.sin(tm), rows = [];
    for (let j = 0; j <= N; j++) { const t = j / N * tm; rows.push({ s: inset - R * Math.sin(t), y: R * (1 - Math.cos(t)) - H, nh: Math.sin(t), ny: Math.cos(t), v: R * t }); }
    rows.inset = inset; return rows;
  }
  function sweep(ol, rc, y0, rowsOf, mat, tr = true) {
    const all = ol.map(rowsOf), nr = all[0].length, pos = [], nor = [], uv = [], idx = [], us = [0];
    for (let i = 0; i < ol.length; i++) us.push(us[i] + lipAt(ol[i], rc, 0).distanceTo(lipAt(ol[(i + 1) % ol.length], rc, 0)));
    for (let i = 0; i <= ol.length; i++) {
      const p = ol[i % ol.length], rows = all[i % ol.length];
      for (const r of rows) {
        const q = p.c.clone().addScaledVector(p.n, rc + r.s), nn = p.n.clone().multiplyScalar(r.nh).setY(r.ny).normalize();
        pos.push(q.x, y0 + r.y, q.z); nor.push(nn.x, nn.y, nn.z); uv.push(us[i] / TILE, r.v / TILE);
      }
    }
    for (let i = 0; i < ol.length; i++) for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, b = a + nr; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // face the triangles the way the normals point
    const A = V().fromArray(pos, idx[0] * 3), B = V().fromArray(pos, idx[1] * 3), Cc = V().fromArray(pos, idx[2] * 3);
    if (V().subVectors(B, A).cross(V().subVectors(Cc, A)).dot(V().fromArray(nor, idx[0] * 3)) < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.setIndex(idx); add(g, mat, true, tr); return all;
  }
  // a flat slab filling a polygon (with optional holes), at height y
  function slab(pts, y, mat, holes = [], collide = true) {
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.z))));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2); g.translate(0, y, 0);
    const P = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < P.count; i++) uv.setXY(i, P.getX(i) / TILE, P.getZ(i) / TILE);
    add(g, mat, collide);
  }
  // steel coping all the way round a lip, and grind lines on it. out = +1 deck is outside the outline (bowls), -1 inside (hips)
  function copingLoop(ol, rc, y, out, r = 0.05, cmat = MAT.coping) {
    const pts = ol.map((p) => p.c.clone().addScaledVector(p.n, rc + out * -0.012).setY(y - 0.012));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0), pts.length * 2, r, 10, true), cmat, false);
    const segs = [];
    for (let i = 0; i < ol.length; i++) {
      const j = (i + 1) % ol.length, o = ol[i].n.clone().add(ol[j].n).normalize().multiplyScalar(out);
      segs.push(seg(lipAt(ol[i], rc, y + 0.03), lipAt(ol[j], rc, y + 0.03), { out: o, coping: true }));
    }
    segs.forEach((s, i) => { s.next = segs[(i + 1) % segs.length]; s.prev = segs[(i + segs.length - 1) % segs.length]; });
    // dark grind and wax marks along the top of the wall, under the coping
    return pts;
  }
  // BOWL: lip outline (cx,cz,hx,hz, corner radius rc) at deck height y0. depth(x,z) = how deep at that spot,
  // R(D) = transition radius for that depth. Returns the lip points so the deck can have a hole cut for it.
  function bowl(cx, cz, hx, hz, rc, y0, depth, radius, mat, { floorMat = mat, tiles = true, tileMat = MAT.poolTile, copingMat = MAT.coping } = {}) {
    const ol = outline(cx, cz, hx, hz, rc);
    const rowsOf = (p) => {        // find the bottom of the wall, then size the wall for the floor depth there
      let D = depth(p.c.x + p.n.x * rc, p.c.z + p.n.z * rc), rows;
      for (let k = 0; k < 3; k++) { rows = bowlWall(D, radius(D)); const b = p.c.clone().addScaledVector(p.n, rc - rows.inset); D = depth(b.x, b.z); }
      return bowlWall(D, radius(D));
    };
    const all = sweep(ol, rc, y0, rowsOf, mat);
    // floor: rings from the foot of each wall in to the corner centres, then a grid for the middle
    const fb = new Buf(), fy = (x, z) => y0 - depth(x, z), fn = (x, z) => V(-(fy(x + 0.05, z) - fy(x - 0.05, z)) / 0.1, 1, -(fy(x, z + 0.05) - fy(x, z - 0.05)) / 0.1).normalize();
    const K = 5, ring = ol.map((p, i) => { const r0 = rc - all[i].inset; const out = []; for (let k = 0; k <= K; k++) { const q = p.c.clone().addScaledVector(p.n, r0 * (1 - k / K)); q.y = fy(q.x, q.z); out.push(q); } return out; });
    for (let i = 0; i < ol.length; i++) { const A = ring[i], B = ring[(i + 1) % ol.length]; for (let k = 0; k < K; k++) {
      const q = [A[k], B[k], B[k + 1], A[k + 1]]; if (q[2].distanceToSquared(q[3]) < 1e-8) fb.tri(q[0], q[1], q[2], q.slice(0, 3).map((v) => fn(v.x, v.z)));
      else fb.quad(...q, q.map((v) => fn(v.x, v.z))); } }
    const ix = hx - rc, iz = hz - rc;
    if (ix > 1e-3 && iz > 1e-3) {
      const mx = Math.max(1, Math.ceil(2 * ix / 0.45)), mz = Math.max(1, Math.ceil(2 * iz / 0.45)), G = (i, k) => { const x = cx - ix + 2 * ix * i / mx, z = cz - iz + 2 * iz * k / mz; return V(x, fy(x, z), z); };
      for (let i = 0; i < mx; i++) for (let k = 0; k < mz; k++) { const q = [G(i, k), G(i + 1, k), G(i + 1, k + 1), G(i, k + 1)]; fb.quad(...q, q.map((v) => fn(v.x, v.z))); }
    }
    add(fb.geo(), floorMat, true, true);
    const lip = copingLoop(ol, rc, y0, 1, 0.05, copingMat);
    // pool tiles just under the coping, then scuffed dark grind marks over the top of the wall
    if (tiles) sweep(ol, rc, y0, (p, i) => all[i].slice(-2).map((r, k) => ({ ...r, s: r.s - r.nh * 0.003, y: r.y + 0.003 * r.ny, v: k * TILE })), tileMat, false);
    sweep(ol, rc, y0, (p, i) => all[i].slice(-5).map((r) => ({ ...r, s: r.s - r.nh * 0.005, y: r.y + 0.005 * r.ny })), MAT.copingWear, false);
    return ol.map((p) => lipAt(p, rc, y0));
  }
  // RAISED transition box: a deck at height H with transitions rolling down on every side;
  // a small corner radius makes the corners rolled hips. hz = rc = 0 makes a spine.
  function hipBox(cx, cz, hx, hz, rc, H, R, mat, { deckMat = mat, coping = true, copingMat = MAT.coping } = {}) {
    const ol = outline(cx, cz, hx, hz, rc), w = riseWall(H, R);
    sweep(ol, rc, H, () => w, mat);
    if (hx - rc > 0.01 && hz - rc > 0.01 || rc > 0.05) slab(ol.map((p) => lipAt(p, rc, H)), H, deckMat);
    if (!coping) return;
    if (hz < 0.01 || hx < 0.01) {     // spine: coping along the top
      const a = V(cx - hx, H - 0.01, cz - hz), b = V(cx + hx, H - 0.01, cz + hz); tube(a, b, 0.05, 0.05, copingMat, false, 14);
      seg(a.clone().setY(H + 0.03), b.clone().setY(H + 0.03), { coping: true });
    } else copingLoop(ol, rc, H, -1, 0.05, copingMat);
  }
  // STAIRS going down from a deck at height H, top edge at (x, zTop), descending toward dir (+1 = +z, -1 = -z)
  function stairs(x, zTop, w, n, rise, tread, dir, mat, { yb = 0, nose = MAT.paintYellow } = {}) {
    const H = n * rise;
    for (let k = 1; k < n; k++) box(x, yb, zTop + dir * tread * (k - 0.5), w, H - rise * k, tread, mat);
    for (let k = 0; k < n; k++) decal(x, yb + H - rise * k, zTop + dir * (tread * k + 0.03), w, 0.05, nose, { tile: 1 });   // painted nosings
    return { H, run: n * tread, slope: rise / tread };
  }
  // HUBBA: a ledge that runs down beside a stair set. From (x,z0) at top height y0 to (x,z1) at y1; ledge width w.
  function hubba(x, z0, y0, z1, y1, w, mat, yb = 0) {
    const b = new Buf(), a = w / 2, up = V(0, z1 - z0, y0 - y1).normalize(); if (up.y < 0) up.negate();
    const T0 = V(-a, y0, z0), T1 = V(a, y0, z0), T2 = V(a, y1, z1), T3 = V(-a, y1, z1), B0 = V(-a, yb, z0), B1 = V(a, yb, z0), B2 = V(a, yb, z1), B3 = V(-a, yb, z1);
    b.quad(T0, T1, T2, T3, up);
    b.quad(B0, T0, T3, B3, V(-1, 0, 0)); b.quad(B1, T1, T2, B2, V(1, 0, 0));
    b.quad(B0, B1, T1, T0, V(0, 0, -Math.sign(z1 - z0))); b.quad(B3, B2, T2, T3, V(0, 0, Math.sign(z1 - z0)));
    add(place(b.geo(), x, 0, 0), mat);
    const wb = new Buf();
    for (const sx of [-1, 1]) {
      seg(V(x + sx * a, y0, z0), V(x + sx * a, y1, z1));
      const i0 = x + sx * (a - 0.16), i1 = x + sx * a, e = 0.004;
      wb.quad(V(i0, y0 + e, z0), V(i1, y0 + e, z0), V(i1, y1 + e, z1), V(i0, y1 + e, z1), up, [[0, 0], [0.16 / 0.7, 0], [0.16 / 0.7, Math.abs(z1 - z0) / 0.7], [0, Math.abs(z1 - z0) / 0.7]]);
    }
    add(wb.geo(), MAT.wax, false);
  }

  // MURAL: one of the eight paintings on an upright wall, centre (x,y,z), facing ry (0 = faces +z)
  function mural(x, y, z, w, h, ry, which, mat = MAT.mural) {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, cu = (which % 2) / 2, cv = 1 - ((which >> 1) + 1) / 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 2, cv + uv.getY(i) / 4);
    add(place(g, x + Math.sin(ry) * 0.012, y, z + Math.cos(ry) * 0.012, ry), mat, false);
  }
  // weeds(x, y, z, size): one tuft. They are gathered up and drawn as one instanced mesh at the end.
  const tufts = [], weeds = (x, y, z, sc = 1) => tufts.push([x, y, z, sc]);
  // a scatter of tufts along a line from a to b (ground points), n of them, pushed off it by up to 'spread'
  const weedLine = (a, b, n, spread = 0.15) => { for (let i = 0; i < n; i++) { const t = rnd(), p = V().lerpVectors(a, b, t); weeds(p.x + (rnd() - 0.5) * spread, p.y, p.z + (rnd() - 0.5) * spread, 0.5 + rnd() * 0.8); } };
  const kit = { weeds, weedLine, seg, mural, box, wedge, quarter, rail, tree, decal, plate, tube, add, bowl, hipBox, stairs, hubba, slab, outline, MAT, PI, V, extra: (o) => extras.push(o), solid: (g, thin = false) => solids.push({ g: g.index ? g.toNonIndexed() : g, tr: false, thin }) };
  propColliders(kit);     // props get collision shapes (colliders.js)
  let spawn, more = {};
  if (which === 'plaza') { layout(kit); city(kit); spawn = { pos: V(-28, 0, -10), fwd: V(1, 0, 0) }; }
  else if (which === 'mega') { more = megapark(kit, cityKit(kit)); spawn = more.spawn; }
  else spawn = skatepark(kit, cityKit(kit));

  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = !mat.userData.noShadow; m.receiveShadow = true; m.layers.enable(1); scene.add(m);   // layer 1 = static world (gfx.js draws its wide shadow from it)
  }
  if (tufts.length && document.documentElement.dataset.quality !== 'low') {   // the weeds: three crossed cards per tuft, swaying a little in the breeze
    const g = mergeGeometries([0, 1, 2].map((i) => { const q = new THREE.PlaneGeometry(0.42, 0.34); q.translate(0, 0.17, 0); q.rotateY(i * PI / 3); return q; }));
    const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);   // lit like the ground they grow from
    const im = new THREE.InstancedMesh(g, MAT.tuft, tufts.length), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    tufts.forEach(([x, y, z, sc], i) => { q.setFromAxisAngle(Y, rnd() * 6.28); M4.compose(V(x, y, z), q, V(sc, sc * (0.7 + rnd() * 0.6), sc)); im.setMatrixAt(i, M4);
      im.setColorAt(i, c.setRGB(0.8 + rnd() * 0.4, 0.85 + rnd() * 0.3, 0.7 + rnd() * 0.3)); });
    im.castShadow = false; im.receiveShadow = true; im.onBeforeRender = () => { WIND.value = performance.now() / 1000; };
    im.layers.enable(1); scene.add(im);
  }
  for (const o of extras) { o.castShadow = !o.material.userData.noShadow; o.receiveShadow = true; o.layers.enable(1); scene.add(o); }   // instanced things (cars)
  const collider = new THREE.Mesh(mergeGeometries(solids.map((s) => s.g)), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const trFlags = new Uint8Array(collider.geometry.attributes.position.count);
  const thinFlags = new Uint8Array(trFlags.length);     // thin = posts, trunks, railings: the camera sees past them
  let at = 0; for (const s of solids) { const n = s.g.attributes.position.count; if (s.tr) trFlags.fill(1, at, at + n); if (s.thin) thinFlags.fill(1, at, at + n); at += n; }
  collider.geometry.computeBoundsTree();
  return { collider, trFlags, thinFlags, rails, ...more, spawn, which };
}

// ─────────────────────────────────────────────────────────────────────
//  THE PARK LAYOUT. Meters. x = left/right, z = forward/back, y = up.
//  An original plaza: a street-level square with an upper deck.
// ─────────────────────────────────────────────────────────────────────
function layout({ box, wedge, quarter, rail, tree }) {
  const PI = Math.PI;
  // ground + surrounding street
  box(0, -1, 0, 93, 1, 72, MAT.concrete);
  box(0, -1.02, 0, 500, 1, 500, MAT.asphalt);
  // perimeter walls
  box(0, 0, -36.5, 94, 1.2, 1, MAT.brick); box(0, 0, 36.5, 94, 2.6, 1, MAT.brick);
  box(-47, 0, 0, 1, 1.2, 74, MAT.brick); box(47, 0, 0, 1, 1.2, 74, MAT.brick);

  // upper deck along the back, with stairs, hubba ledges, a handrail and banks
  box(0, 0, 25.5, 93, 1.2, 21, MAT.concrete);
  for (let k = 1; k <= 5; k++) box(0, 0, 15 - 0.45 * (k - 0.5), 8, 1.2 - 0.2 * k, 0.45, MAT.smooth);
  box(-4.4, 0, 13.6, 0.8, 1.55, 3.6, MAT.smooth, { grind: 'z' });
  box(4.4, 0, 13.6, 0.8, 1.55, 3.6, MAT.smooth, { grind: 'z' });
  rail(new THREE.Vector3(0, 1.65, 15.1), new THREE.Vector3(0, 0.45, 12.5), [[0.03, 0.45], [0.97, 0.45]]);
  wedge(-16, 10.5, 12, 4.5, 1.2, 0, MAT.concrete);
  wedge(16, 10.5, 12, 4.5, 1.2, 0, MAT.concrete);
  wedge(32, 12.4, 8, 2.6, 1.2, 0, MAT.wood);                       // steeper bank
  rail(new THREE.Vector3(-30, 1.6, 20), new THREE.Vector3(-30, 1.6, 12.5), [[0.05, 0.4], [0.6, 0.4]]); // rail off the drop
  box(-20, 1.2, 26, 7, 0.45, 2.2, MAT.brick, { grind: 'x' }); tree(-20, 1.65, 26);
  box(20, 1.2, 26, 7, 0.45, 2.2, MAT.brick, { grind: 'x' }); tree(20, 1.65, 26);
  box(0, 1.2, 29, 5, 0.42, 0.6, MAT.wood, { grind: 'x' });         // bench
  box(-36, 1.2, 30, 4, 0.42, 0.6, MAT.wood, { grind: 'x', ry: 0.5 });
  tree(38, 1.2, 31, 1.2); tree(-41, 1.2, 22, 1.1);

  // quarter pipes facing each other across the square
  quarter(-40, -10, 22, -PI / 2, MAT.wood);
  quarter(40, -10, 22, PI / 2, MAT.wood);

  // funbox in the middle, with a ledge along the top
  wedge(-6.5, -8, 6, 4, 0.9, PI / 2, MAT.wood);
  box(0, 0, -8, 5, 0.9, 6, MAT.wood);
  wedge(6.5, -8, 6, 4, 0.9, -PI / 2, MAT.wood);
  box(0, 0.9, -5.5, 5, 0.35, 0.5, MAT.smooth, { grind: 'x' });

  // kicker gap
  wedge(-24, -24, 3.5, 2.6, 0.75, PI / 2, MAT.wood);
  wedge(-17.8, -24, 3.5, 2.6, 0.75, -PI / 2, MAT.wood);

  // street stuff: flat rail, low ledge, manual pad, round rail
  rail(new THREE.Vector3(8, 0.38, -22), new THREE.Vector3(15, 0.38, -22));
  box(-8, 0, -29, 8, 0.4, 0.7, MAT.smooth, { grind: 'x' });
  box(24, 0, -28, 7, 0.22, 3.2, MAT.smooth, { grind: 'x' });
  rail(new THREE.Vector3(-14, 0.3, 2), new THREE.Vector3(-8, 0.3, 5));
  box(14, 0, 3, 6, 0.45, 2, MAT.brick, { grind: 'x', ry: 0.35 }); tree(14, 0.45, 3, 0.9);
  box(-30, 0, -30, 2.2, 0.5, 2.2, MAT.brick); tree(-30, 0.5, -30); tree(36, 0, -31, 1.1);

}

// ─────────────────────────────────────────────────────────────────────
//  THE CITY AROUND THE PLAZA: dressing, streets and buildings. Nothing in
//  here changes how the park skates — it is all scenery (collide: false),
//  except the pavement outside the walls.
// ─────────────────────────────────────────────────────────────────────
export function cityKit(kit) {
  if (!MAT.facades) {
    MAT.facades = FACADES.map(facadeMat);
    MAT.facades[1].color.setHex(0xd2cdc4); MAT.facades[3].color.setHex(0xbab6ad); MAT.facades[5].color.setHex(0xe0dad2);   // pale concrete sets: off the white
  }
  const { box, tree, decal, plate, tube, add } = kit;
  const PI = Math.PI, off = { collide: false };
  const cyl = (x, y, z, r1, r2, h, mat, n = 12) => add(place(new THREE.CylinderGeometry(r2, r1, h, n), x, y + h / 2, z), mat, false);

  // ── street furniture ──
  function lamp(x, y, z, ry = 0) {
    cyl(x, y, z, 0.15, 0.11, 0.5, MAT.darkMetal); cyl(x, y, z, 0.075, 0.05, 6.2, MAT.darkMetal, 10);
    const tip = local(V(0, 6.4, 1.5), x, y, z, ry);
    tube(V(x, y + 6.1, z), tip, 0.04, 0.035, MAT.darkMetal);
    box(tip.x, tip.y - 0.09, tip.z, 0.3, 0.1, 0.75, MAT.darkMetal, { ry, ...off });
    box(tip.x, tip.y - 0.11, tip.z, 0.22, 0.03, 0.55, MAT.lamp, { ry, ...off });
  }
  function bin(x, y, z) {
    cyl(x, y, z, 0.26, 0.29, 0.92, MAT.plate, 14); cyl(x, y + 0.9, z, 0.31, 0.31, 0.05, MAT.darkMetal, 14); cyl(x, y + 0.93, z, 0.2, 0.2, 0.025, flat(0x050505));
  }
  function bollard(x, y, z) { cyl(x, y, z, 0.075, 0.075, 0.9, MAT.darkMetal, 10); add(place(new THREE.SphereGeometry(0.075, 10, 6), x, y + 0.9, z), MAT.darkMetal, false); cyl(x, y + 0.7, z, 0.078, 0.078, 0.06, MAT.plate, 10); }
  function hydrant(x, y, z) {
    cyl(x, y, z, 0.13, 0.13, 0.05, MAT.hydrant); cyl(x, y, z, 0.1, 0.085, 0.55, MAT.hydrant);
    add(place(new THREE.SphereGeometry(0.09, 10, 8), x, y + 0.56, z), MAT.hydrant, false);
    tube(V(x - 0.16, y + 0.4, z), V(x + 0.16, y + 0.4, z), 0.045, 0.045, MAT.hydrant);
  }
  function bikeRack(x, y, z, ry = 0) {
    for (let i = -1; i <= 1; i++) { const p = local(V(i * 0.8, 0, 0), x, y, z, ry), g = new THREE.TorusGeometry(0.42, 0.025, 6, 14, PI); g.rotateY(PI / 2); add(place(g, p.x, p.y + 0.4, p.z, ry), MAT.metal, false);
      for (const s of [-1, 1]) { const q = local(V(i * 0.8, 0, s * 0.42), x, y, z, ry); cyl(q.x, q.y, q.z, 0.025, 0.025, 0.4, MAT.metal, 6); } }
  }
  function seat(x, y, z, ry = 0) {            // a slatted street bench with a back (scenery, not for grinding)
    for (let i = 0; i < 4; i++) { const p = local(V(0, 0, -0.18 + i * 0.12), x, y, z, ry); box(p.x, y + 0.42, p.z, 1.9, 0.035, 0.1, MAT.planks, { ry, ...off }); }
    for (let i = 0; i < 3; i++) { const p = local(V(0, 0, -0.27 - i * 0.02), x, y, z, ry); box(p.x, y + 0.55 + i * 0.13, p.z, 1.9, 0.1, 0.03, MAT.planks, { ry, ...off }); }
    for (const s of [-0.8, 0.8]) { const p = local(V(s, 0, 0), x, y, z, ry); box(p.x, y, p.z, 0.05, 0.42, 0.42, MAT.darkMetal, { ry, ...off });
      const q = local(V(s, 0, -0.29), x, y, z, ry); box(q.x, y + 0.42, q.z, 0.05, 0.5, 0.04, MAT.darkMetal, { ry, ...off }); }
  }
  function signPost(x, y, z, ry, sign, h = 3.1) { cyl(x, y, z, 0.035, 0.035, h, MAT.plate, 8); for (const r of [ry, ry + PI]) { const p = local(V(0, 0, 0.04), x, y, z, r); plate(p.x, y + h - 0.2, p.z, 1.1, 0.28, r, MAT.sign, sign); } }
  function shelter(x, y, z, ry) {
    for (const [sx, sz] of [[-1.9, -0.6], [1.9, -0.6], [-1.9, 0.6], [1.9, 0.6]]) { const p = local(V(sx, 0, sz), x, y, z, ry); cyl(p.x, y, p.z, 0.04, 0.04, 2.5, MAT.darkMetal, 8); }
    box(x, y + 2.5, z, 4.2, 0.08, 1.7, MAT.darkMetal, { ry, ...off });
    const b = local(V(0, 0, -0.6), x, y, z, ry); box(b.x, y + 0.35, b.z, 3.8, 1.9, 0.03, MAT.glass, { ry, ...off });
    const s = local(V(0, 0, -0.56), x, y, z, ry); plate(s.x, y + 2.25, s.z, 1.9, 0.48, ry, MAT.sign, 14);
    const q = local(V(0, 0, -0.3), x, y, z, ry); box(q.x, y + 0.42, q.z, 3, 0.05, 0.35, MAT.planks, { ry, ...off });
  }

  // ── buildings: a glass core behind real piers and bands, so windows sit back in shadow ──
  let shop = 0;
  function building(cx, cz, w, d, floors, kind, face, far, y0 = 0) {
    const wall = (far ? MAT.farWalls : MAT.walls)[kind], glass = MAT.windows;
    const bay = [3, 3.2, 3.6, 3, 2.8, 4, 3, 3.2, 2.9, 3.4][kind] * (far ? 1.3 : 1), pier = [0.95, 1, 0.5, 1.25, 1.1, 0.4, 0.9, 1, 0.8, 0.6][kind], sp = [1.3, 1.2, 0.85, 1.4, 1.3, 0.75, 1.2, 1.3, 1.1, 0.9][kind];
    const fh = 3.4, gh = y0 > 0 ? fh : 4.4, h = gh + floors * fh, dp = 0.45;
    const box = (x, y, z, ...r) => kit.box(x, y + y0, z, ...r);
    if (far) {      // a distant tower: one box wearing a whole-facade photo, a stone cornice and parapet, plant on the roof
      const F = MAT.facades[kind % MAT.facades.length], S = F.userData.S, fl = Math.round(S / 3.4), tg = boxGeo(w, h, d, S), tu = tg.attributes.uv;
      const ou = rnd(), ov = Math.floor(rnd() * fl) / fl;
      for (let i = 0; i < tu.count; i++) tu.setXY(i, tu.getX(i) + ou, tu.getY(i) + ov);
      add(place(tg, cx, y0 + h / 2, cz), F, false);
      box(cx, h - 0.1, cz, w + 0.5, 0.4, d + 0.5, MAT.farTrim, off);
      box(cx, h + 0.3, cz, w - 0.1, 0.8, d - 0.1, MAT.farTrim, off);
      box(cx, h + 1.1, cz, w + 0.12, 0.14, d + 0.12, MAT.farTrim, off);
      if (y0 === 0) box(cx, 0, cz, w + 0.3, 1.1, d + 0.3, MAT.farTrim, off);              // a stone plinth at the street
      const top = y0 + h + 1.24;
      if (floors > 10 && rnd() < 0.7 && w > 10) building(cx, cz, w * (0.62 + rnd() * 0.15), d * (0.62 + rnd() * 0.15), 2 + Math.floor(rnd() * Math.min(10, floors * 0.4)), kind, null, true, top);
      else {
        for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) kit.box(cx + (rnd() - 0.5) * w * 0.5, top, cz + (rnd() - 0.5) * d * 0.5, 2 + rnd() * w * 0.3, 1.5 + rnd() * 3, 2 + rnd() * d * 0.3, MAT.farRoof, off);
        if (floors > 22 && rnd() < 0.5) tube(V(cx, top, cz), V(cx, top + 8 + rnd() * 14, cz), 0.25, 0.08, MAT.darkMetal);
      }
      return;
    }
    const nx = Math.max(1, Math.round(w / bay)), nz = Math.max(1, Math.round(d / bay));
    const g = boxGeo(w - 0.8, h, d - 0.8, 1), uv = g.attributes.uv, ro = Math.floor(rnd() * 8) / 8, rv = Math.floor(rnd() * 8) / 8;
    for (let i = 0; i < uv.count; i++) {       // one window picture per bay per floor
      const cw = Math.floor(i / 6) < 2 ? (d - 0.8) / nz : (w - 0.8) / nx;
      uv.setXY(i, uv.getX(i) / (cw * 8) + ro, (uv.getY(i) - gh) / (fh * 8) + rv);
    }
    add(place(g, cx, y0 + h / 2, cz), glass, false);
    const B = (x, y, z, bw, bh, bd) => box(x, y, z, bw, bh, bd, wall, off);
    for (let i = 0; i <= nx; i++) { const px = cx - w / 2 + pier / 2 + i * (w - pier) / nx; for (const s of [-1, 1]) B(px, 0, cz + s * (d / 2 - dp / 2), pier, h, dp); }
    for (let i = 1; i < nz; i++) { const pz = cz - d / 2 + pier / 2 + i * (d - pier) / nz; for (const s of [-1, 1]) B(cx + s * (w / 2 - dp / 2), 0, pz, dp, h, pier); }
    for (let f = 0; f <= floors; f++) {        // the band under each row of windows, then the parapet
      const topB = f === floors, y = topB ? h - 0.3 : gh + f * fh - (f ? 0 : 0.7), bh = topB ? 1.3 : sp + (f ? 0 : 0.7), out = topB ? 0.14 : -0.06;
      for (const s of [-1, 1]) { B(cx, y, cz + s * (d / 2 - dp / 2 + out), w + out * 2, bh, dp); B(cx + s * (w / 2 - dp / 2 + out), y, cz, dp, bh, d + out * 2); }
    }
    // a stone cornice under the parapet and a coping along its top (rings, so the roof stays open)
    const ring = (y, hh, o, t) => { for (const s of [-1, 1]) { box(cx, y, cz + s * (d / 2 + o - t / 2), w + 2 * o, hh, t, MAT.trim, off); box(cx + s * (w / 2 + o - t / 2), y, cz, t, hh, d + 2 * o - 2 * t, MAT.trim, off); } };
    if (kind !== 2 && kind !== 5) { ring(h - 0.55, 0.26, 0.4, 0.9); ring(h + 1.0, 0.1, 0.2, 0.55); }
    box(cx, h - 0.25, cz, w - 0.7, 0.25, d - 0.7, far ? MAT.farRoof : MAT.roof, off);
    // setbacks: towers step in near the top, low blocks sometimes carry a smaller block set back from the street
    const kn = (kind + 1 + Math.floor(rnd() * 3)) % MAT.walls.length;
    if (y0 === 0 && floors >= 3 && rnd() < 0.55 && w > 12) {
      const back = face ? 0.22 : 0, bw = w * (0.5 + rnd() * 0.2), bd = d * 0.55;
      building(cx - (face ? face[0] : 0) * d * back, cz - (face ? face[1] : 0) * d * back, bw, bd, 1 + Math.floor(rnd() * 3), kn, null, false, h);
    } else {
      for (let i = 0; i < 2; i++) box(cx + (rnd() - 0.5) * (w - 5), h, cz + (rnd() - 0.5) * (d - 5), 1.5 + rnd() * 2, 1 + rnd() * 1.2, 1.5 + rnd() * 2, MAT.plate, off);
      if (rnd() < 0.5) {                                 // a timber water tank on legs
        const tx = cx + (rnd() - 0.5) * (w - 6), tz = cz + (rnd() - 0.5) * (d - 6), ty = y0 + h;
        for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tube(V(tx + ax * 1.1, ty, tz + az * 1.1), V(tx + ax * 1.1, ty + 2, tz + az * 1.1), 0.07, 0.07, MAT.darkMetal);
        add(place(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 16), tx, ty + 3.3, tz), MAT.planks, false);
        add(place(new THREE.ConeGeometry(1.75, 1.1, 16), tx, ty + 5.15, tz), MAT.darkMetal, false);
      }
    }
    if (!face) return;
    // street level: a shop sign and awnings on the side facing the plaza
    const [fx, fz] = face, ry = Math.atan2(fx, fz), alongX = fz !== 0, n = alongX ? nx : nz, len = alongX ? w : d, half = (alongX ? d : w) / 2;
    const at = (t, out, y) => alongX ? [cx - len / 2 + t * len, y, cz + fz * (half + out)] : [cx + fx * (half + out), y, cz - len / 2 + t * len];
    const sw = Math.min(5.2, len - 2.5); plate(...at(0.5, 0.04, gh + 0.25), sw, sw / 4, ry, MAT.sign, shop++ % 12);
    const aw = MAT.awnings[Math.floor(rnd() * 4)];
    for (let i = 0; i < n; i++) if (rnd() < 0.6) {
      const t = (pier / 2 + (i + 0.5) * (len - pier) / n) / len, ag = new THREE.BoxGeometry((len - pier) / n - pier - 0.1, 0.05, 1.3); ag.rotateX(0.4); ag.translate(0, 0, 0.6);
      add(place(ag, ...at(t, 0, gh - 1.05), ry), aw, false);
    }
  }
  // a row of buildings shoulder to shoulder. along = 'x' or 'z'; front = where the fronts line up; dir = which way they extend back.
  function row(a0, a1, front, dir, along, far = false) {
    for (let a = a0; a < a1 - 6;) {
      let w = 11 + rnd() * 11; if (a1 - a - w < 9) w = a1 - a;
      const d = 14 + rnd() * 8, floors = far ? 9 + Math.floor(rnd() * rnd() * 26) : 2 + Math.floor(rnd() * 5), c = a + w / 2, m = front + dir * d / 2, k = Math.floor(rnd() * MAT.walls.length);
      const kk = far && rnd() < 0.75 ? k % 6 : k;          // most far towers stay brick, stone and glass; painted walls are mostly street level
      if (along === 'x') building(c, m, w - 0.04, d, floors, kk, far ? null : [0, -dir], far); else building(m, c, d, w - 0.04, floors, kk, far ? null : [-dir, 0], far);
      if (!far && rnd() < 0.35) { const fw = along === 'x' ? [c, front + dir * 0.6] : [front + dir * 0.6, c];   // a painted mural on some fronts
        kit.mural && kit.mural(fw[0] - (along === 'x' ? 0 : dir * 0.62), 4.4 + 3.4 * 0.5 + 2, fw[1] - (along === 'x' ? dir * 0.62 : 0), Math.min(w - 4, 9), Math.min(w - 4, 9) / 2, along === 'x' ? (dir > 0 ? PI : 0) : (dir > 0 ? -PI / 2 : PI / 2), Math.floor(rnd() * 8), MAT.muralFaded); }
      a += w + (far ? 6 + rnd() * 22 : 0);
    }
  }
  // a spray-painted tag on a wall: centre (x,y,z), size w, facing ry (0 = faces +z), which = 0..7
  function tag(x, y, z, w, ry, which) {
    const g = new THREE.PlaneGeometry(w, w), uv = g.attributes.uv, cu = (which % 4) / 4, cv = 1 - ((which >> 2) + 1) / 2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) / 4, cv + uv.getY(i) / 2);
    const n = V(Math.sin(ry), 0, Math.cos(ry)); add(place(g, x + n.x * 0.012, y, z + n.z * 0.012, ry), MAT.tag, false);
  }
  // chain-link fence from a to b (ground points), h tall, posts every ~3 m
  function fence(a, b, h = 2.1) {
    const len = a.distanceTo(b), n = Math.max(1, Math.round(len / 3)), dir = V().subVectors(b, a).normalize(), ry = Math.atan2(dir.x, dir.z) - PI / 2;
    const g = new THREE.PlaneGeometry(len, h - 0.08), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.42, uv.getY(i) * (h - 0.08) / 0.42);
    const m = V().addVectors(a, b).multiplyScalar(0.5); add(place(g, m.x, m.y + h / 2, m.z, ry), MAT.fence, false);
    for (let i = 0; i <= n; i++) { const p = V().lerpVectors(a, b, i / n); cyl(p.x, p.y, p.z, 0.03, 0.03, h + 0.05, MAT.metal, 8); }
    tube(a.clone().setY(a.y + h), b.clone().setY(b.y + h), 0.022, 0.022, MAT.metal, false, 8);
    tube(a.clone().setY(a.y + 0.1), b.clone().setY(b.y + 0.1), 0.012, 0.012, MAT.metal, false, 6);
  }
  // a tall floodlight mast with four lamps, for the park at night
  function floodlight(x, y, z, ry) {
    cyl(x, y, z, 0.2, 0.12, 11, MAT.darkMetal, 12); cyl(x, y, z, 0.32, 0.32, 0.35, MAT.parkLedge, 12);
    const c = local(V(0, 0, 0.35), x, y, z, ry); box(c.x, y + 10.6, c.z, 1.7, 0.08, 0.08, MAT.darkMetal, { ry, ...off });
    for (let i = 0; i < 4; i++) { const p = local(V(-0.66 + i * 0.44, 0, 0.45), x, y, z, ry);
      const g = new THREE.BoxGeometry(0.36, 0.3, 0.16); g.rotateX(-0.6); add(place(g, p.x, y + 10.9, p.z, ry), MAT.darkMetal, false);
      const l = new THREE.PlaneGeometry(0.3, 0.24); l.rotateX(PI / 2 - 0.6 + PI); add(place(l, p.x, y + 10.82, p.z + 0, ry), MAT.lamp, false); }
  }
  // bleachers: three rows of aluminium planks on a frame
  function bleacher(x, y, z, len, ry) {
    for (let k = 0; k < 3; k++) { const p = local(V(0, 0, -k * 0.7), x, y, z, ry); box(p.x, y + 0.42 + k * 0.42, p.z, len, 0.05, 0.32, MAT.plate, { ry, ...off });
      const f = local(V(0, 0, -k * 0.7 + 0.25), x, y, z, ry); box(f.x, y + 0.08 + k * 0.42, f.z, len, 0.03, 0.22, MAT.plate, { ry, ...off }); }
    for (let i = 0; i <= Math.round(len / 2); i++) { const p = local(V(-len / 2 + i * len / Math.round(len / 2), 0, -0.7), x, y, z, ry); box(p.x, y, p.z, 0.06, 1.3, 1.9, MAT.darkMetal, { ry, ...off }); }
  }
  // parked cars: four body styles, built in cars.js (one InstancedMesh per style and material). list = [[x, y, z, ry], ...]
  function cars(list) { for (const o of buildCars(list, rnd)) kit.extra(o); }
  // a traffic signal on a corner: pole, mast arm out over the road (toward ry), a head with one lamp lit
  function signal(x, y, z, ry, go = false) {
    cyl(x, y, z, 0.13, 0.1, 0.4, MAT.darkMetal); cyl(x, y, z, 0.09, 0.08, 5.6, MAT.darkMetal, 10);
    const tip = local(V(0, 5.4, 4.2), x, y, z, ry); tube(V(x, y + 5.4, z), tip, 0.06, 0.04, MAT.darkMetal);
    for (const t of [0.55, 1]) { const p = local(V(0, 5.4, 4.2 * t), x, y, z, ry);
      box(p.x, p.y - 1.05, p.z, 0.34, 1.0, 0.26, MAT.darkMetal, { ry, ...off });
      const nx = Math.cos(ry) * 0.135, nz = -Math.sin(ry) * 0.135;   // the lamps face along the road
      [[0.32, !go, MAT.signalRed], [0, false, null], [-0.32, go, MAT.signalGreen]].forEach(([dy, on, lit]) => { const g = new THREE.CircleGeometry(0.1, 14); g.rotateY(ry + PI / 2);
        add(place(g, p.x + nx, p.y - 0.55 + dy, p.z + nz), on ? lit : MAT.signalOff, false); }); }
    const b = local(V(0, 0, 0.12), x, y, z, ry); box(b.x, y + 1.1, b.z, 0.22, 0.3, 0.12, MAT.darkMetal, { ry, ...off });   // push-button box
  }
  // zebra crossing: stripes across a road. centre (x,z), road width w, stripes run along dir 'x' or 'z'
  function crossing(x, y, z, w, along) {
    for (let i = -Math.floor(w / 1.2) / 2; i <= Math.floor(w / 1.2) / 2; i++) decal(along === 'x' ? x : x + i * 1.2, y, along === 'x' ? z + i * 1.2 : z, along === 'x' ? 3 : 0.55, along === 'x' ? 0.55 : 3, MAT.paint, { tile: 1.3 });
  }
  // the far city: hazy blocks out to the horizon, so the park sits inside a city instead of at its edge.
  // A downtown cluster rises to the north-east. All one draw call per facade, no shadows.
  function skyline(r0 = 300, r1 = 760, n = document.documentElement.dataset.quality === 'low' ? 80 : 280) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * PI * 2, r = r0 + Math.sqrt(rnd()) * (r1 - r0), dn = Math.max(0, Math.cos(a - 0.9));
      const h = 16 + rnd() * rnd() * 60 + dn * dn * dn * rnd() * 150, w = 16 + rnd() * 26, d = 16 + rnd() * 26;
      const F = MAT.facades[Math.floor(rnd() * MAT.facades.length)], S = F.userData.S, g = boxGeo(w, h, d, S), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const uv = g.attributes.uv, ou = rnd(); for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) + ou);
      add(place(g, x, -0.6 + h / 2, z), F, false);
      box(x, h - 0.6, z, w + 0.4, 0.7, d + 0.4, MAT.farTrim, off);
      if (h > 60 && rnd() < 0.6) box(x, h, z, w * 0.6, 3 + rnd() * 5, d * 0.6, MAT.farRoof, off);
    }
  }
  return propsFor(kit, { cyl, lamp, bin, bollard, hydrant, bikeRack, seat, signPost, shelter, building, row, tag, fence, floodlight, bleacher, cars, skyline, signal, crossing });
}

function city(kit) {
  const { box, tree, decal, add } = kit, PI = Math.PI, off = { collide: false };
  const { lamp, bin, bollard, hydrant, bikeRack, seat, signPost, shelter, row, skyline } = cityKit(kit);
  // ── inside the plaza: caps on the walls, lights, bins, drains, stains, cracks, paint ──
  box(0, 1.2, -36.5, 94.2, 0.09, 1.16, MAT.smooth, off); box(0, 2.6, 36.5, 94.2, 0.09, 1.16, MAT.smooth, off);
  box(-47, 1.2, 0, 1.16, 0.09, 74.2, MAT.smooth, off); box(47, 1.2, 0, 1.16, 0.09, 74.2, MAT.smooth, off);
  for (const x of [-36, -12, 12, 36]) { lamp(x, 0, -35.5, 0); lamp(x, 1.2, 35.5, PI); }
  bin(-25, 0, -35.4); bin(30, 0, -35.4); bin(6, 1.2, 35.4); bin(-44, 1.2, 33);
  seat(-18, 0, -35.3, 0); seat(18.5, 0, -35.3, 0); seat(-9, 1.2, 35.3, PI); seat(27, 1.2, 35.3, PI);
  box(40.5, 0, -35.5, 1.1, 1.5, 0.5, MAT.plate, off); signPost(-45.6, 0, -34.6, PI / 4, 15, 2.4);
  decal(0, 0, -35.75, 88, 0.22, MAT.grate, { tile: 0.22 });           // long drain channel by the wall
  for (const [x, z] of [[-20, -18], [20, -18], [0, 4], [-35, 5], [35, 5], [-10, 21], [12, 21]]) decal(x, z > 15 ? 1.2 : 0, z, 0.5, 0.5, MAT.grate);
  for (let i = 0; i < 70; i++) {
    const deck = i % 5 === 0, x = (rnd() - 0.5) * 88, z = deck ? 17 + rnd() * 17 : -34 + rnd() * 43, s = 2.5 + rnd() * 6;
    decal(x, deck ? 1.2 : 0, z, s, s * (0.6 + rnd() * 0.6), MAT.stain, { ry: rnd() * 6.28, cell: [i % 4, 2] });
    if (i % 3 === 0) decal((rnd() - 0.5) * 86, deck ? 1.2 : 0, deck ? 17 + rnd() * 17 : -34 + rnd() * 43, 3 + rnd() * 3, 3 + rnd() * 3, MAT.crack, { ry: rnd() * 6.28, cell: [i % 4, 2] });
  }
  for (let k = 0; k <= 5; k++) decal(0, 1.2 - 0.2 * k, 15 - 0.45 * k - 0.04, 8, 0.055, MAT.paintYellow, { tile: 1 });   // stair edges
  kit.weedLine(V(-46, 0, -35.95), V(46, 0, -35.95), 80, 0.2); kit.weedLine(V(-46.45, 0, -35), V(-46.45, 0, 14), 40, 0.2); kit.weedLine(V(46.45, 0, -35), V(46.45, 0, 14), 40, 0.2);
  kit.weedLine(V(-46, 1.2, 35.95), V(46, 1.2, 35.95), 60, 0.2);
  // a faded old ball-court, half scuffed away
  const P = (x, z, w, d) => decal(x, 0, z, w, d, MAT.paint, { tile: 1.3 });
  P(27, -17.5, 18, 0.09); P(27, -31.5, 18, 0.09); P(18, -24.5, 0.09, 14); P(36, -24.5, 0.09, 14); P(27, -24.5, 0.09, 14);
  { const g = new THREE.RingGeometry(1.75, 1.84, 40); g.rotateX(-PI / 2); add(place(g, 27, 0.006, -24.5), MAT.paint, false); }

  // ── pavement, kerbs and the road around the block ──
  box(0, -1.03, 0, 4000, 1, 4000, MAT.ground, off);
  for (const s of [-1, 1]) {
    box(0, -0.02, s * 40, 107, 0.15, 6, MAT.paving); box(s * 50.5, -0.02, 0, 6, 0.15, 74, MAT.paving);          // around the plaza
    box(0, 0.0, s * 43.1, 107.4, 0.14, 0.2, MAT.smooth, off); box(s * 53.6, 0.0, 0, 0.2, 0.14, 86, MAT.smooth, off);
    box(0, -0.02, s * 57.5, 107, 0.15, 5, MAT.paving, off); box(s * 68, -0.02, 0, 5, 0.15, 110, MAT.paving, off); // far side of the road
    for (const t of [-1, 1]) box(s * 85.5, -0.02, t * 80, 40, 0.15, 50, MAT.paving, off);
    for (let x = -36; x <= 36; x += 9) decal(x, -0.02, s * 49, 3, 0.12, MAT.paint, { tile: 1.3 });                 // lane dashes
    for (let z = -50; z <= 50; z += 9) decal(s * 59.5, -0.02, z, 0.12, 3, MAT.paint, { tile: 1.3 });
    for (let x = -50; x <= 50; x += 5.6) decal(x, -0.02, s * 44.4, 0.1, 2.2, MAT.paint, { tile: 1.3 });            // parking bays
    for (let i = 0; i < 8; i++) { decal(s * 44 + i * 0.9 - 3.2, -0.02, s * 49, 0.45, 11, MAT.paint, { tile: 1.3 }); decal(-38 + rnd() * 76, -0.02, s * (45 + rnd()), 1.2, 1.6, MAT.stain, { cell: [i % 4, 2] }); }
    for (const x of [-45, -27, -9, 9, 27, 45]) lamp(x, 0.13, s * 42.2, s > 0 ? 0 : PI);
    for (const z of [-27, -9, 9, 27]) { lamp(s * 52.7, 0.13, z, s > 0 ? PI / 2 : -PI / 2); tree(s * 51.5, 0.13, z + 9 * 0.5, 1.2 + rnd() * 0.4); }
    for (const x of [-40, -20, 0, 20, 40]) tree(x, 0.13, s * 58, 1.25 + rnd() * 0.5);
    for (let i = 0; i < 5; i++) bollard(s * (40 + i * 1.6), 0.13, s * 42.6);
    decal(s * 22, -0.02, s * 51, 0.9, 0.9, MAT.grate); hydrant(s * 33, 0.13, s * 42.3); bin(s * -15, 0.13, s * 41.6); bikeRack(s * 8, 0.13, s * 41.5);
    signPost(s * 52.6, 0.13, s * 42.2, 0, 12); signPost(s * 52.9, 0.13, s * 41.9, PI / 2, 13);
  }
  shelter(-30, 0.13, -40.2, PI); seat(31, 0.13, 40.6, 0); seat(-5, 0.13, -40.9, PI);

  for (const s of [-1, 1]) {
    row(-53.5, 53.5, s * 60, s, 'x'); row(-55, 55, s * 70.5, s, 'z');
    row(-108, -65.5, s * 60, s, 'x'); row(65.5, 108, s * 60, s, 'x');
    row(-190, 190, s * 118, s, 'x', true); row(-112, 112, s * 150, s, 'z', true); row(-230, 230, s * 175, s, 'x', true);
  }
  skyline();
}
