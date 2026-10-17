// ============================================================
// 参数预设 — 四种典型视觉风格
// ============================================================

export const PRESETS = {
  /** 默认（Default） */
  default: {
    strips: 56, foil: 0.50, blur: 36, ridge: 0.50,
    refraction: 0.32, tilt: 14, lift: 40, warping: 0.45, inactiveDim: 0.55,
  },
  /** 强彩虹全息（Vibrant Foil） */
  foil: {
    strips: 56, foil: 0.88, blur: 46, ridge: 0.70,
    refraction: 0.50, tilt: 18, lift: 50, warping: 0.60, inactiveDim: 0.45,
  },
  /** 致密光栅板（80 Strips） */
  dense: {
    strips: 84, foil: 0.45, blur: 30, ridge: 0.65,
    refraction: 0.25, tilt: 12, lift: 35, warping: 0.35, inactiveDim: 0.55,
  },
  /** 极简微光（Subtle Sheen） */
  subtle: {
    strips: 40, foil: 0.25, blur: 50, ridge: 0.30,
    refraction: 0.20, tilt: 10, lift: 25, warping: 0.25, inactiveDim: 0.65,
  },
};
