// ─────────────────────────────────────────────────────────────────────
//  THE SKATEPARK. Meters. x = left/right, z = forward/back, y = up.
//  An original concrete park: bowls and transition up north, a stepped
//  street section with three stair sets down south, a sunken plaza in the
//  middle, a raised terrace with a drop-in tower out east, a clear lane between.
//  Every obstacle is one line — copy a line, change the numbers, refresh.
//
//  bowl(x, z, halfLength, halfWidth, cornerRadius, deckHeight, depth(x,z), radius(depth), material)
//  hipBox(x, z, halfLength, halfWidth, cornerRadius, height, radius, material)   (halfWidth 0 = spine)
//  quarter(x, z, width, direction, material, { R: curve radius, maxDeg: how vertical, deck, y0: start height })
//  stairs(x, zTop, width, steps, rise, tread, +1/-1 which way down, material, { yb: bottom height })
//  hubba(x, zTop, yTop, zBottom, yBottom, width, material, bottom height)
//  rail(from, to, posts, radius, material)   box(x, y, z, w, h, d, material, { grind: 'x'|'z', edge: painted steel })
//  wedge(x, z, width, length, height, direction, material, startHeight)
//  mural(x, y, z, width, height, facing, which 0-7)
//
//  COLOURS: MAT.deckOf('teal') flat concrete, MAT.transOf(..) ramps, MAT.ledgeOf(..) ledges,
//  MAT.steelOf(..) painted coping and edges. Names: teal terracotta sand charcoal blue ochre
//  coral sage cream red navy mint lilac (or any '#rrggbb').
// ─────────────────────────────────────────────────────────────────────
const rnd = (k) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
export function skatepark(kit, ck) {
  const { box, wedge, quarter, rail, tree, decal, bowl, hipBox, stairs, hubba, slab, mural, MAT, PI, V } = kit;
  const { lamp, bin, seat, bollard, signPost, row, tag, fence, floodlight, bleacher, cars } = ck;
  const { deckOf: deck, transOf: trans, ledgeOf: ledge, steelOf: steel, bowlOf, tileOf, floorPaint, stripe } = MAT;
  const off = { collide: false };
  const X = 74, Z = 56;                         // the park is 148 m x 112 m
  const rect = (x0, z0, x1, z1) => [V(x0, 0, z0), V(x1, 0, z0), V(x1, 0, z1), V(x0, 0, z1)];

  // ── BOWLS (dug into the deck) ──
  // the big bowl: a deep end with a little vert at the west, stepping up to a shallow end in the east. Pool-blue, cobalt tiles.
  const ease = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return 0.5 - 0.5 * Math.cos(t * PI); };
  const big = bowl(-48, 30, 14, 9, 5.5, 0, (x) => 3.2 - 1.5 * ease(x, -53, -45), (D) => 2.1 + 0.2 * D, bowlOf('#5aa9c4'), { tileMat: tileOf('#1d4fae', '#eef0ea') });
  // a round pocket bowl, mellow and deep enough to carve laps in. Terracotta with sand tiles.
  const pocket = bowl(-54, 4, 6.5, 6.5, 6.5, 0, () => 1.9, () => 2.4, bowlOf('terracotta'), { tileMat: tileOf('ochre', 'cream'), copingMat: steel('navy') });

  // a drain in each bowl floor, and stains where the water sits
  decal(-57, -3.2, 30, 0.55, 0.55, MAT.grate); decal(-56.5, -3.2, 30.5, 5, 3.5, MAT.stain, { ry: 0.4, cell: [2, 2] }); decal(-44, -1.7, 28, 4, 3, MAT.stain, { ry: 1.9, cell: [1, 2] });
  decal(-54, -1.9, 4, 0.5, 0.5, MAT.grate); decal(-54, -1.9, 4, 3.4, 3.4, MAT.stain, { ry: 0.9, cell: [3, 2] });

  // ── THE DECK: natural grey concrete, with pigmented zones poured in (each zone is its own slab, flush) ──
  const zBowl = rect(-X, 14, -30, Z), zStreet = rect(-24, -34, 31, -12), pit = rect(-6, 10, 18, 27);
  slab([V(-X, 0, -Z), V(X, 0, -Z), V(X, 0, Z), V(-X, 0, Z)], 0, MAT.parkDeck, [zBowl, zStreet, pit, pocket]);
  slab(zBowl, 0, deck('sand'), [big]);                     // warm sand round the big bowl
  slab(zStreet, 0, deck('charcoal'));                      // dark street plaza, so the ledges and rails pop

  // ── TRANSITION SECTION ──
  // mini ramp: dark skatelite riding surface, painted blue sides
  quarter(-12, 44, 9, PI / 2, MAT.skatelite, { R: 2.2, maxDeg: 72, deck: 2.2, sideMat: MAT.paintedPly('blue') });
  quarter(-16, 44, 9, -PI / 2, MAT.skatelite, { R: 2.2, maxDeg: 72, deck: 2.2, sideMat: MAT.paintedPly('blue') });
  // spine: two transitions back to back with coping along the top
  hipBox(12, 40, 5, 0, 0, 1.7, 2.2, trans('blue'), { copingMat: steel('ochre') });
  // hip box: a deck 1.3 m up with transitions all round and rolled hips at the corners, ledge on top
  hipBox(32, 22, 4, 2.5, 0.3, 1.3, 1.9, trans('terracotta'), { deckMat: deck('sand'), copingMat: steel('teal') });
  box(32, 1.3, 22, 4.5, 0.4, 0.6, ledge('charcoal'), { grind: 'x', edge: steel('ochre') });
  // big quarter pipes on the east and north edges
  quarter(60, 25, 22, PI / 2, trans('teal'), { R: 3.2, maxDeg: 86, deck: 3, copingMat: steel('red') });
  quarter(40, 46, 16, 0, trans('terracotta'), { R: 2.8, maxDeg: 82, deck: 3, copingMat: steel('ochre') });
  // pump bumps: three concrete rollers in a row, pump them for speed
  [['ochre', -22], ['teal', -15], ['coral', -8]].forEach(([c, x]) => hipBox(x, 1, 0, 3, 0, 0.45, 3.5, trans(c), { coping: false }));
  // double ledges, out in the open middle
  box(40, 0, -1.5, 9, 0.5, 0.9, ledge('red'), { grind: 'x', edge: steel('charcoal') }); box(40, 0, 2.5, 9, 0.3, 0.9, ledge('cream'), { grind: 'x', edge: steel('red') });
  // bank funbox: bank up, flat top with a ledge, bank down
  wedge(-30, 22, 8, 4, 1.2, PI / 2, trans('blue'));
  box(-24, 0, 22, 4, 1.2, 8, deck('cream'));
  wedge(-18, 22, 8, 4, 1.2, -PI / 2, trans('blue'));
  box(-24, 1.2, 25.6, 4, 0.35, 0.5, ledge('terracotta'), { grind: 'x', edge: steel('navy') });
  rail(V(-25.5, 1.55, 18.6), V(-22.5, 1.55, 18.6), [[0.08, 0.35], [0.92, 0.35]], 0.03, MAT.railPaint.blue);

  // ── THE PIT: a sunken plaza 1.4 m down. Stairs in from the south, a bank out to the north,
  //    a quarter up the west side, a bank up the east side, a pad and a rail on the floor. ──
  const PD = -1.4;
  slab(pit, PD, deck('teal'));
  const pitWall = ledge('cream');
  box(6, PD, 9.8, 24.8, 1.38, 0.4, pitWall); box(6, PD, 27.2, 24.8, 1.38, 0.4, pitWall);
  box(-6.2, PD, 18.5, 0.4, 1.38, 17, pitWall); box(18.2, PD, 18.5, 0.4, 1.38, 17, pitWall);
  wedge(6, 22, 24, 5, 1.4, 0, trans('ochre'), PD);                                                    // north bank
  quarter(-6 + 2.0494, 16, 12, -PI / 2, trans('blue'), { R: 2.2, maxDeg: 68.677, deck: 0, fence: false, y0: PD, copingMat: steel('ochre') });   // west quarter
  wedge(13.5, 16, 12, 4.5, 1.4, PI / 2, trans('coral'), PD);                                         // east bank
  const sp = stairs(6, 10, 7, 7, 0.2, 0.4, 1, ledge('cream'), { yb: PD });
  rail(V(6, 0.95, 9.7), V(6, PD + 0.68, 10 + sp.run + 0.25), [[0.03, 0.95 + 0.03], [0.97, 0.7]], 0.032, MAT.railPaint.red);
  hubba(2.15, 10, 0.45, 10 + sp.run, PD + 0.45, 0.7, ledge('charcoal'), PD);
  for (const [x0, x1] of [[-3.95, 2.5], [9.5, 13.5]]) {                                                // the bare south wall: a grindable steel lip
    box((x0 + x1) / 2, -0.07, 10.03, x1 - x0, 0.07, 0.06, steel('ochre'), off);
    kit.seg(V(x0, 0, 10), V(x1, 0, 10));
  }
  mural(-2.3, PD + 0.7, 10, 2.8, 1.4, 0, 6); mural(0.85, PD + 0.7, 10, 2.8, 1.4, 0, 2); mural(11.5, PD + 0.7, 10, 2.8, 1.4, 0, 5);
  box(2, PD, 19.5, 5, 0.3, 2.2, ledge('ochre'), { grind: 'x', edge: steel('charcoal') });            // manual pad on the floor
  rail(V(8, PD + 0.36, 16.5), V(12.5, PD + 0.36, 16.5), [[0.06, null], [0.94, null]], 0.03, MAT.railPaint.yellow);
  decal(8.5, PD, 21, 4.5, 4.5, floorPaint('ochre'), { cell: [2, 2] });

  // ── THE TERRACE: a raised deck 1.5 m up on the east side. A bank and a quarter up from the
  //    west, stairs down the south, ledges along the top, and a drop-in tower at the back. ──
  const TH = 1.5;
  box(65, 0, 0, 18, TH, 24, deck('#d9dde0'));
  wedge(50, -8.5, 7, 6, TH, PI / 2, trans('ochre'));                                                 // bank up
  quarter(56 - 3.0757, 4, 16, PI / 2, trans('teal'), { R: 3.903, maxDeg: 52, deck: 0, fence: false, copingMat: steel('ochre') });   // quarter to the upper level (52°: mellow enough to fly out onto the deck)
  const st = stairs(63, -12, 6, 8, TH / 8, 0.36, -1, ledge('cream'));
  handrail(59.6, -12, st, MAT.railPaint.blue, -1);
  hubba(66.35, -12, TH + 0.45, -12 - st.run, 0.45, 0.7, ledge('charcoal'));
  box(61.5, TH, -6.5, 6, 0.45, 0.7, ledge('terracotta'), { grind: 'x', edge: steel('navy') });     // ledges along the top
  box(69, TH, -10.2, 6, 0.4, 0.7, ledge('charcoal'), { grind: 'x', edge: steel('ochre') });
  box(60.5, TH, -1.2, 4.5, 0.2, 2.6, ledge('cream'), { grind: 'x', edge: steel('teal') });         // manual pad
  // the drop-in tower: a bank up from the terrace, then roll in off the top
  wedge(71, -2, 6, 6, TH, 0, trans('ochre'), TH);
  box(71, TH, 8, 6, TH, 8, deck('terracotta'));
  quarter(68 - 2.598, 8, 8, PI / 2, trans('terracotta'), { R: 3, maxDeg: 60, deck: 0, fence: false, y0: TH, copingMat: steel('teal') });
  for (const [a, b] of [[V(73.85, 3, 4.2), V(73.85, 3, 11.85)], [V(68.2, 3, 11.85), V(73.85, 3, 11.85)]]) {
    for (const t of [0, 0.5, 1]) { const p = V().lerpVectors(a, b, t); kit.tube(p, p.clone().add(V(0, 1.05, 0)), 0.03, 0.03, steel('red')); }
    kit.tube(a.clone().add(V(0, 1.05, 0)), b.clone().add(V(0, 1.05, 0)), 0.03, 0.03, steel('red'));
    if (kit.barrier) kit.barrier(a, b, 1.05);                                    // solid to ride into (colliders.js)
  }
  mural(57.6, TH / 2, -12, 3, TH, PI, 0); mural(69.1, TH / 2, -12, 3, TH, PI, 4); mural(72.25, TH / 2, -12, 3, TH, PI, 7);
  decal(46, 0, -8.5, 4, 4, floorPaint('ochre'), { ry: -PI / 2, cell: [3, 2] });                     // chevrons pointing up the bank
  decal(47.5, 0, 4, 5, 5, floorPaint('coral'), { cell: [0, 2] });

  // ── STREET SECTION: three raised tiers along the south edge, each with a stair set down ──
  const R = 0.19, TR = 0.36;                   // stair rise and tread, metres
  const tier = (x0, x1, H, c) => box((x0 + x1) / 2, 0, -47, x1 - x0, H, 18, deck(c));
  function handrail(x, zTop, st, mat, dir = 1, over = 0.8) {
    const y0 = st.H + over + 0.3 * st.slope, y1 = over - 0.25 * st.slope;
    rail(V(x, y0, zTop - dir * 0.3), V(x, y1, zTop + dir * (st.run + 0.25)), [[0.03, y0 - 0.06 * st.slope - st.H], [0.97, y1 + 0.02]], 0.032, mat);
  }
  const sideHubba = (x, zTop, st, w = 0.7, c = 'charcoal') => hubba(x, zTop, st.H + 0.45, zTop + st.run, 0.45, w, ledge(c));
  // 5 stairs: centre handrail, hubbas both sides
  tier(-40, -5, 5 * R, 'terracotta');
  const s5 = stairs(-22, -38, 5, 5, R, TR, 1, MAT.parkLedge);
  handrail(-22, -38, s5, MAT.railPaint.yellow); sideHubba(-25.35, -38, s5); sideHubba(-18.65, -38, s5);
  // 8 stairs: handrail on the west, hubba on the east
  tier(-5, 28, 8 * R, 'sand');
  const s8 = stairs(10, -38, 6, 8, R, TR, 1, MAT.parkLedge);
  handrail(7.3, -38, s8, MAT.railPaint.red); sideHubba(13.35, -38, s8, 0.7, 'terracotta');
  // 12 stairs: handrails both sides, hubba beside
  tier(28, 62, 12 * R, 'charcoal');
  const s12 = stairs(44, -38, 7, 12, R, TR, 1, MAT.parkLedge);
  handrail(40.8, -38, s12, MAT.railPaint.yellow); handrail(47.2, -38, s12, MAT.railPaint.yellow); sideHubba(47.85 + 0.35, -38, s12, 0.7, 'cream');
  // ways up: a bank to the first tier, small banks between tiers, a long bank up to the top one
  wedge(-34, -30, 6, 8, 5 * R, PI, trans('terracotta'));
  wedge(-9, -47, 6, 4, 3 * R, PI / 2, trans('sand'), 5 * R);
  wedge(24, -47, 6, 4, 4 * R, PI / 2, trans('charcoal'), 8 * R);
  wedge(68, -47, 8, 6, 12 * R, -PI / 2, trans('charcoal'));
  // ledges up on the tiers
  box(-30, 5 * R, -46, 7, 0.45, 0.7, ledge('cream'), { grind: 'x', edge: steel('teal') });
  box(12, 8 * R, -48, 8, 0.42, 0.6, MAT.wood, { grind: 'x' });
  box(48, 12 * R, -48, 9, 0.45, 0.8, ledge('red'), { grind: 'x', edge: steel('cream') });
  // a mural wall along the back of the top tier
  box(45, 12 * R, -55.85, 30, 3, 0.3, ledge('cream')); for (const [x, w] of [[35, 3], [45, 1], [55, 7]]) mural(x, 12 * R + 1.5, -55.69, 9.6, 2.9, 0, w);

  // ── FLAT GROUND STREET STUFF (on the dark street plaza) ──
  rail(V(6, 0.38, -22), V(12, 0.38, -22), [[0.04, null], [0.5, null], [0.96, null]], 0.03, MAT.railPaint.black);   // flat bar
  box(-6, 0, -28, 9, 0.45, 0.8, ledge('coral'), { grind: 'x', edge: steel('charcoal') });         // long ledge
  box(-18, 0, -22, 6, 0.2, 3.2, ledge('ochre'), { grind: 'x', edge: steel('charcoal') });         // manual pad
  rail(V(22, 0.32, -27), V(30, 0.32, -20), [[0.04, null], [0.5, null], [0.96, null]], 0.03, MAT.railPaint.red);   // angled round rail
  // kicker over a planter to a landing bank
  quarter(33, -24, 3, PI / 2, MAT.rampPly, { R: 3, maxDeg: 30, deck: 0, fence: false, coping: false, sideMat: MAT.paintedPly('red') });
  box(38.3, 0, -24, 2, 0.5, 3.2, MAT.brick);
  wedge(44, -24, 3.2, 4, 0.5, -PI / 2, trans('teal'));
  box(54, 0, -20, 10, 0.3, 0.5, ledge('red'), { grind: 'x', edge: steel('cream') });              // curb
  box(-34, 0, -20, 5, 0.5, 2.2, MAT.brick); tree(-34, 0.5, -20, 0.9);                             // planter
  // painted floor: lane stripes and a starburst
  for (const [z, c] of [[-12.6, 'teal'], [-12.2, 'ochre']]) decal(10, 0, z, 60, 0.14, stripe(c), { tile: 1.3 });
  decal(18, 0, -5, 5.5, 5.5, floorPaint('coral'), { cell: [1, 2], ry: 0.3 });
  decal(-30, 0, -8, 4, 4, floorPaint('cream'), { cell: [2, 2] });                                 // the start ring

  // big bank up to a raised deck in the south-west corner, ledge along the top, a mural wall to ride
  wedge(-56, -27, 14, 6, 1.6, -PI / 2, trans('sage'));
  box(-67, 0, -27, 10, 1.6, 14, deck('sage'));
  box(-63.6, 1.6, -27, 0.7, 0.45, 10, ledge('cream'), { grind: 'z', edge: steel('terracotta') });
  box(-71.7, 0, -27, 0.6, 3.6, 14, ledge('cream'));
  mural(-71.39, 1.6 + 1.0, -30.5, 7, 2, PI / 2, 1); mural(-71.39, 1.6 + 1.0, -23.5, 7, 2, PI / 2, 0);
  // picnic table and benches in the middle (all skateable)
  box(10, 0, 3.5, 3.2, 0.76, 0.9, MAT.wood, { grind: 'x' }); box(10, 0, 2.3, 3.2, 0.45, 0.35, MAT.wood, { grind: 'x' }); box(10, 0, 4.7, 3.2, 0.45, 0.35, MAT.wood, { grind: 'x' });
  // a kinked rail and a low flat bar out east
  rail(V(56, 0.42, -31), V(60, 0.42, -31), [[0.05, null], [0.95, null]], 0.03, MAT.railPaint.green);
  rail(V(60, 0.42, -31), V(64, 0.9, -31), [[0.95, null]], 0.03, MAT.railPaint.green);
  rail(V(36, 0.3, -9), V(46, 0.3, -9), [[0.04, null], [0.5, null], [0.96, null]], 0.03, MAT.railPaint.yellow);

  // ── MURAL WALLS round the edge (freestanding, solid) ──
  box(-12, 0, 54.5, 16, 4, 0.4, ledge('cream')); mural(-16, 2, 54.29, 8, 4, PI, 4); mural(-8, 2, 54.29, 8, 4, PI, 3);
  box(72.5, 0, 25, 0.4, 4.5, 18, ledge('cream')); mural(72.29, 2.25, 20.5, 9, 4.5, -PI / 2, 5); mural(72.29, 2.25, 29.5, 9, 4.5, -PI / 2, 2);

  // ── EDGES AND DRESSING (scenery only) ──
  for (const s of [-1, 1]) {
    box(0, 0, s * (Z + 0.5), 2 * X + 2, 0.7, 1, ledge('cream')); box(s * (X + 0.5), 0, 0, 1, 0.7, 2 * Z + 2, ledge('cream'));
    for (let x0 = -60; x0 <= 60; x0 += 20) { const x = s < 0 && x0 === -40 ? -38 : x0;   // (off the tier's corner, so the base sits on the deck)
      const y = s > 0 ? 0 : x >= 28 && x < 62 ? 12 * R : x >= -5 && x < 28 ? 8 * R : x >= -40 && x < -5 ? 5 * R : 0; lamp(x, y, s * (Z - 0.6), s > 0 ? PI : 0); }
    for (let z = -40; z <= 40; z += 20) { lamp(s * (X - 0.6), s > 0 && Math.abs(z) <= 12 ? TH : 0, z, s > 0 ? -PI / 2 : PI / 2); }
  }
  for (const [x, z] of [[0, 7], [20, 7], [-12, 9], [28, 10], [-40, -14], [50, 16]]) { box(x, 0, z, 2.2, 0.45, 2.2, MAT.brick); tree(x, 0.45, z); }
  seat(-2, 0, 54.6, PI); seat(24, 0, 54.6, PI); bin(4, 0, 54.8); bin(-38, 0, -12);
  for (const [x, z] of [[-20, -30], [5, -24], [26, -24], [30, 5], [-36, 10], [52, 40]]) decal(x, 0, z, 3 + (x % 3), 2.5, MAT.stain, { ry: x * 0.7, cell: [Math.abs(x) % 4, 2] });
  for (const [x, z] of [[-8, -16], [24, 30], [44, -6], [-40, 48]]) decal(x, 0, z, 4, 4, MAT.crack, { ry: z, cell: [Math.abs(z) % 4, 2] });
  // weeds: at the foot of the edge walls, in the cracks, round the planters (scenery, kit.weeds / kit.weedLine)
  kit.weedLine(V(-X + 0.6, 0, Z - 0.05), V(X - 0.6, 0, Z - 0.05), 120, 0.25);
  for (const s of [-1, 1]) kit.weedLine(V(s * (X - 0.05), 0, -Z + 0.6), V(s * (X - 0.05), 0, Z - 0.6), 90, 0.25);
  kit.weedLine(V(-X + 0.6, 0, -Z + 0.05), V(-41, 0, -Z + 0.05), 30, 0.25); kit.weedLine(V(63, 0, -Z + 0.05), V(X - 0.6, 0, -Z + 0.05), 12, 0.25);
  for (const [x, z] of [[-8, -16], [24, 30], [44, -6], [-40, 48], [-20, -30], [5, -24], [30, 5], [-36, 10]]) for (let i = 0; i < 5; i++) kit.weeds(x + (rnd(x + i) - 0.5) * 3, 0, z + (rnd(z + i * 3) - 0.5) * 3, 0.4 + rnd(i + x * z) * 0.4);
  kit.weedLine(V(-20, 0, 54.15), V(-4, 0, 54.15), 20); kit.weedLine(V(72.15, 0, 16.5), V(72.15, 0, 33.5), 20); kit.weedLine(V(-71.2, 1.6, -33.5), V(-71.2, 1.6, -20.5), 14);

  // ── round the park: a fence, grass verges with trees, then sidewalks, kerbs and streets with parked cars ──
  for (const s of [-1, 1]) {
    fence(V(-X, 0.7, s * (Z + 0.5)), V(-4, 0.7, s * (Z + 0.5))); fence(V(4, 0.7, s * (Z + 0.5)), V(X, 0.7, s * (Z + 0.5)));
    fence(V(s * (X + 0.5), 0.7, -Z), V(s * (X + 0.5), 0.7, -4)); fence(V(s * (X + 0.5), 0.7, 4), V(s * (X + 0.5), 0.7, Z));
    floodlight(s * (X - 2), 0, Z - 2, s > 0 ? -3 * PI / 4 : 3 * PI / 4); floodlight(s * (X - 2), s > 0 ? 0 : 0, -Z + 2, s > 0 ? -PI / 4 : PI / 4);
    // grass verge, sidewalk, kerb, road, kerb, sidewalk up to the shop fronts (each strip a hair apart in height so none flicker)
    box(0, -1.02, s * (Z + 7.25), 2 * X + 28, 1, 13.5, MAT.grass, off); box(s * (X + 7.25), -1.021, 0, 13.5, 1, 2 * Z + 1, MAT.grass, off);
    box(0, -0.9, s * (Z + 16), 2 * X + 36, 1, 4, MAT.paving, off); box(s * (X + 16), -0.901, 0, 4, 1, 2 * Z + 28, MAT.paving, off);
    box(0, -1.04, s * (Z + 25), 2 * X + 84, 1, 14, MAT.asphalt, off); box(s * (X + 25), -1.041, 0, 14, 1, 2 * Z + 36, MAT.asphalt, off);
    box(0, -0.9, s * (Z + 37), 2 * X + 84, 1, 10, MAT.paving, off); box(s * (X + 37), -0.901, 0, 10, 1, 2 * Z + 64, MAT.paving, off);
    for (const k of [18.05, 31.95]) { box(0, -0.06, s * (Z + k), 2 * X + (k < 20 ? 36 : 84), 0.17, 0.12, MAT.smooth, off); box(s * (X + k), -0.061, 0, 0.12, 0.17, 2 * Z + (k < 20 ? 28 : 64), MAT.smooth, off); }
    for (let x = -X - 30; x <= X + 30; x += 9) decal(x, -0.04, s * (Z + 25), 3, 0.13, MAT.paint, { tile: 1.3 });
    for (let z = -Z - 10; z <= Z + 10; z += 9) decal(s * (X + 25), -0.041, z, 0.13, 3, MAT.paint, { tile: 1.3 });
    for (let x = -X; x <= X; x += 12) { tree(x + 3, -0.02, s * (Z + 8), 1.1 + ((x * 7) % 5) * 0.08); tree(x + 9, 0.1, s * (Z + 40.5), 1.25 + ((x * 3) % 4) * 0.1); }
    for (let z = -Z + 6; z <= Z; z += 12) tree(s * (X + 8), -0.02, z, 1.15 + ((z * 3) % 5) * 0.08);
    for (let x = -X + 6; x <= X; x += 24) lamp(x, 0.1, s * (Z + 17.4), s > 0 ? 0 : PI);
    for (let z = -Z + 6; z <= Z; z += 24) lamp(s * (X + 17.4), 0.1, z, s > 0 ? PI / 2 : -PI / 2);
    for (let i = 0; i < 6; i++) bollard(s * (6 + i * 1.6), 0.1, s * (Z + 14.6));
    for (const t of [-1, 1]) {                                                         // the four street corners: signals and crossings
      ck.signal(t * (X + 18.6), 0.1, s * (Z + 18.6), s > 0 ? 0 : PI, t > 0);
      ck.crossing(t * (X + 14.5), -0.04, s * (Z + 25), 12, 'x'); ck.crossing(t * (X + 25), -0.041, s * (Z + 14.5), 12, 'z');
    }
  }
  // parked cars along both kerbs (gaps where nobody parked)
  const parked = [];
  for (const s of [-1, 1]) for (const side of [19.3, 30.7]) {
    // nobody parks perfectly: a little slack along the kerb, off it, and in angle
    const j = (k) => [(rnd(k * 1.7) - 0.5) * 0.5, (rnd(k * 2.3 + 1) - 0.5) * 0.16, (rnd(k * 3.1 + 2) - 0.5) * 0.05];
    for (let x = -X - 26; x <= X + 26; x += 6.2) if (rnd(x * s + side) > 0.3) { const [a, b, c] = j(x * s + side); parked.push([x + a, -0.04, s * (Z + side) + b, (side < 25 ? 0 : PI) + c]); }
    for (let z = -Z - 8; z <= Z + 8; z += 6.2) if (rnd(z * s + side + 7) > 0.3) { const [a, b, c] = j(z * s + side + 7); parked.push([s * (X + side) + b, -0.04, z + a, (side < 25 ? -PI / 2 : PI / 2) + c]); }
  }
  cars(parked);
  // inside the park: puddles at the drains, skid marks, benches and bins, bleachers by the bowl, tags on the walls
  decal(-57, -3.2, 30, 2.4, 1.8, MAT.puddle, { ry: 0.3 }); decal(-54, -1.9, 4.3, 1.6, 1.3, MAT.puddle, { ry: 1.1 }); decal(-35.5, 0, -18.5, 2.2, 1.4, MAT.puddle, { ry: 0.5 });
  for (const [x, z, r] of [[-6, -26.6, 0], [-18, -20, 1.4], [52, -18.6, 0.1], [0, -8, 2], [30, 30, 0.7], [-10, 14, 2.6], [18, -12, 1.1], [8, 20, 0.4]]) decal(x, z > 10 && z < 27 && x > -6 && x < 18 ? PD : 0, z, 3.4, 1.8, MAT.skid, { ry: r, tile: 3 });
  bleacher(-48, 0, 41.5, 12, PI); bleacher(-66, 0, 10, 8, -PI / 2);
  for (const [x, z, r] of [[-30, 52.6, PI], [16, 52.6, PI], [70.4, -16, -PI / 2], [-70.4, 30, PI / 2], [36, 12, 0.4]]) seat(x, 0, z, r);
  for (const [x, z] of [[-26, 53], [20, 53], [70.6, -18], [-70.6, 34], [33, 10]]) bin(x, 0, z);
  tag(-33, 0.48, -37.99, 0.85, 0, 0); tag(-12, 0.5, -37.99, 0.8, 0, 3); tag(1, 0.76, -37.99, 1.3, 0, 1); tag(20, 0.78, -37.99, 1.25, 0, 4);
  tag(33, 1.1, -37.99, 1.9, 0, 2); tag(56, 1.1, -37.99, 1.8, 0, 6); tag(-71.39, 0.8, -33.2, 1.2, PI / 2, 5); tag(-71.39, 0.7, -20.8, 1.0, PI / 2, 7);
  tag(-24, 0.62, 17.99, 1.0, PI, 6); tag(-24, 0.62, 26.01, 1.0, 0, 0); tag(-67, 0.8, -34.01, 1.4, PI, 3);
  tag(-19, 0.7, 54.29, 1.3, PI, 2);
  for (const s of [-1, 1]) { box(0, -1.06, s * (Z + 1041), 4000, 1, 2000, MAT.ground, off); box(s * (X + 1041), -1.06, 0, 2000, 1, 2 * Z + 84, MAT.ground, off); }
  signPost(X + 3.4, 0.1, -Z - 14.6, PI / 4, 13, 2.6);
  for (const s of [-1, 1]) {
    row(-118, 118, s * 98, s, 'x'); row(-96, 96, s * 116, s, 'z');
    row(-230, 230, s * 170, s, 'x', true); row(-150, 150, s * 200, s, 'z', true);
  }
  ck.skyline();
  return { pos: V(-30, 0, -8), fwd: V(1, 0, 0) };
}
