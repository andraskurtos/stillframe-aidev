export function srgbHex(hex) {
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [toLinear(hex >> 16 & 255), toLinear(hex >> 8 & 255), toLinear(hex & 255)];
}
