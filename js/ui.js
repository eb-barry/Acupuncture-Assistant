/**
 * ui.js
 * 共用 UI 工具：頁面切換、Toast、穴位資訊面板
 *
 * 圖片載入策略：
 *   依序嘗試 Cache.pointImageUrls() 回傳的多個備援 URL
 *   任一成功即顯示，全部失敗才顯示「暫未提供」
 */

const UI = (() => {

  /* ── 頁面切換 ── */
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
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

  /* ── 依序嘗試多個圖片 URL ──
   * 解決中文檔名在不同 CDN 的編碼相容問題
   */
  function _loadImageWithFallback(urls, imgEl, phEl, slowEl) {
    let idx = 0;

    function tryNext() {
      if (idx >= urls.length) {
        // 全部失敗
        if (phEl) phEl.innerHTML =
          `<span style="color:var(--clr-muted);font-size:var(--fs-sm)">穴位圖暫未提供</span>`;
        slowEl && slowEl.classList.remove('visible');
        return;
      }

      const url = urls[idx++];
      imgEl.onerror = () => tryNext();           // 失敗 → 試下一個
      imgEl.onload  = () => {
        if (phEl) phEl.style.display = 'none';
        imgEl.style.display = 'block';
        slowEl && slowEl.classList.remove('visible');
      };
      imgEl.src = url;
    }

    tryNext();
  }

  /* ── 穴位資訊面板 ── */
  async function renderPointPanel(container, pointName, badgeLabel) {
    const uid  = pointName.replace(/[^\w]/g, '_') + '_' + Date.now();
    const imgId  = `pi_${uid}`;
    const phId   = `pp_${uid}`;
    const slowId = `ps_${uid}`;
    const descId = `pd_${uid}`;

    container.innerHTML = `
      <div class="info-panel">
        <div class="info-image-wrap">
          <div class="img-placeholder" id="${phId}">
            <div class="spinner"></div>
            <span>穴位圖載入中</span>
          </div>
          <img id="${imgId}" src="" alt="${pointName}穴位圖" style="display:none;" />
        </div>
        <p class="slow-notice" id="${slowId}">圖片載入較慢，請稍候…</p>
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

    const imgEl  = document.getElementById(imgId);
    const phEl   = document.getElementById(phId);
    const slowEl = document.getElementById(slowId);
    const descEl = document.getElementById(descId);

    // 5 秒後顯示「載入較慢」提示
    const slowTimer = setTimeout(() => slowEl?.classList.add('visible'), 5000);

    // 嘗試多個備援 URL 載入圖片
    const imageUrls = Cache.pointImageUrls(pointName);
    clearTimeout(slowTimer);  // 由 _loadImageWithFallback 內部管理
    setTimeout(() => slowEl?.classList.add('visible'), 5000);
    _loadImageWithFallback(imageUrls, imgEl, phEl, slowEl);

    // 載入文字說明
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
