// All 3D models are built from code (no asset files), so everything is tweakable.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/* Hex math (pointy-top, axial coords)                                */
/* ------------------------------------------------------------------ */
export const HEX = 1.0;
const SQ3 = Math.sqrt(3);
export const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const hexKey = (q, r) => `${q},${r}`;
export function hexToWorld(q, r) {
  return { x: HEX * SQ3 * (q + r / 2), z: HEX * 1.5 * r };
}
export function worldToHex(x, z) {
  const q = ((SQ3 / 3) * x - (1 / 3) * z) / HEX;
  const r = ((2 / 3) * z) / HEX;
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}
export const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
export function hash(q, r, salt = 0) {
  let h = Math.imul(q * 374761393 + r * 668265263 + salt * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822519);
    s = Math.imul(s ^ (s >>> 13), 3266489917);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967295;
  };
}

/* ------------------------------------------------------------------ */
/* Textures                                                           */
/* ------------------------------------------------------------------ */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const glowTex = canvasTex(128, 128, (g, w) => {
  const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, w);
});

export const cloudTex = canvasTex(256, 256, (g, w) => {
  const r = rng(7);
  for (let i = 0; i < 26; i++) {
    const x = w / 2 + (r() - 0.5) * w * 0.5, y = w / 2 + (r() - 0.5) * w * 0.5;
    const rad = w * (0.12 + r() * 0.22);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }
});

const ringTex = canvasTex(256, 256, (g, w) => {
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 6;
  g.setLineDash([18, 14]);
  g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2); g.stroke();
});

const faceTex = canvasTex(256, 256, (g) => {
  g.fillStyle = '#fff';
  const tri = (pts) => { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fill(); };
  tri([[62, 110], [108, 110], [88, 62]]);          // left eye
  tri([[148, 110], [194, 110], [168, 62]]);        // right eye
  tri([[116, 140], [140, 140], [128, 118]]);       // nose
  g.beginPath();                                    // jagged grin
  g.moveTo(48, 160);
  const teeth = [[70, 176], [84, 164], [100, 186], [118, 170], [138, 188], [156, 170], [172, 184], [188, 164], [208, 160]];
  for (const p of teeth) g.lineTo(...p);
  g.quadraticCurveTo(176, 228, 128, 226);
  g.quadraticCurveTo(76, 228, 48, 160);
  g.fill();
});

const veinTex = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#f4eee6'; g.fillRect(0, 0, w, h);
  const r = rng(3);
  g.strokeStyle = 'rgba(190,20,30,.75)';
  for (let i = 0; i < 30; i++) {
    let x = r() * w, y = h * (0.55 + r() * 0.45);
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 22; y -= r() * 12; g.lineTo(x, y); }
    g.stroke();
  }
});

// Tileable water normal map from summed sine waves.
export function makeWaterNormals(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const r = rng(11);
  const waves = Array.from({ length: 7 }, () => ({
    fx: Math.floor(r() * 6) + 1, fy: Math.floor(r() * 6) - 3, ph: r() * 6.28, a: 0.4 + r() * 0.6,
  }));
  const hgt = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin(((w.fx * x + w.fy * y) / size) * Math.PI * 2 + w.ph), 0);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
    const i = (y * size + x) * 4;
    data[i] = (n.x * 0.5 + 0.5) * 255; data[i + 1] = (n.y * 0.5 + 0.5) * 255; data[i + 2] = (n.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export function makeLabelTexture(text, { bg = 'rgba(20,14,36,.85)', fg = '#fff', w = 256, h = 96, font = 50 } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    const rad = h / 2 - 6;
    g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, rad); g.fill();
    g.strokeStyle = 'rgba(200,170,255,.55)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = fg; g.font = `700 ${font}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

/* ------------------------------------------------------------------ */
/* Materials                                                          */
/* ------------------------------------------------------------------ */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
export const hdr = (r, g, b) => new THREE.Color(r, g, b);
const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c });

const M = {
  wood: std(0x3a2a22, { roughness: 0.9 }),
  darkWood: std(0x231914, { roughness: 0.95 }),
  bark: std(0x2b2522, { roughness: 1 }),
  stone: std(0x6d6a7a, { roughness: 0.95 }),
  mossStone: std(0x556052, { roughness: 1 }),
  soil: std(0x2e2018, { roughness: 1 }),
  vine: std(0x2f5a2a, { roughness: 0.7 }),
  pumpkin: std(0xe8661c, { roughness: 0.55, emissive: 0x7a2200, emissiveIntensity: 0.25 }),
  stem: std(0x4a5a22, { roughness: 0.9 }),
  iron: std(0x1c1b22, { roughness: 0.35, metalness: 0.8 }),
  houseWall: std(0x463a5e, { roughness: 0.9 }),
  roof: std(0x231a33, { roughness: 0.8 }),
  black: new THREE.MeshBasicMaterial({ color: 0x050308 }),
  white: std(0xf2efe8, { roughness: 0.4 }),
  shroomStem: std(0xd8d2c4, { roughness: 0.8 }),
};

/* ------------------------------------------------------------------ */
/* Hex tile geometry with baked top/side colors                       */
/* ------------------------------------------------------------------ */
const TILE_DEPTH = 1.6;
export const TILE_TOP = 0.06;
const tileShape = (() => {
  const s = new THREE.Shape();
  const rad = HEX * 0.93;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
})();

export function makeTileGeometry(top, side) {
  const g = new THREE.ExtrudeGeometry(tileShape, {
    depth: TILE_DEPTH, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -TILE_DEPTH, 0);
  g.clearGroups();
  const ct = new THREE.Color(top), cs = new THREE.Color(side);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = y > 0.025 ? ct : y > -0.05 ? ct.clone().lerp(cs, 0.6) : cs;
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export const TILE_GEOS = {
  owned: makeTileGeometry(0x3f6e35, 0x3a291e),
  buy: makeTileGeometry(0x4e4b5c, 0x2a2631),
  dark: makeTileGeometry(0x15111d, 0x0c0910),
  grave: makeTileGeometry(0x3c4a3e, 0x26241f),
};
export const TILE_MATS = [1, 0.92, 1.06, 0.97].map((v, i) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, color: new THREE.Color(v, v * (i === 2 ? 0.97 : 1), v * (i === 1 ? 0.95 : 1)) })
);

export function makeSelectRing() {
  const g = new THREE.RingGeometry(HEX * 0.8, HEX * 0.97, 6, 1, Math.PI / 2);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color: hdr(1.2, 2.2, 3.0), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 5;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Ground decals                                                      */
/* ------------------------------------------------------------------ */
export function makePool(color, size, opacity = 0.5) {
  const m = new THREE.MeshBasicMaterial({
    map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 2;
  return mesh;
}
export function makeSafeRing(radius) {
  const m = new THREE.MeshBasicMaterial({
    map: ringTex, color: hdr(1.0, 0.8, 0.4), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.renderOrder = 3;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Decorations                                                        */
/* ------------------------------------------------------------------ */
function placed(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }) {
  const o = new THREE.Object3D();
  o.position.set(...p); o.rotation.set(...r); o.scale.set(...s);
  o.updateMatrix();
  return geo.clone().applyMatrix4(o.matrix);
}

export function makeDeadTree(seed) {
  const r = rng(seed);
  const parts = [];
  const h = 0.9 + r() * 0.7;
  const trunk = new THREE.CylinderGeometry(0.05, 0.11, h, 7);
  parts.push(placed(trunk, { p: [0, h / 2, 0], r: [(r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.2] }));
  const branch = (len, rad) => new THREE.CylinderGeometry(rad * 0.4, rad, len, 5).translate(0, len / 2, 0);
  const nb = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const y = h * (0.45 + r() * 0.5);
    const yaw = r() * Math.PI * 2;
    const tilt = 0.6 + r() * 0.7;
    const len = 0.3 + r() * 0.35;
    const o = new THREE.Object3D();
    o.position.set(0, y, 0); o.rotation.set(0, yaw, tilt, 'YXZ'); o.updateMatrix();
    parts.push(branch(len, 0.04).applyMatrix4(o.matrix));
    // twig
    const o2 = new THREE.Object3D();
    o2.position.set(0, len * 0.8, 0); o2.rotation.set(0, (r() - 0.5) * 2, -0.7 + r() * 0.3); o2.updateMatrix();
    o2.matrix.premultiply(o.matrix);
    parts.push(branch(len * 0.5, 0.02).applyMatrix4(o2.matrix));
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), M.bark);
  mesh.castShadow = true;
  mesh.rotation.y = r() * Math.PI * 2;
  return mesh;
}

const graveGeo = mergeGeometries([
  new THREE.BoxGeometry(0.32, 0.36, 0.08).translate(0, 0.18, 0),
  new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.36, 0),
]);
export function makeGrave(seed) {
  const r = rng(seed);
  const m = new THREE.Mesh(graveGeo, r() > 0.5 ? M.stone : M.mossStone);
  m.rotation.set((r() - 0.5) * 0.25, r() * Math.PI * 2, (r() - 0.5) * 0.3);
  const s = 0.8 + r() * 0.5; m.scale.setScalar(s);
  m.castShadow = true;
  return m;
}

const rockGeo = new THREE.DodecahedronGeometry(0.14, 0);
export function makeRock(seed) {
  const r = rng(seed);
  const m = new THREE.Mesh(rockGeo, M.stone);
  m.scale.set(1 + r(), 0.5 + r() * 0.5, 1 + r() * 0.6);
  m.rotation.set(r(), r() * 6, r());
  m.position.y = 0.03;
  m.castShadow = true;
  return m;
}

const shroomCapGeo = new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const shroomStemGeo = new THREE.CylinderGeometry(0.018, 0.026, 0.09, 6).translate(0, 0.045, 0);
const shroomGlow = [hdr(0.3, 2.2, 2.4), hdr(1.8, 0.5, 2.6), hdr(0.6, 2.4, 0.6)];
const shroomMats = shroomGlow.map((c) => new THREE.MeshStandardMaterial({ color: 0x223344, emissive: c, emissiveIntensity: 1, roughness: 0.5 }));
export function makeMushrooms(seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  const mat = shroomMats[Math.floor(r() * shroomMats.length)];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.6 + r() * 0.9;
    const m = new THREE.Group();
    m.add(new THREE.Mesh(shroomStemGeo, M.shroomStem));
    const cap = new THREE.Mesh(shroomCapGeo, mat); cap.position.y = 0.085; m.add(cap);
    m.position.set((r() - 0.5) * 0.35, 0, (r() - 0.5) * 0.35);
    m.scale.setScalar(s);
    m.rotation.z = (r() - 0.5) * 0.4;
    g.add(m);
  }
  return g;
}

const tuftGeo = mergeGeometries([0, 1, 2, 3, 4].map((i) =>
  new THREE.ConeGeometry(0.025, 0.18, 3).translate(0, 0.09, 0).rotateZ((i - 2) * 0.25).rotateY(i * 1.3).translate((i - 2) * 0.03, 0, 0)));
const tuftMat = std(0x4d7d3a, { roughness: 0.9 });
export function makeTuft(seed) {
  const r = rng(seed);
  const m = new THREE.Mesh(tuftGeo, tuftMat);
  m.rotation.y = r() * 6; m.scale.setScalar(0.7 + r() * 0.8);
  return m;
}

/* ------------------------------------------------------------------ */
/* Pumpkins                                                           */
/* ------------------------------------------------------------------ */
const PUMPKIN_SQUASH = 0.72;
const pumpkinGeo = (() => {
  const g = new THREE.SphereGeometry(1, 40, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rib = 1 + 0.07 * Math.cos(Math.atan2(z, x) * 8);
    const dent = 1 - 0.18 * Math.pow(Math.abs(y), 8);
    p.setXYZ(i, x * rib * dent, y * PUMPKIN_SQUASH, z * rib * dent);
  }
  g.computeVertexNormals();
  return g;
})();
const faceGeo = (() => {
  const g = new THREE.PlaneGeometry(1.15, 1.15, 12, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) / PUMPKIN_SQUASH * 0.72;
    const zz = Math.sqrt(Math.max(0.0, 1 - x * x - (y / PUMPKIN_SQUASH) ** 2 * 0.6)) * 1.075;
    p.setXYZ(i, x, y * 0.9, zz);
  }
  g.computeVertexNormals();
  return g;
})();
const stemGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.35, 6).translate(0, 0.17, 0);

export function makePumpkin(size, faceMat, withFace = true) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(pumpkinGeo, M.pumpkin);
  body.castShadow = true;
  g.add(body);
  const stem = new THREE.Mesh(stemGeo, M.stem);
  stem.position.y = PUMPKIN_SQUASH * 0.86; stem.rotation.z = 0.25;
  g.add(stem);
  if (withFace) g.add(new THREE.Mesh(faceGeo, faceMat));
  g.scale.setScalar(size);
  g.position.y = size * PUMPKIN_SQUASH * 0.9;
  return g;
}

export function makePumpkinPatch(level, seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, color: hdr(3.2, 1.6, 0.35), transparent: true, alphaTest: 0.3 });
  // soil mound
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.08, 14), M.soil);
  mound.position.y = 0.04; mound.receiveShadow = true;
  g.add(mound);
  const layouts = {
    1: [[0, 0.05, 0.4]],
    2: [[-0.25, 0.1, 0.26], [0.28, -0.12, 0.22], [0.0, -0.45, 0.14, true]],
    3: [[-0.28, 0.12, 0.3], [0.3, -0.1, 0.26], [0.05, -0.48, 0.17], [0.42, 0.4, 0.15, true], [-0.45, -0.35, 0.13, true]],
  }[level];
  const pumpkins = [];
  for (const [x, z, s, noFace] of layouts) {
    const p = makePumpkin(s, faceMat, !noFace);
    p.position.x = x; p.position.z = z + 0.1;
    p.rotation.y = (r() - 0.5) * 0.6;
    g.add(p);
    pumpkins.push(p);
  }
  // curly vines
  for (let i = 0; i < 3 + level; i++) {
    const a0 = r() * Math.PI * 2;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = a0 + k * 0.5, rad = 0.2 + k * 0.09;
      pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.09 + Math.sin(k) * 0.02, Math.sin(a) * rad));
    }
    const vine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.018, 5), M.vine);
    g.add(vine);
  }
  // spooky scarecrow-stick at level 3
  if (level >= 3) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.2, 6), M.wood);
    pole.position.set(-0.55, 0.6, 0.3); g.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), M.wood);
    arm.rotation.z = Math.PI / 2; arm.position.set(-0.55, 0.95, 0.3); g.add(arm);
    const head = makePumpkin(0.13, faceMat);
    head.position.set(-0.55, 1.25, 0.3); g.add(head);
  }
  const pool = makePool(hdr(1.0, 0.45, 0.1), 2.6, 0.35);
  g.add(pool);
  return { group: g, faceMat, pumpkins, pool, height: 0.9 + (level >= 3 ? 0.5 : 0) };
}

/* ------------------------------------------------------------------ */
/* Lantern                                                            */
/* ------------------------------------------------------------------ */
export function makeLantern(level, radius) {
  const g = new THREE.Group();
  const H = 1.5 + level * 0.15;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, H, 7), M.darkWood);
  post.position.y = H / 2; post.castShadow = true; g.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 8), M.stone);
  base.position.y = 0.06; base.castShadow = true; g.add(base);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.045), M.darkWood);
  arm.position.set(0.2, H - 0.05, 0); g.add(arm);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.03), M.darkWood);
  brace.position.set(0.1, H - 0.16, 0); brace.rotation.z = 0.7; g.add(brace);

  const lamp = new THREE.Group();
  lamp.position.set(0.42, H - 0.12, 0);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), M.iron);
  chain.position.y = 0.0; lamp.add(chain);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.12, 4), M.iron);
  cap.position.y = -0.1; cap.rotation.y = Math.PI / 4; cap.castShadow = true; lamp.add(cap);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.17), M.iron);
  bottom.position.y = -0.36; lamp.add(bottom);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.02), M.iron);
    bar.position.set(x * 0.075, -0.25, z * 0.075); lamp.add(bar);
  }
  const coreMat = glowMat(hdr(4, 2.4, 0.8));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), coreMat);
  core.position.y = -0.25; lamp.add(core);
  const glassMat = new THREE.MeshBasicMaterial({ color: hdr(1.2, 0.7, 0.25), transparent: true, opacity: 0.35, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), glassMat);
  glass.position.y = -0.25; lamp.add(glass);
  g.add(lamp);

  const pool = makePool(hdr(1.0, 0.62, 0.25), radius * 2.4, 0.55);
  g.add(pool);
  const ring = makeSafeRing(radius);
  g.add(ring);
  const lampWorld = new THREE.Vector3(0.42, H - 0.37, 0);
  return { group: g, coreMat, glassMat, pool, ring, lamp, lampLocal: lampWorld, height: H + 0.2 };
}

/* ------------------------------------------------------------------ */
/* Witch pot (cauldron)                                               */
/* ------------------------------------------------------------------ */
export function makeCauldron(level) {
  const g = new THREE.Group();
  const s = 0.85 + level * 0.12;
  const pot = new THREE.Group();
  pot.scale.setScalar(s);
  g.add(pot);
  const prof = [[0.0, 0.0], [0.22, 0.01], [0.36, 0.08], [0.45, 0.22], [0.46, 0.36], [0.41, 0.5], [0.36, 0.56], [0.4, 0.6], [0.42, 0.64], [0.37, 0.65], [0.34, 0.58]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ color: 0x18171d, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide }));
  body.position.y = 0.18; body.castShadow = true; pot.add(body);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.26, 6), M.iron);
    leg.position.set(Math.cos(a) * 0.28, 0.12, Math.sin(a) * 0.28); leg.rotation.z = Math.cos(a) * 0.25; leg.rotation.x = -Math.sin(a) * 0.25;
    pot.add(leg);
  }
  const brewMat = new THREE.MeshBasicMaterial({ color: hdr(0.5, 2.8, 0.6) });
  const brew = new THREE.Mesh(new THREE.CircleGeometry(0.36, 28), brewMat);
  brew.rotation.x = -Math.PI / 2; brew.position.y = 0.18 + 0.58; pot.add(brew);
  // logs + fire
  const logs = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), M.wood);
    log.rotation.z = Math.PI / 2; log.rotation.y = (i / 3) * Math.PI; log.position.y = 0.04; logs.add(log);
  }
  pot.add(logs);
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: hdr(3.5, 1.2, 0.2), transparent: true, opacity: 0.9, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), flameMat);
    const a = (i / 4) * Math.PI * 2;
    f.position.set(Math.cos(a) * 0.1, 0.1, Math.sin(a) * 0.1);
    pot.add(f); flames.push(f);
  }
  // bubbles
  const bubbleMat = new THREE.MeshBasicMaterial({ color: hdr(0.6, 3.2, 0.8), transparent: true, opacity: 0.9 });
  const bubbles = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), bubbleMat);
    b.userData.phase = Math.random();
    b.userData.x = (Math.random() - 0.5) * 0.45; b.userData.z = (Math.random() - 0.5) * 0.45;
    pot.add(b); bubbles.push(b);
  }
  // steam
  const steam = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: hdr(0.4, 1.1, 0.5), transparent: true, opacity: 0.25, depthWrite: false }));
    sp.userData.phase = i / 3; pot.add(sp); steam.push(sp);
  }
  const pool = makePool(hdr(0.25, 1.2, 0.3), 3.0, 0.5);
  g.add(pool);
  return { group: g, brewMat, flames, bubbles, steam, pool, s, height: 1.1 * s };
}

/* ------------------------------------------------------------------ */
/* Boo's crooked house                                                */
/* ------------------------------------------------------------------ */
export function makeHome() {
  const g = new THREE.Group();
  const house = new THREE.Group();
  house.rotation.z = 0.035; house.rotation.y = -0.2;
  g.add(house);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.85), M.houseWall);
  walls.position.y = 0.425; walls.castShadow = true; walls.receiveShadow = true; house.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.85, 4), M.roof);
  roof.position.y = 1.27; roof.rotation.y = Math.PI / 4; roof.rotation.z = -0.06; roof.scale.set(1, 1, 0.95); roof.castShadow = true; house.add(roof);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.36), M.houseWall);
  tower.position.set(0.32, 1.25, -0.1); tower.rotation.z = -0.08; tower.castShadow = true; house.add(tower);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 4), M.roof);
  towerRoof.position.set(0.35, 1.85, -0.1); towerRoof.rotation.set(0, Math.PI / 4, -0.15); towerRoof.castShadow = true; house.add(towerRoof);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), M.stone);
  chimney.position.set(-0.3, 1.35, -0.15); house.add(chimney);
  const winMat = glowMat(hdr(3.0, 1.9, 0.6));
  const addWin = (x, y, z, w, h, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), winMat);
    m.position.set(x, y, z); m.rotation.y = ry; house.add(m);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.12, h), M.darkWood);
    frame.position.set(x, y, z + 0.002); frame.rotation.y = ry; house.add(frame);
  };
  addWin(-0.24, 0.55, 0.427, 0.2, 0.26);
  addWin(0.3, 1.3, 0.082, 0.14, 0.18);
  addWin(0.478, 0.5, 0.05, 0.22, 0.24, Math.PI / 2);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.42), M.darkWood);
  door.position.set(0.18, 0.21, 0.428); house.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), glowMat(hdr(2.5, 1.8, 0.5)));
  knob.position.set(0.25, 0.21, 0.44); house.add(knob);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.16), M.stone);
  step.position.set(0.18, 0.03, 0.5); house.add(step);
  const grave = makeGrave(42); grave.position.set(-0.55, 0, 0.5); g.add(grave);
  const pool = makePool(hdr(1.0, 0.6, 0.25), 3.2, 0.4);
  g.add(pool);
  return { group: g, winMat, pool, height: 2.0 };
}

/* ------------------------------------------------------------------ */
/* Candy                                                              */
/* ------------------------------------------------------------------ */
const candyGeo = mergeGeometries([
  new THREE.SphereGeometry(0.12, 16, 12).scale(1.3, 1, 1),
  new THREE.ConeGeometry(0.1, 0.16, 8).rotateZ(Math.PI / 2).translate(0.23, 0, 0),
  new THREE.ConeGeometry(0.1, 0.16, 8).rotateZ(-Math.PI / 2).translate(-0.23, 0, 0),
]);
const candyMats = [0xff5ccf, 0x7f6bff, 0x4fe0c0, 0xffc04d].map((c) =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 }));
export function makeCandy(i = 0) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(candyGeo, candyMats[i % candyMats.length]);
  g.add(m);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(1.2, 0.5, 1.0), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.9);
  g.add(halo);
  return { group: g, mesh: m };
}

/* ------------------------------------------------------------------ */
/* Boo the ghost                                                      */
/* ------------------------------------------------------------------ */
export function makeBoo() {
  const g = new THREE.Group();
  const pts = [new THREE.Vector2(0.4, 0.0), new THREE.Vector2(0.39, 0.15), new THREE.Vector2(0.36, 0.38), new THREE.Vector2(0.345, 0.6)];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    pts.push(new THREE.Vector2(0.345 * Math.cos(a), 0.6 + 0.36 * Math.sin(a)));
  }
  pts[pts.length - 1].x = 0.0001;
  const geo = new THREE.LatheGeometry(pts, 48);
  const pos = geo.attributes.position;
  const hem = [];
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.001) hem.push({ i, a: Math.atan2(pos.getZ(i), pos.getX(i)) });
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf2f6ff, emissive: 0xa9c8ff, emissiveIntensity: 0.7, roughness: 0.45, transparent: true, opacity: 0.93, side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  g.add(body);
  const eyeGeo = new THREE.SphereGeometry(0.055, 12, 10);
  for (const x of [-0.12, 0.12]) {
    const e = new THREE.Mesh(eyeGeo, M.black);
    e.scale.set(0.9, 1.35, 0.5); e.position.set(x, 0.72, 0.31); g.add(e);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), glowMat(hdr(2, 2, 2)));
    shine.position.set(x + 0.018, 0.75, 0.34); g.add(shine);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.black);
  mouth.scale.set(0.8, 1.1, 0.4); mouth.position.set(0, 0.56, 0.33); g.add(mouth);
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff8fb8, transparent: true, opacity: 0.55 });
  for (const x of [-0.2, 0.2]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), cheekMat);
    c.position.set(x, 0.62, 0.3); c.rotation.y = x * 1.6; g.add(c);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), mat);
    arm.scale.set(1.4, 0.7, 0.8); arm.position.set(sx * 0.36, 0.38, 0.05); g.add(arm); arms.push(arm);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0.35, 0.5, 0.9), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.2); halo.position.y = 0.5; g.add(halo);

  function animate(t) {
    for (const { i, a } of hem) pos.setY(i, -0.05 * (0.5 + 0.5 * Math.sin(a * 6 + t * 5)));
    pos.needsUpdate = true;
    arms[0].position.y = 0.38 + Math.sin(t * 3) * 0.03;
    arms[1].position.y = 0.38 + Math.sin(t * 3 + 1) * 0.03;
  }
  return { group: g, mouth, animate, mat };
}

/* ------------------------------------------------------------------ */
/* Monsters                                                           */
/* ------------------------------------------------------------------ */
const eyeGlowY = glowMat(hdr(3.0, 2.4, 0.3));
const eyeGlowR = glowMat(hdr(3.4, 0.35, 0.2));
const eyeGlowG = glowMat(hdr(0.6, 3.2, 0.4));
const toothMat = std(0xefe6cf, { roughness: 0.4 });
const toothGeo = new THREE.ConeGeometry(0.025, 0.07, 4).rotateX(Math.PI);

function teethRow(g, n, width, y, z, curve = 0.0) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.position.set(t * width, y - Math.abs(t) * curve, z);
    tooth.scale.setScalar(0.8 + ((i * 37) % 5) * 0.12);
    g.add(tooth);
  }
}

function makeGloomblob() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x2a1442, emissive: 0x2a0c48, emissiveIntensity: 0.7, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.8, sheenColor: new THREE.Color(0x9b4ad8) });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.5, 36, 28), mat);
  blob.scale.set(1, 0.92, 1); blob.position.y = 0.46; blob.castShadow = true; body.add(blob);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.1 + (i % 3) * 0.03, 12, 10), mat);
    drip.scale.set(1, 1.6, 1);
    drip.position.set(Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4); body.add(drip);
  }
  const eyes = new THREE.Group(); eyes.rotation.order = 'YXZ'; eyes.rotation.x = -0.25; body.add(eyes);
  for (const [x, y, s] of [[-0.17, 0.62, 1], [0.16, 0.66, 1.15], [0.02, 0.8, 0.6]]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085 * s, 14, 10), eyeGlowY);
    e.position.set(x, y, 0.42); eyes.add(e);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 8, 8), M.black);
    pupil.scale.set(0.35, 1.2, 0.4); pupil.position.set(x, y, 0.42 + 0.075 * s); eyes.add(pupil);
  }
  const mouth = new THREE.Group(); body.add(mouth);
  const gap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a0008 }));
  gap.scale.set(1.2, 0.5, 0.4); gap.rotation.x = 0; gap.position.set(0, 0.44, 0.42); mouth.add(gap);
  teethRow(mouth, 6, 0.36, 0.44, 0.47, 0.04);
  return {
    group: g, body, eyes, height: 1.1, hitR: 0.75,
    animate(t, moving, scared) {
      const w = moving ? 6 : 2.5;
      const sq = Math.sin(t * w) * (moving ? 0.1 : 0.05);
      body.scale.set(1 - sq * 0.6, 1 + sq, 1 - sq * 0.6);
      body.position.y = moving ? Math.max(0, Math.sin(t * w)) * 0.06 : 0;
      mouth.scale.y = scared ? 2.2 : 1 + Math.sin(t * 1.7) * 0.15;
    },
  };
}

function makeLongarms() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const skin = new THREE.MeshStandardMaterial({ color: 0x2a2430, emissive: 0x1c0a24, emissiveIntensity: 0.8, roughness: 0.55 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.7, 6, 12), skin);
  torso.position.y = 1.1; torso.castShadow = true; body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 1.72, 0.03); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
  skull.scale.set(1, 1.25, 1); skull.castShadow = true; head.add(skull);
  for (const x of [-0.08, 0.08]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), eyeGlowR);
    e.position.set(x, 0.04, 0.17); e.scale.set(1, 0.6, 1); head.add(e);
  }
  const grin = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20, Math.PI), new THREE.MeshBasicMaterial({ color: 0xd8d0c0 }));
  grin.rotation.z = Math.PI; grin.position.set(0, -0.07, 0.175); head.add(grin);
  const legs = [];
  for (const x of [-0.08, 0.08]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.75, 0); body.add(leg);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.78, 6), skin);
    l.position.y = -0.39; l.castShadow = true; leg.add(l);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.17, 1.45, 0); body.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 1.25, 6), skin);
    upper.position.y = -0.62; upper.castShadow = true; arm.add(upper);
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.22, 4), skin);
      finger.position.set((f - 1) * 0.025, -1.34, 0.02); finger.rotation.x = (f - 1) * 0.2; arm.add(finger);
    }
    arm.rotation.z = sx * 0.12;
    arms.push(arm);
  }
  return {
    group: g, body, eyes: head, height: 2.0, hitR: 0.8,
    animate(t, moving, scared) {
      const sp = moving ? 3.2 : 1;
      legs[0].rotation.x = Math.sin(t * sp) * (moving ? 0.45 : 0);
      legs[1].rotation.x = -Math.sin(t * sp) * (moving ? 0.45 : 0);
      arms[0].rotation.x = -Math.sin(t * sp) * 0.25 - (scared ? 2.6 : 0);
      arms[1].rotation.x = Math.sin(t * sp) * 0.25 - (scared ? 2.6 : 0);
      head.rotation.z = Math.sin(t * 0.7) * 0.35 + 0.15;
      head.rotation.y = Math.sin(t * 0.4) * 0.3;
      body.rotation.z = Math.sin(t * sp * 0.5) * 0.05;
    },
  };
}

function makePeeper() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const eyeball = new THREE.Group(); eyeball.position.y = 0.62; eyeball.rotation.order = 'YXZ'; eyeball.rotation.x = -0.6; body.add(eyeball);
  const ballMat = new THREE.MeshPhysicalMaterial({ map: veinTex, roughness: 0.15, clearcoat: 1 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 24), ballMat);
  ball.rotation.x = -Math.PI / 2; // veins radiate around the iris
  ball.castShadow = true; eyeball.add(ball);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, 0.6), new THREE.MeshBasicMaterial({ color: hdr(0.45, 1.25, 0.22) }));
  iris.rotation.x = Math.PI / 2; iris.scale.setScalar(2.04); eyeball.add(iris);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10), M.black);
  pupil.scale.set(1, 1, 0.4); pupil.position.z = 0.32; eyeball.add(pupil);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.36, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.3), new THREE.MeshStandardMaterial({ color: 0x3a1430, roughness: 0.6 }));
  lid.rotation.x = 0.35; eyeball.add(lid);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a1830, emissive: 0x1e0a22, emissiveIntensity: 0.8, roughness: 0.5 });
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const hip = new THREE.Group(); hip.position.y = 0.55; hip.rotation.y = a; body.add(hip);
    const upper = new THREE.Group(); upper.rotation.z = 0.9; hip.add(upper);
    const u = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.45, 5), legMat); u.position.y = 0.22; u.castShadow = true; upper.add(u);
    const knee = new THREE.Group(); knee.position.y = 0.45; knee.rotation.z = -2.3; upper.add(knee);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.008, 0.62, 5), legMat); l.position.y = 0.31; l.castShadow = true; knee.add(l);
    legs.push({ hip, upper, phase: i % 2 ? 0 : Math.PI });
  }
  return {
    group: g, body, eyes: eyeball, height: 1.1, hitR: 0.75, lid,
    animate(t, moving, scared) {
      const sp = moving ? 9 : 2;
      for (const L of legs) {
        L.upper.rotation.z = 0.9 + Math.sin(t * sp + L.phase) * (moving ? 0.25 : 0.04);
        L.hip.rotation.x = Math.cos(t * sp + L.phase) * (moving ? 0.12 : 0);
      }
      body.position.y = moving ? Math.abs(Math.sin(t * sp)) * 0.04 : 0;
      const blink = (Math.sin(t * 0.9) > 0.985) ? 1 : 0;
      lid.rotation.x = scared ? -0.6 : 0.05 + blink * 1.2;
      eyeball.scale.setScalar(scared ? 1.25 : 1);
    },
  };
}

export const MONSTER_TYPES = ['gloomblob', 'longarms', 'peeper', 'zombie'];
export function makeMonster(type) {
  const m = type === 'longarms' ? makeLongarms() : type === 'peeper' ? makePeeper() : type === 'zombie' ? makeZombie() : makeGloomblob();
  const hit = new THREE.Mesh(new THREE.SphereGeometry(m.hitR, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = m.height * 0.5;
  m.group.add(hit);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0.7, 0.04, 0.3), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.scale.setScalar(m.height * 2.4);
  aura.position.y = m.height * 0.5;
  m.group.add(aura);
  m.aura = aura;
  m.hit = hit;
  return m;
}

/* Spooky eyes peeking from the dark */
export function makeEyePair(red) {
  const g = new THREE.Group();
  const mat = red ? eyeGlowR : eyeGlowY;
  const geo = new THREE.SphereGeometry(0.045, 10, 8);
  const a = new THREE.Mesh(geo, mat); a.position.x = -0.08; a.scale.set(1.2, 0.7, 1);
  const b = new THREE.Mesh(geo, mat); b.position.x = 0.08; b.scale.set(1.2, 0.7, 1);
  g.add(a, b);
  return g;
}

/* ------------------------------------------------------------------ */
/* Boo the black cat (round 2: "Boo should be a black cat!")          */
/* ------------------------------------------------------------------ */
export function makeCat() {
  const g = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(1.45); g.add(rig);
  const fur = new THREE.MeshPhysicalMaterial({
    color: 0x0b090e, roughness: 0.6, sheen: 0.7, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x4a3f80),
    emissive: 0x050308, emissiveIntensity: 1, envMapIntensity: 0.6,
  });
  const body = new THREE.Group(); rig.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.26, 6, 14), fur);
  torso.rotation.x = Math.PI / 2; torso.position.set(0, 0.27, -0.02); torso.castShadow = true; body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.45, 0.2); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), fur);
  skull.scale.set(1.1, 0.95, 1); skull.castShadow = true; head.add(skull);
  const earGeo = new THREE.ConeGeometry(0.055, 0.13, 4);
  const innerEar = new THREE.MeshBasicMaterial({ color: 0x8a3a6a });
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, fur);
    ear.position.set(sx * 0.085, 0.14, -0.01); ear.rotation.set(-0.1, 0, -sx * 0.35); head.add(ear);
    const ie = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 3), innerEar);
    ie.position.set(sx * 0.083, 0.13, 0.015); ie.rotation.set(-0.1, 0, -sx * 0.35); head.add(ie);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: hdr(1.6, 2.8, 0.35) });
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), eyeMat);
    e.scale.set(1, 1.15, 0.5); e.position.set(sx * 0.065, 0.025, 0.13); head.add(e);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.01), M.black);
    slit.position.set(sx * 0.065, 0.025, 0.152); head.add(slit);
    eyes.push(e, slit);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7aa8 }));
  nose.position.set(0, -0.025, 0.148); head.add(nose);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3a0a18 }));
  mouth.scale.set(1, 0.2, 0.4); mouth.position.set(0, -0.065, 0.135); head.add(mouth);
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xcfc8ff, transparent: true, opacity: 0.6 });
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.16, 3), whiskerMat);
    w.rotation.z = Math.PI / 2 + (k - 1) * 0.18 * sx; w.position.set(sx * 0.1, -0.03 + (k - 1) * 0.012, 0.12); head.add(w);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 20), new THREE.MeshBasicMaterial({ color: hdr(1.4, 0.35, 2.6) }));
  collar.position.set(0, 0.36, 0.17); collar.rotation.x = Math.PI / 2 - 0.5; body.add(collar);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 1, roughness: 0.25, emissive: 0x5a3a00 }));
  bell.position.set(0, 0.29, 0.25); body.add(bell);
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.2, 7).translate(0, -0.1, 0);
  for (const [x, z] of [[-0.07, 0.14], [0.07, 0.14], [-0.07, -0.16], [0.07, -0.16]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.2, z); body.add(leg);
    const l = new THREE.Mesh(legGeo, fur); l.castShadow = true; leg.add(l);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), fur); paw.scale.set(1, 0.6, 1.3); paw.position.set(0, -0.2, 0.01); leg.add(paw);
    legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.3, -0.22); body.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, -0.12), new THREE.Vector3(0, 0.32, -0.14), new THREE.Vector3(0.04, 0.46, -0.06), new THREE.Vector3(0.1, 0.5, 0.02),
  ]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 24, 0.028, 7), fur);
  tailMesh.castShadow = true; tail.add(tailMesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0.3, 0.2, 0.7), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.0); halo.position.y = 0.45; halo.renderOrder = -1; g.add(halo);

  function animate(t, moving, scared, booT = 0) {
    const sp = moving ? 13 : 0;
    legs[0].rotation.x = legs[3].rotation.x = Math.sin(t * sp) * 0.7 * (moving ? 1 : 0);
    legs[1].rotation.x = legs[2].rotation.x = -Math.sin(t * sp) * 0.7 * (moving ? 1 : 0);
    tail.rotation.z = Math.sin(t * (scared ? 9 : 2)) * (scared ? 0.5 : 0.25);
    tail.rotation.x = scared ? -0.5 : Math.sin(t * 1.3) * 0.1;
    tailMesh.scale.setScalar(scared ? 1.35 : 1); // puffed-up scaredy tail
    head.rotation.z = moving ? 0 : Math.sin(t * 0.8) * 0.15;
    head.rotation.x = -booT * 0.4;
    const blink = !moving && Math.sin(t * 0.7) > 0.98 ? 0.15 : 1;
    for (const e of eyes) e.scale.y = (e.geometry.type === 'BoxGeometry' ? 1 : 1.15) * blink * (scared ? 1.3 : 1);
    mouth.scale.set(1 + booT * 0.6, 0.2 + booT * 1.6, 0.4);
    body.position.y = moving ? Math.abs(Math.sin(t * sp)) * 0.03 : Math.sin(t * 2) * 0.005;
  }
  return { group: g, mouth, animate, height: 0.95 };
}

/* ------------------------------------------------------------------ */
/* Haunted castle (round 2)                                           */
/* ------------------------------------------------------------------ */
const castleStone = std(0x4c4760, { roughness: 0.95 });
const castleDark = std(0x2a2338, { roughness: 0.9 });
const castleRoof = std(0x2b1640, { roughness: 0.7 });
const batGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.18, 0.06); s.lineTo(0.14, -0.02); s.lineTo(0.1, 0.0); s.lineTo(0.06, -0.04); s.lineTo(0, -0.02);
  return new THREE.ShapeGeometry(s);
})();
const batMat = new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.DoubleSide });
function makeBat() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), batMat); g.add(body);
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group(); g.add(pivot);
    const w = new THREE.Mesh(batGeo, batMat); w.rotation.x = -Math.PI / 2; w.scale.x = sx; pivot.add(w);
    wings.push(pivot);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 4, 4), new THREE.MeshBasicMaterial({ color: hdr(3, 0.3, 0.2) }));
  eye.position.set(0, 0.01, 0.033); g.add(eye);
  return { g, wings };
}
export function makeCastle(level) {
  const g = new THREE.Group();
  const s = 0.9 + level * 0.07;
  const c = new THREE.Group(); c.scale.setScalar(s); g.add(c);
  const winMat = glowMat(hdr(1.0, 2.8, 0.9));
  const box = (w, h, d, x, y, z, mat = castleStone) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; c.add(m); return m;
  };
  // curtain walls + crenellations
  box(1.2, 0.55, 1.2, 0, 0.275, 0);
  for (let i = 0; i < 5; i++) for (const [x, z, rot] of [[-0.5 + i * 0.25, 0.6, 0], [-0.5 + i * 0.25, -0.6, 0], [0.6, -0.5 + i * 0.25, 1], [-0.6, -0.5 + i * 0.25, 1]]) {
    box(rot ? 0.06 : 0.12, 0.1, rot ? 0.12 : 0.06, x, 0.6, z);
  }
  // keep
  box(0.55, 1.25 + level * 0.15, 0.55, 0.05, 0.62 + level * 0.075, -0.05, castleDark);
  const keepTop = 1.25 + level * 0.15;
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 4), castleRoof);
  keepRoof.position.set(0.05, keepTop + 0.35, -0.05); keepRoof.rotation.y = Math.PI / 4; keepRoof.castShadow = true; c.add(keepRoof);
  // towers
  for (const [x, z, h] of [[-0.58, 0.58, 1.0], [0.58, 0.58, 1.15], [-0.58, -0.58, 1.25], [0.58, -0.58, 0.95]]) {
    const th = h + level * 0.1;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, th, 10), castleStone);
    t.position.set(x, th / 2, z); t.castShadow = true; c.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 10), castleRoof);
    roof.position.set(x, th + 0.25, z); roof.rotation.z = (x * z) * 0.15; roof.castShadow = true; c.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), winMat);
    win.position.set(x, th * 0.7, z + 0.205 * Math.sign(z || 1)); if (z < 0) win.rotation.y = Math.PI; c.add(win);
  }
  // glowing windows on the keep, door
  for (const [x, y] of [[-0.07, 0.95], [0.17, 0.95], [0.05, 1.25]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.14), winMat);
    w.position.set(x, y, 0.226); c.add(w);
  }
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16, 0, Math.PI), M.black);
  door.position.set(0, 0.2, 0.603); c.add(door);
  box(0.32, 0.2, 0.01, 0, 0.1, 0.603, M.black);
  // flag
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 4), M.iron);
  pole.position.set(0.05, keepTop + 0.85, -0.05); c.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12, 6, 1), new THREE.MeshBasicMaterial({ color: hdr(1.2, 0.25, 1.8), side: THREE.DoubleSide }));
  flag.position.set(0.15, keepTop + 0.95, -0.05); c.add(flag);
  // bats
  const bats = [];
  for (let i = 0; i < 2 + level; i++) {
    const b = makeBat(); b.phase = (i / (2 + level)) * Math.PI * 2; b.r = 0.8 + (i % 2) * 0.3; b.h = keepTop * s + 0.4 + (i % 3) * 0.2;
    g.add(b.g); bats.push(b);
  }
  const pool = makePool(hdr(0.5, 0.25, 1.1), 3.4, 0.5);
  g.add(pool);
  return { group: g, winMat, flag, bats, pool, height: (keepTop + 1.0) * s };
}


/* ------------------------------------------------------------------ */
/* Zombie (round 3: lives in the Spooky Graveyard)                    */
/* ------------------------------------------------------------------ */
function makeZombie() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const skin = std(0x5f7d52, { emissive: 0x0f1c0a, emissiveIntensity: 1, roughness: 0.8 });
  const cloth = std(0x3d2b45, { roughness: 0.95 });
  const pants = std(0x262636, { roughness: 0.95 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.24), cloth);
  torso.position.y = 0.97; torso.rotation.x = 0.15; torso.castShadow = true; body.add(torso);
  const rip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.02), skin);
  rip.position.set(0.08, 0.9, 0.13); rip.rotation.z = 0.4; body.add(rip);
  const head = new THREE.Group(); head.position.set(0, 1.4, 0.06); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), skin);
  skull.scale.set(1, 1.12, 1); skull.castShadow = true; head.add(skull);
  for (const [x, s] of [[-0.065, 1], [0.07, 1.3]]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 10, 8), eyeGlowG);
    e.position.set(x, 0.03, 0.145); head.add(e);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a0606 }));
  mouth.position.set(0, -0.07, 0.155); mouth.rotation.z = -0.15; head.add(mouth);
  teethRow(head, 4, 0.09, -0.055, 0.165, 0.0);
  const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.01), M.black);
  stitch.position.set(-0.02, 0.12, 0.15); stitch.rotation.z = 0.3; head.add(stitch);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.26, 1.15, 0.02); body.add(arm);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.55, 7), sx > 0 ? skin : cloth);
    a.position.y = -0.27; a.castShadow = true; arm.add(a);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin); hand.position.y = -0.56; arm.add(hand);
    arm.rotation.x = -Math.PI / 2 + 0.1;
    arms.push(arm);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sx * 0.1, 0.72, 0); body.add(leg);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.7, 7), pants);
    l.position.y = -0.35; l.castShadow = true; leg.add(l);
    legs.push(leg);
  }
  return {
    group: g, body, eyes: head, height: 1.6, hitR: 0.8,
    animate(t, moving, scared) {
      const sp = moving ? 3.4 : 1;
      legs[0].rotation.x = Math.sin(t * sp) * (moving ? 0.35 : 0);
      legs[1].rotation.x = -Math.sin(t * sp) * (moving ? 0.35 : 0);
      body.rotation.z = Math.sin(t * sp * 0.5) * 0.12;
      arms[0].rotation.x = -Math.PI / 2 + 0.1 + Math.sin(t * 1.3) * 0.12 - (scared ? 1.2 : 0);
      arms[1].rotation.x = -Math.PI / 2 + 0.1 + Math.sin(t * 1.3 + 1) * 0.12 - (scared ? 1.2 : 0);
      head.rotation.z = 0.25 + Math.sin(t * 0.6) * 0.2;
    },
  };
}

/* Lightning bolt geometry (castle zaps) */
export function makeBoltGeometry(from, to) {
  const pts = [];
  const n = 9;
  const dir = to.clone().sub(from);
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  for (let i = 0; i <= n; i++) {
    const p = from.clone().addScaledVector(dir, i / n);
    if (i > 0 && i < n) {
      p.addScaledVector(side, (Math.random() - 0.5) * 0.5);
      p.y += (Math.random() - 0.5) * 0.4;
    }
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 0.035, 5);
}

/* ------------------------------------------------------------------ */
/* The Toy King (round 4): castle-sized rusty toy robot, TV face,     */
/* crown, and one super long spring arm with a claw.                  */
/* ------------------------------------------------------------------ */
const rust = std(0xb0703e, { roughness: 0.7, metalness: 0.45, emissive: 0x2a1206 });
const rustDark = std(0x6a4630, { roughness: 0.8, metalness: 0.4, emissive: 0x160a04 });
const tin = std(0x8f97a3, { roughness: 0.4, metalness: 0.85 });
const gold = new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.25, metalness: 1, emissive: 0x3a2400 });

function drawTV(g, w, h, mode, t) {
  g.fillStyle = mode === 'tied' ? '#1a1030' : '#08201a';
  g.fillRect(0, 0, w, h);
  // static
  for (let i = 0; i < 260; i++) {
    const v = Math.random() * 120 + 60;
    g.fillStyle = `rgba(${v},${v + 30},${v},${Math.random() * 0.25})`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 2);
  }
  g.strokeStyle = '#b6ffd8'; g.fillStyle = '#b6ffd8';
  g.lineWidth = 9; g.lineCap = 'round';
  const jitter = (Math.random() - 0.5) * 3;
  if (mode === 'tied') {
    // dizzy spiral eyes
    for (const cx of [80, 176]) {
      g.beginPath();
      for (let a = 0; a < 12; a += 0.2) { const r = a * 2.6; g.lineTo(cx + Math.cos(a + t * 6) * r, 70 + Math.sin(a + t * 6) * r); }
      g.stroke();
    }
    g.beginPath(); g.arc(128, 150, 18, 0, Math.PI * 2); g.stroke();
  } else {
    const angry = mode === 'grab';
    for (const [cx, dir] of [[82, 1], [174, -1]]) {
      g.beginPath(); g.ellipse(cx + jitter, 72, 22, angry ? 12 : 22, 0, 0, Math.PI * 2); g.fill();
      if (angry) { g.beginPath(); g.moveTo(cx - 30, 40 - dir * 10); g.lineTo(cx + 30, 40 + dir * 10); g.stroke(); }
    }
    // wide creepy grin with teeth
    g.beginPath(); g.moveTo(40, 120); g.quadraticCurveTo(128, 200 + jitter, 216, 120); g.stroke();
    for (let i = 0; i < 7; i++) { const x = 62 + i * 22; g.beginPath(); g.moveTo(x, 128 + Math.sin(i / 6 * Math.PI) * 26); g.lineTo(x, 150 + Math.sin(i / 6 * Math.PI) * 26); g.stroke(); }
  }
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = (t * 40) % 6; y < h; y += 6) g.fillRect(0, y, w, 2);
}

export function makeToyKing() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const box = (w, h, d, x, y, z, mat, parent = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  // legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.38, 1.25, 0); body.add(hip);
    box(0.36, 0.62, 0.36, 0, -0.31, 0, rust, hip);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), tin); knee.position.y = -0.66; hip.add(knee);
    box(0.32, 0.5, 0.32, 0, -0.95, 0, rustDark, hip);
    box(0.46, 0.14, 0.62, 0, -1.2, 0.08, tin, hip);
    legs.push(hip);
  }
  // torso
  box(1.25, 1.05, 0.8, 0, 1.78, 0, rust);
  box(1.05, 0.12, 0.84, 0, 1.3, 0, tin);
  const dent = box(0.4, 0.3, 0.05, -0.3, 1.95, 0.41, rustDark); dent.rotation.z = 0.2;
  const rivetGeo = new THREE.SphereGeometry(0.035, 6, 5);
  for (let i = 0; i < 10; i++) {
    const r = new THREE.Mesh(rivetGeo, tin);
    r.position.set(-0.55 + (i % 5) * 0.275, i < 5 ? 2.22 : 1.38, 0.41); body.add(r);
  }
  const leds = [];
  const ledCols = [hdr(3, 0.3, 0.2), hdr(0.3, 3, 0.4), hdr(3, 2.4, 0.3), hdr(0.4, 1.2, 3.2)];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshBasicMaterial({ color: ledCols[i].clone() });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m);
    led.position.set(0.12 + i * 0.12, 1.7, 0.41); body.add(led);
    leds.push({ m, base: ledCols[i] });
  }
  // wind-up-style speaker grille
  for (let i = 0; i < 4; i++) box(0.3, 0.025, 0.02, 0.3, 2.05 - i * 0.06, 0.41, rustDark);
  // TV head
  const head = new THREE.Group(); head.position.set(0, 2.62, 0); body.add(head);
  box(1.0, 0.8, 0.78, 0, 0.1, 0, std(0x3b2d40, { roughness: 0.6, metalness: 0.3 }), head);
  box(0.84, 0.64, 0.05, 0, 0.1, 0.38, M.black, head);
  const tvCanvas = document.createElement('canvas'); tvCanvas.width = 256; tvCanvas.height = 192;
  const tvTex = new THREE.CanvasTexture(tvCanvas); tvTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tvTex, color: hdr(1.6, 1.9, 1.7) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.57), screenMat);
  screen.position.set(0, 0.1, 0.411); head.add(screen);
  for (const [x, c] of [[0.42, 0x8a1a1a], [0.42, 0x1a6a2a]]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), std(c));
    knob.rotation.x = Math.PI / 2; knob.position.set(x, c === 0x8a1a1a ? 0.25 : 0.05, 0.4); head.add(knob);
  }
  for (const sx of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), tin);
    ant.position.set(sx * 0.22, 0.75, -0.1); ant.rotation.z = -sx * 0.45; head.add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: hdr(3, 0.4, 0.3) }));
    tip.position.set(sx * 0.35, 1.02, -0.1); head.add(tip);
  }
  // crown
  const crown = new THREE.Group(); crown.position.set(0, 0.52, 0); head.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.14, 16, 1, true), gold);
  band.material.side = THREE.DoubleSide; crown.add(band);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), gold);
    spike.position.set(Math.cos(a) * 0.34, 0.16, Math.sin(a) * 0.34); crown.add(spike);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? hdr(3, 0.2, 0.6) : hdr(0.3, 0.8, 3) }));
    gem.position.set(Math.cos(a) * 0.36, 0.0, Math.sin(a) * 0.36); crown.add(gem);
  }
  crown.rotation.z = 0.12;
  // short left arm
  const leftArm = new THREE.Group(); leftArm.position.set(-0.72, 2.15, 0); body.add(leftArm);
  box(0.24, 0.7, 0.24, 0, -0.35, 0, rust, leftArm);
  box(0.3, 0.22, 0.3, 0, -0.78, 0, tin, leftArm);
  leftArm.rotation.z = 0.15;
  // super long spring arm (z-forward, length 1; scale.z stretches it)
  const shoulder = new THREE.Group(); shoulder.position.set(0.78, 2.15, 0); body.add(shoulder);
  const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), tin); shoulder.add(shoulderBall);
  const coilPts = [];
  for (let i = 0; i <= 160; i++) { const a = i * 0.55; coilPts.push(new THREE.Vector3(Math.cos(a) * 0.1, Math.sin(a) * 0.1, i / 160)); }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 600, 0.02, 5), tin);
  coil.castShadow = true; shoulder.add(coil);
  const claw = new THREE.Group(); shoulder.add(claw);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.16, 10), rust); hub.rotation.x = Math.PI / 2; claw.add(hub);
  const prongs = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Group(); p.rotation.z = (i / 3) * Math.PI * 2; claw.add(p);
    const hinge = new THREE.Group(); hinge.position.y = 0.1; p.add(hinge);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), tin); f.position.z = 0.15; hinge.add(f);
    const tipF = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.14), tin); tipF.position.set(0, -0.05, 0.32); tipF.rotation.x = 0.8; hinge.add(tipF);
    prongs.push(hinge);
  }
  // yarn loops get added as the cat ties it up
  const yarnMat = std(0xff4f8b, { roughness: 1, emissive: 0x3a0018 });
  const yarn = new THREE.Group(); g.add(yarn);
  function addYarn(n) {
    const y = [0.7, 1.4, 1.9, 1.0, 2.3][n % 5];
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.78 - (y < 1.3 ? 0.15 : 0), 0.06, 8, 28), yarnMat);
    loop.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5; loop.rotation.y = (Math.random() - 0.5) * 0.4;
    loop.position.y = y; loop.castShadow = true;
    yarn.add(loop);
  }

  const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 3.2, 10), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.6; g.add(hit);
  const tvG = tvCanvas.getContext('2d');
  let tvTimer = 0;
  let armLen = 1.0;
  return {
    group: g, body, head, shoulder, coil, claw, prongs, hit, screenMat, addYarn, yarn, height: 3.2,
    setArm(len, open) {
      armLen = len;
      coil.scale.set(1, 1, len);
      claw.position.set(0, 0, len);
      for (const p of prongs) p.rotation.x = open ? -0.5 : 0.25;
    },
    clawWorld(v = new THREE.Vector3()) { return claw.getWorldPosition(v); },
    animate(t, dt, moving, mode) {
      const sp = moving ? 2.4 : 0;
      legs[0].rotation.x = Math.sin(t * sp) * 0.35 * (moving ? 1 : 0);
      legs[1].rotation.x = -Math.sin(t * sp) * 0.35 * (moving ? 1 : 0);
      body.position.y = moving ? Math.abs(Math.sin(t * sp)) * 0.08 : 0;
      body.rotation.z = mode === 'tied' ? Math.sin(t * 9) * 0.04 : Math.sin(t * sp * 0.5) * 0.03;
      head.rotation.z = Math.sin(t * 0.7) * 0.12 + (mode === 'tied' ? 0.25 : 0);
      leftArm.rotation.x = Math.sin(t * sp) * 0.3;
      for (const [i, l] of leds.entries()) {
        const on = Math.sin(t * (3 + i) + i * 2) > -0.2 && Math.random() > 0.03;
        l.m.color.copy(l.base).multiplyScalar(on ? 1 : 0.08);
      }
      tvTimer -= dt;
      if (tvTimer <= 0) { tvTimer = 0.08; drawTV(tvG, 256, 192, mode, t); tvTex.needsUpdate = true; }
      screenMat.color.setScalar(Math.random() > 0.04 ? 1.7 : 0.6);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Robot buddy (claw machine prize): guards Boo and grabs candy.      */
/* ------------------------------------------------------------------ */
export function makeRobotBuddy() {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xe8f2ff, roughness: 0.3, clearcoat: 1, metalness: 0.1 });
  const teal = std(0x2ad1c0, { roughness: 0.4, emissive: 0x0a3a34 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.1, 6, 14), shell);
  body.position.y = 0.2; body.castShadow = true; g.add(body);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.025, 8, 20), teal);
  belt.rotation.x = Math.PI / 2; belt.position.y = 0.17; g.add(belt);
  const head = new THREE.Group(); head.position.y = 0.45; g.add(head);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), shell); dome.scale.set(1.15, 0.9, 1); head.add(dome);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, -0.9, 1.8, 1.1, 0.9), new THREE.MeshBasicMaterial({ color: 0x06141c }));
  visor.position.z = 0.04; visor.scale.set(1.2, 1, 1); head.add(visor);
  const eyeM = new THREE.MeshBasicMaterial({ color: hdr(0.3, 2.6, 3.0) });
  const eyes = [];
  for (const x of [-0.045, 0.045]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeM); e.position.set(x, 0.0, 0.135); e.scale.set(1, 1.3, 0.5); head.add(e); eyes.push(e);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), teal); ant.position.y = 0.17; head.add(ant);
  const bulbM = new THREE.MeshBasicMaterial({ color: hdr(3, 0.6, 0.3) });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), bulbM); bulb.position.y = 0.25; head.add(bulb);
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.1, 4, 8), teal);
    a.position.set(sx * 0.19, 0.2, 0); a.rotation.z = sx * 0.4; g.add(a); arms.push(a);
  }
  const jet = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hdr(0.3, 1.6, 2.0), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  jet.scale.setScalar(0.45); jet.position.y = 0.02; g.add(jet);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), new THREE.MeshBasicMaterial({ color: hdr(0.3, 1.4, 2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  shield.position.y = 0.3; g.add(shield);
  return {
    group: g, head, shield,
    animate(t) {
      head.rotation.y = Math.sin(t * 0.8) * 0.5;
      arms[0].rotation.z = -0.4 - Math.sin(t * 4) * 0.2;
      arms[1].rotation.z = 0.4 + Math.sin(t * 4) * 0.2;
      bulbM.color.setRGB(Math.sin(t * 5) > 0 ? 3 : 0.4, 0.5, 0.3);
      jet.material.opacity = 0.6 + Math.random() * 0.3;
      const blink = Math.sin(t * 0.9) > 0.97 ? 0.15 : 1;
      for (const e of eyes) e.scale.y = 1.3 * blink;
    },
  };
}
