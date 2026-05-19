/**
 * ui.js
 * 共用 UI 工具：
 *   - 頁面切換
 *   - Toast 通知
 *   - 穴位資訊面板（圖片 lazy load + 文字按需載入）
 */

const UI = (() => {

  /* ── 頁面切換 ── */
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      // 捲回頂部
      const scroll = target.querySelector('.scroll-area');
      if (scroll) scroll.scrollTop = 0;
    }
  }

  /* ── Toast ── */
  let _toastTimer = null;
  function toast(msg, duration = 2800) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  /* ── 穴位資訊面板 ──
   * @param {HTMLElement} container  渲染目標
   * @param {string}      pointName  穴位名稱，如「尺澤」
   * @param {string}      badgeLabel 標籤文字，如「主穴」「合穴」
   */
  async function renderPointPanel(container, pointName, badgeLabel) {
    const imgId  = `pi-${pointName}`;
    const phId   = `pp-${pointName}`;
    const slowId = `ps-${pointName}`;
    const descId = `pd-${pointName}`;

    container.innerHTML = `
      <div class="info-panel">

        <!-- 穴位圖 -->
        <div class="info-image-wrap">
          <div class="img-placeholder" id="${phId}">
            <div class="spinner"></div>
            <span>穴位圖載入中</span>
          </div>
          <img id="${imgId}" src="" alt="${pointName}穴位圖" style="display:none;" loading="lazy" />
        </div>
        <p class="slow-notice" id="${slowId}">圖片載入較慢，請稍候…</p>

        <!-- 文字說明 -->
        <div class="info-text">
          <h4>
            ${pointName}
            ${badgeLabel ? `<span class="badge">${badgeLabel}</span>` : ''}
          </h4>
          <div id="${descId}">
            <div class="img-placeholder" style="position:relative;height:56px;">
              <div class="spinner"></div>
            </div>
          </div>
        </div>

      </div>`;

    /* ── 載入圖片 ── */
    const imgEl  = document.getElementById(imgId);
    const phEl   = document.getElementById(phId);
    const slowEl = document.getElementById(slowId);

    // 5 秒後顯示「載入較慢」提示
    const slowTimer = setTimeout(() => slowEl?.classList.add('visible'), 5000);

    imgEl.onload = () => {
      clearTimeout(slowTimer);
      phEl.style.display   = 'none';
      imgEl.style.display  = 'block';
      slowEl?.classList.remove('visible');
    };
    imgEl.onerror = () => {
      clearTimeout(slowTimer);
      phEl.innerHTML = `<span style="color:var(--clr-muted);font-size:var(--fs-sm)">穴位圖暫未提供</span>`;
      slowEl?.classList.remove('visible');
    };
    imgEl.src = Cache.pointImageUrl(pointName);

    /* ── 載入文字 ── */
    const descEl = document.getElementById(descId);
    try {
      const text = await Cache.loadPointText(pointName);
      if (descEl) descEl.innerHTML = `<p>${text.trim()}</p>`;
    } catch {
      if (descEl) descEl.innerHTML =
        `<p style="color:var(--clr-muted)">取穴說明暫未提供。</p>`;
    }
  }

  return { showPage, toast, renderPointPanel };
})();
