/**
 * lingui.js — 靈龜八法
 * UI 改動：主穴／配穴並排同一列，主穴藍底白字，配穴綠底白字
 */

const Lingui = (() => {
  let _timer       = null;
  let _lastRem     = null;
  let _currentText = {};

  function init() {
    _lastRem = null;
    _currentText = {};
    render();
    clearInterval(_timer);
    _timer = setInterval(() => {
      const calc = GanZhi.calculate(new Date());
      if (calc.remainder !== _lastRem) render();
    }, 30000);
  }

  function render() {
    const now = new Date();
    let calc;
    try { calc = GanZhi.calculate(now); }
    catch (e) { renderError(e); return; }

    _lastRem = calc.remainder;
    const isYang = calc.isYang;
    const mod    = isYang ? 9 : 6;

    document.getElementById('lingui-content').innerHTML = `

      <div class="ganzhi-banner">
        <div class="solar-date" id="lingui-clock">${calc.solarStr}　${_timeStr(now)}</div>
        <div class="lunar-date">${calc.lunarStr}</div>
        <div class="gua-row">
          <span class="gua-tag">${calc.gua}卦</span>
          <span class="yinyang-tag ${isYang ? 'yang' : 'yin'}">${isYang ? '陽日' : '陰日'}</span>
        </div>
        <div style="margin-top:6px;font-size:var(--fs-xs);color:var(--clr-muted)">
          ${calc.total} ÷ ${mod} 餘 ${calc.remainder}　通 ${calc.vessel}
        </div>
      </div>

      <div class="divider"></div>

      <p class="section-title">本時辰開穴</p>

      <!-- ── 主穴／配穴並排 ── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm)" id="lingui-btns">

        <button class="btn-point btn-point--main" id="btn-main"
                data-point="${calc.main}" data-label="主穴">
          <span class="point-label">主穴</span>
          ${calc.main}
        </button>

        <button class="btn-point btn-point--paired" id="btn-paired"
                data-point="${calc.paired}" data-label="配穴">
          <span class="point-label">配穴</span>
          ${calc.paired}
        </button>

      </div>

      <div class="divider" id="lingui-divider" style="display:none"></div>
      <div id="lingui-panel"></div>
    `;

    document.querySelectorAll('#lingui-btns .btn-point').forEach(btn =>
      btn.addEventListener('click', () => onPointClick(btn))
    );

    _startClock();

    if (_currentText.name) {
      const match = document.querySelector(
        `#lingui-btns .btn-point[data-point="${_currentText.name}"]`
      );
      if (match) onPointClick(match);
    }
  }

  function onPointClick(btn) {
    document.querySelectorAll('#lingui-btns .btn-point')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const name  = btn.dataset.point;
    const label = btn.dataset.label;
    _currentText = { name, label };

    document.getElementById('lingui-divider').style.display = '';
    const panel = document.getElementById('lingui-panel');
    UI.renderPointPanel(panel, name, label);
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
  }

  let _clockTimer = null;
  function _startClock() {
    clearInterval(_clockTimer);
    _clockTimer = setInterval(() => {
      const el = document.getElementById('lingui-clock');
      if (!el) { clearInterval(_clockTimer); return; }
      const now = new Date();
      el.textContent = `${GanZhi.calculate(now).solarStr}　${_timeStr(now)}`;
    }, 1000);
  }

  function _timeStr(d) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function renderError(err) {
    document.getElementById('lingui-content').innerHTML =
      `<div style="text-align:center;padding:var(--sp-xl);color:var(--clr-muted)">
         <p style="font-size:var(--fs-lg);margin-bottom:var(--sp-sm)">⚠ 計算錯誤</p>
         <p style="font-size:var(--fs-sm)">${err.message}</p>
       </div>`;
  }

  return { init };
})();
