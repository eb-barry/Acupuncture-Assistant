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
  const _pending = {};
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

  /** 載入 JSON 資料檔（併發請求共用同一 in-flight promise） */
  async function loadJSON(filename) {
    const url = `${RAW_BASE}/${filename}`;
    if (_mem[url]) return _mem[url];
    if (_pending[url]) return _pending[url];

    _pending[url] = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Cannot load ${filename}: HTTP ${res.status}`);
      const data = await res.json();
      _mem[url] = data;
      return data;
    })();

    try {
      return await _pending[url];
    } finally {
      delete _pending[url];
    }
  }

  /** 載入完整穴位資料表（points-data.json） */
  async function loadAllPointsData() {
    if (_pointsData) return _pointsData;
    _pointsData = await loadJSON('points-data.json');
    return _pointsData;
  }

  /** 取得單一穴位完整資料物件 */
  async function loadPointData(pointName) {
    const data = await loadAllPointsData();
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

  const BAHUI_KW = ['脈會','氣會','血會','筋會','骨會','髓會','臟會','腑會'];
  const BAMAI_KW = ['任脈','督脈','衝脈','帶脈','陰維','陽維','陰蹻','陽蹻'];
  const ORGANS   = ['肺','心','肝','脾','腎','胃','心包','三焦','膽','大腸','小腸','膀胱'];

  function _cleanDetail(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/（[^）]*）/g, '').trim();
    return cleaned || null;
  }

  function _splitDetails(text) {
    if (!text) return [];
    return String(text).split(/[，,]/).map(_cleanDetail).filter(Boolean);
  }

  function _uniqueAttrs(attrs) {
    if (!attrs) return [];
    const list = Array.isArray(attrs) ? attrs : [attrs];
    const seen = [];
    for (const attr of list) {
      if (attr && !seen.includes(attr)) seen.push(attr);
    }
    return seen;
  }

  function _detailMatchesAttr(attr, detail) {
    if (!detail) return false;
    if (attr === '八會穴') {
      return BAHUI_KW.some(kw => detail.includes(kw)) || ORGANS.includes(detail);
    }
    if (attr === '八脈交會穴') {
      return BAMAI_KW.some(kw => detail.includes(kw));
    }
    if (attr === '交會穴') {
      return detail.includes('之會') || detail.includes('之郄');
    }
    if (attr === '募穴' || attr === '背俞穴') {
      return ORGANS.includes(detail);
    }
    if (attr === '郄穴') {
      return detail.includes('之郄');
    }
    return false;
  }

  /**
   * 將經穴屬性與經穴屬性細節組合成 [{ 屬性, 細節 }, ...]
   * 優先使用 經穴屬性配對；否則依屬性陣列與細節文字自動配對。
   */
  function buildAttrPairs(d) {
    if (!d) return [];

    const existing = d['經穴屬性配對'];
    if (Array.isArray(existing) && existing.length) {
      return existing.map(p => ({
        屬性: p['屬性'],
        細節: _cleanDetail(p['細節']),
      }));
    }

    const attrs = _uniqueAttrs(d['經穴屬性']);
    if (!attrs.length) return [];

    const rawDetail = d['經穴屬性細節'];
    const parts = Array.isArray(rawDetail)
      ? rawDetail.map(_cleanDetail).filter(Boolean)
      : _splitDetails(rawDetail);

    if (parts.length === attrs.length) {
      return attrs.map((attr, i) => ({ 屬性: attr, 細節: parts[i] || null }));
    }
    if (parts.length === 1 && attrs.length === 1) {
      return [{ 屬性: attrs[0], 細節: parts[0] }];
    }

    const assigned = {};
    for (const part of parts) {
      for (const attr of attrs) {
        if (assigned[attr]) continue;
        if (_detailMatchesAttr(attr, part)) {
          assigned[attr] = part;
          break;
        }
      }
    }

    const unmatchedParts = parts.filter(part => !Object.values(assigned).includes(part));
    const unmatchedAttrs = attrs.filter(attr => !assigned[attr]);
    unmatchedParts.forEach((part, i) => {
      if (unmatchedAttrs[i]) assigned[unmatchedAttrs[i]] = part;
    });

    return attrs.map(attr => ({ 屬性: attr, 細節: assigned[attr] || null }));
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
    loadAllPointsData,
    loadPointData,
    buildAttrPairs,
    pointImageUrl,
    pointImageUrls,
    loadRhymeText,
  };
})();
