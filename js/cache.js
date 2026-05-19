/**
 * cache.js
 * On-demand loader for acupoint images (.webp), text files (.txt), and JSON data.
 *
 * 中文檔名處理策略：
 *   - fetch() 請求：一律使用 encodeURIComponent() 編碼中文路徑
 *   - <img src>：瀏覽器會自動處理，但仍先 encode 確保一致
 *   - 圖片來源：優先 jsDelivr CDN，失敗時 fallback 到 GitHub Pages
 */

const Cache = (() => {

  const REPO   = 'eb-barry/Acupuncture-Assistant';
  const BRANCH = 'main';

  // 文字 / JSON：raw.githubusercontent.com
  const RAW_BASE   = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/assets`;
  // 圖片主要來源：jsDelivr（CDN 全球加速）
  const CDN_BASE   = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/assets`;
  // 圖片備援來源：GitHub Pages
  const PAGES_BASE = `https://eb-barry.github.io/Acupuncture-Assistant/assets`;

  const _mem = {};  // session 記憶體快取

  /** 安全編碼中文路徑片段 */
  function _enc(str) {
    return encodeURIComponent(str);
  }

  async function _fetchText(url) {
    if (_mem[url]) return _mem[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    _mem[url] = text;
    return text;
  }

  /** 載入 JSON 資料檔（無中文路徑，直接用） */
  async function loadJSON(filename) {
    const url = `${RAW_BASE}/${filename}`;
    if (_mem[url]) return _mem[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Cannot load ${filename}: HTTP ${res.status}`);
    const data = await res.json();
    _mem[url] = data;
    return data;
  }

  /** 載入穴位說明文字（中文檔名需 encode） */
  async function loadPointText(pointName) {
    // 先嘗試 raw，失敗時嘗試 GitHub Pages
    const urls = [
      `${RAW_BASE}/points/${_enc(pointName)}.txt`,
      `${PAGES_BASE}/points/${_enc(pointName)}.txt`,
    ];
    for (const url of urls) {
      try { return await _fetchText(url); } catch {}
    }
    throw new Error(`無法載入 ${pointName}.txt`);
  }

  /**
   * 穴位圖 URL 陣列（供 <img> 依序嘗試）
   * 回傳多個備援 URL，由 ui.js 的 renderPointPanel 依序載入
   */
  function pointImageUrls(pointName) {
    const enc = _enc(pointName);
    return [
      `${CDN_BASE}/points/${enc}.webp`,       // jsDelivr（CDN 加速）
      `${PAGES_BASE}/points/${enc}.webp`,      // GitHub Pages 備援
      `${RAW_BASE}/points/${enc}.webp`,        // raw 最後備援
    ];
  }

  // 保留舊介面相容（單一 URL，供未更新的地方使用）
  function pointImageUrl(pointName) {
    return pointImageUrls(pointName)[0];
  }

  /** 載入歌訣文字（中文檔名需 encode） */
  async function loadRhymeText(filename) {
    const urls = [
      `${RAW_BASE}/rhymes/${_enc(filename)}.txt`,
      `${PAGES_BASE}/rhymes/${_enc(filename)}.txt`,
    ];
    for (const url of urls) {
      try { return await _fetchText(url); } catch {}
    }
    throw new Error(`無法載入 ${filename}.txt`);
  }

  return { loadJSON, loadPointText, pointImageUrl, pointImageUrls, loadRhymeText };
})();
