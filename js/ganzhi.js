/**
 * ganzhi.js
 * Core module: Heavenly Stems (天干), Earthly Branches (地支),
 * Five-Rat Escape (五鼠遁) hour-stem derivation, and
 * Lingui Bafa (靈龜八法) main/paired acupoint calculation.
 *
 * 日干支與時干支採用獨立的數值表（依附圖修正）。
 * Day GanZhi algorithm verified against lunar-python for 2024–2026.
 */

const GanZhi = (() => {

  /* ── 天干地支序列 ── */
  const TIAN_GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const DI_ZHI   = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

  /* ── 日天干數值表 ── */
  const DAY_GAN_VALUE = {
    甲:10, 乙:9, 丙:7, 丁:8, 戊:7,
    己:10, 庚:9, 辛:7, 壬:8, 癸:7
  };

  /* ── 日地支數值表 ── */
  const DAY_ZHI_VALUE = {
    子:7, 丑:10, 寅:9, 卯:8, 辰:10, 巳:7,
    午:7, 未:10, 申:9, 酉:9, 戌:10, 亥:7
  };

  /* ── 時天干數值表 ── */
  const HOUR_GAN_VALUE = {
    甲:9, 乙:8, 丙:7, 丁:6, 戊:5,
    己:4, 庚:8, 辛:7, 壬:6, 癸:5
  };

  /* ── 時地支數值表 ── */
  const HOUR_ZHI_VALUE = {
    子:9, 丑:8, 寅:7, 卯:6, 辰:5, 巳:4,
    午:9, 未:8, 申:7, 酉:6, 戌:5, 亥:4
  };

  /* ── 陽日天干 ── */
  const YANG_GAN = new Set(['甲','丙','戊','庚','壬']);

  /* ── 五鼠遁：日干 → 子時時干在 TIAN_GAN 的起始索引 ── */
  const WU_SHU_DUN = {
    甲:0, 乙:2, 丙:4, 丁:6, 戊:8,
    己:0, 庚:2, 辛:4, 壬:6, 癸:8
  };

  /* ── 靈龜八法對照表 ── */
  const BAFA_TABLE = {
    1: { gua:'坎', main:'申脈',   paired:'後溪',   vessel:'陽蹻脈' },
    2: { gua:'坤', main:'照海',   paired:'列缺',   vessel:'陰蹻脈' },
    3: { gua:'震', main:'外關',   paired:'足臨泣', vessel:'陽維脈' },
    4: { gua:'巽', main:'足臨泣', paired:'外關',   vessel:'帶脈'   },
    5: { gua:'坤', main:'照海',   paired:'列缺',   vessel:'陰蹻脈',
         genderDependent: true,
         male:   { main:'照海', paired:'列缺',  vessel:'陰蹻脈' },
         female: { main:'內關', paired:'公孫',  vessel:'陰維脈' } },
    6: { gua:'乾', main:'公孫',   paired:'內關',   vessel:'沖脈'   },
    7: { gua:'兌', main:'後溪',   paired:'申脈',   vessel:'督脈'   },
    8: { gua:'艮', main:'內關',   paired:'公孫',   vessel:'陰維脈' },
    9: { gua:'離', main:'列缺',   paired:'照海',   vessel:'任脈'   },
  };

  /* ── 日干支推算（Julian Day Number） ──
   * 基準：JDN 2460311 = 2024-01-01 = 甲子日（索引 0）
   * 已用 lunar-python 對 2024–2026 年 9 個日期全數驗證。
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

  /* ── 時支推算：時辰索引（子=0 … 亥=11） ── */
  function hourToZhiIndex(hour) {
    return Math.floor(((hour + 1) % 24) / 2);
  }

  /* ── 時干推算（五鼠遁） ── */
  function getHourGan(dayGan, zhiIndex) {
    return TIAN_GAN[(WU_SHU_DUN[dayGan] + zhiIndex) % 10];
  }

  /* ── 靈龜八法主計算 ── */
  function calculate(date) {
    const hour = date.getHours();

    // 23:00 起為隔日子時，日干支取隔天
    const dayDate = (hour >= 23)
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      : date;

    const { gan: dayGan, zhi: dayZhi } = getDayGanZhi(dayDate);

    const zhiIdx  = hourToZhiIndex(hour);
    const hourZhi = DI_ZHI[zhiIdx];
    const hourGan = getHourGan(dayGan, zhiIdx);

    // 四柱各取對應數值表
    const total = DAY_GAN_VALUE[dayGan]   + DAY_ZHI_VALUE[dayZhi]
                + HOUR_GAN_VALUE[hourGan] + HOUR_ZHI_VALUE[hourZhi];

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

  return {
    calculate, getDayGanZhi, getZhiName, getCurrentZhiIndex,
    TIAN_GAN, DI_ZHI, BAFA_TABLE,
    DAY_GAN_VALUE, DAY_ZHI_VALUE, HOUR_GAN_VALUE, HOUR_ZHI_VALUE
  };
})();
