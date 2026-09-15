/**
 * meridian3d.js — 3D 經絡檢視（讀取經脈繪圖室出版地圖）
 * 延遲載入 Three.js；Play 才載 GLB。自動模式鎖定畫面右側（hamburger / +X）。
 */
const Meridian3D = (() => {

  const MERIDIANS = [
    { id: 'LU', name: '手太陰肺經', group: 'yin' },
    { id: 'LI', name: '手陽明大腸經', group: 'yang' },
    { id: 'ST', name: '足陽明胃經', group: 'yang' },
    { id: 'SP', name: '足太陰脾經', group: 'yin' },
    { id: 'HT', name: '手少陰心經', group: 'yin' },
    { id: 'SI', name: '手太陽小腸經', group: 'yang' },
    { id: 'BL', name: '足太陽膀胱經', group: 'yang' },
    { id: 'KI', name: '足少陰腎經', group: 'yin' },
    { id: 'PC', name: '手厥陰心包經', group: 'yin' },
    { id: 'TE', name: '手少陽三焦經', group: 'yang' },
    { id: 'GB', name: '足少陽膽經', group: 'yang' },
    { id: 'LR', name: '足厥陰肝經', group: 'yin' },
    { id: 'CV', name: '任脈', group: 'ren-du' },
    { id: 'GV', name: '督脈', group: 'ren-du' },
  ];
  const LINE_COLOR = { yin: '#22c55e', yang: '#ef4444', 'ren-du': '#3b82f6' };
  const POINT_COLOR = '#111111';
  const SKIN_COLOR = 0xd4a88a;
  const MAX_LABELED_MERIDIANS = 3;
  const REFERENCE_BODY_HEIGHT_M = 1.75;
  const RIBBON_WIDTH_MM = 3.5;
  const MARKER_DIAMETER_MM = 7;
  const SKIN_LIFT_MM = 0.4;
  const SAMPLE_STEP_MM = 1.5;
  const HANDLE_MIN_ARC_MM = 32;
  const HANDLE_SPACING_MM = 40.9;
  const HANDLE_BULGE_MM = 22;
  const RIBBON_HUG_MM = 36;
  const MAX_PAIR_HANDLES = 5;
  const ROUTE_BREAK_MM = 200;

  const MAP_URL = {
    male: 'assets/meridians/male.json',
    female: 'assets/meridians/female.json',
  };

  const opts = {
    gender: 'male',
    mode: 'manual',
    scale: 1,
    meridians: new Set(),
  };

  let three = null;
  let scene, camera, renderer, controls;
  let modelRoot = null;
  let annotRoot = null;
  let bodyMeshes = [];
  let bodyHeight = 1;
  let loadedGender = null;
  let raf = 0;
  let playingAuto = false;
  let autoAbort = false;
  let autoCursor = null;
  let autoLockedSide = 'right';
  let currentPoint = null;
  let pickables = [];
  let highlighted = null;
  let pointsData = null;
  let entered = false;
  let movingUntil = 0;
  let mapCache = { male: null, female: null };
  let mapFit = { scale: 1, cx: 0, cy: 0, cz: 0 };
  let skinMaterial = null;
  let nailMaterial = null;
  let playGeneration = 0;
  let calloutsDirty = true;
  let orbiting = false;

  const $ = (id) => document.getElementById(id);

  function meridianMeta(id) {
    return MERIDIANS.find((m) => m.id === id) || MERIDIANS[0];
  }

  function lineColorFor(id) {
    return LINE_COLOR[meridianMeta(id).group] || LINE_COLOR.yang;
  }

  function markerColorFor() {
    return POINT_COLOR;
  }

  function setCalloutsVisible(on) {
    const svg = $('m3d-callouts');
    if (!svg) return;
    if (on) svg.removeAttribute('hidden');
    else svg.setAttribute('hidden', '');
  }

  function clearCallouts() {
    const svg = $('m3d-callouts');
    if (!svg) return;
    svg.innerHTML = '';
    setCalloutsVisible(false);
  }

  function hideCallouts() {
    setCalloutsVisible(false);
  }

  function noteCameraMoving(ms = 240) {
    movingUntil = performance.now() + ms;
    calloutsDirty = true;
    hideCallouts();
  }

  function labelSideByMeridian(selected) {
    const sides = new Map();
    const flexible = [];
    selected.forEach((m) => {
      if (m.id === 'CV' || m.id === 'GV') sides.set(m.id, 'left');
      else flexible.push(m);
    });
    if (flexible.length >= 2) {
      flexible.forEach((m, i) => sides.set(m.id, i % 2 === 0 ? 'right' : 'left'));
    } else {
      flexible.forEach((m) => sides.set(m.id, 'right'));
    }
    return sides;
  }

  function clusterByX(items, width) {
    const sorted = [...items].sort((a, b) => a.px - b.px);
    const minGap = Math.max(8, width * 0.022);
    const clusters = [];
    let cur = [];
    sorted.forEach((it) => {
      if (cur.length && it.px - cur[cur.length - 1].px > minGap) {
        clusters.push(cur);
        cur = [];
      }
      cur.push(it);
    });
    if (cur.length) clusters.push(cur);
    return clusters;
  }

  function pickEdgeItems(items, park, width) {
    if (!items.length) return items;
    const xs = items.map((it) => it.px);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const mid = (minX + maxX) * 0.5;
    const span = maxX - minX;
    const clusters = clusterByX(items, width);
    if (clusters.length >= 2) {
      const slack = Math.max(10, width * 0.02);
      const kept = [];
      clusters.forEach((cluster, i) => {
        const med = cluster.reduce((sum, it) => sum + it.px, 0) / cluster.length;
        const nearPark = park === 'right' ? i >= clusters.length - 2 : i <= 1;
        const onParkHalf = park === 'right' ? med >= mid - slack : med <= mid + slack;
        if (nearPark || onParkHalf) kept.push(...cluster);
      });
      if (kept.length) return kept;
    }
    if (span > Math.max(24, width * 0.07)) {
      const half = park === 'right'
        ? items.filter((it) => it.px >= mid - 6)
        : items.filter((it) => it.px <= mid + 6);
      if (half.length) return half;
    }
    return items;
  }

  function splitCalloutColumns(items, park, width) {
    if (!items.length) return [];
    const yTol = Math.max(12, (items[0]?.textH || 16) * 0.9);
    const ranked = [...items].sort((a, b) => a.py - b.py);
    ranked.forEach((it) => { it.indent = 0; });
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        if (ranked[j].py - ranked[i].py > yTol) break;
        const outer = park === 'right'
          ? (ranked[i].px >= ranked[j].px ? ranked[i] : ranked[j])
          : (ranked[i].px <= ranked[j].px ? ranked[i] : ranked[j]);
        const inner = outer === ranked[i] ? ranked[j] : ranked[i];
        inner.indent = 1;
      }
    }
    const outerItems = ranked.filter((it) => !it.indent);
    const innerItems = ranked.filter((it) => it.indent);
    if (innerItems.length) {
      return [
        { items: outerItems, indent: 0 },
        { items: innerItems, indent: 1 },
      ];
    }
    const clusters = clusterByX(items, width);
    if (clusters.length < 2) return [{ items: ranked, indent: 0 }];
    if (park === 'right') {
      return [
        { items: clusters[clusters.length - 1], indent: 0 },
        { items: clusters.slice(0, -1).flat(), indent: 1 },
      ];
    }
    return [
      { items: clusters[0], indent: 0 },
      { items: clusters.slice(1).flat(), indent: 1 },
    ];
  }

  function worldPerMm() {
    const height = Number(bodyHeight) || 0;
    if (!(height > 0)) return 0.001;
    return height / (REFERENCE_BODY_HEIGHT_M * 1000);
  }

  function chineseNum(n) {
    const d = '零一二三四五六七八九';
    n = Number(n) || 0;
    if (n <= 10) return '零一二三四五六七八九十'[n];
    if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      return d[t] + '十' + (o ? d[o] : '');
    }
    return String(n);
  }

  function selectedMeridians() {
    return MERIDIANS.filter((m) => opts.meridians.has(m.id));
  }

  function currentMap() {
    const key = opts.gender === 'female' ? 'female' : 'male';
    return mapCache[key];
  }

  function sideAllowed(side) {
    if (opts.mode !== 'auto') return true;
    if (side === 'midline') return true;
    return side === autoLockedSide;
  }

  function setPlayIcon(kind) {
    const img = $('m3d-play-img');
    const btn = $('m3d-play');
    if (!img || !btn) return;
    img.src = kind === 'stop' ? 'assets/icons/stop-3d.png' : 'assets/icons/play-3d.png';
    btn.setAttribute('aria-label', kind === 'stop' ? '停止' : '播放');
  }

  function setTitle(text) {
    const el = $('m3d-title');
    if (el) el.textContent = text || '3D 經絡模型';
  }

  function setLoading(on) {
    const el = $('m3d-loading');
    if (el) el.hidden = !on;
  }

  function setModal(on) {
    const el = $('m3d-modal');
    if (el) el.hidden = !on;
    if (on) {
      playingAuto && stopAuto({ keepCursor: true });
      hideCallouts();
    } else {
      calloutsDirty = true;
    }
  }

  function closeOverlay() {
    const el = $('m3d-point-overlay');
    if (el) el.hidden = true;
    calloutsDirty = true;
  }

  async function openOverlay(point) {
    if (!point) return;
    const overlay = $('m3d-point-overlay');
    const sheet = $('m3d-point-sheet');
    if (!overlay || !sheet) return;
    overlay.hidden = false;
    hideCallouts();
    sheet.innerHTML = '';
    await UI.renderPointPanel(sheet, point.name, {
      meridian: point.meridian,
      intlCode: point.code,
    });
  }

  function unlockSpeech() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    try {
      synth.resume();
      const priming = new SpeechSynthesisUtterance(' ');
      priming.volume = 0;
      priming.rate = 10;
      synth.speak(priming);
      synth.cancel();
    } catch {}
  }

  function waitForVoices() {
    const synth = window.speechSynthesis;
    if (!synth) return Promise.resolve();
    if (synth.getVoices().length) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 900);
      synth.addEventListener('voiceschanged', done, { once: true });
    });
  }

  function speak(text, gender) {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || autoAbort) { resolve(); return; }
      try { synth.cancel(); synth.resume(); } catch {}
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.88;
      const voice = Settings.pickTTSVoice(gender === 'female' ? 'female' : 'male');
      if (voice) {
        utt.voice = voice;
        utt.lang = voice.lang || 'zh-TW';
      } else {
        utt.lang = 'zh-TW';
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      utt.onend = finish;
      utt.onerror = finish;
      const timer = setTimeout(finish, Math.min(12000, Math.max(2200, String(text).length * 420)));
      try { synth.speak(utt); }
      catch { finish(); }
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadThree() {
    if (three) return three;
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    three = { THREE, OrbitControls, GLTFLoader, MeshoptDecoder };
    return three;
  }

  function isNailMesh(object) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const names = materials.map((material) => (material?.name || '').toLowerCase());
    const objectName = `${object.name || ''} ${object.parent?.name || ''}`.toLowerCase();
    const isToeNail = objectName.includes('toenail')
      || names.some((name) => name.includes('toenail'));
    const isNail = !isToeNail && (
      objectName.includes('nail')
      || names.some((name) => name.includes('fingernail') || name.includes('nail'))
    );
    return isToeNail || isNail;
  }

  function getSkinMaterial(THREE) {
    if (!skinMaterial) {
      skinMaterial = new THREE.MeshPhysicalMaterial({
        color: SKIN_COLOR,
        roughness: 0.52,
        metalness: 0,
        reflectivity: 0.22,
        clearcoat: 0.12,
        clearcoatRoughness: 0.48,
        sheen: 0.55,
        sheenRoughness: 0.62,
        sheenColor: new THREE.Color(0xe8b9a4),
        specularIntensity: 0.35,
        specularColor: new THREE.Color(0xf0cfc0),
        flatShading: false,
      });
    }
    return skinMaterial;
  }

  function getNailMaterial(THREE) {
    if (!nailMaterial) {
      nailMaterial = new THREE.MeshStandardMaterial({
        color: 0xffc8bc,
        emissive: 0x5a241c,
        emissiveIntensity: 0.18,
        metalness: 0.15,
        roughness: 0.32,
        flatShading: false,
        side: THREE.DoubleSide,
      });
    }
    return nailMaterial;
  }

  function applySurfaceFinish(root, THREE) {
    const skin = getSkinMaterial(THREE);
    const nail = getNailMaterial(THREE);
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.material = isNailMesh(object) ? nail : skin;
    });
  }

  function disposeObject(obj, { keepShared = false } = {}) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const mats = child.material;
      if (!mats) return;
      const list = Array.isArray(mats) ? mats : [mats];
      list.forEach((m) => {
        if (keepShared && (m === skinMaterial || m === nailMaterial)) return;
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
  }

  function teardownRenderer() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (controls) controls.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
    }
    disposeObject(scene);
    scene = camera = renderer = controls = modelRoot = annotRoot = null;
    bodyMeshes = [];
    pickables = [];
    loadedGender = null;
    clearCallouts();
    if (skinMaterial) { skinMaterial.dispose(); skinMaterial = null; }
    if (nailMaterial) { nailMaterial.dispose(); nailMaterial = null; }
  }

  function applyScale() {
    if (!camera || !controls || !bodyHeight || playingAuto) return;
    const { THREE } = three;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (bodyHeight / 2) / Math.tan(fov / 2) * 1.7 / Math.max(opts.scale, 0.5);
    const target = controls.target.clone();
    const dir = camera.position.clone().sub(target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.15, 1).normalize();
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.near = Math.max(bodyHeight / 200, 0.01);
    camera.far = bodyHeight * 40;
    camera.updateProjectionMatrix();
    controls.minDistance = bodyHeight * 0.08;
    controls.maxDistance = bodyHeight * 12;
    controls.update();
    calloutsDirty = true;
  }

  function faceFront() {
    if (!camera || !controls) return;
    const dist = framingDistance();
    controls.target.set(0, bodyHeight * 0.42, 0);
    camera.zoom = 1;
    camera.near = Math.max(bodyHeight / 200, 0.01);
    camera.far = bodyHeight * 40;
    camera.updateProjectionMatrix();
    camera.position.set(0, bodyHeight * 0.5, dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    controls.update();
    noteCameraMoving(280);
  }

  function framingDistance() {
    if (!camera || !three) return bodyHeight * 2;
    const { THREE } = three;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    return (bodyHeight / 2) / Math.tan(fov / 2) * 1.7 / Math.max(opts.scale, 0.5);
  }

  function lookAtWorld(position, normal) {
    if (!camera || !controls || !position) return;
    const { THREE } = three;
    const n = new THREE.Vector3().fromArray(normal || [0, 0, 1]);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    else n.normalize();
    if (Math.abs(n.y) > 0.92) {
      n.add(new THREE.Vector3(0, 0, 0.35)).normalize();
    }
    const front = new THREE.Vector3(0, 0.08, 1).normalize();
    if (n.dot(front) < 0.15) n.lerp(front, 0.7).normalize();
    const dist = bodyHeight * 0.38 / Math.max(opts.scale, 0.5);
    const target = new THREE.Vector3().fromArray(position);
    camera.zoom = 1;
    camera.near = Math.max(bodyHeight / 200, 0.01);
    camera.far = bodyHeight * 40;
    camera.updateProjectionMatrix();
    camera.position.copy(target).addScaledVector(n, dist);
    camera.up.set(0, 1, 0);
    controls.target.copy(target);
    camera.lookAt(target);
    controls.minDistance = bodyHeight * 0.08;
    controls.maxDistance = bodyHeight * 12;
    controls.update();
    noteCameraMoving(320);
  }

  function raycastSkin(THREE, origin, dir) {
    const ray = new THREE.Raycaster(origin, dir.clone().normalize(), 0, bodyHeight * 4);
    const hits = ray.intersectObjects(bodyMeshes, true);
    return hits[0] || null;
  }

  function jsonBounds(doc) {
    const pts = (doc && doc.acupoints) || [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    pts.forEach((p) => {
      const pos = p && p.position;
      if (!pos || pos.length < 3) return;
      minX = Math.min(minX, pos[0]); maxX = Math.max(maxX, pos[0]);
      minY = Math.min(minY, pos[1]); maxY = Math.max(maxY, pos[1]);
      minZ = Math.min(minZ, pos[2]); maxZ = Math.max(maxZ, pos[2]);
    });
    if (!Number.isFinite(minX)) {
      return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 1, maxZ: 0 };
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  function fitMapToUnframed(doc, unframedBox) {
    const b = jsonBounds(doc);
    const jsonH = Math.max(b.maxY - b.minY, 1e-6);
    const meshH = Math.max(unframedBox.max.y - unframedBox.min.y, 1e-6);
    const jsonCx = (b.minX + b.maxX) * 0.5;
    const jsonCz = (b.minZ + b.maxZ) * 0.5;
    const meshCx = (unframedBox.min.x + unframedBox.max.x) * 0.5;
    const meshCz = (unframedBox.min.z + unframedBox.max.z) * 0.5;
    const grounded = b.minY >= -0.08 * jsonH && b.minY <= 0.08 * jsonH;
    const unitMismatch = jsonH > meshH * 2 || meshH > jsonH * 2;
    if (unitMismatch) {
      return { scale: meshH / jsonH, cx: jsonCx, cy: b.minY, cz: jsonCz };
    }
    if (grounded) {
      return { scale: 1, cx: 0, cy: 0, cz: 0 };
    }
    return { scale: 1, cx: meshCx, cy: unframedBox.min.y, cz: meshCz };
  }

  function toWorld(pos) {
    if (!pos || pos.length < 3) return [0, 0, 0];
    return [
      (pos[0] - mapFit.cx) * mapFit.scale,
      (pos[1] - mapFit.cy) * mapFit.scale,
      (pos[2] - mapFit.cz) * mapFit.scale,
    ];
  }

  function snapToSkin(worldPos, normal, maxPullMm = 10) {
    if (!three || !bodyMeshes.length) return { position: worldPos, normal: normal || [0, 0, 1] };
    const { THREE } = three;
    const n = new THREE.Vector3().fromArray(normal || [0, 0, 1]);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    else n.normalize();
    const mm = worldPerMm();
    const pull = Number(maxPullMm) > 0 ? maxPullMm : 10;
    const origin = new THREE.Vector3().fromArray(worldPos).addScaledVector(n, mm * (pull + 2));
    const hit = raycastSkin(THREE, origin, n.clone().negate());
    if (!hit) return { position: worldPos, normal: [n.x, n.y, n.z] };
    const mapped = new THREE.Vector3().fromArray(worldPos);
    if (hit.point.distanceTo(mapped) > mm * pull) {
      return { position: worldPos, normal: [n.x, n.y, n.z] };
    }
    const hn = hit.face && hit.object
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : n;
    if (hn.dot(n) < 0) hn.negate();
    return { position: [hit.point.x, hit.point.y, hit.point.z], normal: [hn.x, hn.y, hn.z] };
  }

  function liftPoint(position, normal) {
    const mm = worldPerMm();
    return [
      position[0] + normal[0] * mm * SKIN_LIFT_MM,
      position[1] + normal[1] * mm * SKIN_LIFT_MM,
      position[2] + normal[2] * mm * SKIN_LIFT_MM,
    ];
  }

  function lerpNode(a, b, t) {
    const pos = [
      a.position[0] + (b.position[0] - a.position[0]) * t,
      a.position[1] + (b.position[1] - a.position[1]) * t,
      a.position[2] + (b.position[2] - a.position[2]) * t,
    ];
    const nrm = [
      a.normal[0] + (b.normal[0] - a.normal[0]) * t,
      a.normal[1] + (b.normal[1] - a.normal[1]) * t,
      a.normal[2] + (b.normal[2] - a.normal[2]) * t,
    ];
    const len = Math.hypot(...nrm) || 1;
    return { position: pos, normal: [nrm[0] / len, nrm[1] / len, nrm[2] / len] };
  }

  function splitRouteNodes(nodes) {
    const mm = worldPerMm();
    const maxJump = mm * ROUTE_BREAK_MM;
    const chunks = [];
    let cur = [];
    (nodes || []).forEach((node) => {
      if (!cur.length) {
        cur.push(node);
        return;
      }
      const a = toWorld(cur[cur.length - 1].position);
      const b = toWorld(node.position);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (dist > maxJump) {
        if (cur.length >= 2) chunks.push(cur);
        cur = [node];
        return;
      }
      cur.push(node);
    });
    if (cur.length >= 2) chunks.push(cur);
    return chunks;
  }

  function densifyPolyline(nodes, step) {
    const out = [];
    nodes.forEach((node, i) => {
      if (i === 0) {
        out.push(node);
        return;
      }
      const prev = nodes[i - 1];
      const dist = Math.hypot(
        node.position[0] - prev.position[0],
        node.position[1] - prev.position[1],
        node.position[2] - prev.position[2],
      );
      const segs = Math.max(1, Math.ceil(dist / Math.max(step, 1e-5)));
      for (let s = 1; s <= segs; s++) out.push(lerpNode(prev, node, s / segs));
    });
    return out;
  }

  function segmentHandleCount(dist, mm) {
    if (!(dist > mm * HANDLE_MIN_ARC_MM)) return 0;
    return Math.min(MAX_PAIR_HANDLES, Math.max(1, Math.round(dist / (mm * HANDLE_SPACING_MM))));
  }

  function densifyNodes(nodes) {
    const mm = worldPerMm();
    const prepared = nodes.map((node) => {
      const n = node.normal || [0, 0, 1];
      const nLen = Math.hypot(n[0], n[1], n[2]) || 1;
      return {
        type: node.type === 'control' ? 'control' : 'acupoint',
        position: toWorld(node.position),
        normal: [n[0] / nLen, n[1] / nLen, n[2] / nLen],
      };
    }).filter((n) => n.position);

    const located = [];
    prepared.forEach((node, i) => {
      if (i === 0) {
        located.push(node);
        return;
      }
      const prev = prepared[i - 1];
      const dist = Math.hypot(
        node.position[0] - prev.position[0],
        node.position[1] - prev.position[1],
        node.position[2] - prev.position[2],
      );
      const count = segmentHandleCount(dist, mm);
      for (let k = 1; k <= count; k++) {
        const t = k / (count + 1);
        const sample = lerpNode(prev, node, t);
        const bulge = Math.sin(Math.PI * t) * mm * HANDLE_BULGE_MM;
        sample.position = [
          sample.position[0] + sample.normal[0] * bulge,
          sample.position[1] + sample.normal[1] * bulge,
          sample.position[2] + sample.normal[2] * bulge,
        ];
        sample.type = 'control';
        located.push(sample);
      }
      located.push(node);
    });
    located.forEach((node) => {
      const pull = node.type === 'acupoint' ? 12 : RIBBON_HUG_MM;
      const hugged = snapToSkin(node.position, node.normal, pull);
      node.position = hugged.position;
      node.normal = hugged.normal;
    });
    return densifyPolyline(located, mm * SAMPLE_STEP_MM);
  }

  function addRibbon(THREE, samples, color) {
    if (!samples || samples.length < 2) return;
    const mm = worldPerMm();
    const half = mm * RIBBON_WIDTH_MM * 0.5;
    const count = samples.length;
    const position = new Float32Array(count * 2 * 3);
    const normal = new Float32Array(count * 2 * 3);
    for (let i = 0; i < count; i++) {
      const prev = samples[Math.max(0, i - 1)].position;
      const next = samples[Math.min(count - 1, i + 1)].position;
      const tangent = [
        next[0] - prev[0],
        next[1] - prev[1],
        next[2] - prev[2],
      ];
      const nrm = samples[i].normal.slice();
      const nLen = Math.hypot(...nrm) || 1;
      nrm[0] /= nLen; nrm[1] /= nLen; nrm[2] /= nLen;
      let side = [
        nrm[1] * tangent[2] - nrm[2] * tangent[1],
        nrm[2] * tangent[0] - nrm[0] * tangent[2],
        nrm[0] * tangent[1] - nrm[1] * tangent[0],
      ];
      let sLen = Math.hypot(...side);
      if (sLen < 1e-9) {
        side = [nrm[1], nrm[2], nrm[0]];
        sLen = Math.hypot(...side) || 1;
      }
      side[0] /= sLen; side[1] /= sLen; side[2] /= sLen;
      const lifted = liftPoint(samples[i].position, nrm);
      for (let lane = 0; lane < 2; lane++) {
        const sign = lane === 0 ? -1 : 1;
        const base = (i * 2 + lane) * 3;
        position[base] = lifted[0] + side[0] * half * sign;
        position[base + 1] = lifted[1] + side[1] * half * sign;
        position[base + 2] = lifted[2] + side[2] * half * sign;
        normal[base] = nrm[0];
        normal[base + 1] = nrm[1];
        normal[base + 2] = nrm[2];
      }
    }
    const index = new Uint32Array((count - 1) * 6);
    for (let span = 0; span < count - 1; span++) {
      const a = span * 2;
      const w = span * 6;
      index[w] = a;
      index[w + 1] = a + 1;
      index[w + 2] = a + 3;
      index[w + 3] = a;
      index[w + 4] = a + 3;
      index[w + 5] = a + 2;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geom.setIndex(new THREE.BufferAttribute(index, 1));
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));
    mesh.renderOrder = 2;
    mesh.raycast = () => {};
    annotRoot.add(mesh);
  }

  function addMarker(THREE, rec, color) {
    const mm = worldPerMm();
    const radius = mm * MARKER_DIAMETER_MM * 0.5;
    const lifted = liftPoint(rec.position, rec.normal);
    const geom = new THREE.CircleGeometry(radius, 20);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const marker = new THREE.Mesh(geom, mat);
    marker.position.fromArray(lifted);
    const n = new THREE.Vector3().fromArray(rec.normal || [0, 0, 1]);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    else n.normalize();
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    marker.userData.point = rec;
    marker.userData.kind = 'marker';
    marker.userData.baseColor = color;
    marker.renderOrder = 3;

    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 2.2, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    halo.visible = false;
    halo.renderOrder = 2;
    halo.raycast = () => {};
    marker.add(halo);
    marker.userData.halo = halo;

    annotRoot.add(marker);
    pickables.push(marker);
    return marker;
  }

  function projectToScreen(world, width, height) {
    const { THREE } = three;
    const v = new THREE.Vector3().fromArray(world);
    v.project(camera);
    if (!Number.isFinite(v.x) || v.z > 1 || v.z < -1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * width,
      y: (-v.y * 0.5 + 0.5) * height,
    };
  }

  function isPointVisible(rec, width, height) {
    if (!rec || !rec.position || !camera) return false;
    const { THREE } = three;
    const world = new THREE.Vector3().fromArray(rec.position);
    const cam = camera.position;
    const toCam = cam.clone().sub(world);
    const dist = toCam.length();
    if (dist < 1e-4) return false;
    toCam.multiplyScalar(1 / dist);
    const n = new THREE.Vector3().fromArray(rec.normal || [0, 0, 1]);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    else n.normalize();
    const facing = n.dot(toCam);
    if (facing < 0) return false;
    const screen = projectToScreen(rec.position, width, height);
    if (!screen) return false;
    if (screen.x < -8 || screen.x > width + 8 || screen.y < -8 || screen.y > height + 8) {
      return false;
    }
    if (facing >= 0.12) return true;
    const dir = world.clone().sub(cam).normalize();
    const slack = Math.max(worldPerMm() * 40, dist * 0.06);
    const ray = new THREE.Raycaster(cam, dir, 0, Math.max(dist - slack, 0));
    const hits = ray.intersectObjects(bodyMeshes, true);
    if (!hits.length) return true;
    const hit = hits[0];
    if (hit.distance >= dist - slack) return true;
    if (hit.point.distanceTo(world) <= worldPerMm() * 50) return true;
    return false;
  }

  function measureCallout(name) {
    const css = getComputedStyle(document.documentElement);
    const fs = parseFloat(css.getPropertyValue('--fs-md')) || 16;
    return { w: Math.max(fs, name.length * fs), h: fs * 1.35, fs };
  }

  function packSlots(items, height, slotH, pad) {
    items.sort((a, b) => a.py - b.py);
    let next = pad;
    const bot = height - pad;
    items.forEach((item) => {
      let y = Math.max(next, item.py);
      if (y > bot) y = bot;
      item.slotY = y;
      next = y + slotH;
    });
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function updateCallouts() {
    const svg = $('m3d-callouts');
    if (!svg || !camera || !renderer) return;
    if (orbiting || performance.now() < movingUntil) {
      setCalloutsVisible(false);
      return;
    }
    if ($('m3d-modal') && !$('m3d-modal').hidden) { setCalloutsVisible(false); return; }
    if ($('m3d-loading') && !$('m3d-loading').hidden) { setCalloutsVisible(false); return; }
    if ($('m3d-point-overlay') && !$('m3d-point-overlay').hidden) { setCalloutsVisible(false); return; }

    const selected = selectedMeridians();
    if (selected.length === 0 || selected.length > MAX_LABELED_MERIDIANS) {
      svg.innerHTML = '';
      setCalloutsVisible(false);
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const sides = labelSideByMeridian(selected);
    const pad = 8;
    const buckets = { left: [], right: [] };
    pickables.forEach((obj) => {
      if (obj.userData.kind !== 'marker' || !obj.userData.point) return;
      const rec = obj.userData.point;
      if (!isPointVisible(rec, width, height)) return;
      const screen = projectToScreen(rec.position, width, height);
      if (!screen) return;
      const size = measureCallout(rec.name || '');
      const park = sides.get(rec.meridianId) || 'right';
      buckets[park].push({
        rec,
        px: screen.x,
        py: screen.y,
        park,
        textW: size.w,
        textH: size.h,
      });
    });

    buckets.right = pickEdgeItems(buckets.right, 'right', width);
    buckets.left = pickEdgeItems(buckets.left, 'left', width);

    const laid = [];
    ['right', 'left'].forEach((park) => {
      const columns = splitCalloutColumns(buckets[park], park, width);
      columns.forEach((col) => {
        const slotH = Math.max(16, (col.items[0]?.textH || 16) + 3);
        packSlots(col.items, height, slotH, pad + 6);
        col.items.forEach((item) => {
          const slotY = item.slotY;
          if (park === 'right') {
            const inset = col.indent ? Math.max(item.textW + 12, 56) : 0;
            let textX = width - pad - item.textW - inset;
            if (textX < item.px + 10) textX = item.px + 10;
            if (textX + item.textW > width - 2) textX = width - item.textW - 2;
            const joinX = textX;
            const horiz = Math.min(28, Math.max(8, Math.abs(joinX - item.px) * 0.28));
            const elbowX = Math.max(item.px + 6, joinX - horiz);
            laid.push({ ...item, textX, elbowX, slotY, park });
          } else {
            const inset = col.indent ? Math.max(item.textW + 12, 56) : 0;
            let textX = pad + inset;
            if (textX + item.textW + 10 > item.px) textX = item.px - item.textW - 10;
            if (textX < 2) textX = 2;
            const joinX = textX + item.textW;
            const horiz = Math.min(28, Math.max(8, Math.abs(item.px - joinX) * 0.28));
            const elbowX = Math.min(item.px - 6, joinX + horiz);
            laid.push({ ...item, textX, elbowX, slotY, park });
          }
        });
      });
    });

    svg.innerHTML = '';
    if (!laid.length) {
      setCalloutsVisible(false);
      return;
    }
    laid.forEach((item) => {
      const joinX = item.park === 'left' ? item.textX + item.textW : item.textX;
      const aligned = Math.abs(item.slotY - item.py) < 2;
      const d = aligned
        ? `M ${item.px.toFixed(1)} ${item.py.toFixed(1)} L ${joinX.toFixed(1)} ${item.py.toFixed(1)}`
        : `M ${item.px.toFixed(1)} ${item.py.toFixed(1)} L ${item.elbowX.toFixed(1)} ${item.slotY.toFixed(1)} L ${joinX.toFixed(1)} ${item.slotY.toFixed(1)}`;
      svg.appendChild(svgEl('path', { class: 'leader-halo', d }));
      svg.appendChild(svgEl('path', { class: 'leader', d }));
      const text = svgEl('text', {
        class: 'callout-name',
        x: item.textX.toFixed(1),
        y: item.slotY.toFixed(1),
        'text-anchor': 'start',
      });
      text.textContent = item.rec.name;
      svg.appendChild(text);
    });
    setCalloutsVisible(true);
  }

  function tourPoints(meridianId) {
    const doc = currentMap();
    if (!doc) return [];
    return (doc.acupoints || [])
      .filter((p) => p.meridianId === meridianId && sideAllowed(p.side))
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      .map((p) => placedPoint(p));
  }

  function placedPoint(p) {
    const mapped = toWorld(p.position);
    const snapped = snapToSkin(mapped, p.normal);
    const position = liftPoint(snapped.position, snapped.normal);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      meridian: p.meridianName || meridianMeta(p.meridianId).name,
      meridianId: p.meridianId,
      side: p.side,
      sequence: p.sequence,
      position,
      normal: snapped.normal,
    };
  }

  function placeAnnotations() {
    if (!annotRoot || !three) return;
    const { THREE } = three;
    disposeObject(annotRoot, { keepShared: true });
    annotRoot.clear();
    pickables = [];
    highlighted = null;

    const doc = currentMap();
    const selected = selectedMeridians();
    if (!doc || !selected.length) {
      clearCallouts();
      return;
    }

    const selectedIds = new Set(selected.map((m) => m.id));

    (doc.meridians || []).forEach((route) => {
      if (!selectedIds.has(route.meridianId) || !sideAllowed(route.side)) return;
      const color = route.color || lineColorFor(route.meridianId);
      splitRouteNodes(route.nodes || []).forEach((chunk) => {
        addRibbon(THREE, densifyNodes(chunk), color);
      });
    });

    (doc.acupoints || []).forEach((p) => {
      if (!selectedIds.has(p.meridianId) || !sideAllowed(p.side)) return;
      const rec = placedPoint(p);
      addMarker(THREE, rec, markerColorFor());
    });
    calloutsDirty = true;
  }

  function highlightPoint(rec) {
    pickables.forEach((obj) => {
      if (obj.userData.kind !== 'marker') return;
      const mat = obj.material;
      const pt = obj.userData.point;
      const isOn = rec && pt && pt.code === rec.code && pt.meridianId === rec.meridianId && pt.side === rec.side;
      mat.color.set(isOn ? '#facc15' : obj.userData.baseColor);
      if (obj.userData.halo) obj.userData.halo.visible = !!isOn;
    });
    highlighted = rec;
  }

  function onPointer(event) {
    if (!renderer || !camera || $('m3d-modal')?.hidden === false) return;
    if (!$('m3d-point-overlay').hidden) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const { THREE } = three;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x, y }, camera);
    const hits = ray.intersectObjects(pickables, false);
    const hit = hits.find((h) => h.object.userData.point);
    if (hit) {
      currentPoint = hit.object.userData.point;
      if (playingAuto) stopAuto({ keepCursor: true });
      openOverlay(currentPoint);
    }
  }

  async function ensureScene() {
    const { THREE, OrbitControls } = await loadThree();
    const mount = $('m3d-viewport');
    if (renderer) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#dce8ec');
    camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff4ea, 0x6a7c82, 0.95));
    const key = new THREE.DirectionalLight(0xfff7f0, 1.2);
    key.position.set(2.2, 4.5, 3.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdde7ee, 0.35);
    fill.position.set(-2.4, 1.8, -1.6);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));

    modelRoot = new THREE.Group();
    annotRoot = new THREE.Group();
    scene.add(modelRoot);
    scene.add(annotRoot);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.addEventListener('change', () => { noteCameraMoving(220); });
    controls.addEventListener('start', () => { orbiting = true; hideCallouts(); });
    controls.addEventListener('end', () => { orbiting = false; noteCameraMoving(260); });

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const moving = orbiting || performance.now() < movingUntil;
      const cap = moving ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      if (Math.abs(renderer.getPixelRatio() - cap) > 0.05) renderer.setPixelRatio(cap);
      controls.update();
      const rect = mount.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
      if (moving) hideCallouts();
      else if (calloutsDirty) {
        updateCallouts();
        calloutsDirty = false;
      }
    };
    loop();

    let ptrDown = null;
    renderer.domElement.addEventListener('pointerdown', (ev) => {
      ptrDown = { x: ev.clientX, y: ev.clientY };
    });
    renderer.domElement.addEventListener('pointerup', (ev) => {
      if (playingAuto) return;
      if (ptrDown) {
        const dx = ev.clientX - ptrDown.x;
        const dy = ev.clientY - ptrDown.y;
        ptrDown = null;
        if (dx * dx + dy * dy > 64) return;
      }
      onPointer(ev);
    });
    window.addEventListener('resize', () => {
      if (!renderer) return;
      applyScale();
      calloutsDirty = true;
    });
  }

  async function loadMap(gender) {
    const key = gender === 'female' ? 'female' : 'male';
    if (mapCache[key]) return mapCache[key];
    const res = await fetch(MAP_URL[key]);
    if (!res.ok) throw new Error(`地圖載入失敗（${key}）`);
    const doc = await res.json();
    if (!doc || !Array.isArray(doc.acupoints) || !Array.isArray(doc.meridians)) {
      throw new Error('地圖格式不正確');
    }
    mapCache[key] = doc;
    return doc;
  }

  async function loadBody(gender) {
    const { THREE, GLTFLoader, MeshoptDecoder } = await loadThree();
    await ensureScene();
    const wanted = gender === 'female' ? 'female' : 'male';
    const doc = await loadMap(wanted);
    if (loadedGender === wanted && modelRoot.children.length) {
      placeAnnotations();
      if (!playingAuto) {
        faceFront();
        applyScale();
      }
      return;
    }
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`assets/models/${wanted}.glb`);
    disposeObject(modelRoot, { keepShared: true });
    modelRoot.clear();
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const unframed = new THREE.Box3().setFromObject(root);
    mapFit = fitMapToUnframed(doc, unframed);
    const center = unframed.getCenter(new THREE.Vector3());
    root.position.x += -center.x;
    root.position.z += -center.z;
    root.position.y += -unframed.min.y;
    root.updateMatrixWorld(true);
    bodyHeight = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y || 1;
    bodyMeshes = [];
    applySurfaceFinish(root, THREE);
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (obj.geometry && !obj.geometry.getAttribute('normal')) obj.geometry.computeVertexNormals();
      if (!isNailMesh(obj)) bodyMeshes.push(obj);
    });
    modelRoot.add(root);
    loadedGender = wanted;
    placeAnnotations();
    faceFront();
    applyScale();
  }

  async function playManual() {
    setLoading(true);
    $('m3d-hint').hidden = true;
    try {
      await loadBody(opts.gender);
    } catch (err) {
      console.warn(err);
      UI.toast('模型或地圖載入失敗，請檢查網路後再試');
    } finally {
      setLoading(false);
    }
    setPlayIcon('play');
    setTitle('3D 經絡模型');
  }

  function stopAuto({ keepCursor = false } = {}) {
    playingAuto = false;
    autoAbort = true;
    if (controls) controls.enabled = true;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setPlayIcon('play');
    if (!keepCursor) {
      autoCursor = null;
      highlightPoint(null);
      setTitle('3D 經絡模型');
    }
  }

  async function playAuto(resume) {
    const list = selectedMeridians();
    if (!list.length) return;
    const gen = ++playGeneration;
    playingAuto = true;
    autoAbort = false;
    if (!resume) autoLockedSide = 'right';
    if (controls) controls.enabled = false;
    setPlayIcon('stop');
    $('m3d-hint').hidden = true;

    setLoading(true);
    try {
      await Promise.all([loadBody(opts.gender), waitForVoices()]);
    } catch (err) {
      console.warn(err);
      UI.toast('模型或地圖載入失敗，請檢查網路後再試');
      stopAuto();
      setLoading(false);
      return;
    }
    if (autoAbort || gen !== playGeneration) {
      setLoading(false);
      return;
    }
    placeAnnotations();
    if (!resume) faceFront();
    setLoading(false);

    let mIndex = resume && autoCursor ? autoCursor.mIndex : 0;
    let pIndex = resume && autoCursor ? autoCursor.pIndex : -1;
    let phase = resume && autoCursor ? autoCursor.phase : 'name';

    for (; mIndex < list.length; mIndex++) {
      if (autoAbort || gen !== playGeneration) return;
      const mer = list[mIndex];
      const pts = tourPoints(mer.id);
      if (!pts.length) continue;
      setTitle(mer.name);
      autoCursor = { mIndex, pIndex: -1, phase: 'name' };
      if (pts[0] && pts[0].position) {
        highlightPoint(pts[0]);
        lookAtWorld(pts[0].position, pts[0].normal);
      }

      if (!resume || phase === 'name' || phase === 'count') {
        if (phase !== 'count') {
          await speak(mer.name, opts.gender);
          if (autoAbort || gen !== playGeneration) return;
        }
        await speak(`共${chineseNum(pts.length)}穴`, opts.gender);
        if (autoAbort || gen !== playGeneration) return;
        await sleep(2000);
        if (autoAbort || gen !== playGeneration) return;
        phase = 'point';
        pIndex = -1;
      }

      const startP = pIndex < 0 ? 0 : pIndex;
      for (let i = startP; i < pts.length; i++) {
        if (autoAbort || gen !== playGeneration) return;
        const rec = pts[i];
        currentPoint = rec;
        autoCursor = { mIndex, pIndex: i, phase: 'point' };
        highlightPoint(rec);
        lookAtWorld(rec.position, rec.normal);
        await speak(rec.name, opts.gender);
        if (autoAbort || gen !== playGeneration) return;
        await sleep(2000);
        if (autoAbort || gen !== playGeneration) return;
      }
      phase = 'name';
      pIndex = -1;
      resume = false;
    }

    if (gen !== playGeneration) return;
    playingAuto = false;
    autoCursor = null;
    if (controls) controls.enabled = true;
    highlightPoint(null);
    faceFront();
    setPlayIcon('play');
    setTitle('3D 經絡模型');
  }

  function validatePlay() {
    if (!opts.meridians.size) {
      UI.toast('請至少選擇一條經脈');
      setModal(true);
      return false;
    }
    return true;
  }

  async function onPlayClick() {
    closeOverlay();
    if (playingAuto) {
      stopAuto({ keepCursor: true });
      return;
    }
    if (!validatePlay()) return;
    unlockSpeech();
    setModal(false);
    if (opts.mode === 'auto') {
      await playAuto(!!autoCursor);
    } else {
      await playManual();
    }
  }

  function bindUi() {
    const list = $('m3d-meridian-list');
    if (!list) return;
    list.innerHTML = MERIDIANS.map((m) => (
      `<label><input type="checkbox" data-mid="${m.id}">${m.name}<span style="margin-left:auto;color:var(--clr-muted)">${m.id}</span></label>`
    )).join('');

    list.addEventListener('change', (e) => {
      const id = e.target.dataset.mid;
      if (!id) return;
      if (e.target.checked) opts.meridians.add(id);
      else opts.meridians.delete(id);
      if (loadedGender) placeAnnotations();
    });

    $('m3d-select-all').onclick = () => {
      MERIDIANS.forEach((m) => opts.meridians.add(m.id));
      list.querySelectorAll('input').forEach((el) => { el.checked = true; });
      if (loadedGender) placeAnnotations();
    };
    $('m3d-select-none').onclick = () => {
      opts.meridians.clear();
      list.querySelectorAll('input').forEach((el) => { el.checked = false; });
      if (loadedGender) placeAnnotations();
    };

    $('m3d-gender').onclick = (e) => {
      const btn = e.target.closest('button[data-gender]');
      if (!btn) return;
      $('m3d-gender').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      const next = btn.dataset.gender;
      const changed = next !== opts.gender;
      opts.gender = next;
      if (changed) {
        stopAuto();
        autoCursor = null;
        if (loadedGender && $('m3d-modal').hidden) playManual();
      }
    };
    $('m3d-mode').onclick = (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      $('m3d-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      const next = btn.dataset.mode;
      if (next !== opts.mode) {
        stopAuto();
        autoCursor = null;
      }
      opts.mode = next;
      if (loadedGender) placeAnnotations();
    };

    const scale = $('m3d-scale');
    const scaleVal = $('m3d-scale-val');
    scale.oninput = () => {
      opts.scale = Number(scale.value) || 1;
      scaleVal.textContent = opts.scale.toFixed(1) + '×';
      applyScale();
    };

    $('m3d-menu-btn').onclick = () => {
      if (playingAuto) stopAuto({ keepCursor: true });
      setModal($('m3d-modal').hidden);
    };
    $('m3d-modal-close').onclick = () => {
      setModal(false);
      if (opts.gender !== loadedGender && loadedGender) playManual();
    };
    $('m3d-modal').addEventListener('click', (e) => {
      if (e.target === $('m3d-modal')) {
        setModal(false);
        if (opts.gender !== loadedGender && loadedGender) playManual();
      }
    });

    $('m3d-play').onclick = onPlayClick;
    $('m3d-point-dismiss').onclick = closeOverlay;
    $('m3d-title').addEventListener('click', () => {
      if (currentPoint && $('m3d-point-overlay').hidden && !playingAuto) openOverlay(currentPoint);
    });
  }

  async function enter() {
    entered = true;
    setTitle('3D 經絡模型');
    setPlayIcon('play');
    closeOverlay();
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
    if (!pointsData) {
      try {
        const local = await fetch('assets/points-data.json');
        if (local.ok) pointsData = await local.json();
      } catch {}
      if (!pointsData) {
        try { pointsData = await Cache.loadAllPointsData(); }
        catch { UI.toast('穴位資料載入失敗'); }
      }
    }
    loadMap(opts.gender).catch(() => {});
    setModal(true);
    $('m3d-hint').hidden = !!loadedGender;
  }

  function leave() {
    entered = false;
    playGeneration += 1;
    stopAuto();
    closeOverlay();
    setModal(false);
    teardownRenderer();
    clearCallouts();
    $('m3d-hint').hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi);
  else bindUi();

  return { enter, leave };
})();
