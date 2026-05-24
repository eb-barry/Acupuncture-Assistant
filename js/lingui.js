/**
 * lingui.js — 靈龜八法
 * 功能：
 *   - 即時顯示當前日期干支、卦象、主穴配穴
 *   - 月曆圖示 → 自訂日期時間輸入介面
 *   - 自訂時間模式：標題改為自訂日期時間，顯示「回到當前時間」
 *   - 餘數=5 男/女切換
 */

const Lingui = (() => {
  let _timer        = null;
  let _lastRem      = null;
  let _currentText  = {};
  let _gender       = null;
  let _customDate   = null;   // Date | null，null 表示使用當前時間

  function init() {
    _lastRem     = null;
    _currentText = {};
    _gender      = null;
    // 進入頁面不重置自訂時間，讓使用者可以保留
    render();
    clearInterval(_timer);
    _timer = setInterval(() => {
      if (_customDate) return;   // 自訂模式不自動刷新
      const calc = GanZhi.calculate(new Date());
      if (calc.remainder !== _lastRem) {
        _gender = null;
        render();
      }
    }, 30000);
  }

  /* ── 主渲染 ── */
  function render() {
    const targetDate = _customDate || new Date();
    const isCustom   = !!_customDate;
    let calc;
    try { calc = GanZhi.calculate(targetDate); }
    catch (e) { renderError(e); return; }

    _lastRem = calc.remainder;
    const isYang    = calc.isYang;
    const mod       = isYang ? 9 : 6;
    const isGenderDep = !!calc.genderDependent;

    let main = calc.main, paired = calc.paired, vessel = calc.vessel;
    if (isGenderDep && _gender) {
      main   = calc[_gender].main;
      paired = calc[_gender].paired;
      vessel = calc[_gender].vessel;
    }

    // 標題文字
    const openLabel = isCustom
      ? `自訂時間：${_fmtCustom(targetDate)}`
      : '本時辰開穴';

    document.getElementById('lingui-content').innerHTML = `

      <div class="page-content">

        <!-- ── 日期橫幅 ── -->
        <div class="ganzhi-banner">

          <!-- 月曆圖示 + 日期時間 + 回到當前（自訂模式才顯示） -->
          <div style="display:flex;align-items:center;justify-content:center;
                      gap:var(--sp-sm);margin-bottom:4px;">

            <!-- 月曆圖示按鈕 -->
            <button id="btn-calendar" title="自訂日期時間"
                    style="background:none;border:none;cursor:pointer;
                           color:var(--clr-teal);padding:2px;
                           display:flex;align-items:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   style="width:20px;height:20px;">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
              </svg>
            </button>

            <!-- 日期時間顯示 -->
            <div id="lingui-clock" class="solar-date" style="margin-bottom:0;">
              ${isCustom ? _fmtDisplay(targetDate) : calc.solarStr + '　' + _timeStr(targetDate)}
            </div>

            <!-- 回到當前時間（自訂模式才顯示） -->
            ${isCustom ? `
            <button id="btn-reset-time" title="回到當前時間"
                    style="background:none;border:none;cursor:pointer;
                           color:var(--clr-muted);padding:2px;
                           display:flex;align-items:center;font-size:var(--fs-xs);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   style="width:16px;height:16px;margin-right:2px;">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
              </svg>
              當前
            </button>` : ''}
          </div>

          <div class="lunar-date">${calc.lunarStr}</div>
          <div class="gua-row">
            <span class="gua-tag">${calc.gua}卦</span>
            <span class="yinyang-tag ${isYang ? 'yang' : 'yin'}">${isYang ? '陽日' : '陰日'}</span>
          </div>
          <div style="margin-top:6px;font-size:var(--fs-xs);color:var(--clr-muted)">
            ${calc.total} ÷ ${mod} 餘 ${calc.remainder}　通 ${vessel}
          </div>
        </div>

        <!-- ── 自訂時間輸入面板（預設隱藏） ── -->
        <div id="calendar-panel" style="display:none;">
          <div class="calendar-input-box">
            <div class="calendar-input-title">自訂查詢日期與時間</div>
            <div class="calendar-input-grid">
              <div class="form-group">
                <label class="form-label" for="ci-date">日期</label>
                <input type="date" id="ci-date" class="styled-input"
                       value="${_isoDate(_customDate || new Date())}" />
              </div>
              <div class="form-group">
                <label class="form-label" for="ci-time">時間</label>
                <input type="time" id="ci-time" class="styled-input"
                       value="${_isoTime(_customDate || new Date())}" />
              </div>
            </div>
            <div style="display:flex;gap:var(--sp-sm);margin-top:var(--sp-sm);">
              <button class="btn btn-primary" id="btn-ci-confirm"
                      style="flex:1;">確認</button>
              <button class="btn btn-secondary" id="btn-ci-cancel"
                      style="flex:1;">取消</button>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- ── 標題列 ── -->
        <div style="display:flex;align-items:center;justify-content:space-between;
                    margin-bottom:var(--sp-sm);">
          <p class="section-title" style="margin-bottom:0;
             ${isCustom ? 'font-size:var(--fs-sm);color:var(--clr-gold);' : ''}">
            ${openLabel}
          </p>
          ${isGenderDep ? `
          <div class="gender-toggle" id="gender-toggle">
            <button class="gender-btn ${(!_gender || _gender==='male') ? 'active':''}"
                    data-gender="male">男</button>
            <button class="gender-btn ${_gender==='female' ? 'active':''}"
                    data-gender="female">女</button>
          </div>` : ''}
        </div>

        <!-- ── 主穴／配穴並排 ── -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-sm);"
             id="lingui-btns">
          <button class="btn-point btn-point--main" id="btn-main"
                  data-point="${main}" data-label="主穴">
            <span class="point-label">主穴</span>${main}
          </button>
          <button class="btn-point btn-point--paired" id="btn-paired"
                  data-point="${paired}" data-label="配穴">
            <span class="point-label">配穴</span>${paired}
          </button>
        </div>

        <div class="divider" id="lingui-divider" style="display:none;"></div>

      </div><!-- /.page-content -->

      <div id="lingui-panel"></div>
    `;

    /* ── 事件綁定 ── */

    // 月曆圖示：切換顯示輸入面板
    document.getElementById('btn-calendar').addEventListener('click', () => {
      const panel = document.getElementById('calendar-panel');
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        // 打開時預填目前值
        document.getElementById('ci-date').value = _isoDate(_customDate || new Date());
        document.getElementById('ci-time').value = _isoTime(_customDate || new Date());
        setTimeout(() => panel.scrollIntoView({ behavior:'smooth', block:'nearest' }), 80);
      }
    });

    // 確認自訂時間
    document.getElementById('btn-ci-confirm').addEventListener('click', () => {
      const dv = document.getElementById('ci-date').value;
      const tv = document.getElementById('ci-time').value;
      if (!dv || !tv) { UI.toast('請選擇日期與時間'); return; }
      _customDate  = new Date(`${dv}T${tv}:00`);
      _gender      = null;
      _currentText = {};
      render();
    });

    // 取消
    document.getElementById('btn-ci-cancel').addEventListener('click', () => {
      document.getElementById('calendar-panel').style.display = 'none';
    });

    // 回到當前時間
    document.getElementById('btn-reset-time')?.addEventListener('click', () => {
      _customDate  = null;
      _gender      = null;
      _currentText = {};
      render();
    });

    // 穴位按鈕
    document.querySelectorAll('#lingui-btns .btn-point').forEach(btn =>
      btn.addEventListener('click', () => onPointClick(btn))
    );

    // 男/女切換
    if (isGenderDep) {
      document.querySelectorAll('.gender-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          _gender      = btn.dataset.gender;
          _currentText = {};
          render();
        });
      });
    }

    // 即時時鐘（非自訂模式）
    if (!isCustom) _startClock();
    else           clearInterval(_clockTimer);

    // 恢復已選穴位
    if (_currentText.name) {
      const match = document.querySelector(
        `#lingui-btns .btn-point[data-point="${_currentText.name}"]`
      );
      if (match) onPointClick(match);
    }
  }

  /* ── 穴位點擊 ── */
  function onPointClick(btn) {
    document.querySelectorAll('#lingui-btns .btn-point')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const name = btn.dataset.point, label = btn.dataset.label;
    _currentText = { name, label };
    document.getElementById('lingui-divider').style.display = '';
    const panel = document.getElementById('lingui-panel');
    UI.renderPointPanel(panel, name, label);
    setTimeout(() => panel.scrollIntoView({ behavior:'smooth', block:'nearest' }), 120);
  }

  /* ── 即時時鐘 ── */
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

  /* ── 格式化工具 ── */
  function _timeStr(d) {
    const p = n => String(n).padStart(2,'0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function _fmtDisplay(d) {
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} `
         + `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function _fmtCustom(d) {
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} `
         + `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function _isoDate(d) {
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function _isoTime(d) {
    const p = n => String(n).padStart(2,'0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
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
