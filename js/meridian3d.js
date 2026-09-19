/**
 * meridian3d.js — 3D 經絡檢視（讀取經脈繪圖室出版地圖）
 * 延遲載入 Three.js；Play 才載 GLB。自動模式固定 5 倍、第一穴置中面對使用者；靠近畫面邊緣 10% 才再置中。
 * 出版地圖若含 meridians[].ribbons 則直接繪製烤乾貼膚折線，不再現場 hug / split。
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
  const AUTO_SCALE = 5;
  const EDGE_MARGIN = 0.1;
  const FACE_DOT_MIN = 0.35;
  const INNER_ARM_FACE_DOT_MIN = 0.85;
  const INNER_ARM_DIST_SCALE = 0.50;

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
  let lastReframeName = '';
  let reframeLog = [];
  let capturedPointerId = null;
  let annotDirty = true;
  let ribbonCache = new Map();
  let pointCache = new Map();
  let annotPlaced = new Set();
  let annotWork = 0;
  let skinAccel = null;

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

  function viewScale() {
    return playingAuto ? AUTO_SCALE : (Number(opts.scale) || 1);
  }

  function labelSideByMeridian(selected) {
    const sides = new Map();
    selected.forEach((m) => sides.set(m.id, 'right'));
    return sides;
  }

  const BL_LIAO_NAMES = new Set(['上髎', '次髎', '中髎', '下髎']);
  const BL_FOOT_NAMES = new Set(['僕參', '申脈', '金門', '京骨', '束骨', '足通谷', '至陰']);
  const BL_PARALLEL_PAIRS = [
    ['眉衝', '曲差'],
    ['委中', '委陽'],
  ];

  function isBlFootLateral(rec) {
    return !!(rec && rec.meridianId === 'BL' && BL_FOOT_NAMES.has(rec.name));
  }

  function blCalloutBand(rec) {
    if (!rec || rec.meridianId !== 'BL') return '';
    if (BL_LIAO_NAMES.has(rec.name)) return 'liao';
    if (rec.name === '委中') return 'inner';
    if (rec.name === '委陽') return 'outer';
    const seq = Number(rec.sequence) || 0;
    if (seq >= 11 && seq <= 30) return 'inner';
    if (seq >= 41 && seq <= 54) return 'outer';
    return '';
  }

  function blPairedInner(rec) {
    const seq = Number(rec && rec.sequence) || 0;
    return !!(rec && rec.meridianId === 'BL' && seq >= 12 && seq <= 23);
  }

  function blPairedOuter(rec) {
    const seq = Number(rec && rec.sequence) || 0;
    return !!(rec && rec.meridianId === 'BL' && seq >= 41 && seq <= 52);
  }

  function calloutParkFor(rec, fallback = 'right') {
    return blCalloutBand(rec) === 'liao' ? 'left' : fallback;
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

  function dedupeParkItems(items, park) {
    const byName = new Map();
    items.forEach((it) => {
      const key = it.rec && it.rec.name;
      if (!key) return;
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, it);
        return;
      }
      const keep = park === 'right'
        ? (it.px >= prev.px ? it : prev)
        : (it.px <= prev.px ? it : prev);
      byName.set(key, keep);
    });
    return [...byName.values()];
  }

  function clusterMedian(cluster) {
    return cluster.reduce((sum, it) => sum + it.px, 0) / cluster.length;
  }

  function clusterScore(cluster) {
    const ys = cluster.map((it) => it.py);
    return cluster.length * (Math.max(...ys) - Math.min(...ys) + 12);
  }

  function isFocusRec(rec) {
    const focus = highlighted || currentPoint;
    if (!rec || !focus) return false;
    return rec.code === focus.code && rec.meridianId === focus.meridianId && rec.side === focus.side;
  }

  function ensureFocusItem(items, visible, park, sides) {
    const focusItem = visible.find((it) => isFocusRec(it.rec));
    if (!focusItem) return items;
    const meridianPark = (sides && sides.get(focusItem.rec.meridianId)) || 'right';
    const want = calloutParkFor(focusItem.rec, meridianPark);
    if (park !== want) return items;
    if (items.some((it) => isFocusRec(it.rec))) return items;
    return items.concat([{ ...focusItem, park }]);
  }

  function pickEdgeItems(items, park, width) {
    if (!items.length) return items;
    if (items.length <= 14) return items;
    const clusters = clusterByX(items, width);
    const screenMid = width * 0.5;
    let parkClusters = clusters.filter((cluster) => {
      const med = clusterMedian(cluster);
      return park === 'right' ? med >= screenMid : med <= screenMid;
    });
    if (parkClusters.length < 2) {
      parkClusters = park === 'right' ? clusters.slice(-3) : clusters.slice(0, 3);
    }
    if (!parkClusters.length) return items;
    const ranked = [...parkClusters].sort((a, b) => clusterScore(b) - clusterScore(a));
    const main = ranked.slice(0, 2);
    const kept = new Set(main);
    const mainMeds = main.map(clusterMedian);
    const innerBound = park === 'right' ? Math.min(...mainMeds) : Math.max(...mainMeds);
    parkClusters.forEach((cluster) => {
      if (kept.has(cluster)) return;
      const med = clusterMedian(cluster);
      const moreMedial = park === 'right' ? med <= innerBound + 6 : med >= innerBound - 6;
      if (moreMedial && cluster.length >= 3) kept.add(cluster);
      if (cluster.some((it) => isFocusRec(it.rec))) kept.add(cluster);
    });
    const out = [];
    kept.forEach((cluster) => out.push(...cluster));
    items.forEach((it) => {
      const name = it.rec && it.rec.name;
      if (isFocusRec(it.rec) || name === '會陽' || (name && name.endsWith('髎'))) {
        if (!out.includes(it)) out.push(it);
      }
    });
    return out.length ? out : items;
  }

  function focusTorsoItems(items) {
    if (!items.length || items.length <= 28) return items;
    const ys = items.map((it) => it.py).sort((a, b) => a - b);
    const y0 = ys[0];
    const span = Math.max(1, ys[ys.length - 1] - y0);
    const lo = y0 + span * 0.1;
    const hi = y0 + span * 0.72;
    const keepName = (name) => name === '會陽' || name === '承扶' || name === '胞肓' || name === '秩邊' || (name && name.endsWith('髎'));
    const core = items.filter((it) => isFocusRec(it.rec) || keepName(it.rec && it.rec.name) || (it.py >= lo && it.py <= hi));
    return core.length >= 8 ? core : items;
  }

  function splitCalloutColumns(items, park, width) {
    if (!items.length) return [];
    if (items.every((it) => blCalloutBand(it.rec) === 'liao')) {
      return [{ items: [...items], indent: 0, liao: true }];
    }
    const foot = items.filter((it) => isBlFootLateral(it.rec));
    const rest = items.filter((it) => !isBlFootLateral(it.rec));
    const cols = rest.length ? splitCalloutColumnsRest(rest, park, width) : [];
    if (foot.length >= 2) {
      const bySeq = (a, b) => (Number(a.rec.sequence) || 0) - (Number(b.rec.sequence) || 0);
      const outerFoot = foot.filter((it) => (Number(it.rec.sequence) || 0) % 2 === 0).sort(bySeq);
      const innerFoot = foot.filter((it) => (Number(it.rec.sequence) || 0) % 2 === 1).sort(bySeq);
      if (outerFoot.length) cols.push({ items: outerFoot, indent: 0, foot: true });
      if (innerFoot.length) cols.push({ items: innerFoot, indent: 1, foot: true });
    } else if (foot.length === 1) {
      cols.push({ items: foot, indent: 0 });
    }
    return cols;
  }

  function splitCalloutColumnsRest(items, park, width) {
    const hasBlPair = items.some((it) => blCalloutBand(it.rec) === 'inner')
      && items.some((it) => blCalloutBand(it.rec) === 'outer');
    if (hasBlPair) {
      const innerCol = items.filter((it) => blCalloutBand(it.rec) === 'inner');
      const outerCol = items.filter((it) => blCalloutBand(it.rec) !== 'inner');
      const cols = [];
      if (outerCol.length) cols.push({ items: outerCol, indent: 0, stick: true });
      if (innerCol.length) cols.push({ items: innerCol, indent: 1, stick: true });
      return cols;
    }
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

  function clearAnnotCache() {
    ribbonCache.clear();
    pointCache.clear();
    annotDirty = true;
    annotPlaced = new Set();
  }

  function markAnnotDirty() {
    annotDirty = true;
    autoCursor = null;
  }

  function yieldPaint() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== 'function') {
        setTimeout(resolve, 0);
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
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
    try { synth.cancel(); } catch {}
    try {
      synth.resume();
      const priming = new SpeechSynthesisUtterance(' ');
      priming.volume = 0;
      priming.rate = 10;
      synth.speak(priming);
    } catch {}
  }

  function cancelSpeech() {
    if (!window.speechSynthesis) return;
    try { window.speechSynthesis.cancel(); } catch {}
  }

  function restoreControls() {
    orbiting = false;
    if (controls) {
      controls.enabled = true;
      controls.enableDamping = false;
    }
    const el = renderer && renderer.domElement;
    if (!el || capturedPointerId == null || typeof el.releasePointerCapture !== 'function') {
      capturedPointerId = null;
      return;
    }
    try {
      if (typeof el.hasPointerCapture !== 'function' || el.hasPointerCapture(capturedPointerId)) {
        el.releasePointerCapture(capturedPointerId);
      }
    } catch {}
    capturedPointerId = null;
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
      const cap = (window.__m3dTest && window.__m3dTest.fastAuto)
        ? 80
        : Math.min(12000, Math.max(2200, String(text).length * 420));
      const timer = setTimeout(finish, cap);
      try { synth.speak(utt); }
      catch { finish(); }
    });
  }

  function sleep(ms) {
    if (window.__m3dTest && window.__m3dTest.fastAuto) ms = Math.min(ms, 80);
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
    annotWork += 1;
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
    skinAccel = null;
    clearCallouts();
    clearAnnotCache();
    if (skinMaterial) { skinMaterial.dispose(); skinMaterial = null; }
    if (nailMaterial) { nailMaterial.dispose(); nailMaterial = null; }
  }

  function applyScale() {
    if (!camera || !controls || !bodyHeight || playingAuto) return;
    const { THREE } = three;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (bodyHeight / 2) / Math.tan(fov / 2) * 1.7 / Math.max(viewScale(), 0.5);
    const target = controls.target.clone();
    const dir = camera.position.clone().sub(target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.15, 1).normalize();
    camera.position.copy(target).addScaledVector(dir, dist);
    applyCameraLimits();
    controls.update();
    calloutsDirty = true;
  }

  function jumpCamera(x, y, z) {
    if (!camera || !controls) return;
    controls.enableDamping = false;
    applyCameraLimits();
    controls.target.set(0, frameLookAtY(), 0);
    camera.zoom = 1;
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    controls.update();
    noteCameraMoving(280);
  }

  function faceFront() {
    jumpCamera(0, frameCameraY(), framingDistance());
  }

  function faceBack() {
    jumpCamera(0, frameCameraY(), -framingDistance());
  }

  function framingDistance() {
    if (!camera || !three) return bodyHeight * 2;
    const { THREE } = three;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    return (bodyHeight / 2) / Math.tan(fov / 2) * 1.7 / Math.max(viewScale(), 0.5);
  }

  function frameLookAtY() {
    const s = Math.min(Math.max(viewScale(), 0.5), 5);
    const t = Math.min(1, Math.max(0, (s - 1) / 1.5));
    return bodyHeight * (0.42 + 0.16 * t);
  }

  function frameCameraY() {
    return frameLookAtY() + bodyHeight * 0.08;
  }

  function applyCameraLimits() {
    if (!camera || !controls || !bodyHeight) return;
    camera.near = Math.max(bodyHeight / 200, 0.01);
    camera.far = Math.max(bodyHeight * 40, camera.near * 20);
    camera.updateProjectionMatrix();
    const want = framingDistance();
    controls.minDistance = Math.min(bodyHeight * 0.08, want * 0.45);
    controls.maxDistance = Math.max(bodyHeight * 12, want * 8);
  }

  function isInnerForearmLu(rec) {
    return !!(rec && rec.meridianId === 'LU' && (Number(rec.sequence) || 0) >= 8);
  }

  function innerArmSourceNormal(rec) {
    const doc = currentMap();
    const pts = (doc && doc.acupoints) || [];
    const palmar = pts.find((p) => (
      p.meridianId === 'LU'
      && p.side === rec.side
      && Number(p.sequence) === 10
    ));
    return (palmar && palmar.normal) || rec.normal;
  }

  function viewNormal(normal, rec) {
    const { THREE } = three;
    if (isInnerForearmLu(rec)) {
      const medial = rec.side === 'left' ? 1 : -1;
      const n = new THREE.Vector3().fromArray(innerArmSourceNormal(rec) || [medial, 0, 1]);
      if (n.lengthSq() < 1e-8) n.set(medial, 0.16, 0.5);
      else n.normalize();
      n.x = medial * Math.max(Math.abs(n.x), 0.78);
      n.y = Math.min(Math.max(n.y, 0.12), 0.32);
      n.z = Math.max(n.z, 0.40);
      return n.normalize();
    }
    const n = new THREE.Vector3().fromArray(normal || [0, 0, 1]);
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    else n.normalize();
    n.y = 0;
    if (n.lengthSq() < 0.05) n.set(0, 0, (normal && normal[2] < 0) ? -1 : 1);
    else n.normalize();
    if (n.z > 0.35) n.set(0, 0, 1);
    else if (n.z < -0.35) n.set(0, 0, -1);
    return n;
  }

  function cameraPoseForPoint(position, normal, rec) {
    const { THREE } = three;
    const n = viewNormal(normal, rec);
    const dist = isInnerForearmLu(rec) ? framingDistance() * INNER_ARM_DIST_SCALE : framingDistance();
    const target = new THREE.Vector3().fromArray(position);
    const pos = target.clone().addScaledVector(n, dist);
    return { pos, target };
  }

  function viewportSize() {
    if (!renderer) return { width: 1, height: 1 };
    const rect = renderer.domElement.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  function needsReframe(rec) {
    if (!rec || !camera || !controls || !three) return true;
    const { THREE } = three;
    const { width, height } = viewportSize();
    const screen = projectToScreen(rec.position, width, height);
    if (!screen) return true;
    const mx = width * EDGE_MARGIN;
    const my = height * EDGE_MARGIN;
    if (screen.x < mx || screen.x > width - mx || screen.y < my || screen.y > height - my) return true;
    const world = new THREE.Vector3().fromArray(rec.position);
    const toCam = camera.position.clone().sub(world);
    if (toCam.lengthSq() < 1e-8) return true;
    toCam.normalize();
    const n = viewNormal(rec.normal, rec);
    const minDot = isInnerForearmLu(rec) ? INNER_ARM_FACE_DOT_MIN : FACE_DOT_MIN;
    return n.dot(toCam) < minDot;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
  }

  function moveDuration(fromPos, toPos, fromTarget, toTarget) {
    const a = fromPos.clone().sub(fromTarget);
    const b = toPos.clone().sub(toTarget);
    if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 500;
    a.normalize();
    b.normalize();
    const ang = a.angleTo(b);
    const dist = fromPos.distanceTo(toPos) + fromTarget.distanceTo(toTarget);
    const ms = 400 + (ang / Math.PI) * 700 + (dist / Math.max(bodyHeight, 0.5)) * 350;
    return Math.max(400, Math.min(1200, ms));
  }

  function animateCameraTo(position, normal, gen, rec) {
    return new Promise((resolve) => {
      if (!camera || !controls || !three || !position) { resolve(); return; }
      applyCameraLimits();
      const pose = cameraPoseForPoint(position, normal, rec);
      const startPos = camera.position.clone();
      const startTarget = controls.target.clone();
      let dur = moveDuration(startPos, pose.pos, startTarget, pose.target);
      if (window.__m3dTest && window.__m3dTest.fastAuto) dur = 50;
      controls.enableDamping = false;
      const t0 = performance.now();
      noteCameraMoving(dur + 80);
      const step = () => {
        if (autoAbort || (gen && gen !== playGeneration)) {
          resolve();
          return;
        }
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = easeInOutCubic(t);
        camera.position.lerpVectors(startPos, pose.pos, e);
        controls.target.lerpVectors(startTarget, pose.target, e);
        camera.zoom = 1;
        camera.up.set(0, 1, 0);
        camera.lookAt(controls.target);
        camera.near = Math.max(bodyHeight / 200, 0.01);
        camera.far = bodyHeight * 40;
        camera.updateProjectionMatrix();
        controls.update();
        if (t < 1) {
          noteCameraMoving(80);
          requestAnimationFrame(step);
        } else {
          noteCameraMoving(280);
          calloutsDirty = true;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  async function framePointIfNeeded(rec, force, gen) {
    if (!rec) return;
    if (!force && !needsReframe(rec)) return;
    lastReframeName = rec.name;
    reframeLog.push(rec.name);
    await animateCameraTo(rec.position, rec.normal, gen, rec);
    if (autoAbort || (gen && gen !== playGeneration)) return;
    await sleep(300);
    calloutsDirty = true;
  }

  function lookAtWorld(position, normal) {
    if (!camera || !controls || !position || !three) return;
    applyCameraLimits();
    const pose = cameraPoseForPoint(position, normal);
    controls.enableDamping = false;
    camera.zoom = 1;
    camera.position.copy(pose.pos);
    camera.up.set(0, 1, 0);
    controls.target.copy(pose.target);
    camera.lookAt(pose.target);
    controls.update();
    noteCameraMoving(320);
  }

  function clearSkinAccel() {
    skinAccel = null;
  }

  function buildSkinAccel() {
    if (!three || !bodyMeshes.length) {
      skinAccel = null;
      return;
    }
    if (bodyMeshes.some((mesh) => mesh.isSkinnedMesh)) {
      skinAccel = null;
      return;
    }
    try {
    const { THREE } = three;
    const box = new THREE.Box3();
    bodyMeshes.forEach((mesh) => {
      mesh.updateWorldMatrix(true, false);
      box.expandByObject(mesh);
    });
    if (box.isEmpty()) {
      skinAccel = null;
      return;
    }
    const pad = Math.max(bodyHeight * 0.002, 1e-4);
    box.min.addScalar(-pad);
    box.max.addScalar(pad);
    const size = box.getSize(new THREE.Vector3());
    const n = 32;
    const inv = [n / Math.max(size.x, 1e-8), n / Math.max(size.y, 1e-8), n / Math.max(size.z, 1e-8)];
    const cellCount = n * n * n;
    const cells = new Array(cellCount);
    const meshes = [];
    const cellOf = (x, y, z) => {
      const ix = Math.min(n - 1, Math.max(0, Math.floor((x - box.min.x) * inv[0])));
      const iy = Math.min(n - 1, Math.max(0, Math.floor((y - box.min.y) * inv[1])));
      const iz = Math.min(n - 1, Math.max(0, Math.floor((z - box.min.z) * inv[2])));
      return (iz * n + iy) * n + ix;
    };

    bodyMeshes.forEach((mesh) => {
      const geom = mesh.geometry;
      if (!geom) return;
      const pos = geom.getAttribute('position');
      if (!pos) return;
      const idx = geom.index;
      const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
      if (triCount <= 0) return;
      const verts = new Float32Array(triCount * 9);
      mesh.updateWorldMatrix(true, false);
      const e = mesh.matrixWorld.elements;
      const apply = (x, y, z, o) => {
        verts[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        verts[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        verts[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      };
      const mi = meshes.length;
      for (let t = 0; t < triCount; t++) {
        let i0;
        let i1;
        let i2;
        if (idx) {
          i0 = idx.getX(t * 3);
          i1 = idx.getX(t * 3 + 1);
          i2 = idx.getX(t * 3 + 2);
        } else {
          i0 = t * 3;
          i1 = t * 3 + 1;
          i2 = t * 3 + 2;
        }
        const o = t * 9;
        apply(pos.getX(i0), pos.getY(i0), pos.getZ(i0), o);
        apply(pos.getX(i1), pos.getY(i1), pos.getZ(i1), o + 3);
        apply(pos.getX(i2), pos.getY(i2), pos.getZ(i2), o + 6);
        const minx = Math.min(verts[o], verts[o + 3], verts[o + 6]);
        const miny = Math.min(verts[o + 1], verts[o + 4], verts[o + 7]);
        const minz = Math.min(verts[o + 2], verts[o + 5], verts[o + 8]);
        const maxx = Math.max(verts[o], verts[o + 3], verts[o + 6]);
        const maxy = Math.max(verts[o + 1], verts[o + 4], verts[o + 7]);
        const maxz = Math.max(verts[o + 2], verts[o + 5], verts[o + 8]);
        const packed = (mi << 24) | t;
        const x0 = Math.min(n - 1, Math.max(0, Math.floor((minx - box.min.x) * inv[0])));
        const y0 = Math.min(n - 1, Math.max(0, Math.floor((miny - box.min.y) * inv[1])));
        const z0 = Math.min(n - 1, Math.max(0, Math.floor((minz - box.min.z) * inv[2])));
        const x1 = Math.min(n - 1, Math.max(0, Math.floor((maxx - box.min.x) * inv[0])));
        const y1 = Math.min(n - 1, Math.max(0, Math.floor((maxy - box.min.y) * inv[1])));
        const z1 = Math.min(n - 1, Math.max(0, Math.floor((maxz - box.min.z) * inv[2])));
        const span = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
        if (span > 27) {
          [0, 3, 6].forEach((off) => {
            const ci = cellOf(verts[o + off], verts[o + off + 1], verts[o + off + 2]);
            const bucket = cells[ci] || (cells[ci] = []);
            bucket.push(packed);
          });
          continue;
        }
        for (let iz = z0; iz <= z1; iz++) {
          for (let iy = y0; iy <= y1; iy++) {
            for (let ix = x0; ix <= x1; ix++) {
              const ci = (iz * n + iy) * n + ix;
              const bucket = cells[ci] || (cells[ci] = []);
              bucket.push(packed);
            }
          }
        }
      }
      meshes.push({ verts, triCount });
    });

    skinAccel = { box, n, inv, cells, meshes };
    } catch (err) {
      console.warn(err);
      skinAccel = null;
    }
  }

  function rayTriT(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-7 && det < 1e-7) return null;
    const invDet = 1 / det;
    const tx = ox - ax;
    const ty = oy - ay;
    const tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * invDet;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * invDet;
    if (v < 0 || u + v > 1) return null;
    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    if (!(t >= 0)) return null;
    return t;
  }

  function raycastSkinAccel(origin, dir, far) {
    if (!skinAccel) return null;
    const { box, n, inv, cells, meshes } = skinAccel;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / len;
    const dy = dir.y / len;
    const dz = dir.z / len;
    const maxT = far > 0 ? far : bodyHeight * 4;
    const x1 = ox + dx * maxT;
    const y1 = oy + dy * maxT;
    const z1 = oz + dz * maxT;
    const minx = Math.min(ox, x1);
    const miny = Math.min(oy, y1);
    const minz = Math.min(oz, z1);
    const maxx = Math.max(ox, x1);
    const maxy = Math.max(oy, y1);
    const maxz = Math.max(oz, z1);
    if (maxx < box.min.x || maxy < box.min.y || maxz < box.min.z || minx > box.max.x || miny > box.max.y || minz > box.max.z) {
      return null;
    }
    const ix0 = Math.min(n - 1, Math.max(0, Math.floor((Math.max(minx, box.min.x) - box.min.x) * inv[0])));
    const iy0 = Math.min(n - 1, Math.max(0, Math.floor((Math.max(miny, box.min.y) - box.min.y) * inv[1])));
    const iz0 = Math.min(n - 1, Math.max(0, Math.floor((Math.max(minz, box.min.z) - box.min.z) * inv[2])));
    const ix1 = Math.min(n - 1, Math.max(0, Math.floor((Math.min(maxx, box.max.x) - box.min.x) * inv[0])));
    const iy1 = Math.min(n - 1, Math.max(0, Math.floor((Math.min(maxy, box.max.y) - box.min.y) * inv[1])));
    const iz1 = Math.min(n - 1, Math.max(0, Math.floor((Math.min(maxz, box.max.z) - box.min.z) * inv[2])));
    let bestT = maxT;
    let best = null;
    const seen = new Set();
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const bucket = cells[(iz * n + iy) * n + ix];
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const packed = bucket[i];
            if (seen.has(packed)) continue;
            seen.add(packed);
            const mi = packed >>> 24;
            const tIdx = packed & 0xffffff;
            const mesh = meshes[mi];
            if (!mesh) continue;
            const o = tIdx * 9;
            const v = mesh.verts;
            const t = rayTriT(
              ox, oy, oz, dx, dy, dz,
              v[o], v[o + 1], v[o + 2],
              v[o + 3], v[o + 4], v[o + 5],
              v[o + 6], v[o + 7], v[o + 8],
            );
            if (t == null || t > bestT) continue;
            bestT = t;
            const ax = v[o]; const ay = v[o + 1]; const az = v[o + 2];
            const bx = v[o + 3]; const by = v[o + 4]; const bz = v[o + 5];
            const cx = v[o + 6]; const cy = v[o + 7]; const cz = v[o + 8];
            const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
            const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            best = { t, nx, ny, nz };
          }
        }
      }
    }
    if (!best) return null;
    const nLen = Math.hypot(best.nx, best.ny, best.nz) || 1;
    return {
      point: { x: ox + dx * best.t, y: oy + dy * best.t, z: oz + dz * best.t },
      distance: best.t,
      face: { normal: { x: best.nx / nLen, y: best.ny / nLen, z: best.nz / nLen } },
      object: null,
    };
  }

  function raycastSkin(THREE, origin, dir, far) {
    const maxFar = far > 0 ? far : bodyHeight * 4;
    if (skinAccel) {
      const hit = raycastSkinAccel(origin, dir, maxFar);
      if (hit) return hit;
    }
    const ray = new THREE.Raycaster(origin, dir.clone().normalize(), 0, maxFar);
    ray.firstHitOnly = true;
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
    const far = mm * (pull * 2 + 4);
    const hit = raycastSkin(THREE, origin, n.clone().negate(), far);
    if (!hit) return { position: worldPos, normal: [n.x, n.y, n.z] };
    const mapped = new THREE.Vector3().fromArray(worldPos);
    const hx = hit.point.x;
    const hy = hit.point.y;
    const hz = hit.point.z;
    if (Math.hypot(hx - mapped.x, hy - mapped.y, hz - mapped.z) > mm * pull) {
      return { position: worldPos, normal: [n.x, n.y, n.z] };
    }
    let nx;
    let ny;
    let nz;
    if (hit.object && hit.face && hit.face.normal && hit.face.normal.clone) {
      const hn = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      nx = hn.x; ny = hn.y; nz = hn.z;
    } else if (hit.face && hit.face.normal) {
      nx = hit.face.normal.x;
      ny = hit.face.normal.y;
      nz = hit.face.normal.z;
    } else {
      nx = n.x; ny = n.y; nz = n.z;
    }
    if (nx * n.x + ny * n.y + nz * n.z < 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }
    return { position: [hx, hy, hz], normal: [nx, ny, nz] };
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

  function acupointByPointId(pointId) {
    if (!pointId) return null;
    const doc = currentMap();
    if (!doc) return null;
    return (doc.acupoints || []).find((p) => p.id === pointId) || null;
  }

  function nearestAcupointMeta(worldPos, meridianId) {
    const doc = currentMap();
    if (!doc) return null;
    const maxD = worldPerMm() * 25;
    let best = null;
    let bd = Infinity;
    (doc.acupoints || []).forEach((p) => {
      if (meridianId && p.meridianId !== meridianId) return;
      const w = toWorld(p.position);
      const d = Math.hypot(w[0] - worldPos[0], w[1] - worldPos[1], w[2] - worldPos[2]);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    if (!best || bd > maxD) return null;
    return best;
  }

  function luNodeSequence(node) {
    const rec = acupointByPointId(node && node.pointId);
    return rec ? (Number(rec.sequence) || 0) : 0;
  }

  function collapseLuWrapNodes(prepared, meridianId) {
    if (meridianId !== 'LU' || !prepared.length) return prepared;
    const out = [];
    for (let i = 0; i < prepared.length; i++) {
      out.push(prepared[i]);
      if (prepared[i].type !== 'acupoint' || luNodeSequence(prepared[i]) !== 10) continue;
      let j = i + 1;
      while (j < prepared.length && luNodeSequence(prepared[j]) !== 11) j += 1;
      if (j < prepared.length && luNodeSequence(prepared[j]) === 11) i = j - 1;
    }
    return out;
  }

  function luWrapHandles(prev, node, mm, meridianId) {
    if (meridianId !== 'LU') return [];
    if (prev.type !== 'acupoint' || node.type !== 'acupoint') return [];
    const a = acupointByPointId(prev.pointId);
    const b = acupointByPointId(node.pointId);
    if (!a || !b) return [];
    const lo = Math.min(a.sequence || 0, b.sequence || 0);
    const hi = Math.max(a.sequence || 0, b.sequence || 0);
    const wrist = lo === 7 && hi === 8;
    const thumb = lo === 10 && hi === 11;
    if (!wrist && !thumb) return [];
    const dist = Math.hypot(
      node.position[0] - prev.position[0],
      node.position[1] - prev.position[1],
      node.position[2] - prev.position[2],
    );
    if (dist > mm * ROUTE_BREAK_MM) return [];
    const count = thumb ? 5 : 3;
    const bump = mm * (thumb ? 7 : 8);
    const handles = [];
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      const sample = lerpNode(prev, node, t);
      sample.position = [
        sample.position[0] + sample.normal[0] * bump,
        sample.position[1] + sample.normal[1] * bump,
        sample.position[2] + sample.normal[2] * bump,
      ];
      sample.type = 'control';
      sample.luWrap = true;
      handles.push(sample);
    }
    return handles;
  }

  function hugDenseSamples(samples) {
    samples.forEach((node) => {
      const hugged = snapToSkin(node.position, node.normal, 16);
      node.position = hugged.position;
      node.normal = hugged.normal;
    });
    return samples;
  }

  function innerBackDoglegs(prev, node, mm, meridianId) {
    if (meridianId !== 'BL') return [];
    if (prev.type !== 'acupoint' || node.type !== 'acupoint') return [];
    const a = acupointByPointId(prev.pointId) || nearestAcupointMeta(prev.position, 'BL');
    const b = acupointByPointId(node.pointId) || nearestAcupointMeta(node.position, 'BL');
    if (!a || !b) return [];
    const seqA = a.sequence || 0;
    const seqB = b.sequence || 0;
    if (seqA < 11 || seqA > 30 || seqB < 11 || seqB > 30) return [];
    const dist = Math.hypot(
      node.position[0] - prev.position[0],
      node.position[1] - prev.position[1],
      node.position[2] - prev.position[2],
    );
    if (dist > mm * ROUTE_BREAK_MM) return [];
    const midX = (prev.position[0] + node.position[0]) * 0.5;
    const towardGV = midX >= 0 ? -1 : 1;
    const weaken = (seqA >= 28 || seqB >= 28) ? 0.35 : 1;
    const offset = Math.min(dist * 0.28, Math.abs(midX) * 0.45, mm * 10) * weaken;
    if (!(offset > mm * 1.2)) return [];
    const spineGap = mm * 3;
    return [0.28, 0.72].map((t) => {
      const sample = lerpNode(prev, node, t);
      let x = sample.position[0] + towardGV * offset;
      if (towardGV > 0) x = Math.min(x, -spineGap);
      else x = Math.max(x, spineGap);
      sample.position = [x, sample.position[1], sample.position[2]];
      sample.type = 'control';
      sample.dogleg = true;
      return sample;
    });
  }

  function densifyNodes(nodes, meridianId) {
    const mm = worldPerMm();
    const prepared = nodes.map((node) => {
      const n = node.normal || [0, 0, 1];
      const nLen = Math.hypot(n[0], n[1], n[2]) || 1;
      return {
        type: node.type === 'control' ? 'control' : 'acupoint',
        position: toWorld(node.position),
        normal: [n[0] / nLen, n[1] / nLen, n[2] / nLen],
        pointId: node.pointId || null,
      };
    }).filter((n) => n.position);

    const route = collapseLuWrapNodes(prepared, meridianId);
    const located = [];
    route.forEach((node, i) => {
      if (i === 0) {
        located.push(node);
        return;
      }
      const prev = route[i - 1];
      const dist = Math.hypot(
        node.position[0] - prev.position[0],
        node.position[1] - prev.position[1],
        node.position[2] - prev.position[2],
      );
      const wraps = luWrapHandles(prev, node, mm, meridianId);
      const doglegs = innerBackDoglegs(prev, node, mm, meridianId);
      if (wraps.length) {
        wraps.forEach((sample) => located.push(sample));
      } else if (doglegs.length) {
        doglegs.forEach((sample) => located.push(sample));
      } else {
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
      }
      located.push(node);
    });
    located.forEach((node) => {
      const pull = node.luWrap ? 22 : (node.type === 'acupoint' ? 12 : RIBBON_HUG_MM);
      const snapN = node.dogleg
        ? [0, 0, (node.normal && node.normal[2] < 0) ? -1 : 1]
        : node.normal;
      const hugged = snapToSkin(node.position, snapN, pull);
      node.position = hugged.position;
      node.normal = hugged.normal;
    });
    const dense = densifyPolyline(located, mm * SAMPLE_STEP_MM);
    return meridianId === 'LU' ? hugDenseSamples(dense) : dense;
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
    const screen = projectToScreen(rec.position, width, height);
    if (!screen) return false;
    if (screen.x < -8 || screen.x > width + 8 || screen.y < -8 || screen.y > height + 8) {
      return false;
    }
    if (isFocusRec(rec)) return true;
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
    return facing >= 0.12;
  }

  function measureCallout(name) {
    const css = getComputedStyle(document.documentElement);
    const fs = (parseFloat(css.getPropertyValue('--fs-md')) || 16) * 2;
    return { w: Math.max(fs, name.length * fs), h: fs * 1.35, fs };
  }

  function packSlots(items, height, slotH, pad, stickToPoint = false) {
    items.sort((a, b) => a.py - b.py);
    const bot = height - pad;
    if (stickToPoint) {
      const kept = [];
      let lastY = pad - slotH;
      items.forEach((item) => {
        const y = Math.max(pad, Math.min(bot, item.py));
        if (y < lastY + slotH) {
          const nudged = lastY + slotH;
          if (nudged <= bot && nudged - item.py <= Math.max(6, item.textH * 0.28)) {
            item.slotY = nudged;
            kept.push(item);
            lastY = nudged;
          }
          return;
        }
        item.slotY = y;
        kept.push(item);
        lastY = y;
      });
      if (!kept.length && items.length) {
        items[0].slotY = Math.max(pad, Math.min(bot, items[0].py));
        kept.push(items[0]);
      }
      items.length = 0;
      items.push(...kept);
      return;
    }
    const minSlot = Math.max(14, slotH * 0.72);
    const maxN = Math.max(1, Math.floor((height - pad * 2) / minSlot));
    if (items.length > maxN) {
      const focusIdx = items.findIndex((it) => isFocusRec(it.rec));
      if (focusIdx >= 0) {
        let start = Math.min(Math.max(0, focusIdx - Math.floor((maxN - 1) / 2)), items.length - maxN);
        const kept = items.slice(start, start + maxN);
        if (!kept.some((it) => isFocusRec(it.rec))) kept[kept.length - 1] = items[focusIdx];
        items.length = 0;
        items.push(...kept);
        items.sort((a, b) => a.py - b.py);
      } else {
        items.splice(maxN);
      }
    }
    let next = pad;
    items.forEach((item) => {
      let y = Math.max(next, item.py);
      y = Math.max(pad, Math.min(bot, y));
      if (y < next) y = next;
      item.slotY = y;
      next = y + slotH;
    });
  }

  function packLiaoColumn(items, height, slotH, pad) {
    items.sort((a, b) => (Number(a.rec && a.rec.sequence) || 0) - (Number(b.rec && b.rec.sequence) || 0) || a.py - b.py);
    const n = items.length;
    if (!n) return;
    const span = (n - 1) * slotH;
    const mid = items.reduce((sum, it) => sum + it.py, 0) / n;
    let y0 = mid - span / 2;
    y0 = Math.max(pad, Math.min(height - pad - span, y0));
    items.forEach((item, i) => {
      item.slotY = y0 + i * slotH;
    });
  }

  function findBlOuterPartner(inner, outerItems) {
    const want = (Number(inner.rec && inner.rec.sequence) || 0) + 29;
    const sameSide = outerItems.filter((o) => blPairedOuter(o.rec) && (!inner.rec.side || !o.rec.side || o.rec.side === inner.rec.side));
    const exact = sameSide.find((o) => (Number(o.rec.sequence) || 0) === want);
    if (exact) return exact;
    let best = null;
    let bestD = Infinity;
    sameSide.forEach((o) => {
      const d = Math.abs(o.py - inner.py);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    });
    return best;
  }

  function nextLowerPy(item, items) {
    let best = Infinity;
    items.forEach((it) => {
      if (it === item) return;
      if (it.py > item.py + 3 && it.py < best) best = it.py;
    });
    return Number.isFinite(best) ? best : null;
  }

  function applyDown45Dogleg(item, partner, nextPy) {
    const sign = partner && partner.px < item.px ? -1 : 1;
    const midX = partner
      ? (item.px + partner.px) / 2
      : item.px + sign * Math.max(16, item.textH * 0.55);
    const gapDrop = Math.abs(midX - item.px);
    const rowDrop = nextPy == null ? item.textH * 0.72 : Math.abs(nextPy - item.py) * 0.5;
    const drop = Math.max(item.textH * 0.62, gapDrop, rowDrop);
    item.dogleg = true;
    item.elbowX = item.px + sign * drop;
    item.slotY = item.py + drop;
  }

  function packBlPairColumns(innerItems, outerItems, height, slotH, pad) {
    const bot = height - pad;
    outerItems.forEach((outer) => {
      outer.slotY = Math.max(pad, Math.min(bot, outer.py));
    });
    const paired = [];
    const rest = [];
    innerItems.forEach((inner) => {
      if (blPairedInner(inner.rec)) paired.push(inner);
      else rest.push(inner);
    });
    const neighbors = innerItems.concat(outerItems);
    paired.forEach((inner) => {
      applyDown45Dogleg(inner, findBlOuterPartner(inner, outerItems), nextLowerPy(inner, neighbors));
      inner.slotY = Math.max(pad, Math.min(bot, inner.slotY));
      const drop = Math.abs(inner.slotY - inner.py);
      const sign = inner.elbowX >= inner.px ? 1 : -1;
      inner.elbowX = inner.px + sign * drop;
    });
    rest.forEach((item) => {
      item.dogleg = false;
      item.slotY = Math.max(pad, Math.min(bot, item.py));
    });
    packSlots(rest, height, slotH, pad, true);
    innerItems.length = 0;
    innerItems.push(...paired, ...rest);
  }

  function packBlFootColumns(columns, height, pad) {
    const inner = columns.find((col) => col.foot && col.indent);
    const outer = columns.find((col) => col.foot && !col.indent);
    if (!inner && !outer) return;
    const sample = (outer && outer.items[0]) || (inner && inner.items[0]);
    const slotH = Math.max(20, (sample?.textH || 16) * 0.95);
    const all = [...(outer?.items || []), ...(inner?.items || [])];
    const mid = all.reduce((sum, it) => sum + it.py, 0) / Math.max(1, all.length);
    const bySeq = new Map();
    all.forEach((it) => bySeq.set(Number(it.rec.sequence) || 0, it));
    const pairs = [];
    [61, 63, 65].forEach((odd) => {
      const inn = bySeq.get(odd);
      const out = bySeq.get(odd + 1);
      if (inn || out) pairs.push({ inner: inn, outer: out });
    });
    if (bySeq.get(67)) pairs.push({ inner: bySeq.get(67), outer: null });
    if (!pairs.length) return;
    const span = Math.max(0, (pairs.length - 1) * slotH);
    let y0 = mid - span / 2;
    y0 = Math.max(pad, Math.min(height - pad - span, y0));
    pairs.forEach((pair, i) => {
      const rowY = y0 + i * slotH;
      if (pair.outer) {
        pair.outer.slotY = rowY;
        const drop = Math.abs(rowY - pair.outer.py);
        pair.outer.dogleg = drop >= 6;
        pair.outer.elbowX = pair.outer.px + drop;
      }
      if (pair.inner) {
        const partner = pair.outer;
        pair.inner.dogleg = true;
        pair.inner.slotY = Math.min(height - pad, rowY + slotH * 0.42);
        const drop = Math.abs(pair.inner.slotY - pair.inner.py);
        const sign = partner && partner.px < pair.inner.px ? -1 : 1;
        pair.inner.elbowX = pair.inner.px + sign * Math.max(drop, 12);
      }
    });
  }

  function applyBlParallelDoglegs(laid) {
    BL_PARALLEL_PAIRS.forEach(([medial, lateral]) => {
      const mei = laid.find((it) => it.rec && it.rec.name === medial);
      const lat = laid.find((it) => it.rec && it.rec.name === lateral);
      if (!mei || !lat) return;
      applyDown45Dogleg(mei, lat, nextLowerPy(mei, laid));
      laid.forEach((it) => {
        if (it === mei || it === lat || it.park !== mei.park) return;
        if (Math.abs(it.slotY - mei.slotY) < mei.textH * 0.82 && it.slotY >= mei.py) {
          it.slotY = mei.slotY + mei.textH * 0.9;
        }
      });
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

    const visible = [];
    pickables.forEach((obj) => {
      if (obj.userData.kind !== 'marker' || !obj.userData.point) return;
      const rec = obj.userData.point;
      if (!isPointVisible(rec, width, height)) return;
      const screen = projectToScreen(rec.position, width, height);
      if (!screen) return;
      const size = measureCallout(rec.name || '');
      visible.push({
        rec,
        px: screen.x,
        py: screen.y,
        textW: size.w,
        textH: size.h,
      });
    });

    const sides = labelSideByMeridian(selected);
    const pad = 8;
    const buckets = { left: [], right: [] };
    visible.forEach((it) => {
      const meridianPark = sides.get(it.rec.meridianId) || 'right';
      const park = calloutParkFor(it.rec, meridianPark);
      buckets[park].push({ ...it, park });
    });

    const preparePark = (park) => {
      const raw = dedupeParkItems(buckets[park], park);
      const hasBlPair = raw.some((it) => blCalloutBand(it.rec) === 'inner')
        && raw.some((it) => blCalloutBand(it.rec) === 'outer');
      const next = hasBlPair
        ? focusTorsoItems(raw)
        : focusTorsoItems(pickEdgeItems(raw, park, width));
      return ensureFocusItem(next, visible, park, sides);
    };
    buckets.right = preparePark('right');
    buckets.left = preparePark('left');

    const laid = [];
    ['right', 'left'].forEach((park) => {
      const columns = splitCalloutColumns(buckets[park], park, width);
      const outerW = Math.max(0, ...columns.filter((col) => !col.indent).flatMap((col) => col.items.map((it) => it.textW)));
      const innerStick = columns.find((col) => col.stick && col.indent);
      const outerStick = columns.find((col) => col.stick && !col.indent);
      if (innerStick && outerStick) {
        const slotH = Math.max(18, (outerStick.items[0]?.textH || innerStick.items[0]?.textH || 16) * 0.86);
        packBlPairColumns(innerStick.items, outerStick.items, height, slotH, pad + 6);
      }
      packBlFootColumns(columns, height, pad + 6);
      columns.forEach((col) => {
        const baseH = col.items[0]?.textH || 16;
        if (col.liao) {
          packLiaoColumn(col.items, height, Math.max(22, baseH * 1.08), pad + 6);
        } else if (col.foot) {
          return;
        } else if (col.stick && !(innerStick && outerStick)) {
          packSlots(col.items, height, Math.max(18, baseH * 0.86), pad + 6, true);
        } else if (!col.stick && !col.liao) {
          packSlots(col.items, height, Math.max(16, baseH + 3), pad + 6, false);
        }
      });
      columns.forEach((col) => {
        col.items.forEach((item) => {
          const slotY = item.slotY;
          if (park === 'right') {
            const inset = col.indent ? Math.max(outerW + 32, 72) : 0;
            let textX = width - pad - item.textW - inset;
            if (!col.stick && !col.foot && !item.dogleg) {
              if (textX < item.px + 10) textX = item.px + 10;
            }
            if (textX + item.textW > width - 2) textX = width - item.textW - 2;
            if (textX < 2) textX = 2;
            const joinX = textX;
            const horiz = Math.min(28, Math.max(8, Math.abs(joinX - item.px) * 0.28));
            const elbowX = item.dogleg
              ? item.elbowX
              : Math.max(item.px + 6, joinX - horiz);
            laid.push({ ...item, textX, elbowX, slotY, park });
          } else {
            let textX = pad;
            if (textX + item.textW + 10 > item.px) textX = Math.max(2, item.px - item.textW - 10);
            if (textX < 2) textX = 2;
            const joinX = textX + item.textW;
            const horiz = Math.min(36, Math.max(10, Math.abs(item.px - joinX) * 0.22));
            const elbowX = Math.min(item.px - 8, joinX + horiz);
            laid.push({ ...item, textX, elbowX, slotY, park });
          }
        });
      });
    });
    applyBlParallelDoglegs(laid);

    svg.innerHTML = '';
    if (!laid.length) {
      setCalloutsVisible(false);
      return;
    }
    laid.sort((a, b) => Number(playingAuto && isFocusRec(a.rec)) - Number(playingAuto && isFocusRec(b.rec)));
    laid.forEach((item) => {
      const focus = !!(playingAuto && isFocusRec(item.rec));
      const joinX = item.park === 'left' ? item.textX + item.textW : item.textX;
      const aligned = !item.dogleg && Math.abs(item.slotY - item.py) < Math.max(6, item.textH * 0.35);
      let elbowX = item.elbowX;
      if (item.dogleg) {
        const drop = Math.abs(item.slotY - item.py);
        const sign = (item.elbowX >= item.px ? 1 : -1);
        elbowX = item.px + sign * drop;
      }
      const d = aligned
        ? `M ${item.px.toFixed(1)} ${item.py.toFixed(1)} L ${joinX.toFixed(1)} ${item.py.toFixed(1)}`
        : `M ${item.px.toFixed(1)} ${item.py.toFixed(1)} L ${elbowX.toFixed(1)} ${item.slotY.toFixed(1)} L ${joinX.toFixed(1)} ${item.slotY.toFixed(1)}`;
      svg.appendChild(svgEl('path', { class: focus ? 'leader-halo is-focus' : 'leader-halo', d }));
      svg.appendChild(svgEl('path', { class: focus ? 'leader is-focus' : 'leader', d }));
      const text = svgEl('text', {
        class: focus ? 'callout-name is-focus' : 'callout-name',
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
    const key = `${loadedGender}|${p.id}`;
    const cached = pointCache.get(key);
    if (cached) return cached;
    const mapped = toWorld(p.position);
    const snapped = snapToSkin(mapped, p.normal);
    const position = liftPoint(snapped.position, snapped.normal);
    const rec = {
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
    pointCache.set(key, rec);
    return rec;
  }

  function ribbonSamples(route, chunk, chunkIdx) {
    const key = `${loadedGender}|${route.meridianId}|${route.side}|${chunkIdx}`;
    const cached = ribbonCache.get(key);
    if (cached) return cached;
    const samples = densifyNodes(chunk, route.meridianId);
    ribbonCache.set(key, samples);
    return samples;
  }

  function bakedRibbonSpan(ribbon) {
    const samples = ribbon?.samples || [];
    if (samples.length < 2) return 0;
    const a = samples[0].position || [0, 0, 0];
    const b = samples[samples.length - 1].position || [0, 0, 0];
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }

  function routeUsesBakedRibbons(route) {
    return Array.isArray(route?.ribbons)
      && route.ribbons.some((ribbon) => (
        (ribbon?.samples || []).length >= 2 && bakedRibbonSpan(ribbon) > 1e-4
      ));
  }

  function bakedRibbonSamples(route, ribbon, ribbonIdx) {
    const key = `${loadedGender}|baked|${route.meridianId}|${route.side}|${ribbonIdx}`;
    const cached = ribbonCache.get(key);
    if (cached) return cached;
    const samples = (ribbon?.samples || []).map((sample) => {
      const n = sample.normal || [0, 0, 1];
      const nLen = Math.hypot(n[0], n[1], n[2]) || 1;
      return {
        position: toWorld(sample.position),
        normal: [n[0] / nLen, n[1] / nLen, n[2] / nLen],
      };
    }).filter((sample) => sample.position);
    ribbonCache.set(key, samples);
    return samples;
  }

  function resetAnnotScene() {
    if (annotRoot && three) {
      disposeObject(annotRoot, { keepShared: true });
      annotRoot.clear();
    }
    pickables = [];
    highlighted = null;
    annotPlaced = new Set();
  }

  function placeMeridian(meridianId) {
    if (!annotRoot || !three || !meridianId || annotPlaced.has(meridianId)) return;
    const { THREE } = three;
    const doc = currentMap();
    if (!doc) return;
    (doc.meridians || []).forEach((route) => {
      if (route.meridianId !== meridianId || !sideAllowed(route.side)) return;
      const color = route.color || lineColorFor(route.meridianId);
      if (routeUsesBakedRibbons(route)) {
        route.ribbons.forEach((ribbon, ribbonIdx) => {
          addRibbon(THREE, bakedRibbonSamples(route, ribbon, ribbonIdx), color);
        });
        return;
      }
      splitRouteNodes(route.nodes || []).forEach((chunk, chunkIdx) => {
        addRibbon(THREE, ribbonSamples(route, chunk, chunkIdx), color);
      });
    });
    (doc.acupoints || []).forEach((p) => {
      if (p.meridianId !== meridianId || !sideAllowed(p.side)) return;
      addMarker(THREE, placedPoint(p), markerColorFor());
    });
    annotPlaced.add(meridianId);
    calloutsDirty = true;
  }

  function placeAnnotations() {
    if (!annotRoot || !three) {
      annotDirty = true;
      return;
    }
    resetAnnotScene();
    const selected = selectedMeridians();
    if (!selected.length) {
      clearCallouts();
      annotDirty = false;
      return;
    }
    selected.forEach((mer) => placeMeridian(mer.id));
    annotDirty = false;
  }

  async function rebuildAnnotations({ ids = null, reset = false, work = annotWork } = {}) {
    if (work !== annotWork) return;
    if (!annotRoot || !three) {
      annotDirty = true;
      return;
    }
    const selected = selectedMeridians();
    const want = ids && ids.length
      ? ids.filter((id) => selected.some((m) => m.id === id))
      : selected.map((m) => m.id);
    if (reset) resetAnnotScene();
    if (!want.length && reset) {
      clearCallouts();
      annotDirty = !selected.length ? false : true;
      return;
    }
    for (let i = 0; i < want.length; i++) {
      if (work !== annotWork) return;
      placeMeridian(want[i]);
      if (i < want.length - 1) await sleep(0);
    }
    if (work !== annotWork) return;
    annotDirty = selected.some((m) => !annotPlaced.has(m.id));
  }

  function scheduleAnnotRebuild() {
    if (!loadedGender || playingAuto || !annotDirty) return;
    const work = ++annotWork;
    setTimeout(() => {
      if (work !== annotWork || playingAuto || !annotDirty) return;
      rebuildAnnotations({ reset: true, work }).catch(() => {});
    }, 0);
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
    calloutsDirty = true;
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
    renderer.setPixelRatio(1);
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
    controls.addEventListener('change', () => {
      if (orbiting) hideCallouts();
    });
    controls.addEventListener('start', () => {
      controls.enableDamping = true;
      orbiting = true;
      hideCallouts();
    });
    controls.addEventListener('end', () => { orbiting = false; noteCameraMoving(280); });

    let cssW = 0;
    let cssH = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if ($('m3d-modal') && !$('m3d-modal').hidden) return;
      const moving = orbiting || performance.now() < movingUntil;
      try { controls.update(); } catch {}
      const rect = mount.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (cssW !== w || cssH !== h) {
        cssW = w;
        cssH = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      try { renderer.render(scene, camera); } catch {}
      if (moving) {
        hideCallouts();
        calloutsDirty = true;
      } else if (calloutsDirty) {
        calloutsDirty = false;
        try { updateCallouts(); } catch {}
      }
    };
    loop();

    let ptrDown = null;
    renderer.domElement.addEventListener('pointerdown', (ev) => {
      capturedPointerId = ev.pointerId;
      ptrDown = { x: ev.clientX, y: ev.clientY };
    });
    renderer.domElement.addEventListener('pointerup', (ev) => {
      capturedPointerId = null;
      if (playingAuto) return;
      if (ptrDown) {
        const dx = ev.clientX - ptrDown.x;
        const dy = ev.clientY - ptrDown.y;
        ptrDown = null;
        if (dx * dx + dy * dy > 64) return;
      }
      onPointer(ev);
    });
    renderer.domElement.addEventListener('pointercancel', () => {
      capturedPointerId = null;
      ptrDown = null;
      orbiting = false;
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
      if (!skinAccel) buildSkinAccel();
      if (!playingAuto && annotDirty) await rebuildAnnotations({ reset: true });
      applyCameraLimits();
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
    applyCameraLimits();
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
    clearSkinAccel();
    buildSkinAccel();
    clearAnnotCache();
    resetAnnotScene();
    if (!playingAuto) await rebuildAnnotations({ reset: false });
    if (!playingAuto) {
      faceFront();
      applyScale();
    }
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
    restoreControls();
    cancelSpeech();
    closeOverlay();
    setLoading(false);
    setPlayIcon('play');
    if (!keepCursor) {
      autoCursor = null;
      highlightPoint(null);
      setTitle('3D 經絡模型');
    }
  }

  async function holdForTest(rec) {
    while (
      window.__m3dTest
      && window.__m3dTest.stopAfter
      && rec
      && window.__m3dTest.stopAfter === rec.name
      && !autoAbort
    ) {
      await sleep(50);
    }
  }

  async function playAuto(resume) {
    const list = selectedMeridians();
    if (!list.length) return;
    const gen = ++playGeneration;
    const work = ++annotWork;
    playingAuto = true;
    autoAbort = false;
    lastReframeName = '';
    reframeLog = [];
    if (window.__m3dTest) window.__m3dTest.trace = [];
    if (!resume) autoLockedSide = 'right';
    if (controls) controls.enabled = false;
    setPlayIcon('stop');
    $('m3d-hint').hidden = true;

    try {
      setLoading(true);
      await yieldPaint();
      try {
        await Promise.all([loadBody(opts.gender), waitForVoices()]);
      } catch (err) {
        console.warn(err);
        UI.toast('模型或地圖載入失敗，請檢查網路後再試');
        stopAuto();
        setLoading(false);
        return;
      }
      if (autoAbort || gen !== playGeneration || work !== annotWork) {
        setLoading(false);
        return;
      }
      const firstId = list[0] && list[0].id;
      if (firstId && (annotDirty || !annotPlaced.has(firstId))) {
        await rebuildAnnotations({ ids: [firstId], reset: true, work });
      }
      setLoading(false);
      const rest = list.slice(1).map((m) => m.id);
      if (rest.length) {
        rebuildAnnotations({ ids: rest, reset: false, work }).catch(() => {});
      }

      let mIndex = resume && autoCursor ? autoCursor.mIndex : 0;
      let pIndex = resume && autoCursor ? autoCursor.pIndex : -1;
      let phase = resume && autoCursor ? autoCursor.phase : 'name';

      for (; mIndex < list.length; mIndex++) {
        if (autoAbort || gen !== playGeneration) return;
        const mer = list[mIndex];
        if (!annotPlaced.has(mer.id)) {
          await rebuildAnnotations({ ids: [mer.id], reset: false, work });
          if (autoAbort || gen !== playGeneration || work !== annotWork) return;
        }
        const pts = tourPoints(mer.id);
        if (!pts.length) continue;
        setTitle(mer.name);
        autoCursor = { mIndex, pIndex: -1, phase: 'name' };
        if (pts[0]) {
          highlightPoint(pts[0]);
          await framePointIfNeeded(pts[0], true, gen);
          if (autoAbort || gen !== playGeneration) return;
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
          if (window.__m3dTest) {
            if (!Array.isArray(window.__m3dTest.trace)) window.__m3dTest.trace = [];
            window.__m3dTest.trace.push(rec.name);
          }
          await framePointIfNeeded(rec, false, gen);
          if (autoAbort || gen !== playGeneration) return;
          await holdForTest(rec);
          if (autoAbort || gen !== playGeneration) return;
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
      stopAuto();
      faceFront();
    } catch (err) {
      console.warn(err);
    } finally {
      if (gen === playGeneration && playingAuto) {
        stopAuto();
        try { faceFront(); } catch {}
      }
    }
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
      playAuto(!!autoCursor).catch((err) => console.warn(err));
    } else {
      await playManual();
    }
  }

  let uiBound = false;

  function bindTap(id, handler) {
    const el = $(id);
    if (!el) return;
    let last = 0;
    const run = (ev) => {
      if (ev && ev.type === 'pointerup') {
        if ((ev.button ?? 0) !== 0) return;
        if (ev.pointerType === 'mouse') return;
      }
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      handler(ev);
    };
    el.addEventListener('pointerup', run);
    el.onclick = run;
  }

  function bindUi() {
    if (uiBound) return;
    uiBound = true;
    const list = $('m3d-meridian-list');
    if (!list) return;
    list.innerHTML = MERIDIANS.map((m) => (
      `<label><input type="checkbox" data-mid="${m.id}">${m.name}<span style="margin-left:auto;color:var(--clr-muted)">${m.id}</span></label>`
    )).join('');

    const syncMeridianBox = (el) => {
      const id = el && el.dataset && el.dataset.mid;
      if (!id) return;
      if (el.checked) opts.meridians.add(id);
      else opts.meridians.delete(id);
      markAnnotDirty();
    };
    list.addEventListener('change', (e) => {
      if (e.target && e.target.matches('input[data-mid]')) syncMeridianBox(e.target);
    });
    list.addEventListener('click', (e) => {
      const box = e.target.closest('input[data-mid]') || e.target.closest('label')?.querySelector('input[data-mid]');
      if (box) syncMeridianBox(box);
    });

    $('m3d-select-all').onclick = () => {
      MERIDIANS.forEach((m) => opts.meridians.add(m.id));
      list.querySelectorAll('input').forEach((el) => { el.checked = true; });
      markAnnotDirty();
    };
    $('m3d-select-none').onclick = () => {
      opts.meridians.clear();
      list.querySelectorAll('input').forEach((el) => { el.checked = false; });
      markAnnotDirty();
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
      markAnnotDirty();
    };

    const scale = $('m3d-scale');
    const scaleVal = $('m3d-scale-val');
    scale.oninput = () => {
      opts.scale = Number(scale.value) || 1;
      scaleVal.textContent = opts.scale.toFixed(1) + '×';
      applyScale();
    };

    bindTap('m3d-menu-btn', () => {
      if (playingAuto) stopAuto({ keepCursor: true });
      setModal($('m3d-modal').hidden);
    });
    $('m3d-modal-close').onclick = () => {
      setModal(false);
      if (opts.gender !== loadedGender && loadedGender) playManual();
      else scheduleAnnotRebuild();
    };
    $('m3d-modal').addEventListener('click', (e) => {
      if (e.target === $('m3d-modal')) {
        setModal(false);
        if (opts.gender !== loadedGender && loadedGender) playManual();
        else scheduleAnnotRebuild();
      }
    });

    bindTap('m3d-play', onPlayClick);
    bindTap('back-meridian-3d', () => {
      leave();
      UI.showPage('page-home');
    });
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
    if (!entered) return;
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

    function testRecord(name) {
      if (!name) return currentPoint;
      const hit = pickables.find((obj) => obj.userData.point && obj.userData.point.name === name);
      return hit ? hit.userData.point : currentPoint;
    }

    window.__m3dTest = {
      faceFront: () => { faceFront(); calloutsDirty = true; },
      faceBack: () => { faceBack(); calloutsDirty = true; },
      dolly(factor) {
        if (!camera || !controls) return;
        const t = controls.target;
        const s = Number(factor) || 1;
        camera.position.set(
          t.x + (camera.position.x - t.x) * s,
          t.y + (camera.position.y - t.y) * s,
          t.z + (camera.position.z - t.z) * s,
        );
        controls.update();
        noteCameraMoving(280);
        calloutsDirty = true;
      },
      nudgeTarget(dyBody) {
        if (!camera || !controls) return;
        const dy = (Number(dyBody) || 0) * (Number(bodyHeight) || 1);
        controls.target.y += dy;
        camera.position.y += dy;
        controls.update();
        noteCameraMoving(280);
        calloutsDirty = true;
      },
      lookAtName(name) {
        const rec = testRecord(name);
        if (!rec || !camera || !controls) return;
        const pos = rec.position;
        const dx = camera.position.x - controls.target.x;
        const dy = camera.position.y - controls.target.y;
        const dz = camera.position.z - controls.target.z;
        controls.target.set(pos[0], pos[1], pos[2]);
        camera.position.set(pos[0] + dx, pos[1] + dy, pos[2] + dz);
        controls.update();
        noteCameraMoving(280);
        calloutsDirty = true;
      },
      playingAuto: () => playingAuto,
      viewScale,
      bodyHeight: () => bodyHeight,
      cameraMoving: () => orbiting || performance.now() < movingUntil,
      lastReframe: () => lastReframeName,
      reframeLog: () => reframeLog.slice(),
      stopAfter: '',
      trace: [],
      callouts() {
        const svg = $('m3d-callouts');
        if (!svg || svg.hasAttribute('hidden')) return [];
        return [...svg.querySelectorAll('text')].map((el) => el.textContent);
      },
      calloutLayout() {
        const svg = $('m3d-callouts');
        if (!svg || svg.hasAttribute('hidden')) return [];
        const { width } = viewportSize();
        const paths = [...svg.querySelectorAll('path.leader')];
        return [...svg.querySelectorAll('text')].map((el, i) => {
          const d = paths[i] ? paths[i].getAttribute('d') || '' : '';
          const ys = [...d.matchAll(/[ML]\s*[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
          const xs = [...d.matchAll(/[ML]\s*([\d.]+) /g)].map((m) => Number(m[1]));
          const horizontal = ys.length >= 2 && ys.every((y) => Math.abs(y - ys[0]) < 1.5);
          const dogleg = ys.length >= 3 && Math.abs(ys[0] - ys[1]) > 2 && Math.abs(ys[1] - ys[ys.length - 1]) < 1.5;
          return {
            name: el.textContent,
            x: Number(el.getAttribute('x')),
            y: Number(el.getAttribute('y')),
            left: Number(el.getAttribute('x')) < width * 0.45,
            horizontal,
            dogleg,
            py0: ys[0] || 0,
            elbowX: xs[1] || xs[0] || 0,
          };
        });
      },
      ndcOf(name) {
        const rec = testRecord(name);
        if (!rec || !camera) return null;
        const { width, height } = viewportSize();
        const screen = projectToScreen(rec.position, width, height);
        if (!screen) return null;
        return {
          x: screen.x / width,
          y: screen.y / height,
          px: screen.x,
          py: screen.y,
          w: width,
          h: height,
        };
      },
      facingDot(name) {
        const rec = testRecord(name);
        if (!rec || !camera || !three) return null;
        const { THREE } = three;
        const world = new THREE.Vector3().fromArray(rec.position);
        const toCam = camera.position.clone().sub(world);
        if (toCam.lengthSq() < 1e-8) return 0;
        return viewNormal(rec.normal, rec).dot(toCam.normalize());
      },
      dist() {
        if (!camera || !controls) return null;
        return camera.position.distanceTo(controls.target);
      },
      current() {
        if (!currentPoint) return null;
        return {
          name: currentPoint.name,
          sequence: currentPoint.sequence,
          side: currentPoint.side,
          meridianId: currentPoint.meridianId,
        };
      },
      cam() {
        if (!camera || !controls) return null;
        return {
          pos: camera.position.toArray().map((n) => Math.round(n * 1000) / 1000),
          target: controls.target.toArray().map((n) => Math.round(n * 1000) / 1000),
        };
      },
      draw() {
        if (!renderer) return null;
        const el = renderer.domElement;
        return {
          cssW: el.clientWidth,
          cssH: el.clientHeight,
          bufW: el.width,
          bufH: el.height,
          pr: renderer.getPixelRatio(),
        };
      },
      annotCache: () => ({
        ribbons: ribbonCache.size,
        points: pointCache.size,
        dirty: annotDirty,
        placed: [...annotPlaced],
        skin: !!skinAccel,
      }),
      ribbonSource(meridianId) {
        const doc = currentMap();
        return (doc?.meridians || [])
          .filter((route) => !meridianId || route.meridianId === meridianId)
          .map((route) => ({
            id: route.id,
            meridianId: route.meridianId,
            side: route.side,
            baked: routeUsesBakedRibbons(route),
            ribbons: (route.ribbons || []).length,
            samples: (route.ribbons || []).reduce(
              (count, ribbon) => count + (ribbon.samples || []).length,
              0,
            ),
          }));
      },
      selection: () => ({
        gender: opts.gender,
        mode: opts.mode,
        meridians: [...opts.meridians],
      }),
      meshStats() {
        let verts = 0;
        let tris = 0;
        let skinned = 0;
        (bodyMeshes || []).forEach((obj) => {
          const g = obj.geometry;
          const v = g && g.getAttribute('position') ? g.getAttribute('position').count : 0;
          const t = g && g.index ? g.index.count / 3 : v / 3;
          verts += v;
          tris += t;
          if (obj.isSkinnedMesh) skinned += 1;
        });
        return {
          meshes: (bodyMeshes || []).length,
          verts,
          tris: Math.round(tris),
          skinned,
          pickables: pickables.length,
        };
      },
      timeCallouts() {
        const t0 = performance.now();
        updateCallouts();
        return Math.round(performance.now() - t0);
      },
      yaw(deg) {
        if (!camera || !controls || !three) return;
        const { THREE } = three;
        const damping = controls.enableDamping;
        controls.enableDamping = false;
        const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(deg),
        );
        camera.position.sub(controls.target).applyQuaternion(q).add(controls.target);
        camera.lookAt(controls.target);
        controls.update();
        controls.enableDamping = damping;
        noteCameraMoving(280);
        calloutsDirty = true;
      },
    };

    return { enter, leave };
})();
