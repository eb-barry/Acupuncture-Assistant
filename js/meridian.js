/**
 * meridian.js
 * 經絡與穴位 page:
 *   - Three cascading selects: 經脈 → 穴位特性 → 穴位名稱
 *   - Confirm button (disabled if no acupoint found)
 *   - Renders acupoint info panel below
 */

const Meridian = (() => {
  let _data = null;   // loaded acupuncture-data.json

  // All possible 穴位特性 column keys (in display order)
  const CATEGORIES = ['井穴','榮穴','俞穴','經穴','合穴','背俞穴','募穴','原穴','絡穴','郄穴','母穴','子穴','下合穴','八脈交會穴'];

  async function init() {
    const container = document.getElementById('meridian-content');
    container.innerHTML = `<div class="img-placeholder" style="position:relative;height:120px;">
      <div class="spinner"></div></div>`;
    try {
      _data = await Cache.loadJSON('acupuncture-data.json');
      renderUI(container);
    } catch (e) {
      container.innerHTML = `<p style="color:var(--clr-muted);text-align:center;padding:var(--sp-lg)">
        資料載入失敗，請檢查網路連線。<br><small>${e.message}</small></p>`;
    }
  }

  function renderUI(container) {
    container.innerHTML = `
      <!-- 上方選擇區 -->
      <div class="flex-col gap-md" id="meridian-selects">
        <div class="form-group">
          <label class="form-label" for="sel-meridian">經脈名稱</label>
          <div class="select-wrap">
            <select class="styled-select" id="sel-meridian">
              <option value="">— 請選擇經脈 —</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="sel-category">穴位特性</label>
          <div class="select-wrap">
            <select class="styled-select" id="sel-category" disabled>
              <option value="">— 請先選擇經脈 —</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="sel-point">穴位名稱</label>
          <div class="select-wrap">
            <select class="styled-select" id="sel-point" disabled>
              <option value="">—</option>
            </select>
          </div>
        </div>

        <button class="btn btn-primary w-full" id="btn-meridian-confirm" disabled>
          查詢穴位
        </button>
      </div>

      <div class="divider" id="meridian-divider" style="display:none"></div>
      <div id="meridian-point-panel"></div>
    `;

    // Populate 經脈
    const selMeridian = document.getElementById('sel-meridian');
    _data.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m['經脈'];
      opt.textContent = m['經脈'];
      selMeridian.appendChild(opt);
    });

    // ── Cascade logic ──
    selMeridian.addEventListener('change', () => {
      const meridianName = selMeridian.value;
      const selCat = document.getElementById('sel-category');
      const selPt  = document.getElementById('sel-point');
      const btnOk  = document.getElementById('btn-meridian-confirm');

      selCat.innerHTML = '<option value="">— 請選擇穴位特性 —</option>';
      selPt.innerHTML  = '<option value="">—</option>';
      selCat.disabled  = !meridianName;
      selPt.disabled   = true;
      btnOk.disabled   = true;

      if (!meridianName) return;

      const rec = _data.find(m => m['經脈'] === meridianName);
      if (!rec) return;

      CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        selCat.appendChild(opt);
      });
    });

    document.getElementById('sel-category').addEventListener('change', () => {
      const selCat = document.getElementById('sel-category');
      const selPt  = document.getElementById('sel-point');
      const btnOk  = document.getElementById('btn-meridian-confirm');
      const cat    = selCat.value;
      const meridianName = selMeridian.value;

      selPt.innerHTML = '<option value="">—</option>';
      selPt.disabled  = true;
      btnOk.disabled  = true;

      if (!cat || !meridianName) return;

      const rec   = _data.find(m => m['經脈'] === meridianName);
      const point = rec && rec['穴位'][cat];

      if (point) {
        const opt = document.createElement('option');
        opt.value = point;
        opt.textContent = point;
        selPt.appendChild(opt);
        selPt.value   = point;
        selPt.disabled = false;
        btnOk.disabled = false;
      } else {
        // No point for this combination
        selPt.innerHTML = '<option value="">（該經絡無此特性穴位）</option>';
        selPt.disabled  = true;
        btnOk.disabled  = true;
      }
    });

    document.getElementById('btn-meridian-confirm').addEventListener('click', () => {
      const point    = document.getElementById('sel-point').value;
      const category = document.getElementById('sel-category').value;
      if (!point) return;

      document.getElementById('meridian-divider').style.display = '';
      const panel = document.getElementById('meridian-point-panel');
      UI.renderPointPanel(panel, point, category);
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    });
  }

  return { init };
})();
