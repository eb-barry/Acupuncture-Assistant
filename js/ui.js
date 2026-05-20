/**
 * ui.js
 * 共用 UI 工具：頁面切換、Toast、穴位資訊面板
 *
 * 圖片全寬策略（最終版）：
 *   圖片區與文字區完全分開，不共用任何父容器。
 *   圖片直接撐滿 scroll-area（左右無 padding），
 *   文字區加回 page-content padding。
 *
 *   DOM 結構：
 *     container
 *       ├─ <div class="point-img-block">    ← 全寬圖片，無包裹容器
 *       └─ <div class="point-text-block">   ← 文字說明，有 padding
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

  /* ── 依序嘗試多個圖片 URL ── */
  function _loadImageWithFallback(urls, imgEl, phEl, slowEl) {
    let idx = 0;
    function tryNext() {
      if (idx >= urls.length) {
        if (phEl) phEl.innerHTML =
          `<span style="color:var(--clr-muted);font-size:var(--fs-sm)">穴位圖暫未提供</span>`;
        slowEl && slowEl.classList.remove('visible');
        return;
      }
      const url = urls[idx++];
      imgEl.onerror = () => tryNext();
      imgEl.onload  = () => {
        if (phEl) phEl.style.display = 'none';
        imgEl.style.display = 'block';
        slowEl && slowEl.classList.remove('visible');
      };
      imgEl.src = url;
    }
    tryNext();
  }

  /* ── 穴位資訊面板 ──
   *
   * 圖片區（point-img-block）：
   *   - 無父容器限制，直接在 scroll-area 內
   *   - scroll-area 左右 padding=0，所以 width:100% 即為螢幕全寬
   *   - 用 padding-bottom 維持圖片比例（aspect-ratio fallback）
   *
   * 文字區（point-text-block）：
   *   - 加回左右 padding
   *   - 有背景色、圓角（底部）、邊框
   */
  async function renderPointPanel(container, pointName, badgeLabel) {
    const uid    = pointName.replace(/[^\w]/g, '_') + '_' + Date.now();
    const imgId  = `pi_${uid}`;
    const phId   = `pp_${uid}`;
    const slowId = `ps_${uid}`;
    const descId = `pd_${uid}`;

    container.innerHTML = `

      <!-- ── 全寬圖片區 ── -->
      <div class="point-img-block">
        <div class="img-placeholder" id="${phId}">
          <div class="spinner"></div>
          <span>穴位圖載入中</span>
        </div>
        <img id="${imgId}" src="" alt="${pointName}穴位圖"
             style="display:none;width:100%;height:100%;object-fit:contain;" />
      </div>
      <p class="slow-notice" id="${slowId}"
         style="text-align:center;padding:var(--sp-xs) var(--sp-md);">
        圖片載入較慢，請稍候…
      </p>

      <!-- ── 文字說明區 ── -->
      <div class="point-text-block">
        <h4 style="font-family:var(--font-serif);font-size:var(--fs-lg);
                   color:var(--clr-ink);margin-bottom:var(--sp-sm);
                   display:flex;align-items:center;gap:var(--sp-sm);">
          ${pointName}
          ${badgeLabel ? `<span class="badge">${badgeLabel}</span>` : ''}
        </h4>
        <div id="${descId}">
          <div class="img-placeholder" style="position:relative;height:56px;">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    `;

    const imgEl  = document.getElementById(imgId);
    const phEl   = document.getElementById(phId);
    const slowEl = document.getElementById(slowId);
    const descEl = document.getElementById(descId);

    setTimeout(() => slowEl?.classList.add('visible'), 5000);
    _loadImageWithFallback(Cache.pointImageUrls(pointName), imgEl, phEl, slowEl);

    try {
      const text = await Cache.loadPointText(pointName);
      if (descEl) descEl.innerHTML = `<p style="font-size:var(--fs-sm);line-height:1.9;color:var(--clr-text);white-space:pre-wrap;">${text.trim()}</p>`;
    } catch {
      if (descEl) descEl.innerHTML =
        `<p style="color:var(--clr-muted);font-size:var(--fs-sm);">取穴說明暫未提供。</p>`;
    }
  }

  return { showPage, toast, renderPointPanel };
})();
