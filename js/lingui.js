/**
 * lingui.js
 * 靈龜八法 page:
 *   - 顯示當前日期干支、卦象
 *   - 顯示主穴與配穴按鈕
 *   - 點選穴位後顯示穴位圖與說明
 *   - 每分鐘自動刷新（換時辰時畫面更新）
 *   - 子時換日邏輯由 ganzhi.js 處理
 */

const Lingui = (() => {
  let _timer       = null;
  let _lastRem     = null;   // 上次的餘數，換時辰才重新渲染
  let _currentText = {};     // { main: name, paired: name } 目前顯示的穴位

  function init() {
    _lastRem = null;
    _currentText = {};
    render();
    clearInterval(_timer);
    // 每 30 秒檢查一次是否需要更新（換時辰）
    _timer = setInterval(() => {
      const now  = new Date();
      const calc = GanZhi.calculate(now);
      if (calc.remainder !== _lastRem) render();
    }, 30000);
  }

  function render() {
    const now  = new Date();
    let   calc;
    try { calc = GanZhi.calculate(now); }
    catch (e) { renderError(e); return; }

    _lastRem = calc.remainder;

    const isYang = calc.isYang;
    const mod    = isYang ? 9 : 6;

    const container = document.getElementById('lingui-content');
    container.innerHTML = `

      <!-- ── 上方資訊橫幅 ── -->
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

      <!-- ── 主穴 / 配穴 ── -->
      <p class="section-title">本時辰開穴</p>
      <div class="flex-col gap-md" id="lingui-btns">
        <button class="btn-point" id="btn-main" data-point="${calc.main}" data-label="主穴">
          <span class="point-label">主穴</span>
          ${calc.main}
        </button>
        <button class="btn-point" id="btn-paired" data-point="${calc.paired}" data-label="配穴">
          <span class="point-label">配穴</span>
          ${calc.paired}
        </button>
      </div>

      <div class="divider" id="lingui-divider" style="display:none"></div>

      <!-- ── 穴位資訊面板 ── -->
      <div id="lingui-panel"></div>
    `;

    // 綁定穴位按鈕
    document.querySelectorAll('#lingui-btns .btn-point').forEach(btn => {
      btn.addEventListener('click', () => onPointClick(btn));
    });

    // 每秒更新時鐘
    _startClock();

    // 若之前已選定穴位，切換時辰後自動恢復顯示
    if (_currentText.name) {
      const matchBtn = document.querySelector(
        `#lingui-btns .btn-point[data-point="${_currentText.name}"]`
      );
      if (matchBtn) onPointClick(matchBtn);
    }
  }

  function onPointClick(btn) {
    // 更新按鈕狀態
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

  // 每秒更新時鐘顯示
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
