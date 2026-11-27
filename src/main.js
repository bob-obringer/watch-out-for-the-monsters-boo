import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as X from './models.js';
import { Sound } from './audio.js';
import { createClawGame } from './claw.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const sound = new Sound();

/* ================================================================== */
/* Game rules — tweak these to change the game                        */
/* ================================================================== */
const TYPES = {
  pumpkin: {
    name: 'Pumpkin Patch', icon: '🎃', costs: [10, 30, 75],
    interval: [4, 3.5, 3], amount: [1, 2, 3], cap: [8, 14, 22],
    blurb: 'Grows candy',
  },
  lantern: {
    name: 'Lantern', icon: '🏮', costs: [20, 45, 90],
    radius: [2.1, 2.8, 3.5],
    blurb: 'Scares monsters',
  },
  cauldron: {
    name: 'Witch Pot', icon: '🧪', costs: [50, 120, 250],
    interval: [6, 5.5, 5], amount: [5, 9, 15], cap: [30, 50, 80],
    blurb: 'Brews lots of candy',
  },
  castle: {
    name: 'Haunted Castle', icon: '🏰', costs: [300, 600, 1200],
    interval: [8, 7, 6], amount: [30, 55, 90], cap: [120, 200, 300],
    blurb: 'Makes TONS of candy',
  },
  home: { name: "Boo's House", icon: '🏚️', interval: [5], amount: [1], cap: [10] },
};
const BUILDABLE = ['pumpkin', 'lantern', 'cauldron', 'castle'];
const START_CANDY = 15;
const MAP_R = 7;
const SAVE_KEY = 'wofm-boo-v1';

const GOALS = [
  { icon: '🎃', text: 'Build a Pumpkin Patch', need: 1, val: () => count('pumpkin'), reward: 10 },
  { icon: '🍬', text: 'Grab 15 candies', need: 15, val: () => S.stats.collected, reward: 10 },
  { icon: '👻', text: 'Tap a monster to say BOO!', need: 1, val: () => S.stats.boo, reward: 15 },
  { icon: '👻', text: 'Tap 👻 to make Boo invisible', need: 1, val: () => S.stats.invis || 0, reward: 15 },
  { icon: '🗺️', text: 'Buy a new tile', need: 1, val: () => S.stats.bought, reward: 15 },
  { icon: '🏮', text: 'Build a Lantern', need: 1, val: () => count('lantern'), reward: 20 },
  { icon: '🎃', text: 'Have 3 Pumpkin Patches', need: 3, val: () => count('pumpkin'), reward: 30 },
  { icon: '⭐', text: 'Level up a Pumpkin Patch', need: 1, val: () => (maxLevel('pumpkin') >= 2 ? 1 : 0), reward: 30 },
  { icon: '🧪', text: 'Build a Witch Pot', need: 1, val: () => count('cauldron'), reward: 50 },
  { icon: '😱', text: 'Scare 15 monsters', need: 15, val: () => S.stats.scared, reward: 60 },
  { icon: '🏰', text: 'Build a Haunted Castle', need: 1, val: () => count('castle'), reward: 150 },
  { icon: '👁️', text: 'Scare a GIANT eyeball', need: 1, val: () => S.stats.giants || 0, reward: 100 },
  { icon: '⚡', text: 'Castle zaps 5 monsters', need: 5, val: () => S.stats.zaps || 0, reward: 120 },
  { icon: '🪦', text: 'Open the Spooky Graveyard', need: 1, val: () => (S.graveyard ? 1 : 0), reward: 200 },
  { icon: '🧶', text: 'Tie up the Toy King', need: 1, val: () => S.stats.kings || 0, reward: 100 },
  { icon: '🤖', text: 'Win a Robot Buddy', need: 1, val: () => (S.buddy ? 1 : 0), reward: 100 },
  { icon: '🏝️', text: 'Own 20 tiles', need: 20, val: () => ownedCount(), reward: 100 },
  { icon: '🌟', text: 'Get a Level 3 building', need: 1, val: () => (maxLevel() >= 3 ? 1 : 0), reward: 120 },
  { icon: '👑', text: 'Scare 50 monsters', need: 50, val: () => S.stats.scared, reward: 200 },
];
function goalAt(i) {
  if (i < GOALS.length) return GOALS[i];
  const n = 50 + 25 * (i - GOALS.length + 1);
  return { icon: '👑', text: `Bravest ghost! Scare ${n} monsters`, need: n, val: () => S.stats.scared, reward: 150 };
}

/* ================================================================== */
/* State                                                              */
/* ================================================================== */
const S = {
  candy: START_CANDY,
  goal: 0,
  stats: { collected: 0, boo: 0, scared: 0, bought: 0, giants: 0, invis: 0, zaps: 0 },
  graveyard: false,
  buddy: false,
};
let started = false;
let resetting = false; // once Start Over is confirmed, nothing may write the old save back
const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } })();
if (saved) {
  S.candy = saved.candy ?? START_CANDY;
  S.goal = saved.goal ?? 0;
  Object.assign(S.stats, saved.stats || {});
  S.graveyard = !!saved.graveyard;
  S.buddy = !!saved.buddy;
}
try { sound.muted = localStorage.getItem('wofm-muted') === '1'; } catch { /* ignore */ }

/* ================================================================== */
/* Renderer, scene, post-processing                                   */
/* ================================================================== */
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const FOG_BASE = new THREE.Color(0x100c22);
const FOG_RED = new THREE.Color(0x2c0812);
scene.fog = new THREE.FogExp2(FOG_BASE.clone(), 0.033);
scene.background = scene.fog.color;

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 250);

const MOON_DIR = new THREE.Vector3(-0.5, 0.62, -0.6).normalize();
(function buildEnvironment() {
  const env = new THREE.Scene();
  const sky = new THREE.SphereGeometry(50, 32, 16);
  const p = sky.attributes.position;
  const top = new THREE.Color(0x0c0c2a), hor = new THREE.Color(0x30234f), bot = new THREE.Color(0x04030a);
  const cols = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(bot, Math.min(1, -y * 4));
    cols.push(c.r, c.g, c.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 2.2) }));
  moonBall.position.copy(MOON_DIR).multiplyScalar(40);
  env.add(moonBall);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  scene.environmentIntensity = 0.55;
})();

const hemi = new THREE.HemisphereLight(0x6d7fd6, 0x1b1027, 1.0);
scene.add(hemi);
const MOON_COL = new THREE.Color(0xb9c6ff), MOON_RED = new THREE.Color(0xff4a4a);
const moon = new THREE.DirectionalLight(MOON_COL.clone(), 2.4);
moon.position.copy(MOON_DIR).multiplyScalar(30);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);
const rim = new THREE.DirectionalLight(0x7a4cff, 0.6);
rim.position.set(6, 4, 8);
scene.add(rim);

const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(DPR);
composer.setSize(innerWidth, innerHeight);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const vignette = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uRed: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uRed; uniform float uTime; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.9, 0.28, length(d * vec2(1.15, 1.0)));
      c.rgb *= mix(0.25, 1.0, v);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.35, 0.55, 0.55) + vec3(0.06, 0.0, 0.0) * (1.0 - v), uRed);
      c.rgb += (rand(vUv * 917.0 + fract(uTime)) - 0.5) * 0.035;
      gl_FragColor = c;
    }`,
});
composer.addPass(vignette);

/* ================================================================== */
/* Camera + controls                                                  */
/* ================================================================== */
const cam = { target: new THREE.Vector3(0, 0, 0.6), dist: 30, goal: innerWidth < innerHeight ? 24 : 17, min: 7, max: 30 };
function updateCamera(dt) {
  if (cam.pan) {
    cam.target.lerp(cam.pan, 1 - Math.exp(-dt * 1.5));
    if (cam.target.distanceTo(cam.pan) < 0.05) cam.pan = null;
  }
  cam.dist += (cam.goal - cam.dist) * (1 - Math.exp(-dt * 8));
  const k = (cam.dist - cam.min) / (cam.max - cam.min);
  const pitch = THREE.MathUtils.lerp(0.72, 1.02, clamp(k, 0, 1));
  const sway = started ? 0 : Math.sin(clockTime * 0.15) * 0.25;
  camera.position.set(
    cam.target.x + Math.sin(sway) * Math.cos(pitch) * cam.dist,
    cam.target.y + Math.sin(pitch) * cam.dist,
    cam.target.z + Math.cos(sway) * Math.cos(pitch) * cam.dist,
  );
  camera.lookAt(cam.target);
}

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
function rayFrom(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster;
}
function groundAt(x, y) {
  return rayFrom(x, y).ray.intersectPlane(groundPlane, new THREE.Vector3());
}
function panBy(a, b) {
  const ga = groundAt(a.x, a.y), gb = groundAt(b.x, b.y);
  if (!ga || !gb) return;
  cam.pan = null;
  cam.target.add(ga.sub(gb));
  cam.target.y = 0;
  if (cam.target.length() > 10) cam.target.setLength(10);
}

const pointers = new Map();
let gesture = null;
const pinchInfo = () => {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
};
let clawDrag = false;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  if (claw.active) { clawDrag = true; claw.pointer(e.clientX, e.clientY); return; }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  if (pointers.size === 1) gesture = { type: 'maybeTap' };
  else if (pointers.size === 2) { const p = pinchInfo(); gesture = { type: 'pinch', d0: p.d, dist0: cam.goal, mid: p.mid }; }
});
canvas.addEventListener('pointermove', (e) => {
  if (claw.active) { if (clawDrag) claw.pointer(e.clientX, e.clientY); return; }
  const p = pointers.get(e.pointerId);
  if (!p || !gesture) return;
  const prev = { x: p.x, y: p.y };
  p.x = e.clientX; p.y = e.clientY;
  if (gesture.type === 'pinch' && pointers.size >= 2) {
    const q = pinchInfo();
    cam.goal = clamp(gesture.dist0 * (gesture.d0 / Math.max(q.d, 1)), cam.min, cam.max);
    panBy(gesture.mid, q.mid);
    gesture.mid = q.mid;
    return;
  }
  if (gesture.type === 'maybeTap' && Math.hypot(p.x - p.sx, p.y - p.sy) > 12) gesture.type = 'pan';
  if (gesture.type === 'pan') panBy(prev, p);
});
const endPointer = (e) => {
  clawDrag = false;
  if (claw.active) { pointers.delete(e.pointerId); gesture = null; return; }
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (!p) return;
  if (e.type === 'pointerup' && gesture?.type === 'maybeTap' && pointers.size === 0 && performance.now() - p.t < 700) handleTap(e.clientX, e.clientY);
  if (pointers.size === 0) gesture = null;
  else gesture = { type: 'pan' };
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.goal = clamp(cam.goal * (1 + e.deltaY * 0.0015), cam.min, cam.max);
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* ================================================================== */
/* World                                                              */
/* ================================================================== */
const tiles = new Map();
const tileMeshes = [];
const buildingHits = [];
const buildings = [];
let frontier = [];

function tileKind(q, r) {
  const d = X.hexDist(q, r);
  const h = X.hash(q, r, 1);
  if (d <= 1) return 'owned';
  if (d <= 3) return 'buy';
  if (d === 4) return h < 0.22 ? 'dark' : 'buy';
  return 'dark';
}

const GRAVE_COST = 400;
function inGraveyard(q, r) {
  const d = X.hexDist(q, r);
  if (d < 4 || d > 6) return false;
  const { x, z } = X.hexToWorld(q, r);
  return Math.abs(Math.atan2(z, x) + 0.25) < 0.62; // a wedge on the right side of the island
}
let graveTiles = [];
function computeFrontier() {
  frontier = [...tiles.values()].filter((t) => t.kind === 'dark' && neighbors(t).some((n) => n.kind !== 'dark'));
}

function generateWorld() {
  const ownedSet = new Set(saved?.owned || []);
  for (let q = -MAP_R; q <= MAP_R; q++) {
    for (let r = -MAP_R; r <= MAP_R; r++) {
      const d = X.hexDist(q, r);
      if (d > MAP_R) continue;
      if (d === MAP_R && X.hash(q, r, 9) < 0.45) continue;
      let kind = tileKind(q, r);
      const grave = kind === 'dark' && inGraveyard(q, r);
      if (grave && S.graveyard) kind = 'buy';
      if (kind === 'buy' && ownedSet.has(X.hexKey(q, r))) kind = 'owned';
      addTile(q, r, kind, grave);
    }
  }
  graveTiles = [...tiles.values()].filter((t) => t.grave);
  computeFrontier();
}

function neighbors(t) {
  const out = [];
  for (const [dq, dr] of X.NEIGHBORS) { const n = tiles.get(X.hexKey(t.q + dq, t.r + dr)); if (n) out.push(n); }
  return out;
}

function tileHeight(t) {
  return (X.hash(t.q, t.r, 2) - 0.5) * 0.1 + (t.kind === 'dark' ? -0.1 : t.kind === 'buy' ? -0.04 : 0);
}

const geoFor = (t) => X.TILE_GEOS[t.kind === 'buy' && t.grave ? 'grave' : t.kind];
function addTile(q, r, kind, grave = false) {
  const { x, z } = X.hexToWorld(q, r);
  const d = X.hexDist(q, r);
  const t = {
    q, r, key: X.hexKey(q, r), x, z, kind, anim: 0, grave,
    price: grave ? 60 + Math.floor(X.hash(q, r, 4) * 4) * 10 : Math.round(({ 2: 15, 3: 35, 4: 70 }[d] ?? 100) + Math.floor(X.hash(q, r, 4) * 3) * 5),
    mesh: new THREE.Mesh(X.TILE_GEOS.owned, X.TILE_MATS[Math.floor(X.hash(q, r, 3) * 4) % 4]),
    decor: new THREE.Group(), label: null, building: null,
  };
  t.mesh.geometry = geoFor(t);
  t.h = tileHeight(t); t.top = t.h + X.TILE_TOP;
  t.mesh.position.set(x, t.h, z);
  t.mesh.receiveShadow = true; t.mesh.castShadow = true;
  t.mesh.userData.tile = t;
  t.decor.position.set(x, t.top, z);
  scene.add(t.mesh, t.decor);
  tiles.set(t.key, t);
  tileMeshes.push(t.mesh);
  decorate(t);
}

function decorate(t) {
  const r = X.rng(X.hash(t.q, t.r, 5) * 1e9);
  const at = (obj, spread = 0.5) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    obj.position.x += Math.cos(a) * d; obj.position.z += Math.sin(a) * d;
    t.decor.add(obj);
  };
  const seed = () => Math.floor(r() * 1e9);
  if (t.grave && t.kind !== 'dark') {
    // spooky graveyard: lots of graves
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) at(X.makeGrave(seed()), 0.6);
    if (r() < 0.3) at(X.makeDeadTree(seed()), 0.3);
    if (r() < 0.3) at(X.makeMushrooms(seed()), 0.5);
    if (r() < 0.3) at(X.makeTuft(seed()), 0.6);
  } else if (t.kind === 'owned') {
    for (let i = 0; i < 3; i++) if (r() < 0.6) at(X.makeTuft(seed()), 0.7);
    if (r() < 0.35) at(X.makeMushrooms(seed()), 0.55);
    if (r() < 0.15) at(X.makeRock(seed()), 0.6);
    if (r() < 0.1) at(X.makeGrave(seed()), 0.5);
  } else if (t.kind === 'buy') {
    if (r() < 0.5) at(X.makeDeadTree(seed()), 0.35);
    if (r() < 0.3) at(X.makeGrave(seed()), 0.55);
    if (r() < 0.3) at(X.makeGrave(seed()), 0.55);
    if (r() < 0.25) at(X.makeRock(seed()), 0.6);
    if (r() < 0.15) at(X.makeMushrooms(seed()), 0.55);
  } else {
    if (r() < 0.45) at(X.makeDeadTree(seed()), 0.4);
    if (r() < 0.2) at(X.makeRock(seed()), 0.6);
  }
}

function clearDecor(t) {
  t.decor.clear();
}

/* ---------------- price labels on buyable tiles ---------------- */
function refreshLabels() {
  for (const t of tiles.values()) {
    if (t.kind !== 'buy') { if (t.label) { scene.remove(t.label); t.label = null; } continue; }
    const adj = neighbors(t).some((n) => n.kind === 'owned');
    if (adj && !t.label) {
      const mat = new THREE.SpriteMaterial({ map: X.makeLabelTexture(`🍬 ${t.price}`), color: new THREE.Color(0.62, 0.6, 0.68), transparent: true, depthTest: false });
      t.label = new THREE.Sprite(mat);
      t.label.scale.set(1.2, 0.45, 1);
      t.label.position.set(t.x, t.top + 0.55, t.z + 0.15);
      t.label.renderOrder = 20;
      scene.add(t.label);
    }
    if (t.label) {
      t.label.visible = adj;
      t.label.material.opacity = S.candy >= t.price ? 1 : 0.5;
    }
  }
}

/* ---------------- tile highlight ---------------- */
const selectRing = X.makeSelectRing();
selectRing.visible = false;
scene.add(selectRing);
let selected = null;

/* ================================================================== */
/* Lights pool (fixed count => no shader recompiles)                  */
/* ================================================================== */
const lightPool = Array.from({ length: 5 }, () => {
  const L = new THREE.PointLight(0xffa04a, 0, 6, 2);
  scene.add(L);
  return { L, owner: null };
});
function claimLight(b) {
  const slot = lightPool.find((s) => !s.owner);
  if (!slot) return;
  slot.owner = b; b.light = slot.L;
}
const homeLight = new THREE.PointLight(0xffb060, 5, 5, 2);
scene.add(homeLight);
// always in the scene (intensity 0) so adding the Toy King doesn't recompile shaders
const kingLight = new THREE.PointLight(0xa8ffd8, 0, 9, 1.6);
scene.add(kingLight);

/* ================================================================== */
/* Buildings                                                          */
/* ================================================================== */
const invisible = new THREE.MeshBasicMaterial({ visible: false });
let candyColor = 0;

function createBuilding(t, type, level = 1, animate = true) {
  const b = { type, level, tile: t, timer: Math.random() * 2, pending: 0, munchers: 0, sad: 0, pop: animate ? 1 : 0, model: null, light: null, seed: Math.floor(Math.random() * 1e9) };
  b.group = new THREE.Group();
  b.group.position.set(t.x, t.top, t.z);
  scene.add(b.group);
  t.building = b;
  clearDecor(t);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.2, 8), invisible);
  hit.position.y = 1.1; hit.userData.tile = t;
  b.group.add(hit);
  buildingHits.push(hit);
  if (TYPES[type].interval) {
    b.candy = X.makeCandy(candyColor++);
    b.candy.group.visible = false;
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), invisible);
    ch.userData.building = b;
    b.candy.group.add(ch);
    b.candyHit = ch;
    b.group.add(b.candy.group);
  }
  buildModel(b);
  if (type === 'lantern' || type === 'cauldron' || type === 'castle') claimLight(b);
  buildings.push(b);
  return b;
}

function buildModel(b) {
  if (b.model) b.group.remove(b.model.group);
  if (b.type === 'pumpkin') b.model = X.makePumpkinPatch(b.level, b.seed);
  else if (b.type === 'lantern') b.model = X.makeLantern(b.level, TYPES.lantern.radius[b.level - 1]);
  else if (b.type === 'cauldron') b.model = X.makeCauldron(b.level);
  else if (b.type === 'castle') b.model = X.makeCastle(b.level);
  else b.model = X.makeHome();
  b.model.group.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = o.castShadow || false; });
  b.group.add(b.model.group);
  if (b.candy) b.candyBase = b.model.height + 0.45;
}

const count = (type) => buildings.filter((b) => b.type === type).length;
const maxLevel = (type) => buildings.filter((b) => b.type !== 'home' && (!type || b.type === type)).reduce((m, b) => Math.max(m, b.level), 0);
const ownedCount = () => [...tiles.values()].filter((t) => t.kind === 'owned').length;
const producers = () => buildings.filter((b) => b.type === 'pumpkin' || b.type === 'cauldron' || b.type === 'castle');

function candyRate() {
  let r = 0;
  for (const b of buildings) {
    const T = TYPES[b.type];
    if (!T.interval || b.munchers > 0) continue;
    r += (T.amount[b.level - 1] / T.interval[b.level - 1]) * 60;
  }
  return Math.round(r);
}

function collect(b) {
  if (!b.pending) return false;
  const n = b.pending;
  b.pending = 0;
  const wp = b.candy.group.getWorldPosition(new THREE.Vector3());
  S.stats.collected += n;
  addCandy(n, wp);
  floatText(`+${n} 🍬`, wp, 'plus');
  sound.collect(n);
  return true;
}

/* ================================================================== */
/* Boo the ghost                                                      */
/* ================================================================== */
const boo = { model: X.makeCat(), pos: new THREE.Vector3(1.2, 0, 1.2), mode: 'idle', modeT: 0, goal: new THREE.Vector3(), yaw: 0, spin: 0, booT: 0, hop: 0 };
scene.add(boo.model.group);
const booLight = new THREE.PointLight(0xb39cff, 2.0, 4.5, 2);
booLight.position.set(0, 1.8, 0.2);
boo.model.group.add(booLight);
const booHit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), invisible);
booHit.position.y = 0.45;
boo.model.group.add(booHit);

// Boo's materials are cloned so Boo can fade out without touching other models
const booMats = [];
boo.model.group.traverse((o) => {
  if ((o.isMesh || o.isSprite) && o.material && o !== booHit) {
    o.material = o.material.clone();
    o.material.transparent = true;
    booMats.push({ m: o.material, base: o.material.opacity });
  }
});
const POWER_TIME = 6, POWER_CD = 20;
let powerT = 0, powerCD = 0, booFade = 1;
function usePower() {
  if (!started) return;
  if (powerCD > 0) { sound.nope(); toast('Boo is resting… 😺'); return; }
  powerT = POWER_TIME; powerCD = POWER_CD;
  S.stats.invis = (S.stats.invis || 0) + 1;
  sound.vanish();
  floatText('poof! 👻', boo.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 'info');
  for (const m of monsters) if (m.state === 'chase') loseTrack(m);
}
function loseTrack(m) {
  m.state = 'walk'; m.confused = 2.5; m.target = pickTarget();
  floatText('❓', m.model.group.position.clone().add(new THREE.Vector3(0, m.h + 0.4, 0)), 'info');
}
function updatePower(dt) {
  powerT = Math.max(0, powerT - dt);
  powerCD = Math.max(0, powerCD - dt);
  const want = powerT > 0 ? 0.16 + Math.sin(clockTime * 9) * 0.06 : 1;
  booFade += (want - booFade) * (1 - Math.exp(-dt * 8));
  for (const { m, base } of booMats) m.opacity = base * booFade;
  booLight.intensity = 2.0 * booFade;
  const btn = $('btn-power');
  btn.classList.toggle('active', powerT > 0);
  btn.classList.toggle('ready', powerCD <= 0);
  $('pw-cd').style.setProperty('--p', powerT > 0 ? 0 : powerCD / POWER_CD);
}
$('btn-power').onclick = usePower;

function booGoTo(v, mode = 'visit', time = 3) {
  boo.goal.copy(v); boo.mode = mode; boo.modeT = time;
}
function updateBoo(dt) {
  boo.modeT -= dt;
  const chasers = monsters.filter((m) => m.state === 'chase');
  if (chasers.length && (boo.mode === 'idle' || boo.mode === 'visit')) boo.mode = 'flee';
  if (boo.mode === 'flee' && !chasers.length) boo.mode = 'idle';
  if ((boo.mode === 'visit' || boo.mode === 'zoom' || boo.mode === 'caught') && boo.modeT <= 0) boo.mode = chasers.length ? 'flee' : 'idle';
  let goal = boo.goal, speed = 2.2;
  if (boo.mode === 'idle') {
    // wander lazily around the house, stopping now and then
    const a = Math.floor(clockTime / 4) * 2.4;
    goal = new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.1 + 0.5);
    speed = 0.7;
  } else if (boo.mode === 'flee') {
    let near = chasers[0];
    for (const m of chasers) if (m.pos.distanceToSquared(boo.pos) < near.pos.distanceToSquared(boo.pos)) near = m;
    // run to the closest lantern if there is one (monsters hate the light!)
    let best = null, bd = Infinity;
    for (const b of buildings) {
      if (b.type !== 'lantern') continue;
      const d = Math.hypot(b.tile.x - boo.pos.x, b.tile.z - boo.pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) goal = new THREE.Vector3(best.tile.x + 0.3, 0, best.tile.z + 0.4);
    else {
      const away = new THREE.Vector3(boo.pos.x - near.pos.x, 0, boo.pos.z - near.pos.z).normalize();
      goal = boo.pos.clone().addScaledVector(away, 2);
      goal.y = 0;
      if (goal.length() > 4) goal.add(new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(2)).setLength(3.5);
    }
    speed = 1.75;
  } else if (boo.mode === 'zoom') speed = 6;
  else if (boo.mode === 'caught') speed = 3.2;

  const dx = goal.x - boo.pos.x, dz = goal.z - boo.pos.z;
  const d = Math.hypot(dx, dz);
  const moving = d > 0.06;
  if (moving) {
    const step = Math.min(d, speed * dt);
    boo.pos.x += (dx / d) * step; boo.pos.z += (dz / d) * step;
  }
  boo.pos.y += (groundY(boo.pos.x, boo.pos.z) - boo.pos.y) * (1 - Math.exp(-dt * 12));
  const g = boo.model.group;
  boo.booT = Math.max(0, boo.booT - dt * 1.4);
  g.position.set(boo.pos.x, boo.pos.y + Math.sin(Math.min(1, boo.booT) * Math.PI) * 0.35, boo.pos.z);
  const camYaw = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
  const want = moving ? Math.atan2(dx, dz) : camYaw;
  boo.yaw = lerpAngle(boo.yaw, want, dt * 8);
  boo.spin *= Math.exp(-dt * 3);
  g.rotation.set(0, boo.yaw + boo.spin, 0);
  g.scale.setScalar(1 + Math.sin(Math.min(1, boo.booT) * Math.PI) * 0.25);
  boo.model.animate(clockTime, moving, boo.mode === 'flee' || boo.mode === 'caught', boo.booT);
}

function catchBoo(m) {
  if (buddy && buddy.guardCD <= 0) { buddyGuard(m); return; }
  const loss = Math.min(S.candy, 5);
  S.candy -= loss;
  candyChanged(true);
  const wp = boo.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  if (loss) floatText(`-${loss} 🍬`, wp, 'minus');
  floatText('😿', wp.clone().add(new THREE.Vector3(0.5, 0.3, 0)), 'info');
  sound.munch(); sound.growl(1.2);
  sound.speak('Meow!', { pitch: 0.7, rate: 0.9 });
  boo.mode = 'caught'; boo.modeT = 2; boo.goal.set(0.3, 0, 0.9); boo.spin = Math.PI * 4;
  m.state = 'flee'; m.st = 0;
  m.dir.set(m.pos.x, 0, m.pos.z).normalize();
  if (m.dir.lengthSq() < 0.5) m.dir.set(0, 0, -1);
}

/* ================================================================== */
/* Monsters                                                           */
/* ================================================================== */
const monsters = [];
let spawnT = 12, waveT = 60, waveQueue = 0, waveSpawnT = 0, waveOn = false, hbT = 0;
let redness = 0, redGoal = 0;
let monstersSeen = saved?.stats?.scared ? 99 : 0;

function groundY(x, z) {
  const h = X.worldToHex(x, z);
  const t = tiles.get(X.hexKey(h.q, h.r));
  return t ? t.top : -0.3;
}

function pickTarget() {
  const list = [...producers(), ...buildings.filter((b) => b.type === 'home')];
  if (!list.length) return null;
  // prefer buildings with candy waiting & far from lanterns
  const scored = list.map((b) => ({ b, s: Math.random() + (b.pending > 0 ? 0.5 : 0) - (litBy(b.tile.x, b.tile.z) ? 0.8 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].b;
}

function litBy(x, z) {
  for (const b of buildings) {
    if (b.type !== 'lantern') continue;
    const R = TYPES.lantern.radius[b.level - 1];
    if (Math.hypot(b.tile.x - x, b.tile.z - z) < R) return b;
  }
  return null;
}

function spawnMonster(opts = {}) {
  const target = pickTarget();
  if (!target || !frontier.length) return;
  const graves = S.graveyard ? graveTiles.filter((t) => !t.building) : [];
  const zombie = opts.type === 'zombie' || (!opts.type && graves.length && Math.random() < 0.35);
  let tile;
  if (zombie && graves.length) tile = graves[Math.floor(Math.random() * graves.length)];
  else {
    const sorted = frontier
      .map((t) => ({ t, d: Math.hypot(t.x - target.tile.x, t.z - target.tile.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    tile = sorted[Math.floor(Math.random() * sorted.length)].t;
  }
  const roll = Math.random();
  const type = zombie && graves.length ? 'zombie' : opts.type || (monstersSeen < 1 ? 'peeper' : roll < 0.6 ? 'peeper' : roll < 0.82 ? 'gloomblob' : 'longarms');
  const size = opts.size || (type === 'peeper' && Math.random() < 0.25 ? 0.6 : 1);
  monstersSeen++;
  const model = X.makeMonster(type);
  const m = {
    type, model, target, state: 'emerge', st: 0, fear: 0, munchT: 0, phase: Math.random() * 10,
    pos: new THREE.Vector3(tile.x + rand(-0.3, 0.3), tile.top, tile.z + rand(-0.3, 0.3)),
    speed: type === 'peeper' ? rand(0.75, 0.9) : type === 'longarms' || type === 'zombie' ? rand(0.42, 0.52) : rand(0.55, 0.7),
    yaw: 0, dir: new THREE.Vector3(), size, h: model.height * size, hp: opts.hp || 1, flinch: 0, chaseT: 0, confused: 0,
  };
  if (size < 1) m.speed *= 1.5;
  if (size > 1) m.speed *= 0.75;
  model.group.scale.setScalar(size);
  m.yaw = Math.atan2(target.tile.x - m.pos.x, target.tile.z - m.pos.z);
  model.group.position.copy(m.pos);
  model.group.position.y -= m.h * 1.1;
  model.hit.userData.monster = m;
  scene.add(model.group);
  monsters.push(m);
  sound.growl((type === 'longarms' ? 0.75 : type === 'zombie' ? 0.55 : type === 'peeper' ? 1.4 : 1) / size);
}

function activeMonsters() {
  return monsters.filter((m) => m.state === 'emerge' || m.state === 'walk' || m.state === 'chase');
}

function scareMonster(m, byBoo) {
  if (!['emerge', 'walk', 'chase'].includes(m.state)) return;
  m.state = 'scared'; m.st = 0;
  S.stats.scared++;
  if (byBoo) S.stats.boo++;
  if (m.size > 1) S.stats.giants = (S.stats.giants || 0) + 1;
  const n = Math.round((m.type === 'longarms' ? 4 : m.type === 'peeper' ? 3 : 2) * (m.size > 1 ? 4 : 1));
  const wp = m.model.group.position.clone().add(new THREE.Vector3(0, m.h, 0));
  addCandy(n, wp);
  floatText(`+${n} 🍬`, wp.clone().add(new THREE.Vector3(0.6, -0.2, 0)), 'plus');
  if (!byBoo) floatText('Eek!', wp, 'info');
  sound.squeal();
}

function booAttack(m) {
  const wp = m.model.group.position;
  const side = wp.x > camera.position.x ? -1 : 1;
  booGoTo(new THREE.Vector3(wp.x + side * (0.7 + m.size * 0.3), 0, wp.z + 0.45), 'zoom', 1.4);
  boo.booT = 1; boo.spin = Math.PI * 2;
  sound.boo();
  sound.speak('Boo!', { pitch: 1.9, rate: 1.25 });
  if (m.hp > 1) {
    m.hp--; m.flinch = 0.5;
    floatText(`BOO! ×${m.hp}`, wp.clone().add(new THREE.Vector3(0, m.h + 0.6, 0)), 'boo');
    sound.squeal();
    return;
  }
  floatText('BOO!', wp.clone().add(new THREE.Vector3(0, m.h + 0.6, 0)), 'boo');
  scareMonster(m, true);
}

function updateMonsters(dt) {
  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    const g = m.model.group;
    m.st += dt;
    let moving = false, scared = false;
    if (m.state === 'emerge') {
      const k = Math.min(1, m.st / 1.8);
      g.position.set(m.pos.x, m.pos.y - m.h * 1.1 * (1 - k * k * (3 - 2 * k)), m.pos.z);
      if (k >= 1) { m.state = 'walk'; m.st = 0; }
    } else if (m.state === 'walk' || m.state === 'chase') {
      m.flinch = Math.max(0, m.flinch - dt);
      m.confused = Math.max(0, m.confused - dt);
      if (m.state === 'chase' && powerT > 0) loseTrack(m);
      let tx, tz;
      if (m.state === 'walk') {
        if (!buildings.includes(m.target)) m.target = pickTarget();
        if (!m.target) { m.state = 'flee'; m.st = 0; continue; }
        tx = m.target.tile.x; tz = m.target.tile.z;
      } else { tx = boo.pos.x; tz = boo.pos.z; }
      const dx = tx - m.pos.x, dz = tz - m.pos.z;
      const d = Math.hypot(dx, dz);
      const dBoo = Math.hypot(boo.pos.x - m.pos.x, boo.pos.z - m.pos.z);
      m.yaw = m.confused > 0 ? m.yaw + Math.sin(clockTime * 3 + m.phase) * dt * 3 : lerpAngle(m.yaw, Math.atan2(dx, dz), dt * 5);
      moving = m.flinch <= 0 && m.confused <= 0 && !(m.state === 'walk' && d < 0.9);
      if (m.state === 'walk' && powerT <= 0 && m.confused <= 0 && (d < 0.9 || dBoo < 1.8)) {
        // reached your stuff (or spotted Boo) -> chase Boo!
        m.state = 'chase'; m.st = 0; m.chaseT = 0;
        sound.growl(m.type === 'peeper' ? 1.5 : 1);
        floatText('❗', g.position.clone().add(new THREE.Vector3(0, m.h + 0.4, 0)), 'minus');
        if (!S.stats.warned) { S.stats.warned = 1; toast('Help Boo! Tap the monster! 👆'); }
      } else if (m.state === 'chase') {
        m.chaseT += dt;
        if (dBoo < 0.5 * Math.max(1, m.size) && boo.mode !== 'caught') catchBoo(m);
        else if (m.chaseT > 16) { m.state = 'flee'; m.st = 0; m.dir.set(m.pos.x, 0, m.pos.z).normalize(); }
      }
      if (moving && (m.state === 'walk' || m.state === 'chase') && d > 0.05) {
        const sp = m.speed * (m.state === 'chase' ? 1.55 : 1);
        m.pos.x += (dx / d) * sp * dt; m.pos.z += (dz / d) * sp * dt;
      }
      m.pos.y = THREE.MathUtils.lerp(m.pos.y, groundY(m.pos.x, m.pos.z), 1 - Math.exp(-dt * 10));
      g.position.copy(m.pos);
      if (m.flinch > 0) { g.position.y += Math.sin((m.flinch / 0.5) * Math.PI) * 0.5; scared = true; }
      // lantern light scares monsters (giants just get annoyed)
      if (litBy(m.pos.x, m.pos.z) && m.size <= 1) { m.fear += dt; if (m.fear > 0.8) scareMonster(m, false); }
      else m.fear = Math.max(0, m.fear - dt);
    } else if (m.state === 'grabbed') {
      scared = true; // the Toy King moves it around
    } else if (m.state === 'thrown') {
      scared = true;
      m.vel.y -= 9.8 * dt;
      m.pos.addScaledVector(m.vel, dt);
      m.yaw += dt * 10;
      const gy = groundY(m.pos.x, m.pos.z);
      if (m.vel.y < 0 && m.pos.y <= gy) {
        m.pos.y = gy; m.state = 'chase'; m.st = 0; m.chaseT = 0;
        sound.stomp();
        floatText('💥', m.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 'info');
        if (powerT > 0) loseTrack(m);
      }
      g.position.copy(m.pos);
    } else if (m.state === 'scared') {
      scared = true;
      const k = m.st / 0.55;
      g.position.set(m.pos.x, m.pos.y + Math.sin(Math.min(1, k) * Math.PI) * 0.9, m.pos.z);
      m.yaw += dt * 14;
      if (k >= 1) {
        m.state = 'flee'; m.st = 0;
        m.dir.set(m.pos.x, 0, m.pos.z).normalize();
        if (m.dir.lengthSq() < 0.5) m.dir.set(0, 0, -1);
        m.yaw = Math.atan2(m.dir.x, m.dir.z);
      }
    } else if (m.state === 'flee') {
      moving = true; scared = true;
      m.pos.addScaledVector(m.dir, dt * 4.2);
      m.pos.y = groundY(m.pos.x, m.pos.z);
      g.position.copy(m.pos);
      if (m.st > 2.6 || Math.hypot(m.pos.x, m.pos.z) > 11) { m.state = 'sink'; m.st = 0; }
    } else if (m.state === 'sink') {
      g.position.y -= dt * 2.5;
      g.scale.multiplyScalar(Math.exp(-dt * 2));
      if (m.st > 1) {
        scene.remove(g);
        monsters.splice(i, 1);
        continue;
      }
    }
    g.rotation.y = m.yaw;
    m.model.animate(clockTime + m.phase, moving, scared);
    if (m.type !== 'longarms') {
      // creepy: the eyes turn to stare at YOU
      const look = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z) - m.yaw;
      const e = m.model.eyes;
      e.rotation.y = lerpAngle(e.rotation.y, clamp(Math.atan2(Math.sin(look), Math.cos(look)), -2.2, 2.2), dt * 3);
    }
  }

  // heartbeat while something is chasing Boo
  if (monsters.some((m) => m.state === 'chase')) { hbT -= dt; if (hbT <= 0) { sound.heartbeat(); hbT = 0.8; } }
  // Spawning: only once you have something worth munching
  const prodCount = producers().length;
  if (!prodCount) return;
  if (!king) { kingT -= dt; if (kingT <= 0 && prodCount >= 2) { spawnKing(); kingT = rand(200, 280); } }
  spawnT -= dt;
  const cap = Math.min(10, 3 + Math.floor(prodCount / 2));
  if (spawnT <= 0) {
    if (activeMonsters().length < cap) spawnMonster();
    spawnT = rand(10, 17) - Math.min(6, prodCount);
  }
  if (buildings.length >= 4) {
    waveT -= dt;
    if (waveT <= 0 && !waveOn) startWave(prodCount);
  }
  if (waveOn) {
    if (waveQueue > 0) {
      waveSpawnT -= dt;
      if (waveSpawnT <= 0) { spawnMonster(); waveQueue--; waveSpawnT = 1.4; }
    } else if (!activeMonsters().length) {
      waveOn = false; redGoal = 0; waveT = rand(55, 75);
    }
  }
}

function startWave(prodCount) {
  waveOn = true; redGoal = 1;
  waveQueue = Math.min(7, 2 + Math.floor(prodCount / 2));
  waveSpawnT = 2.5;
  if (prodCount >= 2) setTimeout(() => spawnMonster({ type: 'peeper', size: 1.8, hp: 3 }), 1500);
  showBanner('Watch out for the monsters, boo!');
  sound.wave();
  setTimeout(() => sound.speak('Watch out for the monsters, boo!', { pitch: 0.2, rate: 0.75 }), 400);
}

function lerpAngle(a, b, k) {
  let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * Math.min(1, k);
}

/* ================================================================== */
/* Atmosphere: water, fog in the dark, eyes, fireflies                */
/* ================================================================== */
const waterNormals = X.makeWaterNormals();
waterNormals.repeat.set(26, 26);
const waterTime = { value: 0 };
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x081525, roughness: 0.38, metalness: 0.0, normalMap: waterNormals, normalScale: new THREE.Vector2(0.2, 0.2), envMapIntensity: 0.15,
});
waterMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = waterTime;
  sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace(
    'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
    `vec3 mapN = normalize(
        (texture2D( normalMap, vNormalMapUv + vec2(uTime * 0.006, uTime * 0.004) ).xyz * 2.0 - 1.0) +
        (texture2D( normalMap, vNormalMapUv * 1.7 + vec2(-uTime * 0.005, uTime * 0.007) ).xyz * 2.0 - 1.0) );`,
  );
};
const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.32;
water.receiveShadow = true;
scene.add(water);

const darkFog = [];
const eyes = [];
function buildAtmosphere() {
  for (const t of tiles.values()) {
    if (t.kind !== 'dark' || X.hash(t.q, t.r, 6) > 0.7) continue;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.cloudTex, color: 0x0d0916, transparent: true, opacity: 0.9, depthWrite: false }));
    const s = rand(3.2, 4.8);
    sp.scale.set(s, s, 1);
    sp.position.set(t.x + rand(-0.4, 0.4), t.top + rand(0.3, 1.0), t.z + rand(-0.4, 0.4));
    sp.material.rotation = Math.random() * 6;
    sp.userData = { base: sp.position.clone(), ph: Math.random() * 10, rs: rand(-0.06, 0.06), key: t.key };
    scene.add(sp);
    darkFog.push(sp);
    if (Math.random() < 0.25) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.cloudTex, color: new THREE.Color(0.25, 0.08, 0.4), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(s * 0.8, s * 0.8, 1);
      glow.position.copy(sp.position).add(new THREE.Vector3(0, 0.2, 0));
      glow.userData = { base: glow.position.clone(), ph: Math.random() * 10, rs: rand(-0.05, 0.05), key: t.key };
      scene.add(glow);
      darkFog.push(glow);
    }
  }
  // a little low mist over the island
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.cloudTex, color: 0x8fa0d8, transparent: true, opacity: 0.07, depthWrite: false }));
    const s = rand(4, 7); sp.scale.set(s, s * 0.6, 1);
    const a = Math.random() * 6.28, d = rand(1, 7);
    sp.position.set(Math.cos(a) * d, 0.5, Math.sin(a) * d);
    sp.userData = { base: sp.position.clone(), ph: Math.random() * 10, rs: 0.01, drift: true };
    scene.add(sp);
    darkFog.push(sp);
  }
  if (S.graveyard) addGraveMist(); else makeLockSign();
  // glowing eyes in the dark
  for (let i = 0; i < 28; i++) {
    const e = { g: X.makeEyePair(Math.random() < 0.4), state: 'hidden', t: rand(0, 5), open: 0 };
    e.g.scale.y = 0;
    scene.add(e.g);
    placeEyes(e);
    eyes.push(e);
  }
}
function placeEyes(e, tile) {
  const darkTiles = [...tiles.values()].filter((t) => t.kind === 'dark');
  const t = tile || darkTiles[Math.floor(Math.random() * darkTiles.length)];
  e.g.position.set(t.x + rand(-0.4, 0.4), t.top + rand(0.25, 0.9), t.z + rand(-0.4, 0.4));
  const s = rand(0.8, 1.5); e.g.scale.set(s, 0, s); e.size = s;
}
function updateAtmosphere(dt) {
  waterTime.value += dt;
  for (const sp of darkFog) {
    const u = sp.userData;
    sp.material.rotation += u.rs * dt;
    sp.position.y = u.base.y + Math.sin(clockTime * 0.3 + u.ph) * 0.12;
    if (u.drift) { sp.position.x = u.base.x + Math.sin(clockTime * 0.05 + u.ph) * 1.5; }
  }
  for (const e of eyes) {
    e.t -= dt;
    if (e.state === 'hidden' && e.t <= 0) { e.state = 'opening'; e.t = 0.35; }
    else if (e.state === 'opening') { e.open = 1 - Math.max(0, e.t) / 0.35; if (e.t <= 0) { e.state = 'open'; e.t = rand(2, 6); } }
    else if (e.state === 'open') {
      e.open = (Math.sin(clockTime * 2.1 + e.g.id) > 0.97) ? 0.1 : 1;
      if (e.t <= 0) { e.state = 'closing'; e.t = 0.3; }
    } else if (e.state === 'closing') {
      e.open = Math.max(0, e.t) / 0.3;
      if (e.t <= 0) { e.state = 'hidden'; e.t = rand(1.5, 7); e.open = 0; placeEyes(e); }
    }
    e.g.scale.y = e.open * e.size * 0.9;
    e.g.rotation.y = Math.atan2(camera.position.x - e.g.position.x, camera.position.z - e.g.position.z);
  }
  // red moon
  redness += (redGoal - redness) * (1 - Math.exp(-dt * 1.2));
  scene.fog.color.lerpColors(FOG_BASE, FOG_RED, redness);
  moon.color.lerpColors(MOON_COL, MOON_RED, redness * 0.8);
  hemi.intensity = 0.85 - redness * 0.3 + flash * 2.5;
  moon.intensity = 2.4 + flash * 10;
  vignette.uniforms.uRed.value = redness * 0.55;
  vignette.uniforms.uTime.value = clockTime;
  sound.setDanger(redness);
}

const FF = 46;
const ffGeo = new THREE.BufferGeometry();
const ffPos = new Float32Array(FF * 3);
const ffSeed = Array.from({ length: FF }, () => ({ a: Math.random() * 6.28, d: rand(0.5, 6.5), y: rand(0.3, 1.6), s: rand(0.1, 0.35), ph: Math.random() * 10 }));
ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
  map: X.glowTex, size: 0.32, color: new THREE.Color(1.8, 2.4, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
fireflies.frustumCulled = false;
scene.add(fireflies);
function updateFireflies() {
  for (let i = 0; i < FF; i++) {
    const f = ffSeed[i];
    const a = f.a + clockTime * f.s * 0.3;
    ffPos[i * 3] = Math.cos(a) * f.d + Math.sin(clockTime * 0.7 + f.ph) * 0.4;
    ffPos[i * 3 + 1] = f.y + Math.sin(clockTime * 1.3 + f.ph) * 0.25;
    ffPos[i * 3 + 2] = Math.sin(a) * f.d + Math.cos(clockTime * 0.5 + f.ph) * 0.4;
  }
  ffGeo.attributes.position.needsUpdate = true;
}

/* ================================================================== */
/* Building visuals per frame                                         */
/* ================================================================== */
const tmpC = new THREE.Color();
function updateBuildings(dt) {
  for (const b of buildings) {
    const T = TYPES[b.type];
    const lvl = b.level - 1;
    b.sad = clamp(b.sad + (b.munchers > 0 ? dt * 2 : -dt), 0, 1);
    // production
    if (T.interval && b.munchers === 0) {
      b.timer += dt;
      if (b.timer >= T.interval[lvl]) {
        b.timer = 0;
        if (b.pending < T.cap[lvl]) {
          const was = b.pending;
          b.pending = Math.min(T.cap[lvl], b.pending + T.amount[lvl]);
          if (!was && started) sound.pop();
        }
      }
    }
    // pop-in
    if (b.pop > 0) {
      b.pop = Math.max(0, b.pop - dt * 2.2);
      const k = 1 - b.pop;
      const s = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
      b.model.group.scale.setScalar(Math.max(0.01, s));
    }
    // floating candy
    if (b.candy) {
      const cg = b.candy.group;
      cg.visible = b.pending > 0;
      if (cg.visible) {
        const fill = b.pending / T.cap[lvl];
        cg.position.y = b.candyBase + Math.sin(clockTime * 2.6 + b.seed) * 0.09;
        b.candy.mesh.rotation.y += dt * 2.2;
        b.candy.mesh.rotation.z = Math.sin(clockTime * 1.7) * 0.3;
        cg.scale.setScalar(0.85 + fill * 0.7);
      }
    }
    const flick = 0.88 + Math.sin(clockTime * 11 + b.seed) * 0.06 + Math.sin(clockTime * 23 + b.seed * 3) * 0.05;
    const dim = 1 - b.sad * 0.75;
    const mdl = b.model;
    if (b.type === 'pumpkin') {
      mdl.faceMat.color.setRGB(3.2 * flick * dim, 1.6 * flick * dim, 0.35 * dim);
      mdl.pool.material.opacity = 0.35 * flick * dim;
      for (const p of mdl.pumpkins) p.rotation.z = Math.sin(clockTime * 32 + p.id) * 0.1 * b.sad;
    } else if (b.type === 'lantern') {
      mdl.coreMat.color.setRGB(4 * flick, 2.4 * flick, 0.8 * flick);
      mdl.pool.material.opacity = 0.55 * flick;
      mdl.ring.material.opacity = 0.22 + Math.sin(clockTime * 2) * 0.1;
      mdl.lamp.rotation.z = Math.sin(clockTime * 1.3 + b.seed) * 0.08;
      if (b.light) {
        b.light.color.set(0xffa04a);
        b.light.position.copy(b.group.position).add(mdl.lampLocal);
        b.light.intensity = 7 * flick;
        b.light.distance = TYPES.lantern.radius[lvl] * 2.2;
      }
    } else if (b.type === 'cauldron') {
      const pulse = 0.8 + Math.sin(clockTime * 3 + b.seed) * 0.2;
      mdl.brewMat.color.setRGB(0.5 * pulse * dim, 2.8 * pulse * dim, 0.6 * pulse * dim);
      mdl.pool.material.opacity = 0.5 * pulse * dim;
      for (const f of mdl.flames) { f.scale.set(1, 0.7 + Math.random() * 0.6, 1); }
      for (const bb of mdl.bubbles) {
        const u = bb.userData;
        const k = (clockTime * 0.7 + u.phase) % 1;
        bb.position.set(u.x * 0.8, 0.76 + k * 0.08, u.z * 0.8);
        bb.scale.setScalar(k < 0.85 ? 0.4 + k : (1 - k) * 6);
      }
      for (const sp of mdl.steam) {
        const k = (clockTime * 0.25 + sp.userData.phase) % 1;
        sp.position.set(Math.sin(k * 6 + sp.userData.phase * 9) * 0.15, 0.85 + k * 1.4, 0);
        sp.scale.setScalar(0.5 + k * 1.2);
        sp.material.opacity = 0.3 * Math.sin(k * Math.PI) * dim;
      }
      if (b.light) {
        b.light.color.set(0x55ff77);
        b.light.position.copy(b.group.position).add(new THREE.Vector3(0, 1.1, 0));
        b.light.intensity = 4 * pulse * dim;
        b.light.distance = 5;
      }
    } else if (b.type === 'castle') {
      mdl.winMat.color.setRGB(1.0 * flick, 2.8 * flick, 0.9 * flick);
      mdl.pool.material.opacity = 0.5 * flick;
      const fp = mdl.flag.geometry.attributes.position;
      for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(clockTime * 6 + fp.getX(i) * 18) * 0.03 * (fp.getX(i) + 0.1) * 5);
      fp.needsUpdate = true;
      for (const bat of mdl.bats) {
        const a = clockTime * 0.9 + bat.phase;
        bat.g.position.set(Math.cos(a) * bat.r, bat.h + Math.sin(clockTime * 2 + bat.phase) * 0.15, Math.sin(a) * bat.r);
        bat.g.rotation.y = -a;
        const flap = Math.sin(clockTime * 22 + bat.phase) * 0.8;
        bat.wings[0].rotation.z = flap; bat.wings[1].rotation.z = -flap;
      }
      b.zapFlash = Math.max(0, (b.zapFlash || 0) - dt * 4);
      b.zapT = (b.zapT ?? 1.5) - dt;
      if (b.zapT <= 0 && started) {
        const range = 2.6 + b.level * 0.5;
        let best = null, bd = range;
        for (const m of monsters) {
          if (!['walk', 'chase', 'emerge'].includes(m.state)) continue;
          const d = Math.hypot(m.pos.x - b.tile.x, m.pos.z - b.tile.z);
          if (d < bd) { bd = d; best = m; }
        }
        if (best) { castleZap(b, best); b.zapT = 3.2 - b.level * 0.5; } else b.zapT = 0.3;
      }
      if (b.light) {
        b.light.color.set(b.zapFlash > 0 ? 0xd8c8ff : 0x9a6bff);
        b.light.position.copy(b.group.position).add(new THREE.Vector3(0, 1.4, 0.6));
        b.light.intensity = 6 * flick + b.zapFlash * 60;
        b.light.distance = 6 + b.zapFlash * 4;
      }
    } else if (b.type === 'home') {
      mdl.winMat.color.setRGB(3 * flick * dim, 1.9 * flick * dim, 0.6 * dim);
      homeLight.position.copy(b.group.position).add(new THREE.Vector3(0.1, 0.8, 0.9));
      homeLight.intensity = 4 * flick * dim;
    }
  }
}

const bolts = [];
const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.0, 5.0), transparent: true, depthWrite: false });
function castleZap(b, m) {
  const from = b.group.position.clone().add(new THREE.Vector3(0.05, b.model.height - 0.25, -0.05));
  bolts.push({ from, m, life: 0.35, mesh: null });
  b.zapFlash = 1;
  sound.zap();
  S.stats.zaps = (S.stats.zaps || 0) + 1;
  const wp = m.model.group.position.clone().add(new THREE.Vector3(0, m.h + 0.5, 0));
  if (m.hp > 1) { m.hp--; m.flinch = 0.5; floatText(`ZAP! ×${m.hp}`, wp, 'boo'); }
  else { floatText('ZAP!', wp, 'boo'); scareMonster(m, false); }
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const bo = bolts[i];
    bo.life -= dt;
    if (bo.mesh) { scene.remove(bo.mesh); bo.mesh.geometry.dispose(); bo.mesh = null; }
    if (bo.life <= 0) { bolts.splice(i, 1); continue; }
    const to = bo.m.model.group.position.clone().add(new THREE.Vector3(0, bo.m.h * 0.6, 0));
    bo.mesh = new THREE.Mesh(X.makeBoltGeometry(bo.from, to), boltMat);
    bo.mesh.renderOrder = 8;
    scene.add(bo.mesh);
  }
}

/* ---------------- The Toy King ---------------- */
let king = null, kingT = 90;
function spawnKing() {
  if (king) return;
  const model = X.makeToyKing();
  const a = Math.PI + rand(-0.9, 0.9); // walks out of the far sea, facing the camera so you see its TV face
  const start = new THREE.Vector3(Math.sin(a) * 13, -3.8, Math.cos(a) * 13);
  king = {
    model, pos: start, state: 'rise', st: 0, yarn: 0, actT: 2, held: null, target: null, life: 80,
    yaw: Math.atan2(-start.x, -start.z), arm: 1.1, aim: new THREE.Vector3(), stepT: 0, clawStarted: false,
  };
  model.setArm(1.1, false);
  model.group.position.copy(start);
  scene.add(model.group);
  cam.pan = new THREE.Vector3(start.x * 0.42, 0, start.z * 0.42);
  showBanner('The Toy King is coming! 📺');
  sound.wave();
  setTimeout(() => sound.speak('I am the Toy King!', { pitch: 0.1, rate: 0.7 }), 500);
  setTimeout(() => toast('Tap the Toy King to tie it up with yarn! 🧶'), 4500);
}
function tieKing() {
  const K = king;
  if (!K || ['tied', 'leave', 'rise'].includes(K.state)) return;
  booGoTo(new THREE.Vector3(K.pos.x + 1.0, 0, K.pos.z + 0.9), 'zoom', 1.5);
  boo.booT = 0.6; boo.spin = Math.PI * 2;
  K.yarn++;
  K.model.addYarn(K.yarn - 1);
  sound.yarn();
  floatText(`🧶 ${K.yarn}/5`, K.pos.clone().add(new THREE.Vector3(0, 3.7, 0)), 'boo');
  if (K.held) { K.held.state = 'walk'; K.held = null; }
  if (K.yarn >= 5) {
    K.state = 'tied'; K.st = 0;
    S.stats.kings = (S.stats.kings || 0) + 1;
    sound.squeal();
    sound.speak('Nooo! You got me!', { pitch: 0.2, rate: 0.8 });
    showBanner('You tied up the Toy King! 🧶', true);
  } else if (['reach', 'retract', 'throw'].includes(K.state)) { K.state = 'idle'; K.actT = 2.5; }
}
const KING_WADE_Y = -0.95;
function updateKing(dt) {
  const K = king;
  if (!K) return;
  const mdl = K.model, g = mdl.group;
  K.st += dt;
  let moving = false, mode = 'smile';
  const R = Math.hypot(K.pos.x, K.pos.z);
  const inward = new THREE.Vector3(-K.pos.x, 0, -K.pos.z).normalize();
  const fwd = new THREE.Vector3(Math.sin(K.yaw), 0, Math.cos(K.yaw));
  const restAim = K.pos.clone().addScaledVector(fwd, 1.2).add(new THREE.Vector3(0, 0.8, 0));
  let aim = restAim;
  if (K.state === 'rise') {
    K.pos.y = Math.min(KING_WADE_Y, K.pos.y + dt * 1.2);
    if (K.pos.y >= KING_WADE_Y) { K.state = 'walk'; K.st = 0; }
  } else if (K.state === 'walk') {
    moving = true;
    K.pos.addScaledVector(inward, dt * 0.9);
    K.yaw = lerpAngle(K.yaw, Math.atan2(inward.x, inward.z), dt * 3);
    if (R < 7.3) { K.state = 'idle'; K.st = 0; K.actT = 1.5; }
  } else if (K.state === 'idle') {
    K.actT -= dt; K.life -= dt;
    K.yaw = lerpAngle(K.yaw, Math.atan2(boo.pos.x - K.pos.x, boo.pos.z - K.pos.z), dt * 2);
    K.arm += (1.1 - K.arm) * (1 - Math.exp(-dt * 4));
    if (K.life <= 0) {
      K.state = 'leave'; K.st = 0;
      sound.speak('Ha ha ha!', { pitch: 0.1, rate: 0.7 });
    } else if (K.actT <= 0) {
      let best = null, bd = 10;
      for (const m of monsters) {
        if (!['walk', 'chase'].includes(m.state)) continue;
        const d = Math.hypot(m.pos.x - K.pos.x, m.pos.z - K.pos.z);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) { K.target = best; K.state = 'reach'; K.st = 0; sound.whirr(); }
      else { spawnMonster(); K.actT = 4; sound.stomp(); } // calls a monster out of the dark
    }
  } else if (K.state === 'reach') {
    mode = 'grab';
    const m = K.target;
    if (!m || !['walk', 'chase'].includes(m.state)) { K.state = 'idle'; K.actT = 1; }
    else {
      aim = m.pos.clone().add(new THREE.Vector3(0, m.h * 0.55, 0));
      const sh = mdl.shoulder.getWorldPosition(new THREE.Vector3());
      const need = Math.max(1.1, sh.distanceTo(aim) - 0.2);
      K.arm = Math.min(need, K.arm + dt * 7);
      if (K.arm >= need - 0.01) {
        m.state = 'grabbed'; K.held = m; K.state = 'retract'; K.st = 0;
        sound.growl(1.4);
        floatText('😱', aim.clone().add(new THREE.Vector3(0, 0.6, 0)), 'info');
      }
    }
  } else if (K.state === 'retract') {
    mode = 'grab';
    K.arm = Math.max(1.5, K.arm - dt * 5);
    aim = K.pos.clone().addScaledVector(fwd, 0.5).add(new THREE.Vector3(0, 4.5, 0));
    if (K.arm <= 1.5 && K.st > 0.6) { K.state = 'throw'; K.st = 0; }
  } else if (K.state === 'throw') {
    mode = 'grab';
    const dir = new THREE.Vector3(boo.pos.x - K.pos.x, 0, boo.pos.z - K.pos.z).normalize();
    K.yaw = lerpAngle(K.yaw, Math.atan2(dir.x, dir.z), dt * 6);
    aim = K.pos.clone().addScaledVector(dir, K.st < 0.35 ? -0.6 : 1.6).add(new THREE.Vector3(0, K.st < 0.35 ? 4.6 : 3.0, 0));
    if (K.st > 0.5 && K.held) {
      const m = K.held;
      const land = boo.pos.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)));
      const T = 1.3;
      m.vel = new THREE.Vector3((land.x - m.pos.x) / T, (land.y - m.pos.y + 0.5 * 9.8 * T * T) / T, (land.z - m.pos.z) / T);
      m.state = 'thrown'; K.held = null;
      sound.whirr();
      floatText('Wheee!', m.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 'info');
    }
    if (K.st > 0.9) { K.state = 'idle'; K.actT = 5; }
  } else if (K.state === 'tied') {
    mode = 'tied';
    K.arm += (1.1 - K.arm) * (1 - Math.exp(-dt * 4));
    if (K.st > 1.8 && !K.clawStarted) { K.clawStarted = true; startClaw(); }
  } else if (K.state === 'leave') {
    moving = true;
    K.pos.addScaledVector(inward, -dt * 1.1);
    K.yaw = lerpAngle(K.yaw, Math.atan2(-inward.x, -inward.z), dt * 3);
    if (K.yarn >= 5) mode = 'tied';
    if (R > 10.5) K.pos.y -= dt * 1.4;
    if (K.pos.y < -4.5) { scene.remove(g); king = null; kingLight.intensity = 0; return; }
  }
  if (K.state !== 'rise' && !(K.state === 'leave' && R > 10.5)) {
    const gy = groundY(K.pos.x, K.pos.z);
    const floorY = gy <= -0.29 ? KING_WADE_Y : gy;
    K.pos.y += (floorY - K.pos.y) * (1 - Math.exp(-dt * 5));
  }
  if (moving) { K.stepT -= dt; if (K.stepT <= 0) { K.stepT = 0.7; sound.stomp(); } }
  g.position.copy(K.pos);
  g.rotation.y = K.yaw;
  mdl.shoulder.lookAt(aim);
  mdl.setArm(K.arm, K.state === 'reach');
  if (K.held) {
    const cw = mdl.clawWorld();
    K.held.pos.copy(cw).sub(new THREE.Vector3(0, K.held.h * 0.6, 0));
    K.held.model.group.position.copy(K.held.pos);
  }
  mdl.animate(clockTime, dt, moving, mode);
  kingLight.position.copy(K.pos).addScaledVector(fwd, 1.6).add(new THREE.Vector3(0, 3.0, 0));
  kingLight.intensity = 14 * mdl.screenMat.color.r / 1.7;
}

/* ---------------- Robot buddy ---------------- */
let buddy = null;
function createBuddy() {
  if (buddy) return;
  const model = X.makeRobotBuddy();
  model.group.scale.setScalar(1.3);
  buddy = { model, pos: boo.pos.clone().add(new THREE.Vector3(0.7, 0.7, 0.3)), mode: 'follow', target: null, guardCD: 0, fetchCD: 2, shieldT: 0 };
  model.group.position.copy(buddy.pos);
  scene.add(model.group);
}
function buddyGuard(m) {
  buddy.guardCD = 5; buddy.shieldT = 1;
  buddy.pos.copy(boo.pos).lerp(m.pos, 0.45).add(new THREE.Vector3(0, 0.4, 0));
  floatText('🛡️ BONK!', boo.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), 'boo');
  sound.zap();
  scareMonster(m, false);
}
function updateBuddy(dt) {
  const B = buddy;
  if (!B) return;
  B.guardCD -= dt; B.fetchCD -= dt; B.shieldT = Math.max(0, B.shieldT - dt);
  if (B.guardCD <= 0) {
    for (const m of monsters) {
      if (m.state === 'chase' && Math.hypot(m.pos.x - boo.pos.x, m.pos.z - boo.pos.z) < 1.3) { buddyGuard(m); break; }
    }
  }
  let goal = null;
  if (B.mode === 'fetch') {
    const b = B.target;
    if (!b || !b.pending || !buildings.includes(b)) B.mode = 'follow';
    else {
      goal = b.candy.group.getWorldPosition(new THREE.Vector3());
      if (B.pos.distanceTo(goal) < 0.4) { collect(b); B.mode = 'follow'; B.fetchCD = 3; }
    }
  }
  if (B.mode === 'follow') {
    const a = clockTime * 0.8;
    goal = boo.pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.8, 0.8 + Math.sin(clockTime * 2) * 0.08, Math.sin(a) * 0.5 + 0.3));
    if (B.fetchCD <= 0) {
      let best = null, bd = 99;
      for (const b of buildings) {
        if (!b.pending) continue;
        const d = Math.hypot(b.tile.x - boo.pos.x, b.tile.z - boo.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) { B.mode = 'fetch'; B.target = best; } else B.fetchCD = 1;
    }
  }
  const step = (B.mode === 'fetch' ? 4.5 : 3.2) * dt;
  const dv = goal.clone().sub(B.pos);
  if (dv.length() > step) dv.setLength(step + dv.length() * 0.04);
  B.pos.add(dv);
  const g = B.model.group;
  g.position.copy(B.pos);
  g.rotation.y = Math.atan2(camera.position.x - B.pos.x, camera.position.z - B.pos.z);
  B.model.shield.material.opacity = B.shieldT * 0.45;
  B.model.shield.scale.setScalar(1 + (1 - B.shieldT) * 0.5);
  B.model.animate(clockTime);
}

/* ---------------- The claw machine mini game ---------------- */
const claw = createClawGame({
  sound,
  environment: scene.environment,
  onPrize(p) {
    if (p.kind === 'buddy') {
      S.buddy = true;
      createBuddy();
      sound.claim();
      showBanner('You won a Robot Buddy! 🤖', true);
    } else {
      S.candy += p.value;
      S.stats.collected += p.value;
      candyChanged();
      sound.collect(5);
      toast(`+${p.value} 🍬`);
    }
    save();
  },
  onDone() {
    renderPass.scene = scene;
    renderPass.camera = camera;
    document.body.classList.remove('claw-mode');
    if (king) { king.state = 'leave'; king.st = 0; }
    save();
  },
});
function startClaw() {
  closePanel();
  claw.start({ hasBuddy: S.buddy });
  renderPass.scene = claw.scene;
  renderPass.camera = claw.camera;
  document.body.classList.add('claw-mode');
  redGoal = 0;
  vignette.uniforms.uRed.value = 0;
  sound.claim();
}

/* ---------------- spooky extras: lightning, creepy noises ---------------- */
let thunderT = rand(20, 35), creepyT = rand(8, 16), flash = 0;
const flashes = [];
function updateSpooky(dt) {
  thunderT -= dt; creepyT -= dt;
  if (thunderT <= 0) {
    thunderT = rand(25, 50);
    const t0 = clockTime;
    flashes.push(t0, t0 + 0.18);
    setTimeout(() => sound.thunder(), 500);
  }
  while (flashes.length && clockTime >= flashes[0]) { flashes.shift(); flash = 1; }
  flash = Math.max(0, flash - dt * 7);
  if (creepyT <= 0) { creepyT = rand(15, 30); sound.creepy(); }
}

/* ---------------- Spooky Graveyard ---------------- */
let lockSign = null;
const graveMist = [];
function addGraveMist() {
  for (const t of graveTiles) {
    if (X.hash(t.q, t.r, 8) > 0.6) continue;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.cloudTex, color: new THREE.Color(0.35, 1.0, 0.5), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    const s = rand(2.4, 3.6); sp.scale.set(s, s * 0.55, 1);
    sp.position.set(t.x, t.top + 0.25, t.z);
    sp.userData = { base: sp.position.clone(), ph: Math.random() * 10, rs: rand(-0.04, 0.04) };
    scene.add(sp); darkFog.push(sp); graveMist.push(sp);
  }
}
function makeLockSign() {
  const inner = graveTiles.filter((t) => X.hexDist(t.q, t.r) <= 5);
  const c = inner.reduce((v, t) => v.add(new THREE.Vector3(t.x, 0, t.z)), new THREE.Vector3()).divideScalar(Math.max(1, inner.length));
  const mat = new THREE.SpriteMaterial({ map: X.makeLabelTexture('🪦 Graveyard 🔒', { w: 440, h: 110, font: 52, bg: 'rgba(14,30,18,.9)' }), color: new THREE.Color(0.8, 0.85, 0.8), transparent: true, depthTest: false });
  lockSign = new THREE.Sprite(mat);
  lockSign.scale.set(3.4, 0.85, 1);
  lockSign.position.set(c.x, 1.3, c.z);
  lockSign.renderOrder = 21;
  scene.add(lockSign);
}
function openGravePanel() {
  panelFor = { kind: 'grave' };
  selected = null;
  refreshPanel();
}
function openGraveyard() {
  if (!spend(GRAVE_COST)) { sound.nope(); toast(`Need 🍬 ${GRAVE_COST}`); return; }
  S.graveyard = true;
  const keys = new Set(graveTiles.map((t) => t.key));
  for (const t of graveTiles) {
    t.kind = 'buy';
    t.mesh.geometry = geoFor(t);
    t.h = tileHeight(t); t.top = t.h + X.TILE_TOP;
    t.mesh.position.y = t.h; t.decor.position.y = t.top;
    clearDecor(t); decorate(t);
    t.anim = 0.5 + Math.random() * 0.5;
  }
  for (let i = darkFog.length - 1; i >= 0; i--) {
    if (keys.has(darkFog[i].userData.key)) { scene.remove(darkFog[i]); darkFog.splice(i, 1); }
  }
  addGraveMist();
  if (lockSign) { scene.remove(lockSign); lockSign = null; }
  computeFrontier();
  refreshLabels();
  closePanel();
  showBanner('The Spooky Graveyard is open! 🪦');
  sound.wave();
  setTimeout(() => sound.speak('Welcome… to the graveyard.', { pitch: 0.1, rate: 0.7 }), 600);
  setTimeout(() => { spawnMonster({ type: 'zombie' }); setTimeout(() => spawnMonster({ type: 'zombie' }), 1200); }, 3500);
  save();
}

/* ================================================================== */
/* UI                                                                 */
/* ================================================================== */
let shownCandy = S.candy;
function candyChanged(loss = false) {
  const el = $('candy-count');
  el.classList.remove('bump', 'loss'); void el.offsetWidth;
  el.classList.add(loss ? 'loss' : 'bump');
  refreshLabels();
  if (panelFor) refreshPanel();
}
function addCandy(n, worldPos) {
  S.candy += n;
  if (worldPos) flyCandy(worldPos, n);
  setTimeout(() => candyChanged(), worldPos ? 550 : 0);
}
function spend(n) {
  if (S.candy < n) return false;
  S.candy -= n;
  candyChanged(true);
  return true;
}
function updateHud() {
  shownCandy += (S.candy - shownCandy) * 0.2;
  if (Math.abs(S.candy - shownCandy) < 0.5) shownCandy = S.candy;
  $('candy-count').textContent = Math.round(shownCandy);
  $('candy-rate').textContent = `+${candyRate()}/min`;
  const am = activeMonsters().length;
  $('monster-meter').classList.toggle('hidden', am === 0);
  $('monster-count').textContent = am;
  updateGoal();
}

const project = (v) => {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, behind: p.z > 1 };
};

const floats = [];
function floatText(text, pos, cls = 'info') {
  const el = document.createElement('div');
  el.className = `ft ${cls}`;
  el.textContent = text;
  $('float-layer').appendChild(el);
  floats.push({ el, pos: pos.clone(), t: 0, dur: cls === 'boo' ? 1.3 : 1.2, cls });
}
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    const k = f.t / f.dur;
    if (k >= 1) { f.el.remove(); floats.splice(i, 1); continue; }
    const p = project(f.pos.clone().add(new THREE.Vector3(0, k * 1.1, 0)));
    const s = f.cls === 'boo' ? 0.6 + Math.min(1, k * 6) * 0.7 + Math.sin(f.t * 40) * 0.04 * (1 - k) : Math.min(1, k * 8);
    f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s}) rotate(${f.cls === 'boo' ? Math.sin(f.t * 30) * 6 * (1 - k) : 0}deg)`;
    f.el.style.opacity = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
  }
}

function flyCandy(worldPos, n) {
  const from = project(worldPos);
  const r = document.querySelector('#candy-pill .candy-icon').getBoundingClientRect();
  const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const k = Math.min(n, 6);
  for (let i = 0; i < k; i++) {
    const el = document.createElement('div');
    el.className = 'fly'; el.textContent = '🍬';
    $('float-layer').appendChild(el);
    const jx = from.x + rand(-60, 60), jy = from.y + rand(-70, -10);
    const anim = el.animate([
      { transform: `translate(${from.x}px, ${from.y}px) translate(-50%,-50%) scale(.5)` },
      { transform: `translate(${jx}px, ${jy}px) translate(-50%,-50%) scale(1.15)`, offset: 0.3 },
      { transform: `translate(${to.x}px, ${to.y}px) translate(-50%,-50%) scale(.7)` },
    ], { duration: 650 + i * 70, easing: 'cubic-bezier(.4,0,.7,.2)', fill: 'forwards' });
    anim.onfinish = () => el.remove();
  }
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('hidden'); void el.offsetWidth; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1600);
}
function showBanner(msg, happy = false) {
  const el = $('banner');
  el.textContent = msg;
  el.classList.toggle('happy', happy);
  el.classList.add('hidden'); void el.offsetWidth; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3400);
}

/* ---------------- bottom panel ---------------- */
let panelFor = null;
function openTilePanel(t) {
  panelFor = { kind: 'tile', t };
  selected = t;
  refreshPanel();
}
function openBuildingPanel(b) {
  panelFor = { kind: 'building', b };
  selected = b.tile;
  refreshPanel();
}
function closePanel() {
  panelFor = null; selected = null;
  $('panel').classList.add('hidden');
  document.body.classList.remove('panel-open');
}
function stars(l) { return '★'.repeat(l) + '☆'.repeat(3 - l); }
function makesText(type, lvl) {
  const T = TYPES[type];
  if (type === 'lantern') return `Light size ${lvl}`;
  return `Makes ${T.amount[lvl - 1]} 🍬`;
}
function refreshPanel() {
  const P = $('panel'), body = $('panel-body');
  if (!panelFor) return;
  P.classList.remove('hidden');
  document.body.classList.add('panel-open');
  body.innerHTML = '';
  if (panelFor.kind === 'grave') {
    $('panel-title').textContent = '🪦 Spooky Graveyard';
    const row = document.createElement('div');
    row.className = 'info-row';
    row.innerHTML = `<div class="bo-icon">🧟</div><div class="info-text"><b>Something is hiding in the dark…</b><br>A creepy graveyard full of graves. Zombies live there!</div>`;
    const up = document.createElement('button');
    up.className = 'big-btn levelup' + (S.candy < GRAVE_COST ? ' poor' : '');
    up.innerHTML = `🔓 Open it!<br>🍬 ${GRAVE_COST}`;
    up.onclick = openGraveyard;
    row.appendChild(up);
    body.appendChild(row);
    return;
  }
  if (panelFor.kind === 'tile') {
    $('panel-title').textContent = 'Build here!';
    for (const type of BUILDABLE) {
      const T = TYPES[type];
      const cost = T.costs[0];
      const btn = document.createElement('button');
      btn.className = 'build-opt' + (S.candy < cost ? ' poor' : '');
      btn.innerHTML = `<div class="bo-icon">${T.icon}</div><div class="bo-name">${T.name}</div><div class="bo-desc">${T.blurb}</div><div class="bo-cost">🍬 ${cost}</div>`;
      btn.onclick = () => tryBuild(panelFor.t, type);
      body.appendChild(btn);
    }
  } else {
    const b = panelFor.b, T = TYPES[b.type];
    $('panel-title').textContent = `${T.icon} ${T.name}`;
    const row = document.createElement('div');
    row.className = 'info-row';
    if (b.type === 'home') {
      row.innerHTML = `<div class="bo-icon">👻</div><div class="info-text"><b>Boo lives here!</b><br>Makes 1 🍬 all by itself. Monsters love to sneak up on it…</div>`;
    } else {
      const max = b.level >= 3;
      const next = max ? 0 : T.costs[b.level];
      row.innerHTML = `<div class="bo-icon">${T.icon}</div>
        <div class="info-text"><span class="stars">${stars(b.level)}</span><br><b>Level ${b.level}</b> · ${makesText(b.type, b.level)}${max ? '' : `<br>Next: ${makesText(b.type, b.level + 1)}`}</div>`;
      const up = document.createElement('button');
      up.className = 'big-btn levelup' + (!max && S.candy < next ? ' poor' : '');
      up.innerHTML = max ? '🌟 MAX!' : `⬆ Level up<br>🍬 ${next}`;
      if (!max) up.onclick = () => tryUpgrade(b);
      row.appendChild(up);
    }
    body.appendChild(row);
  }
}
$('panel-close').onclick = closePanel;

function tryBuild(t, type) {
  const cost = TYPES[type].costs[0];
  if (!spend(cost)) { sound.nope(); toast('Need more 🍬!'); return; }
  createBuilding(t, type, 1, true);
  sound.build();
  floatText('✨', new THREE.Vector3(t.x, t.top + 1, t.z), 'info');
  booGoTo(new THREE.Vector3(t.x + 0.6, 0, t.z + 0.6), 'visit', 2.5);
  closePanel();
  save();
}
function tryUpgrade(b) {
  const cost = TYPES[b.type].costs[b.level];
  if (!spend(cost)) { sound.nope(); toast('Need more 🍬!'); return; }
  b.level++;
  buildModel(b);
  b.pop = 1;
  sound.build();
  floatText('⬆ Level up!', b.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 'plus');
  refreshPanel();
  save();
}

function buyTile(t) {
  if (!spend(t.price)) { sound.nope(); toast(`Need 🍬 ${t.price}`); return; }
  t.kind = 'owned';
  t.mesh.geometry = geoFor(t);
  clearDecor(t);
  t.h = tileHeight(t); t.top = t.h + X.TILE_TOP;
  t.decor.position.y = t.top;
  decorate(t);
  t.anim = 1;
  S.stats.bought++;
  refreshLabels();
  sound.buy();
  floatText('✨ New land! ✨', new THREE.Vector3(t.x, t.top + 0.8, t.z), 'plus');
  booGoTo(new THREE.Vector3(t.x, 0, t.z + 0.5), 'visit', 2.5);
  save();
}

/* ---------------- goals ---------------- */
function updateGoal() {
  const g = goalAt(S.goal);
  const v = Math.min(g.val(), g.need);
  const done = v >= g.need;
  $('goal-icon').textContent = g.icon;
  $('goal-text').textContent = g.text;
  $('goal-prog').textContent = done ? 'Tap me!' : `${v}/${g.need}`;
  $('goal-fill').style.width = `${(v / g.need) * 100}%`;
  $('goal-reward').textContent = `🍬 ${g.reward}`;
  $('goal-card').classList.toggle('done', done);
}
$('goal-card').onclick = () => {
  const g = goalAt(S.goal);
  if (g.val() < g.need) { toast(`${g.icon} ${g.text}`); return; }
  S.goal++;
  sound.claim();
  const r = $('goal-card').getBoundingClientRect();
  S.candy += g.reward;
  // fly candy from the goal card to the counter
  const to = document.querySelector('#candy-pill .candy-icon').getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div'); el.className = 'fly'; el.textContent = '🍬';
    $('float-layer').appendChild(el);
    el.animate([
      { transform: `translate(${r.right - 40}px, ${r.top + r.height / 2}px) scale(.6)` },
      { transform: `translate(${to.left}px, ${to.top}px) scale(.8)` },
    ], { duration: 500 + i * 90, easing: 'ease-in', fill: 'forwards' }).onfinish = () => el.remove();
  }
  setTimeout(() => candyChanged(), 550);
  updateGoal();
  save();
};

/* ---------------- settings & sound ---------------- */
function refreshSoundBtn() { $('btn-sound').textContent = sound.muted ? '🔇' : '🔊'; }
refreshSoundBtn();
$('btn-sound').onclick = () => {
  sound.setMuted(!sound.muted);
  try { localStorage.setItem('wofm-muted', sound.muted ? '1' : '0'); } catch { /* ignore */ }
  refreshSoundBtn();
};
$('btn-gear').onclick = () => {
  $('settings').classList.remove('hidden');
  $('btn-restart').textContent = 'Start Over';
  $('btn-restart').dataset.armed = '0';
};
$('btn-settings-close').onclick = () => $('settings').classList.add('hidden');
$('btn-restart').onclick = (e) => {
  if (e.currentTarget.dataset.armed !== '1') {
    e.currentTarget.dataset.armed = '1';
    e.currentTarget.textContent = 'Really? Tap again!';
    return;
  }
  // Reloading hides the page, which normally triggers a save; block that or the old game comes right back.
  resetting = true;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.reload();
};

/* ================================================================== */
/* Tapping things                                                     */
/* ================================================================== */
function handleTap(x, y) {
  if (!started) return;
  const ray = rayFrom(x, y);
  // 1. candy
  const candyHits = buildings.filter((b) => b.pending > 0).map((b) => b.candyHit);
  let hit = ray.intersectObjects(candyHits, false)[0];
  if (hit) { collect(hit.object.userData.building); return; }
  // 2. monsters
  const mHits = monsters.filter((m) => ['emerge', 'walk', 'chase'].includes(m.state)).map((m) => m.model.hit);
  hit = ray.intersectObjects(mHits, false)[0];
  if (hit) { booAttack(hit.object.userData.monster); return; }
  // 3. the Toy King -> tie it up with yarn
  if (king && ray.intersectObject(king.model.hit, false)[0]) { tieKing(); return; }
  // 3b. Boo
  if (ray.intersectObject(booHit, false)[0]) {
    boo.spin = Math.PI * 2; boo.booT = 0.6;
    sound.speak('Meow!', { pitch: 1.9, rate: 1.2 });
    floatText('meow! 💜', boo.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 'info');
    return;
  }
  // 4. graveyard sign
  if (lockSign && ray.intersectObject(lockSign, false)[0]) { openGravePanel(); return; }
  // 5. buildings / tiles
  hit = ray.intersectObjects([...buildingHits, ...tileMeshes], false)[0];
  if (!hit) { closePanel(); return; }
  tapTile(hit.object.userData.tile);
}

function tapTile(t) {
  if (t.kind === 'owned') {
    if (t.building) {
      if (collect(t.building)) return;
      openBuildingPanel(t.building);
    } else {
      openTilePanel(t);
      booGoTo(new THREE.Vector3(t.x + 0.5, 0, t.z + 0.6), 'visit', 3.5);
    }
  } else if (t.kind === 'buy') {
    closePanel();
    if (!neighbors(t).some((n) => n.kind === 'owned')) { sound.nope(); toast('Buy the tiles next to your land first!'); return; }
    buyTile(t);
  } else if (t.grave && !S.graveyard) {
    openGravePanel();
  } else {
    closePanel();
    toast('Too dark in there… 👀');
    const e = eyes.find((ee) => ee.state === 'hidden') || eyes[0];
    placeEyes(e, t); e.state = 'opening'; e.t = 0.35;
    sound.growl(1.6);
  }
}

/* ================================================================== */
/* Save                                                               */
/* ================================================================== */
function save() {
  if (resetting) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      candy: S.candy, goal: S.goal, stats: S.stats, graveyard: S.graveyard, buddy: S.buddy,
      owned: [...tiles.values()].filter((t) => t.kind === 'owned').map((t) => t.key),
      buildings: buildings.filter((b) => b.type !== 'home').map((b) => ({ k: b.tile.key, type: b.type, level: b.level })),
    }));
  } catch { /* storage is optional */ }
}
setInterval(() => { if (started) save(); }, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden && started) save(); });

/* ================================================================== */
/* Boot                                                               */
/* ================================================================== */
let clockTime = 0;
const clock = new THREE.Clock();

function boot() {
  generateWorld();
  createBuilding(tiles.get('0,0'), 'home', 1, false);
  for (const sb of saved?.buildings || []) {
    const t = tiles.get(sb.k);
    if (t && t.kind === 'owned' && !t.building && TYPES[sb.type]) createBuilding(t, sb.type, clamp(sb.level | 0, 1, 3), false);
  }
  buildAtmosphere();
  if (S.buddy) createBuddy();
  refreshLabels();
  updateGoal();
}

function frame() {
  const dt = clamp(clock.getDelta(), 0.0001, 0.05);
  clockTime += dt;
  if (claw.active) {
    claw.update(dt);
    vignette.uniforms.uTime.value = clockTime;
    composer.render();
    requestAnimationFrame(frame);
    return;
  }
  if (started) {
    updateKing(dt);
    updateBuddy(dt);
    updateMonsters(dt);
    updateBolts(dt);
    updatePower(dt);
    updateSpooky(dt);
    updateFloats(dt);
    updateHud();
  }
  updateBuildings(dt);
  updateBoo(dt);
  updateAtmosphere(dt);
  updateFireflies();
  for (const t of tiles.values()) {
    if (t.anim > 0) {
      t.anim = Math.max(0, t.anim - dt * 2);
      const k = 1 - t.anim;
      const s = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
      t.mesh.position.y = t.h - 0.5 * (1 - s);
      t.decor.position.y = t.mesh.position.y + X.TILE_TOP;
      t.decor.scale.setScalar(Math.max(0.01, s));
    }
  }
  if (selected) {
    selectRing.visible = true;
    selectRing.position.set(selected.x, selected.top + 0.015, selected.z);
    selectRing.material.opacity = 0.6 + Math.sin(clockTime * 5) * 0.25;
  } else selectRing.visible = false;
  updateCamera(dt);
  composer.render();
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  claw.resize();
});

$('btn-play').onclick = () => {
  sound.init();
  started = true;
  $('title').classList.add('gone');
  setTimeout(() => $('title').classList.add('hidden'), 900);
  cam.goal = innerWidth < innerHeight ? 22 : 15;
  setTimeout(() => sound.speak('Watch out for the monsters, boo!', { pitch: 0.3, rate: 0.8 }), 500);
  if (!saved) setTimeout(() => toast('Tap the grass to build! 🎃'), 2500);
};

(document.fonts?.ready ?? Promise.resolve()).then(() => {
  boot();
  requestAnimationFrame(frame);
});

// handy for tinkering from the console
window.game = { get king() { return king; }, S, cam, boo, monsters, buildings, toyKing: () => spawnKing(), clawGame: () => startClaw(), tieKing: () => tieKing(), thunder: () => { thunderT = 0; }, zombie: () => spawnMonster({ type: 'zombie' }), giant: () => spawnMonster({ type: 'peeper', size: 1.8, hp: 3 }), spawnMonster, startWave: () => startWave(producers().length), addCandy: (n) => addCandy(n) };
