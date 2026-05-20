/**
 * lingui.js — 靈龜八法
 * 特殊邏輯：餘數=5 時顯示男/女選擇，依性別決定主穴配穴
 */

const Lingui = (() => {
  let _timer       = null;
  let _lastRem     = null;
  let _currentText = {};
  let _gender      = null;   // 'male' | 'female' | null（僅餘數=5 時有效）

  function init() {
    _lastRem = null;
    _currentText = {};
    _gender = null;
    render();
    clearInterval(_timer);
    _timer = setInterval(() => {
      const calc = GanZhi.calculate(new Date());
      if (calc.remainder !== _lastRem) {
        _gender = null;   // 換時辰重置性別選擇
        render();
      }
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
    const isGenderDep = !!calc.genderDependent;

    // 餘數=5 時依已選性別決定穴位，未選則顯示預設（男）
    let main   = calc.main;
    let paired = calc.paired;
    let vessel = calc.vessel;
    if (isGenderDep && _gender) {
      main   = calc[_gender].main;
      paired = calc[_gender].paired;
      vessel = calc[_gender].vessel;
    }

    document.getElementById('lingui-content').innerHTML = `

      <div class="page-content">

        <div class="ganzhi-banner">
          <div class="solar-date" id="lingui-clock">${calc.solarStr}　${_timeStr(now)}</div>
          <div class="lunar-date">${calc.lunarStr}</div>
          <div class="gua-row">
            <span class="gua-tag">${calc.gua}卦</span>
            <span class="yinyang-tag ${isYang ? 'yang' : 'yin'}">${isYang ? '陽日' : '陰日'}</span>
          </div>
          <div style="margin-top:6px;font-size:var(--fs-xs);color:var(--clr-muted)">
            ${calc.total} ÷ ${mod} 餘 ${calc.remainder}　通 ${vessel}
          </div>
        </div>

        <div class="divider"></div>

        <!-- 標題列：「本時辰開穴」+ 餘數=5 時的男/女切換 -->
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:var(--sp-sm)">
          <p class="section-title" style="margin-bottom:0">本時辰開穴</p>

          ${isGenderDep ? `
          <div class="gender-toggle" id="gender-toggle">
            <button class="gender-btn ${(!_gender || _gender==='male') ? 'active' : ''}"
                    data-gender="male">男</button>
            <button class="gender-btn ${_gender==='female' ? 'active' : ''}"
                    data-gender="female">女</button>
          </div>` : ''}
        </div>

        <!-- 主穴／配穴並排 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm)"
             id="lingui-btns">
          <button class="btn-point btn-point--main" id="btn-main"
                  data-point="${main}" data-label="主穴">
            <span class="point-label">主穴</span>
            ${main}
          </button>
          <button class="btn-point btn-point--paired" id="btn-paired"
                  data-point="${paired}" data-label="配穴">
            <span class="point-label">配穴</span>
            ${paired}
          </button>
        </div>

        <div class="divider" id="lingui-divider" style="display:none"></div>

      </div><!-- /.page-content -->

      <div id="lingui-panel"></div>
    `;

    // 穴位按鈕事件
    document.querySelectorAll('#lingui-btns .btn-point').forEach(btn =>
      btn.addEventListener('click', () => onPointClick(btn))
    );

    // 男/女切換事件（僅餘數=5）
    if (isGenderDep) {
      document.querySelectorAll('.gender-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          _gender = btn.dataset.gender;
          _currentText = {};   // 清除已選穴位，重新渲染
          render();
        });
      });
    }

    _startClock();

    // 恢復已選穴位顯示
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
      `<div class="page-content" style="text-align:center;padding-top:var(--sp-xl);color:var(--clr-muted)">
         <p style="font-size:var(--fs-lg);margin-bottom:var(--sp-sm)">⚠ 計算錯誤</p>
         <p style="font-size:var(--fs-sm)">${err.message}</p>
       </div>`;
  }

  return { init };
})();
