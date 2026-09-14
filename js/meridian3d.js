/**
 * meridian3d.js — 3D 經絡模型第一版
 * 延遲載入 Three.js；Play 才載 GLB。自動模式走畫面右側（hamburger 側）。
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
  let autoCursor = null; // { mIndex, pIndex, phase }
  let currentPoint = null;
  let pickables = [];
  let highlighted = null;
  let pointsData = null;
  let entered = false;
  let movingUntil = 0;

  const $ = (id) => document.getElementById(id);

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

  function codeSeq(code) {
    const m = /^[A-Z]+(\d+)$/.exec(code || '');
    return m ? Number(m[1]) : 0;
  }

  function pointsFor(meridianName) {
    if (!pointsData) return [];
    return Object.entries(pointsData)
      .filter(([, d]) => d && d['所屬經脈'] === meridianName)
      .map(([name, d]) => ({ name, code: d['國際代碼'] || '', meridian: meridianName }))
      .sort((a, b) => codeSeq(a.code) - codeSeq(b.code));
  }

  function selectedMeridians() {
    return MERIDIANS.filter((m) => opts.meridians.has(m.id));
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
    if (on) playingAuto && stopAuto({ keepCursor: true });
  }

  function closeOverlay() {
    const el = $('m3d-point-overlay');
    if (el) el.hidden = true;
  }

  async function openOverlay(point) {
    if (!point) return;
    const overlay = $('m3d-point-overlay');
    const sheet = $('m3d-point-sheet');
    if (!overlay || !sheet) return;
    overlay.hidden = false;
    sheet.innerHTML = '';
    await UI.renderPointPanel(sheet, point.name, {
      meridian: point.meridian,
      intlCode: point.code,
    });
  }

  function speak(text, gender) {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) { resolve(); return; }
      synth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.88;
      const voice = Settings.pickTTSVoice(gender === 'female' ? 'female' : 'male');
      if (voice) {
        utt.voice = voice;
        utt.lang = voice.lang || 'zh-TW';
      } else {
        utt.lang = 'zh-TW';
      }
      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      synth.speak(utt);
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

  function disposeObject(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const mats = child.material;
      if (!mats) return;
      const list = Array.isArray(mats) ? mats : [mats];
      list.forEach((m) => {
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
  }

  function applyScale() {
    if (!camera || !controls || !bodyHeight) return;
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
  }

  function faceFront() {
    if (!camera || !controls) return;
    const { THREE } = three;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (bodyHeight / 2) / Math.tan(fov / 2) * 1.7 / Math.max(opts.scale, 0.5);
    controls.target.set(0, bodyHeight * 0.42, 0);
    // 正面：身體朝 +Z，相機在 +Z 看向原點 → 畫面右為 +X（hamburger 側）
    camera.position.set(0, bodyHeight * 0.5, dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    controls.update();
  }

  function lookAtWorld(position, normal) {
    if (!camera || !controls) return;
    const { THREE } = three;
    const n = new THREE.Vector3().fromArray(normal || [0, 0, 1]).normalize();
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    const dist = bodyHeight * 0.38 / Math.max(opts.scale, 0.5);
    const target = new THREE.Vector3().fromArray(position);
    const pos = target.clone().addScaledVector(n, dist);
    controls.target.copy(target);
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    controls.update();
  }

  function makeLabel(THREE, text, height) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(44,74,82,0.25)';
    ctx.lineWidth = 2;
    roundRect(ctx, 4, 8, 248, 48, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2c4a52';
    ctx.font = '600 28px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide, depthTest: true, depthWrite: false,
    });
    const w = height * 0.11;
    const h = height * 0.028;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.userData.kind = 'label';
    return mesh;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function raycastSkin(THREE, origin, dir) {
    const ray = new THREE.Raycaster(origin, dir.clone().normalize(), 0, bodyHeight * 4);
    const hits = ray.intersectObjects(bodyMeshes, true);
    return hits[0] || null;
  }

  function placeAnnotations() {
    if (!annotRoot || !three) return;
    const { THREE } = three;
    disposeObject(annotRoot);
    annotRoot.clear();
    pickables = [];
    highlighted = null;

    const selected = selectedMeridians();
    const box = new THREE.Box3();
    bodyMeshes.forEach((m) => box.expandByObject(m));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    selected.forEach((meridian, mi) => {
      const catalog = pointsFor(meridian.name);
      if (!catalog.length) return;
      const color = LINE_COLOR[meridian.group] || '#ef4444';
      const markerColor = meridian.group === 'yang' ? '#111111' : color;
      const pts = [];
      const spread = (mi - (selected.length - 1) / 2) * 0.18;
      const midline = meridian.id === 'CV' || meridian.id === 'GV';
      const fromBack = meridian.id === 'GV';

      catalog.forEach((item, i) => {
        const t = (i + 0.5) / catalog.length;
        const y = box.min.y + size.y * (0.92 - t * 0.84);
        let origin, dir;
        if (midline) {
          const zOff = (fromBack ? -1 : 1) * (size.z * 0.9 + 0.15);
          origin = new THREE.Vector3(spread * 0.02, y, center.z + zOff);
          dir = new THREE.Vector3(0, 0, fromBack ? 1 : -1);
        } else {
          // 畫面右側（+X / hamburger 側）射向身體
          origin = new THREE.Vector3(box.max.x + size.x * 0.55, y, center.z + spread * size.z);
          dir = new THREE.Vector3(-1, 0, 0).add(new THREE.Vector3(0, 0, spread)).normalize();
        }
        const hit = raycastSkin(THREE, origin, dir);
        if (!hit) return;
        const pos = hit.point.clone();
        const nrm = hit.face && hit.object
          ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
          : dir.clone().negate();
        const lift = nrm.clone().multiplyScalar(bodyHeight * 0.006);
        pos.add(lift);

        const rec = {
          ...item,
          meridianId: meridian.id,
          position: [pos.x, pos.y, pos.z],
          normal: [nrm.x, nrm.y, nrm.z],
        };
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(bodyHeight * 0.008, 12, 12),
          new THREE.MeshStandardMaterial({
            color: markerColor, roughness: 0.45, metalness: 0.05, emissive: 0x000000,
          }),
        );
        marker.position.copy(pos);
        marker.userData.point = rec;
        marker.userData.kind = 'marker';
        marker.userData.baseColor = markerColor;
        annotRoot.add(marker);

        pickables.push(marker);
        if (selected.length <= 2) {
          const label = makeLabel(THREE, item.name, bodyHeight);
          const tangent = new THREE.Vector3();
          if (Math.abs(nrm.y) < 0.9) tangent.crossVectors(nrm, new THREE.Vector3(0, 1, 0)).normalize();
          else tangent.set(1, 0, 0);
          const bitangent = new THREE.Vector3().crossVectors(nrm, tangent).normalize();
          label.position.copy(pos).addScaledVector(bitangent, bodyHeight * 0.022);
          label.lookAt(pos.clone().add(nrm));
          label.userData.point = rec;
          annotRoot.add(label);
          pickables.push(label);
        }
        pts.push(pos);
      });

      if (pts.length >= 2) {
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(
          geom,
          new THREE.LineBasicMaterial({ color, linewidth: 2 }),
        );
        line.raycast = () => {};
        annotRoot.add(line);
      }
    });
  }

  function highlightPoint(rec) {
    pickables.forEach((obj) => {
      if (obj.userData.kind !== 'marker') return;
      const mat = obj.material;
      const isOn = rec && obj.userData.point && obj.userData.point.code === rec.code
        && obj.userData.point.meridianId === rec.meridianId;
      mat.color.set(isOn ? '#facc15' : obj.userData.baseColor);
      mat.emissive.set(isOn ? '#ca8a04' : '#000000');
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
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf3f6f8, 0x6a7c82, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.2, 4.5, 3.2);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.22));

    modelRoot = new THREE.Group();
    annotRoot = new THREE.Group();
    scene.add(modelRoot);
    scene.add(annotRoot);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.addEventListener('change', () => { movingUntil = performance.now() + 180; });

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const moving = performance.now() < movingUntil;
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
    });
  }

  async function loadBody(gender) {
    const { THREE, GLTFLoader, MeshoptDecoder } = await loadThree();
    await ensureScene();
    const wanted = gender === 'female' ? 'female' : 'male';
    if (loadedGender === wanted && modelRoot.children.length) {
      placeAnnotations();
      faceFront();
      applyScale();
      return;
    }
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`assets/models/${wanted}.glb`);
    disposeObject(modelRoot);
    modelRoot.clear();
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x += -center.x;
    root.position.z += -center.z;
    root.position.y += -box.min.y;
    root.updateMatrixWorld(true);
    bodyHeight = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y || 1;
    bodyMeshes = [];
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (obj.geometry && !obj.geometry.getAttribute('normal')) obj.geometry.computeVertexNormals();
      bodyMeshes.push(obj);
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
      UI.toast('模型載入失敗，請檢查網路後再試');
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
    playingAuto = true;
    autoAbort = false;
    if (controls) controls.enabled = false;
    setPlayIcon('stop');
    $('m3d-hint').hidden = true;

    if (!resume || !loadedGender) {
      setLoading(true);
      try { await loadBody(opts.gender); }
      catch (err) {
        console.warn(err);
        UI.toast('模型載入失敗，請檢查網路後再試');
        stopAuto();
        setLoading(false);
        return;
      }
      setLoading(false);
      faceFront();
    }

    let mIndex = resume && autoCursor ? autoCursor.mIndex : 0;
    let pIndex = resume && autoCursor ? autoCursor.pIndex : -1;
    let phase = resume && autoCursor ? autoCursor.phase : 'name';

    for (; mIndex < list.length; mIndex++) {
      if (autoAbort) return;
      const mer = list[mIndex];
      const pts = pointsFor(mer.name);
      if (!pts.length) continue;
      setTitle(mer.name);
      autoCursor = { mIndex, pIndex: -1, phase: 'name' };

      if (!resume || phase === 'name' || phase === 'count') {
        if (phase !== 'count') {
          await speak(mer.name, opts.gender);
          if (autoAbort) return;
        }
        await speak(`共${chineseNum(pts.length)}穴`, opts.gender);
        if (autoAbort) return;
        await sleep(2000);
        if (autoAbort) return;
        phase = 'point';
        pIndex = -1;
      }

      const startP = pIndex < 0 ? 0 : pIndex;
      for (let i = startP; i < pts.length; i++) {
        if (autoAbort) return;
        const rec = pickables
          .map((o) => o.userData.point)
          .find((p) => p && p.meridianId === mer.id && p.code === pts[i].code) || pts[i];
        currentPoint = rec;
        autoCursor = { mIndex, pIndex: i, phase: 'point' };
        highlightPoint(rec);
        if (rec.position) lookAtWorld(rec.position, rec.normal);
        await speak(pts[i].name, opts.gender);
        if (autoAbort) return;
        highlightPoint(null);
        await sleep(2000);
        if (autoAbort) return;
      }
      phase = 'name';
      pIndex = -1;
      resume = false;
    }

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
    setModal(false);
    if (playingAuto) {
      stopAuto({ keepCursor: true });
      return;
    }
    if (!validatePlay()) return;
    if (opts.mode === 'auto') {
      await playAuto(!!autoCursor);
    } else {
      await playManual();
    }
  }

  function bindUi() {
    const list = $('m3d-meridian-list');
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
      if (changed && loadedGender && $('m3d-modal').hidden) {
        playManual();
      }
    };
    $('m3d-mode').onclick = (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      $('m3d-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      opts.mode = btn.dataset.mode;
      if (opts.mode === 'manual') stopAuto();
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
    setModal(true);
    $('m3d-hint').hidden = !!loadedGender;
  }

  function leave() {
    entered = false;
    stopAuto();
    closeOverlay();
    setModal(false);
    teardownRenderer();
    $('m3d-hint').hidden = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi);
  else bindUi();

  return { enter, leave };
})();
