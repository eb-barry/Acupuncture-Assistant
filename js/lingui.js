/**
 * lingui.js
 * 靈龜八法 page: renders date/ganzhi banner, main/paired point buttons,
 * auto-refreshes every minute, shows acupoint info panel on tap.
 */

const Lingui = (() => {
  let _timer = null;
  let _active = null;  // currently selected point name

  function init() {
    render();
    clearInterval(_timer);
    _timer = setInterval(render, 60000);  // refresh every minute
  }

  function render() {
    const now = new Date();
    let   calc;
    try { calc = GanZhi.calculate(now); }
    catch (e) { renderError(e); return; }

    const container = document.getElementById('lingui-content');
    container.innerHTML = `
      <!-- 上方 1/5：日期與干支 -->
      <div class="ganzhi-banner">
        <div class="solar-date">${calc.solarStr}</div>
        <div class="lunar-date">${calc.lunarStr}</div>
        <div class="gua-row">
          <span class="gua-tag">${calc.gua}卦</span>
          <span class="yinyang-tag ${calc.isYang ? 'yang' : 'yin'}">${calc.isYang ? '陽日' : '陰日'}</span>
          <span class="yinyang-tag yin" style="background:rgba(74,154,170,0.1)">
            總和 ${calc.total} ÷ ${calc.isYang ? 9 : 6} = 餘 ${calc.remainder}
          </span>
        </div>
        <div style="margin-top:8px;font-size:var(--fs-xs);color:var(--clr-muted)">
          通${calc.vessel}
        </div>
      </div>

      <div class="divider"></div>

      <!-- 主穴 / 配穴 按鈕 -->
      <div class="section-title">本時辰開穴</div>
      <div class="flex-col gap-md" id="lingui-point-btns">
        <button class="btn-point" id="btn-main-point" data-point="${calc.main}">
          <span class="point-label">主穴</span>
          ${calc.main}
        </button>
        <button class="btn-point" id="btn-paired-point" data-point="${calc.paired}">
          <span class="point-label">配穴</span>
          ${calc.paired}
        </button>
      </div>

      <div class="divider" id="lingui-divider" style="display:none"></div>

      <!-- 穴位資訊面板 (動態顯示) -->
      <div id="lingui-point-panel"></div>
    `;

    // bind buttons
    ['btn-main-point','btn-paired-point'].forEach(id => {
      document.getElementById(id).addEventListener('click', e => {
        const btn = e.currentTarget;
        const name = btn.dataset.point;
        const label = id === 'btn-main-point' ? '主穴' : '配穴';
        selectPoint(name, label, btn);
      });
    });
  }

  function selectPoint(name, label, activeBtn) {
    // toggle active style
    document.querySelectorAll('#lingui-point-btns .btn-point').forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');

    // show divider & panel
    document.getElementById('lingui-divider').style.display = '';
    const panel = document.getElementById('lingui-point-panel');

    // scroll to panel
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    UI.renderPointPanel(panel, name, label);
  }

  function renderError(err) {
    const container = document.getElementById('lingui-content');
    container.innerHTML = `<p style="color:var(--clr-muted);text-align:center;padding:var(--sp-lg)">
      載入失敗，請確認 lunar-javascript 已正確載入。<br>
      <small>${err.message}</small>
    </p>`;
  }

  return { init };
})();
