/**
 * meridian.js — 經絡與穴位
 *
 * 三種查詢模式（Tab 切換）：
 *   A. 直接輸入穴位名稱
 *   B. 選擇經脈 → 選穴位特性 → 選穴位名稱
 *   C. 選穴位特性 → 列出所有符合穴位 → 選穴位名稱
 *
 * 查詢結果顯示：穴位名稱 + 所屬經脈 + 所有相關特性 + 六欄說明
 */

const Meridian = (() => {
  let _data       = null;   // points-data.json  { 穴位名稱: {...} }
  let _inited     = false;
  let _activeTab  = 'A';    // 'A' | 'B' | 'C'

  // 穴位特性顯示順序（依 points-data.json 實際資料，共 16 種）
  const CATEGORIES = [
    '井穴','滎穴','俞穴','經穴','合穴',
    '原穴','絡穴','郄穴','母穴','子穴',
    '募穴','背俞穴','下合穴','八脈交會穴','八會穴','交會穴'
  ];

  /* ── Init ── */
  async function init() {
    if (_inited) { _rebuildUI(); return; }
    const container = document.getElementById('meridian-content');
    container.innerHTML = _spinnerHTML(120);
    try {
      _data   = await Cache.loadJSON('points-data.json');
      _inited = true;
      _buildUI(container);
    } catch (e) {
      container.innerHTML = _errHTML('資料載入失敗，請檢查網路連線。', e.message);
    }
  }

  function _rebuildUI() {
    _buildUI(document.getElementById('meridian-content'));
  }

  /* ── Build UI ── */
  function _buildUI(container) {
    // 取得所有唯一值
    const allNames    = Object.keys(_data).sort();
    const allMeridians = [...new Set(
      Object.values(_data).map(d => d['所屬經脈']).filter(Boolean)
    )].sort();
    const allCats = CATEGORIES.filter(c =>
      Object.values(_data).some(d => d['經穴屬性']?.includes(c))
    );

    container.innerHTML = `
      <!-- Tab 切換 -->
      <div class="page-content">
        <div class="meri-tabs" style="grid-template-columns:1fr 1fr 1fr 1fr;">
          <button class="meri-tab ${_activeTab==='A'?'active':''}" data-tab="A">輸入穴位</button>
          <button class="meri-tab ${_activeTab==='B'?'active':''}" data-tab="B">依經脈</button>
          <button class="meri-tab ${_activeTab==='C'?'active':''}" data-tab="C">依特性</button>
          <button class="meri-tab ${_activeTab==='D'?'active':''}" data-tab="D">依病症</button>
        </div>

        <!-- Tab A：直接輸入穴位名稱 -->
        <div id="tab-A" class="meri-tab-panel ${_activeTab==='A'?'active':''}">
          <div class="form-group">
            <label class="form-label" for="inp-point-name">穴位名稱</label>
            <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-sm);">
              <div style="position:relative;">
                <input type="text" id="inp-point-name" class="styled-input"
                       placeholder="例：足三里、合谷、三陰交…"
                       autocomplete="off" />
                <div id="inp-suggestions" class="suggestions-dropdown" style="display:none;"></div>
              </div>
              <button class="btn btn-primary" id="btn-a-search"
                      style="height:46px;padding:0 var(--sp-lg);">查詢</button>
            </div>
          </div>
        </div>

        <!-- Tab B：依經脈查詢 -->
        <div id="tab-B" class="meri-tab-panel ${_activeTab==='B'?'active':''}">
          <div class="flex-col gap-md">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm);">
              <div class="form-group">
                <label class="form-label" for="sel-b-meridian">經脈名稱</label>
                <div class="select-wrap">
                  <select class="styled-select" id="sel-b-meridian">
                    <option value="">— 請選擇 —</option>
                    ${allMeridians.map(m => `<option value="${m}">${m}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="sel-b-cat">穴位特性</label>
                <div class="select-wrap">
                  <select class="styled-select" id="sel-b-cat" disabled>
                    <option value="">— 請先選經脈 —</option>
                  </select>
                </div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-sm);align-items:flex-end;">
              <div class="form-group">
                <label class="form-label" for="sel-b-point">穴位名稱</label>
                <div class="select-wrap">
                  <select class="styled-select" id="sel-b-point" disabled>
                    <option value="">—</option>
                  </select>
                </div>
              </div>
              <button class="btn btn-primary" id="btn-b-search"
                      disabled style="height:46px;padding:0 var(--sp-lg);">查詢穴位</button>
            </div>
          </div>
        </div>

        <!-- Tab C：依穴位特性查詢 -->
        <div id="tab-C" class="meri-tab-panel ${_activeTab==='C'?'active':''}">
          <div class="flex-col gap-md">
            <div class="form-group">
              <label class="form-label" for="sel-c-cat">穴位特性</label>
              <div class="select-wrap">
                <select class="styled-select" id="sel-c-cat">
                  <option value="">— 請選擇穴位特性 —</option>
                  ${allCats.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-sm);align-items:flex-end;">
              <div class="form-group">
                <label class="form-label" for="sel-c-point">穴位名稱</label>
                <div class="select-wrap">
                  <select class="styled-select" id="sel-c-point" disabled>
                    <option value="">— 請先選穴位特性 —</option>
                  </select>
                </div>
              </div>
              <button class="btn btn-primary" id="btn-c-search"
                      disabled style="height:46px;padding:0 var(--sp-lg);">查詢穴位</button>
            </div>
          </div>
        </div>

        <!-- Tab D：依病症搜尋 -->
        <div id="tab-D" class="meri-tab-panel ${_activeTab==='D'?'active':''}">
          <div class="flex-col gap-md">
            <div class="form-group">
              <label class="form-label" for="inp-symptom">輸入病症關鍵字</label>
              <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-sm);">
                <div style="position:relative;">
                  <input type="text" id="inp-symptom" class="styled-input"
                         placeholder="例：頭痛、失眠、消化不良…"
                         autocomplete="off" />
                </div>
                <button class="btn btn-primary" id="btn-d-search"
                        style="height:46px;padding:0 var(--sp-lg);">搜尋</button>
              </div>
            </div>
            <!-- 搜尋結果數量提示 -->
            <div id="d-result-count" style="display:none;
                 font-size:var(--fs-sm);color:var(--clr-muted);text-align:center;"></div>
            <!-- 結果清單 -->
            <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-sm);
                        align-items:flex-end;display:none;" id="d-select-row">
              <div class="form-group">
                <label class="form-label" for="sel-d-point">符合穴位</label>
                <div class="select-wrap">
                  <select class="styled-select" id="sel-d-point">
                    <option value="">— 請先搜尋 —</option>
                  </select>
                </div>
              </div>
              <button class="btn btn-primary" id="btn-d-confirm"
                      disabled style="height:46px;padding:0 var(--sp-lg);">查詢穴位</button>
            </div>
          </div>
        </div>

      </div><!-- /.page-content -->

      <div class="divider page-content" id="meri-divider" style="display:none;"></div>
      <div id="meri-panel"></div>
    `;

    _bindTabs();
    _bindTabA(allNames);
    _bindTabB(allMeridians);
    _bindTabC(allCats);
    _bindTabD();
  }

  /* ── Tab 切換 ── */
  function _bindTabs() {
    document.querySelectorAll('.meri-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.tab;
        document.querySelectorAll('.meri-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.meri-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${_activeTab}`).classList.add('active');
      });
    });
  }

  /* ── Tab A：直接輸入，autocomplete ── */
  function _bindTabA(allNames) {
    const inp  = document.getElementById('inp-point-name');
    const sugg = document.getElementById('inp-suggestions');
    const btn  = document.getElementById('btn-a-search');

    inp.addEventListener('input', () => {
      const q = inp.value.trim();
      if (!q) { sugg.style.display = 'none'; return; }
      const matches = allNames.filter(n => n.includes(q)).slice(0, 8);
      if (!matches.length) { sugg.style.display = 'none'; return; }
      sugg.innerHTML = matches.map(n =>
        `<div class="suggestion-item" data-name="${n}">${n}</div>`
      ).join('');
      sugg.style.display = 'block';
    });

    sugg.addEventListener('click', e => {
      const item = e.target.closest('.suggestion-item');
      if (!item) return;
      inp.value = item.dataset.name;
      sugg.style.display = 'none';
    });

    document.addEventListener('click', e => {
      if (!inp.contains(e.target) && !sugg.contains(e.target))
        sugg.style.display = 'none';
    });

    btn.addEventListener('click', () => {
      const name = inp.value.trim();
      sugg.style.display = 'none';
      if (!name) { UI.toast('請輸入穴位名稱'); return; }
      if (!_data[name]) { UI.toast(`找不到「${name}」，請確認名稱`); return; }
      _showResult(name);
    });

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') btn.click();
    });
  }

  /* ── Tab B：依經脈 ── */
  function _bindTabB(allMeridians) {
    const selM  = document.getElementById('sel-b-meridian');
    const selC  = document.getElementById('sel-b-cat');
    const selP  = document.getElementById('sel-b-point');
    const btn   = document.getElementById('btn-b-search');

    selM.addEventListener('change', () => {
      const meridian = selM.value;
      selC.innerHTML  = '<option value="">— 全部特性 —</option>';
      selP.innerHTML  = '<option value="">—</option>';
      selC.disabled   = !meridian;
      selP.disabled   = true;
      btn.disabled    = true;
      if (!meridian) return;

      // 取出該經脈所有穴位的特性
      const pts = Object.entries(_data).filter(([,d]) => d['所屬經脈'] === meridian);
      const cats = [...new Set(pts.flatMap(([,d]) => d['經穴屬性'] || []))];
      const orderedCats = CATEGORIES.filter(c => cats.includes(c));

      orderedCats.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        selC.appendChild(o);
      });

      // 預先列出該經脈全部穴位
      _populatePoints(selP, pts.map(([n]) => n).sort());
      selP.disabled  = false;
      btn.disabled   = selP.value === '';
    });

    selC.addEventListener('change', () => {
      const meridian = selM.value;
      const cat      = selC.value;
      selP.innerHTML = '<option value="">—</option>';
      btn.disabled   = true;

      const pts = Object.entries(_data).filter(([,d]) => {
        const matchM = !meridian || d['所屬經脈'] === meridian;
        const matchC = !cat || d['經穴屬性']?.includes(cat);
        return matchM && matchC;
      });

      if (!pts.length) {
        selP.innerHTML = '<option value="">（無符合穴位）</option>';
        selP.disabled = true;
        return;
      }
      _populatePoints(selP, pts.map(([n]) => n).sort());
      selP.disabled = false;
      btn.disabled  = selP.value === '';
    });

    selP.addEventListener('change', () => { btn.disabled = !selP.value; });
    btn.addEventListener('click', () => { if (selP.value) _showResult(selP.value); });
  }

  /* ── Tab C：依穴位特性 ── */
  function _bindTabC(allCats) {
    const selC = document.getElementById('sel-c-cat');
    const selP = document.getElementById('sel-c-point');
    const btn  = document.getElementById('btn-c-search');

    selC.addEventListener('change', () => {
      const cat = selC.value;
      selP.innerHTML = '<option value="">—</option>';
      selP.disabled  = true;
      btn.disabled   = true;
      if (!cat) return;

      const pts = Object.entries(_data)
        .filter(([,d]) => d['經穴屬性']?.includes(cat))
        .map(([n, d]) => ({ name: n, meridian: d['所屬經脈'] }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

      if (!pts.length) {
        selP.innerHTML = '<option value="">（無符合穴位）</option>';
        return;
      }

      // 顯示穴位名稱＋所屬經脈
      pts.forEach(p => {
        const o = document.createElement('option');
        o.value = p.name;
        o.textContent = `${p.name}（${p.meridian}）`;
        selP.appendChild(o);
      });
      selP.disabled = false;
      btn.disabled  = false;
    });

    selP.addEventListener('change', () => { btn.disabled = !selP.value; });
    btn.addEventListener('click', () => { if (selP.value) _showResult(selP.value); });
  }

  /* ── 填入穴位選項 ── */
  function _populatePoints(selEl, names) {
    selEl.innerHTML = '<option value="">— 請選擇穴位 —</option>';
    names.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      selEl.appendChild(o);
    });
  }

  /* ── 顯示查詢結果 ── */
  function _showResult(pointName) {
    document.getElementById('meri-divider').style.display = '';
    const panel = document.getElementById('meri-panel');
    const d     = _data[pointName];

    const meta = {
      meridian:   d['所屬經脈']    || '',
      intlCode:   d['國際代碼']    || '',
      attributes: d['經穴屬性']   || [],
      detail:     d['經穴屬性細節'] || '',
    };
    UI.renderPointPanel(panel, pointName, meta);
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
  }

  /* ── Tab D：依病症搜尋 ── */
  function _bindTabD() {
    const inp     = document.getElementById('inp-symptom');
    const btnSrch = document.getElementById('btn-d-search');
    const selP    = document.getElementById('sel-d-point');
    const btnOk   = document.getElementById('btn-d-confirm');
    const countEl = document.getElementById('d-result-count');
    const rowEl   = document.getElementById('d-select-row');

    function doSearch() {
      const q = inp.value.trim();
      if (!q) { UI.toast('請輸入病症關鍵字'); return; }

      // 搜尋主治 + 現代醫學闡釋 中包含關鍵字的穴位
      const keywords = q.split(/[，,、\s]+/).filter(Boolean);
      const results = [];

      for (const [name, d] of Object.entries(_data)) {
        const text = [d['主治'] || '', d['現代醫學闡釋'] || ''].join('');
        const matched = keywords.some(kw => text.includes(kw));
        if (matched) {
          // 找出匹配到的關鍵字
          const hits = keywords.filter(kw => text.includes(kw));
          results.push({ name, meridian: d['所屬經脈'], hits });
        }
      }

      // 更新結果數量
      countEl.style.display = '';
      if (!results.length) {
        countEl.textContent = `未找到與「${q}」相關的穴位`;
        countEl.style.color = 'var(--clr-muted)';
        rowEl.style.display = 'none';
        return;
      }

      countEl.textContent = `找到 ${results.length} 個相關穴位`;
      countEl.style.color = 'var(--clr-teal-dark)';

      // 填入選單
      selP.innerHTML = '<option value="">— 請選擇穴位 —</option>';
      results.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.name;
        opt.textContent = `${r.name}（${r.meridian}）`;
        opt.title = `相關：${r.hits.join('、')}`;
        selP.appendChild(opt);
      });
      rowEl.style.display = 'grid';
      btnOk.disabled = true;
    }

    btnSrch.addEventListener('click', doSearch);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    selP.addEventListener('change', () => { btnOk.disabled = !selP.value; });
    btnOk.addEventListener('click', () => { if (selP.value) _showResult(selP.value); });
  }

  /* ── Helpers ── */
  function _spinnerHTML(h) {
    return `<div class="img-placeholder page-content" style="position:relative;height:${h}px;">
              <div class="spinner"></div></div>`;
  }
  function _errHTML(msg, detail) {
    return `<div class="page-content" style="text-align:center;padding-top:var(--sp-xl);color:var(--clr-muted)">
              <p style="font-size:var(--fs-lg);margin-bottom:var(--sp-sm)">⚠ ${msg}</p>
              ${detail ? `<p style="font-size:var(--fs-xs)">${detail}</p>` : ''}
            </div>`;
  }

  return { init };
})();
