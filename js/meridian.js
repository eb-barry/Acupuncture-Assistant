/**
 * meridian.js — 經絡與穴位
 * UI 改動：
 *   - 經脈名稱 + 穴位特性並排同一列
 *   - 穴位名稱 + 查詢穴位並排同一列
 *   - 穴位圖片寬度撐滿螢幕（負 margin 突破 scroll-area padding）
 */

const Meridian = (() => {
  let _data   = null;
  let _inited = false;

  const CATEGORIES = [
    '井穴','榮穴','俞穴','經穴','合穴',
    '背俞穴','募穴','原穴','絡穴','郄穴',
    '母穴','子穴','下合穴','八脈交會穴'
  ];

  async function init() {
    if (_inited) { _restoreUI(); return; }
    const container = document.getElementById('meridian-content');
    container.innerHTML = _loadingHTML(120);
    try {
      _data   = await Cache.loadJSON('acupuncture-data.json');
      _inited = true;
      _buildUI(container);
    } catch (e) {
      container.innerHTML = _errorHTML('資料載入失敗，請檢查網路連線。', e.message);
    }
  }

  function _restoreUI() {
    _buildUI(document.getElementById('meridian-content'));
  }

  function _buildUI(container) {
    container.innerHTML = `
      <div class="flex-col gap-md">

        <!-- ── 第一列：經脈名稱 ＋ 穴位特性 並排 ── -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm)">

          <div class="form-group">
            <label class="form-label" for="sel-meridian">經脈名稱</label>
            <div class="select-wrap">
              <select class="styled-select" id="sel-meridian">
                <option value="">— 請選擇 —</option>
                ${_data.map(m =>
                  `<option value="${m['經脈']}">${m['經脈']}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="sel-category">穴位特性</label>
            <div class="select-wrap">
              <select class="styled-select" id="sel-category" disabled>
                <option value="">— 請先選經脈 —</option>
              </select>
            </div>
          </div>

        </div>

        <!-- ── 第二列：穴位名稱 ＋ 查詢穴位 並排 ── -->
        <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-sm);align-items:flex-end">

          <div class="form-group">
            <label class="form-label" for="sel-point">穴位名稱</label>
            <div class="select-wrap">
              <select class="styled-select" id="sel-point" disabled>
                <option value="">—</option>
              </select>
            </div>
          </div>

          <button class="btn btn-primary" id="btn-meri-ok" disabled
                  style="height:46px;padding:0 var(--sp-lg);white-space:nowrap;flex-shrink:0">
            查詢穴位
          </button>

        </div>

      </div>

      <div class="divider" id="meri-divider" style="display:none"></div>
      <div id="meri-panel"></div>
    `;

    _bindEvents();
  }

  function _bindEvents() {
    const selM  = document.getElementById('sel-meridian');
    const selC  = document.getElementById('sel-category');
    const selP  = document.getElementById('sel-point');
    const btnOk = document.getElementById('btn-meri-ok');

    selM.addEventListener('change', () => {
      const name = selM.value;
      selC.innerHTML = '<option value="">— 請選擇穴位特性 —</option>';
      selP.innerHTML = '<option value="">—</option>';
      selC.disabled  = !name;
      selP.disabled  = true;
      btnOk.disabled = true;
      if (!name) return;

      const rec = _data.find(m => m['經脈'] === name);
      if (!rec) return;
      const available = CATEGORIES.filter(cat => rec['穴位'][cat]);
      if (!available.length) {
        selC.innerHTML = '<option value="">（無特殊穴位資料）</option>';
        return;
      }
      available.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        selC.appendChild(opt);
      });
    });

    selC.addEventListener('change', () => {
      const name  = selM.value;
      const cat   = selC.value;
      selP.innerHTML = '<option value="">—</option>';
      selP.disabled  = true;
      btnOk.disabled = true;
      if (!name || !cat) return;

      const rec   = _data.find(m => m['經脈'] === name);
      const point = rec && rec['穴位'][cat];
      if (point) {
        const opt = document.createElement('option');
        opt.value = point; opt.textContent = point;
        selP.appendChild(opt);
        selP.value    = point;
        selP.disabled = false;
        btnOk.disabled = false;
      } else {
        selP.innerHTML = '<option value="">（此經絡無此特性穴位）</option>';
      }
    });

    btnOk.addEventListener('click', () => {
      const point = selP.value;
      const cat   = selC.value;
      if (!point) return;
      document.getElementById('meri-divider').style.display = '';
      const panel = document.getElementById('meri-panel');
      UI.renderPointPanel(panel, point, cat);
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
    });
  }

  function _loadingHTML(h) {
    return `<div class="img-placeholder" style="position:relative;height:${h}px;">
              <div class="spinner"></div></div>`;
  }
  function _errorHTML(msg, detail) {
    return `<div style="text-align:center;padding:var(--sp-xl);color:var(--clr-muted)">
              <p style="font-size:var(--fs-lg);margin-bottom:var(--sp-sm)">⚠ ${msg}</p>
              ${detail ? `<p style="font-size:var(--fs-xs)">${detail}</p>` : ''}
            </div>`;
  }

  return { init };
})();
