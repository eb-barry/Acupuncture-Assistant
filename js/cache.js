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

  /** 載入 JSON 資料檔（多來源備援 + 併發請求 dedup） */
  async function loadJSON(filename) {
    const cacheKey = `json:${filename}`;
    if (_mem[cacheKey]) return _mem[cacheKey];
    if (_pending[cacheKey]) return _pending[cacheKey];

    const urls = [
      `${PAGES_BASE}/${filename}`,
      `${RAW_BASE}/${filename}`,
      `${CDN_BASE}/${filename}`,
    ];

    _pending[cacheKey] = (async () => {
      let lastErr;
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          _mem[cacheKey] = data;
          return data;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error(`Cannot load ${filename}`);
    })();

    try {
      return await _pending[cacheKey];
    } finally {
      delete _pending[cacheKey];
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
  const BAHUI_BY_POINT = {
    '章門': '臟會', '中脘': '腑會', '膻中': '氣會', '膈俞': '血會',
    '陽陵泉': '筋會', '太淵': '脈會', '大杼': '骨會', '懸鐘': '髓會',
  };

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
      return BAHUI_KW.some(kw => detail.includes(kw));
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

  function _enrichAttrPairs(pairs, pointName) {
    if (!pointName || !pairs.length) return pairs;

    const bahuiDetail = BAHUI_BY_POINT[pointName];
    if (bahuiDetail) {
      const bahuiPair = pairs.find(p => p['屬性'] === '八會穴');
      if (bahuiPair && !bahuiPair['細節']) bahuiPair['細節'] = bahuiDetail;
    }

    return pairs;
  }

  /**
   * 將經穴屬性與經穴屬性細節組合成 [{ 屬性, 細節 }, ...]
   * 優先使用 經穴屬性配對；否則依屬性陣列與細節文字自動配對。
   */
  function buildAttrPairs(d, pointName) {
    if (!d) return [];

    const existing = d['經穴屬性配對'];
    if (Array.isArray(existing) && existing.length) {
      return _enrichAttrPairs(existing.map(p => ({
        屬性: p['屬性'],
        細節: _cleanDetail(p['細節']),
      })), pointName);
    }

    const attrs = _uniqueAttrs(d['經穴屬性']);
    if (!attrs.length) return [];

    const rawDetail = d['經穴屬性細節'];
    const parts = Array.isArray(rawDetail)
      ? rawDetail.map(_cleanDetail).filter(Boolean)
      : _splitDetails(rawDetail);

    let pairs;

    if (parts.length === attrs.length) {
      pairs = attrs.map((attr, i) => ({ 屬性: attr, 細節: parts[i] || null }));
    } else if (parts.length === 1 && attrs.length === 1) {
      pairs = [{ 屬性: attrs[0], 細節: parts[0] }];
    } else {
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

      pairs = attrs.map(attr => ({ 屬性: attr, 細節: assigned[attr] || null }));
    }

    return _enrichAttrPairs(pairs, pointName);
  }

  /** 透過 GitHub API 列出 assets/rhymes 目錄下的 .txt 檔案 */
  async function _discoverRhymeFiles() {
    const apiUrl = `https://api.github.com/repos/${REPO}/contents/assets/rhymes?ref=${BRANCH}`;
    const res = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('Invalid rhyme directory listing');
    return items
      .filter(item => item.type === 'file' && /\.txt$/i.test(item.name))
      .map(item => item.name.replace(/\.txt$/i, ''));
  }

  function _buildRhymeCatalog(stems, metaList) {
    const metaByFile = {};
    for (const item of metaList) {
      if (item && item['檔名']) metaByFile[item['檔名']] = item;
    }

    return [...new Set(stems)]
      .filter(Boolean)
      .map(stem => {
        const meta = metaByFile[stem];
        return {
          檔名: stem,
          名稱: meta?.['名稱'] || stem,
          類別: meta?.['類別'] || '中醫歌訣',
          說明: meta?.['說明'] || '',
        };
      })
      .sort((a, b) => a['名稱'].localeCompare(b['名稱'], 'zh-Hant'));
  }

  /**
   * 載入歌訣清單：優先掃描 assets/rhymes 目錄（GitHub API），
   * 並與 rhymes-data.json 的說明資料合併。
   */
  async function loadRhymesCatalog() {
    if (_pending['rhymes-catalog']) return _pending['rhymes-catalog'];

    _pending['rhymes-catalog'] = (async () => {
      let meta = [];
      try { meta = await loadJSON('rhymes-data.json'); } catch {}

      let stems = [];
      try {
        stems = await _discoverRhymeFiles();
      } catch {
        stems = meta.map(item => item['檔名']).filter(Boolean);
      }

      const catalog = _buildRhymeCatalog(
        [...stems, ...meta.map(item => item['檔名'])],
        meta,
      );
      if (!catalog.length) throw new Error('找不到歌訣資料');
      return catalog;
    })();

    try {
      return await _pending['rhymes-catalog'];
    } finally {
      delete _pending['rhymes-catalog'];
    }
  }

  /** 載入歌訣文字 */
  async function loadRhymeText(filename) {
    const urls = [
      `${PAGES_BASE}/rhymes/${_enc(filename)}.txt`,
      `${RAW_BASE}/rhymes/${_enc(filename)}.txt`,
      `${CDN_BASE}/rhymes/${_enc(filename)}.txt`,
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
    loadRhymesCatalog,
  };
})();
