// ─────────────────────────────────────────────────────────────────────
//  TWEAKS — the knobs. Change a number, save, refresh the browser.
//  Every value here is safe to play with. Break it on purpose and see.
// ─────────────────────────────────────────────────────────────────────
export const TWEAKS = {
  // The name on the start screen. Yours to pick.
  gameName: 'UNTITLED SKATE GAME',

  // Which park you skate: 'skatepark' (the big concrete park) or 'plaza' (the city square).
  // You can also pick on the start screen, or add ?park=plaza to the address.
  park: 'skatepark',

  // ── How it feels ──
  gravity: 18,          // how hard you get pulled down. Earth is about 10; games use more so jumps feel snappy, not floaty.
  popSpeed: 4.95,       // ollie power. Higher = higher ollies. (4.95 with gravity 18 = a 0.68 m ollie, 0.55 s in the air)
  maxPushSpeed: 8.5,    // top speed from pushing, metres a second (hills and ramps can still take you faster). A strong real pusher: 6-8.
  pushesToMax: 4,       // about how many pushes from a standstill to reach that top speed
  pushTaper: 0.5,       // how much less each push gives as you speed up. 0 = every push the same.
  maxSpeed: 20,         // absolute speed limit
  rollFriction: 0.18,   // how fast you slow down when coasting (the wheels)
  airDrag: 0.004,       // wind resistance: barely there slow, it's what stops you speeding up forever down a hill
  brakePower: 4.5,      // how fast B (dragging your foot) stops you
  turnRate: 2.6,        // how sharply you carve
  turnSpeedFalloff: 0.09, // higher = wider turns when going fast
  carveGrip: 11,        // how hard you can carve at speed before the wheels would let go. Lower = wider turns when bombing. 0 = no limit.
  airSpinRate: 6.5,     // how fast you spin in the air
  grindFriction: 1.5,   // how fast grinds slow down
  slideFriction: 1.35,  // slides (board across the rail: boardslide, lipslide, nose/tailslide) slow you this many times more than grinds
  grindSnap: 0.42,      // how close (meters) you need to be to lock onto a rail
  stepUp: 0.18,         // tallest bump you roll over without an ollie
  powerslidePower: 7,   // how fast a powerslide (left stick pulled back) stops you
  manualSweet: 0.45,    // how far to hold the right stick for a manual (0 = middle, 1 = all the way)
  manualTwitch: 6,      // how fast you tip over when you miss the sweet spot
  pumpPower: 0.16,      // how much speed pumping a ramp gives (push button or left stick forward on a ramp)
  steerResponse: 9,     // how quickly the board answers the stick. Lower = heavier, lazier carves.
  steerHeavy: 0.05,     // how much heavier that gets the faster you go
  carveScrub: 0.035,    // how much speed hard carving costs
  popCrouchTime: 0.3,   // seconds of crouch (stick held back) for a full-height pop
  popMin: 0.86,         // pop from a snap flick with no crouch (1 = popSpeed)
  popMax: 1.08,         // pop from a full crouch
  wobbleSpeed: 13.5,    // bomb a hill faster than this and speed wobbles start. Brake, carve or crouch to calm them.
  crackSpacing: 3,      // metres between the clack-clack of slab joints on concrete. 0 = off.
  grindAssist: 0.9,     // how far (metres) a rail pulls you onto it when you drop toward it
  grindMagnet: 5,       // how strongly it pulls
  grindBalance: 1.8,    // how much the left stick leans you back on a grind
  grindWobble: 1,       // how much a sloppy grind entry tips you (0 = never fall off a rail)
  bodyFlipRate: 7.2,    // how fast front/back flips turn (radians per second; 6.3 = one flip a second)
  revertTime: 0.38,     // seconds a revert takes
  hippieJump: 4.2,      // how high the hippie jump goes
  walkSpeed: 1.7,       // walking speed off the board
  sprintSpeed: 4.6,     // running speed (hold X)
  walkJump: 4,          // jump height off the board (A)

  // ── How forgiving it is ──
  bailWallSpeed: 5.5,   // hit a wall faster than this and you slam
  bailImpact: 14,       // land harder than this (metres a second, straight down) and you slam: about a 5.4 m drop
  bailSidewaysLimit: 0.55, // 0 = land any direction, 1 = must land perfectly straight
  flickDiagonal: 22,    // how many degrees off straight-up a flick must be to count as a kickflip or heelflip
  manualForgive: 0.1,   // how far off the manual sweet spot you can be and still balance
  grabBailOnLand: true, // true = landing while still holding a grab slams you (let go first!)
  cleanLanding: 0.6,    // landing score (0..1) you need for a clean landing; below it is sketchy
  sketchySpeedLoss: 0.8, // a sketchy landing keeps this much of your speed
  sketchyScore: 0.7,    // and this much of the combo's points
  landSideScrub: 0.7,   // land with the board turned off your line and this much of the sideways part of your speed scrubs off
  landImpactScrub: 0.12, // the hardest landing you can ride away from costs this much of your speed

  // ── Camera ──
  cameraView: 'filmer', // which angle you start on: 'filmer', 'follow', 'wide', 'side', 'board' or 'overhead'.
                        // In the game: Back button (or C) swaps angle, d-pad left/right (or [ and ]) zooms.
  cameraDistance: 2.45, // how far behind you the filmer rides (the 'filmer' angle)
  cameraHeight: 0.62,   // low = skate-video filmer feel
  cameraSide: 0.35,     // how far off to one side the filmer rides (0 = dead behind)
  cameraFov: 80,        // how wide the lens is. Bigger = wider and faster-feeling.
  fisheye: 0.5,         // how much the lens bulges, like a skate video. 0 = none, 1 = a lot.
  motionBlur: 1,        // streaky blur when you go fast. 0 = off.
  depthOfField: 1,      // soft blurry background, sharp skater. 0 = everything sharp.
  cameraShake: 1,       // handheld wobble. 0 = perfectly steady.

  // ── Sound ──
  volume: 0.8,          // everything. 0 = silent.
  ambience: 0.5,        // the city in the background (traffic, birds)

  // ── Look ──
  stance: 'regular',    // 'regular' or 'goofy'
  outfit: 'hoodie',     // the whole look: 'hoodie', 'crew', 'tee', 'night' or 'sunday' (they live at the top of skater.js — make your own)
  hoodieColor: '',      // '' = the outfit's colour, or put one in, like '#b3261e', to change just the top
  pantsColor: '',
  beanieColor: '',      // the hat (beanie or cap)
  skinColor: '#c99570',
  shoulderWidth: 0.88,  // how broad his shoulders are (1 = the model as built, broad like a grown man; 0.88 = a lean young skater)
  sleeveFit: 0.8,       // how much slack the sleeves and the top's shoulders have (1 = the chunky knit as built, lower = closer fitting)
  boardColor: '#f2b705', // the graphic on the bottom of the deck
  wheelColor: '#f5f1e6',
  graphicsQuality: 'medium', // 'high', 'medium' or 'low'. Lower = less pretty but smoother on slow computers.
  timeOfDay: 17.5,     // the clock, 24-hour: 17.5 = 5:30pm golden hour. 13 = midday, 19 = sunset, 8 = early morning.
  haze: 1,              // how much distance haze (air) there is. 0 = crystal clear, 2 = smoggy.
  sunAngle: 152,        // spins the sky and sun around (0 to 360). Changes which way shadows fall.
  sunStrength: 1,       // how bright the sunlight is
  exposure: 0.9,        // overall brightness of the picture, like a camera setting
  glow: 1,              // soft glow around very bright things. 0 = off.
  contactShadow: 0.4,   // how dark the soft shade right under the board is. 0 = off.
};
