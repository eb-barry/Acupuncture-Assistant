/**
 * ganzhi.js
 * Core module: Heavenly Stems (天干), Earthly Branches (地支),
 * Five-Rat Escape (五鼠遁) hour-stem derivation, and
 * Lingui Bafa (靈龜八法) main/paired acupoint calculation.
 *
 * No external dependencies — pure JavaScript.
 * Day GanZhi algorithm verified against lunar-python for 2024-2026.
 */

const GanZhi = (() => {

  /* ── Tables ── */
  const TIAN_GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const DI_ZHI   = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

  const GAN_VALUE = { 甲:10, 乙:9, 丙:8, 丁:7, 戊:6, 己:10, 庚:9, 辛:8, 壬:7, 癸:6 };
  const ZHI_VALUE = { 子:6, 丑:10, 寅:8, 卯:8, 辰:10, 巳:7, 午:7, 未:10, 申:9, 酉:9, 戌:10, 亥:6 };

  const YANG_GAN = new Set(['甲','丙','戊','庚','壬']);
  const WU_SHU_DUN = { 甲:0, 乙:2, 丙:4, 丁:6, 戊:8, 己:0, 庚:2, 辛:4, 壬:6, 癸:8 };

  const BAFA_TABLE = {
    1: { gua:'坎', main:'申脈', paired:'後溪',   vessel:'陽蹻脈' },
    2: { gua:'坤', main:'照海', paired:'列缺',   vessel:'陰蹻脈' },
    3: { gua:'震', main:'外關', paired:'足臨泣', vessel:'陽維脈' },
    4: { gua:'巽', main:'足臨泣', paired:'外關', vessel:'帶脈'   },
    5: { gua:'坤', main:'照海', paired:'列缺',   vessel:'陰蹻脈', genderDependent: true,
         male:   { main:'照海', paired:'列缺',  vessel:'陰蹻脈' },
         female: { main:'內關', paired:'公孫', vessel:'陰維脈' } },
    6: { gua:'乾', main:'公孫', paired:'內關',   vessel:'沖脈'   },
    7: { gua:'兌', main:'後溪', paired:'申脈',   vessel:'督脈'   },
    8: { gua:'艮', main:'內關', paired:'公孫',   vessel:'陰維脈' },
    9: { gua:'離', main:'列缺', paired:'照海',   vessel:'任脈'   },
  };

  /* ── Day GanZhi via Julian Day Number ──
   * BASE_JD = JDN of 2024-01-01, a 甲子 day (60-cycle index 0).
   * Verified against lunar-python for 2024–2026 (9 spot-checks all pass).
   * Does NOT depend on lunar-javascript at runtime.
   */
  const BASE_JD = 2460311;

  function dateToJDN(y, m, d) {
    const a  = Math.floor((14 - m) / 12);
    const yr = y + 4800 - a;
    const mo = m + 12 * a - 3;
    return d + Math.floor((153 * mo + 2) / 5) + 365 * yr
           + Math.floor(yr / 4) - Math.floor(yr / 100)
           + Math.floor(yr / 400) - 32045;
  }

  function getDayGanZhi(date) {
    const jdn = dateToJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const idx = ((jdn - BASE_JD) % 60 + 60) % 60;
    return { gan: TIAN_GAN[idx % 10], zhi: DI_ZHI[idx % 12] };
  }

  /* ── Hour branch (時支) ── */
  // 子時: 23:00-00:59 → index 0
  function hourToZhiIndex(hour) {
    return Math.floor(((hour + 1) % 24) / 2);
  }

  /* ── Hour stem (時干) via Five-Rat Escape ── */
  function getHourGan(dayGan, zhiIndex) {
    return TIAN_GAN[(WU_SHU_DUN[dayGan] + zhiIndex) % 10];
  }

  /* ── Main public API ── */
  /**
   * Calculate Lingui Bafa result for a given Date.
   * @param  {Date} date
   * @returns {{ solarStr, lunarStr, dayGan, dayZhi, hourGan, hourZhi,
   *             isYang, total, remainder, gua, main, paired, vessel }}
   */
  function calculate(date) {
    const hour = date.getHours();

    // 23:00+ is 子時 of the *next* calendar day
    const dayDate = (hour >= 23)
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      : date;

    const { gan: dayGan, zhi: dayZhi } = getDayGanZhi(dayDate);

    const zhiIdx  = hourToZhiIndex(hour);
    const hourZhi = DI_ZHI[zhiIdx];
    const hourGan = getHourGan(dayGan, zhiIdx);

    const total  = GAN_VALUE[dayGan] + ZHI_VALUE[dayZhi]
                 + GAN_VALUE[hourGan] + ZHI_VALUE[hourZhi];
    const isYang = YANG_GAN.has(dayGan);
    let   rem    = isYang ? (total % 9) : (total % 6);
    if (rem === 0) rem = isYang ? 9 : 6;

    const solarStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;
    const lunarStr = `日柱 ${dayGan}${dayZhi}　時柱 ${hourGan}${hourZhi}`;

    return {
      solarStr, lunarStr,
      dayGan, dayZhi,
      hourGan, hourZhi,
      isYang, total, remainder: rem,
      ...BAFA_TABLE[rem],
    };
  }

  function getZhiName(index)    { return DI_ZHI[index]; }
  function getCurrentZhiIndex() { return hourToZhiIndex(new Date().getHours()); }

  return { calculate, getDayGanZhi, getZhiName, getCurrentZhiIndex, TIAN_GAN, DI_ZHI, BAFA_TABLE };
})();
