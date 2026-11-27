// The Toy King's claw machine: a little mini game that starts when Boo ties up the Toy King.
// Easy on purpose ("not tricky!"): the claw always grabs the closest prize under it.
import * as THREE from 'three';
import * as X from './models.js';

const TOP_Y = 2.75;
const FLOOR_Y = 1.02;
const CHUTE = new THREE.Vector3(-1.12, 0, 0.72);
const BOUNDS = { x0: -1.25, x1: 1.3, z0: -0.85, z1: 0.85 };

export function createClawGame({ sound, onPrize, onDone, environment }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0719);
  scene.fog = new THREE.Fog(0x0c0719, 8, 16);
  scene.environment = environment;
  scene.environmentIntensity = 0.5;
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0x9b8cff, 0x1a0f2a, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 6, 4); scene.add(key);
  const pinkL = new THREE.PointLight(0xff4fc8, 3.5, 8, 2); pinkL.position.set(-2.2, 2.5, 1.6); scene.add(pinkL);
  const blueL = new THREE.PointLight(0x4fc8ff, 3.5, 8, 2); blueL.position.set(2.2, 2.5, 1.6); scene.add(blueL);
  const insideL = new THREE.PointLight(0xfff0d0, 2.2, 4, 2); insideL.position.set(0, 2.6, 0); scene.add(insideL);

  // room
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.35, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ color: 0x150c26, roughness: 0.9 }));
  wall.position.set(0, 6, -4); scene.add(wall);

  // cabinet
  const cab = new THREE.MeshPhysicalMaterial({ color: 0x7a2ad6, roughness: 0.25, clearcoat: 1, metalness: 0.1 });
  const trim = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.4, 1.5) });
  const trim2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.4, 1.9) });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };
  add(new THREE.BoxGeometry(3.0, 1.0, 2.2), cab, 0, 0.5, 0);
  add(new THREE.BoxGeometry(3.24, 0.36, 2.44), cab, 0, 3.12, 0);
  for (const [x, z] of [[-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]]) add(new THREE.BoxGeometry(0.08, 2.0, 0.08), cab, x, 1.98, z);
  add(new THREE.BoxGeometry(3.06, 0.04, 0.04), trim, 0, 1.0, 1.12);
  add(new THREE.BoxGeometry(3.3, 0.04, 0.04), trim2, 0, 2.94, 1.23);
  add(new THREE.BoxGeometry(3.3, 0.04, 0.04), trim, 0, 3.3, 1.23);
  const glass = add(new THREE.BoxGeometry(3.0, 1.92, 2.2), new THREE.MeshPhysicalMaterial({
    color: 0xcfeaff, roughness: 0.05, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.3,
  }), 0, 1.98, 0);
  glass.renderOrder = 10;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: X.makeLabelTexture("👑 Toy King's Claw 🍬", { w: 720, h: 120, font: 60, bg: 'rgba(40,10,60,.95)' }), color: new THREE.Color(0.7, 0.7, 0.7), transparent: true,
  }));
  sign.scale.set(3.0, 0.5, 1); sign.position.set(0, 3.12, 1.3); scene.add(sign);
  // prize chute
  add(new THREE.BoxGeometry(0.62, 0.04, 0.62), new THREE.MeshBasicMaterial({ color: 0x05030a }), CHUTE.x, FLOOR_Y + 0.001, CHUTE.z);
  for (const [dx, dz, w, d] of [[0.31, 0, 0.04, 0.62], [0, -0.31, 0.62, 0.04]]) {
    add(new THREE.BoxGeometry(w, 0.25, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 0.2) }), CHUTE.x + dx, FLOOR_Y + 0.12, CHUTE.z + dz);
  }
  add(new THREE.BoxGeometry(0.62, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: 0x05030a }), CHUTE.x, 0.4, 1.11);

  // gantry + claw
  add(new THREE.BoxGeometry(2.9, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xc0c8d8, metalness: 0.9, roughness: 0.3 }), 0, 2.88, -0.95);
  add(new THREE.BoxGeometry(2.9, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xc0c8d8, metalness: 0.9, roughness: 0.3 }), 0, 2.88, 0.95);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 0.95, roughness: 0.2 });
  const bridge = add(new THREE.BoxGeometry(0.08, 0.06, 1.95), metal, 0, 2.88, 0);
  const carriage = add(new THREE.BoxGeometry(0.22, 0.12, 0.22), metal, 0, 2.86, 0);
  const cable = add(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), metal, 0, 2.5, 0);
  const claw = new THREE.Group(); scene.add(claw);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.14, 12), metal); claw.add(hub);
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 20), trim2); glowRing.rotation.x = Math.PI / 2; glowRing.position.y = -0.06; claw.add(glowRing);
  const prongs = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Group(); p.rotation.y = (i / 3) * Math.PI * 2; claw.add(p);
    const hinge = new THREE.Group(); hinge.position.set(0, -0.06, 0.09); p.add(hinge);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), metal); a.position.y = -0.11; hinge.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), metal); b.position.set(0, -0.25, -0.04); b.rotation.x = 0.7; hinge.add(b);
    prongs.push(hinge);
  }
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3.0), transparent: true, opacity: 0.7, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; scene.add(marker);

  // prizes
  let prizes = [];
  const capsuleColors = [0xff5ccf, 0x7f6bff, 0x4fe0c0, 0xffc04d, 0xff6b4f, 0x6bd1ff];
  function makeCapsule(color, r) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, emissive: color, emissiveIntensity: 0.25 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0xf4f2ff, roughness: 0.2, clearcoat: 1 }));
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.08, 6, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.3 }));
    band.rotation.x = Math.PI / 2;
    g.add(top, bot, band);
    const candy = X.makeCandy(Math.floor(Math.random() * 4));
    candy.group.scale.setScalar(r * 2.2);
    candy.group.children[1].visible = false;
    g.add(candy.group);
    g.rotation.set(Math.random(), Math.random() * 6, Math.random() * 0.6);
    return g;
  }
  const buddyBubble = new THREE.MeshPhysicalMaterial({ color: 0xe0f4ff, roughness: 0.02, transparent: true, opacity: 0.22, depthWrite: false });

  function fillPrizes(includeBuddy) {
    for (const p of prizes) scene.remove(p.mesh);
    prizes = [];
    const spots = [];
    for (let i = 0; i < 40 && spots.length < 15; i++) {
      const x = THREE.MathUtils.lerp(BOUNDS.x0 + 0.2, BOUNDS.x1 - 0.15, Math.random());
      const z = THREE.MathUtils.lerp(BOUNDS.z0 + 0.12, BOUNDS.z1 - 0.12, Math.random());
      if (Math.hypot(x - CHUTE.x, z - CHUTE.z) < 0.55) continue;
      if (includeBuddy && Math.hypot(x - 0.55, z + 0.15) < 0.5) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 0.36)) continue;
      spots.push({ x, z });
    }
    for (const s of spots) {
      const big = Math.random() < 0.25;
      const r = big ? 0.22 : 0.16;
      const mesh = makeCapsule(capsuleColors[Math.floor(Math.random() * capsuleColors.length)], r);
      mesh.position.set(s.x, FLOOR_Y + r, s.z);
      scene.add(mesh);
      prizes.push({ mesh, r, kind: 'candy', value: big ? 40 + Math.floor(Math.random() * 3) * 10 : 10 + Math.floor(Math.random() * 3) * 5 });
    }
    if (includeBuddy) {
      const g = new THREE.Group();
      const bot = X.makeRobotBuddy();
      bot.group.position.y = -0.27; bot.group.scale.setScalar(0.85);
      g.add(bot.group);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), buddyBubble));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: X.glowTex, color: new THREE.Color(0.4, 1.6, 2.2), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.2); g.add(halo);
      g.position.set(0.55, FLOOR_Y + 0.34, -0.15);
      scene.add(g);
      prizes.push({ mesh: g, r: 0.34, kind: 'buddy', value: 0, bot });
    }
  }

  // state
  const st = {
    active: false, phase: 'idle', t: 0, tries: 5,
    pos: new THREE.Vector3(0, TOP_Y, 0), goal: new THREE.Vector3(0, TOP_Y, 0), held: null, open: 1, falling: [],
  };
  const ui = {
    root: document.getElementById('claw-ui'), tries: document.getElementById('claw-tries'), hint: document.getElementById('claw-hint'),
    grab: document.getElementById('claw-grab'), done: document.getElementById('claw-done'),
  };
  function renderTries() {
    ui.tries.textContent = '🪝'.repeat(st.tries) + '▫️'.repeat(5 - st.tries);
  }
  function hint(msg) { ui.hint.textContent = msg; }

  function start({ hasBuddy }) {
    st.active = true; st.phase = 'idle'; st.tries = 5; st.held = null; st.open = 1;
    st.pos.set(0.3, TOP_Y, 0); st.goal.copy(st.pos);
    fillPrizes(!hasBuddy);
    ui.root.classList.remove('hidden');
    ui.done.classList.add('hidden');
    ui.grab.classList.remove('hidden');
    renderTries();
    hint('Drag to move the claw, then tap GRAB! 🪝');
    resize();
  }
  function finish() {
    st.active = false;
    ui.root.classList.add('hidden');
    onDone();
  }
  ui.grab.onclick = () => {
    if (!st.active || st.phase !== 'idle') return;
    st.phase = 'drop'; st.t = 0; st.target = prizeUnder();
    sound.whirr?.();
    hint('Here it goes…');
  };
  ui.done.onclick = finish;

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(FLOOR_Y + 0.2));
  const v2 = new THREE.Vector2();
  function pointer(x, y) {
    if (!st.active || st.phase !== 'idle') return;
    v2.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    st.goal.x = THREE.MathUtils.clamp(p.x, BOUNDS.x0, BOUNDS.x1);
    st.goal.z = THREE.MathUtils.clamp(p.z, BOUNDS.z0, BOUNDS.z1);
  }

  // "Not tricky!": the claw always homes in on the closest prize
  function prizeUnder() {
    let best = null, bd = Infinity;
    for (const p of prizes) {
      const d = Math.hypot(p.mesh.position.x - st.pos.x, p.mesh.position.z - st.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function update(dt) {
    if (!st.active) return;
    st.t += dt;
    const k = 1 - Math.exp(-dt * 7);
    if (st.phase === 'idle') {
      st.pos.x += (st.goal.x - st.pos.x) * k;
      st.pos.z += (st.goal.z - st.pos.z) * k;
      st.pos.y += (TOP_Y - st.pos.y) * k;
      st.open += (1 - st.open) * k;
    } else if (st.phase === 'drop') {
      const target = st.target && prizes.includes(st.target) ? st.target : null;
      const bottom = target ? target.mesh.position.y + target.r * 0.6 + 0.2 : FLOOR_Y + 0.3;
      st.pos.y = Math.max(bottom, st.pos.y - dt * 1.8);
      if (target) { st.pos.x += (target.mesh.position.x - st.pos.x) * k * 1.4; st.pos.z += (target.mesh.position.z - st.pos.z) * k * 1.4; }
      const lined = !target || Math.hypot(target.mesh.position.x - st.pos.x, target.mesh.position.z - st.pos.z) < 0.05;
      if (st.pos.y <= bottom + 0.001 && lined) { st.phase = 'close'; st.t = 0; }
    } else if (st.phase === 'close') {
      st.open = Math.max(0, 1 - st.t / 0.35);
      if (st.t > 0.4) {
        const p = st.target && prizes.includes(st.target) ? st.target : null;
        if (p) { st.held = p; prizes.splice(prizes.indexOf(p), 1); sound.pop(); }
        st.phase = 'lift'; st.t = 0;
      }
    } else if (st.phase === 'lift') {
      st.pos.y = Math.min(TOP_Y, st.pos.y + dt * 1.6);
      if (st.pos.y >= TOP_Y) {
        if (st.held) { st.phase = 'carry'; hint('Got one! 🎉'); }
        else { st.phase = 'idle'; hint("Missed! That one doesn't count — try again 😊"); }
        st.t = 0;
      }
    } else if (st.phase === 'carry') {
      st.pos.x += (CHUTE.x - st.pos.x) * k * 0.8;
      st.pos.z += (CHUTE.z - st.pos.z) * k * 0.8;
      if (Math.hypot(st.pos.x - CHUTE.x, st.pos.z - CHUTE.z) < 0.03) { st.phase = 'release'; st.t = 0; }
    } else if (st.phase === 'release') {
      st.open = Math.min(1, st.t / 0.25);
      if (st.t > 0.25 && st.held) {
        st.falling.push({ p: st.held, vy: 0 });
        st.held = null;
      }
      if (st.t > 0.6) {
        st.tries--;
        renderTries();
        st.phase = 'idle'; st.t = 0;
        st.goal.set(0.3, TOP_Y, 0);
        if (st.tries <= 0 || prizes.length === 0) {
          st.phase = 'over';
          hint('All done! Great grabbing! 🌟');
          ui.grab.classList.add('hidden');
          ui.done.classList.remove('hidden');
        } else hint('Drag the claw and GRAB again!');
      }
    }
    // held prize hangs under the claw
    if (st.held) st.held.mesh.position.set(st.pos.x, st.pos.y - 0.2 - st.held.r * 0.7, st.pos.z);
    // prizes dropping down the chute
    for (let i = st.falling.length - 1; i >= 0; i--) {
      const f = st.falling[i];
      f.vy -= 9.8 * dt;
      f.p.mesh.position.y += f.vy * dt;
      f.p.mesh.rotation.x += dt * 6;
      if (f.p.mesh.position.y < 0.3) {
        scene.remove(f.p.mesh);
        st.falling.splice(i, 1);
        onPrize(f.p);
      }
    }
    // animate the robot buddy inside its bubble
    for (const p of prizes) if (p.bot) p.bot.animate(st.t);
    if (st.held?.bot) st.held.bot.animate(st.t);

    // draw the claw
    claw.position.copy(st.pos);
    for (const p of prongs) p.rotation.x = -0.15 + st.open * 0.55;
    carriage.position.set(st.pos.x, 2.86, st.pos.z);
    bridge.position.x = st.pos.x;
    const len = 2.86 - st.pos.y;
    cable.scale.y = Math.max(0.01, len);
    cable.position.set(st.pos.x, st.pos.y + len / 2, st.pos.z);
    marker.position.set(st.pos.x, FLOOR_Y + 0.01, st.pos.z);
    marker.visible = st.phase === 'idle';
    marker.material.opacity = 0.5 + Math.sin(st.t * 6) * 0.25;
    trim.color.setRGB(1.8, 0.4 + Math.sin(st.t * 3) * 0.2, 1.5);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    // pull back on tall/narrow screens so the whole machine fits
    const dist = camera.aspect < 1 ? 7.6 : 5.0;
    camera.position.set(0, 3.0 + dist * 0.12, dist);
    camera.lookAt(0, 1.75, 0);
    camera.updateProjectionMatrix();
  }

  return { scene, camera, start, update, pointer, resize, get active() { return st.active; } };
}
