/**
 * cache.js
 * On-demand loader for acupoint data (JSON), images (.webp), and rhyme texts.
 */

const Cache = (() => {

  const REPO   = 'eb-barry/Acupuncture-Assistant';
  const BRANCH = 'main';

  const RAW_BASE   = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/assets`;
  const CDN_BASE   = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/assets`;
  const PAGES_BASE = `https://eb-barry.github.io/Acupuncture-Assistant/assets`;

  const _mem = {};
  let _pointsData = null;

  function _enc(str) { return encodeURIComponent(str); }

  async function _fetchText(url) {
    if (_mem[url]) return _mem[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    _mem[url] = text;
    return text;
  }

  /** 載入 JSON 資料檔 */
  async function loadJSON(filename) {
    const url = `${RAW_BASE}/${filename}`;
    if (_mem[url]) return _mem[url];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Cannot load ${filename}: HTTP ${res.status}`);
    const data = await res.json();
    _mem[url] = data;
    return data;
  }

  /** 確保 points-data.json 已載入 */
  async function _ensurePointsData() {
    if (_pointsData) return _pointsData;
    _pointsData = await loadJSON('points-data.json');
    return _pointsData;
  }

  /** 取得單一穴位完整資料物件 */
  async function loadPointData(pointName) {
    const data = await _ensurePointsData();
    const entry = data[pointName];
    if (!entry) throw new Error(`找不到穴位資料：${pointName}`);
    return entry;
  }

  /**
   * 穴位圖 URL 陣列（依序嘗試：jsDelivr → GitHub Pages → raw）
   * 注意：jsDelivr 對新上傳檔案有 24hr 快取延遲，
   *       若圖片剛上傳請先用 GitHub Pages 或 raw。
   */
  function pointImageUrls(pointName) {
    const enc = _enc(pointName);
    return [
      `${PAGES_BASE}/points/${enc}.webp`,
      `${RAW_BASE}/points/${enc}.webp`,
      `${CDN_BASE}/points/${enc}.webp`,
    ];
  }

  function pointImageUrl(pointName) {
    return pointImageUrls(pointName)[0];
  }

  /** 載入歌訣文字 */
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

  return {
    loadJSON,
    loadPointData,
    pointImageUrl,
    pointImageUrls,
    loadRhymeText,
  };
})();
