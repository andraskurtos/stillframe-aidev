export function cellKey(x, z) {
  return x + 4096 << 13 | z + 4096;
}
export function clampN(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
export function rayBox(o, d, b, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 0;
  for (let k = 0; k < 3; k++) {
    const ok = o[k];
    const dk = d[k];
    const lo = b.min[k];
    const hi = b.max[k];
    if (Math.abs(dk) < 1e-12) {
      if (ok < lo || ok > hi)
        return null;
      continue;
    }
    const inv = 1 / dk;
    let t0 = (lo - ok) * inv;
    let t1 = (hi - ok) * inv;
    let s = -1;
    if (t0 > t1) {
      const tmp2 = t0;
      t0 = t1;
      t1 = tmp2;
      s = 1;
    }
    if (t0 > tmin) {
      tmin = t0;
      axis = k;
      sign = s;
    }
    if (t1 < tmax)
      tmax = t1;
    if (tmin > tmax)
      return null;
  }
  if (axis < 0) {
    return { t: 0, axis: 1, sign: 1 };
  }
  return { t: tmin, axis, sign };
}
export function segmentSphere(p0, p1, c, r) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const mx = p0[0] - c[0], my = p0[1] - c[1], mz = p0[2] - c[2];
  const a = dx * dx + dy * dy + dz * dz;
  const b = mx * dx + my * dy + mz * dz;
  const cc = mx * mx + my * my + mz * mz - r * r;
  if (cc <= 0)
    return 0;
  if (a < 1e-12)
    return -1;
  const disc = b * b - a * cc;
  if (disc < 0)
    return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}
export function segmentCapsule(p0, p1, a, b, r) {
  const d1x = p1[0] - p0[0], d1y = p1[1] - p0[1], d1z = p1[2] - p0[2];
  const d2x = b[0] - a[0], d2y = b[1] - a[1], d2z = b[2] - a[2];
  const rx = p0[0] - a[0], ry = p0[1] - a[1], rz = p0[2] - a[2];
  const aa = d1x * d1x + d1y * d1y + d1z * d1z;
  const ee = d2x * d2x + d2y * d2y + d2z * d2z;
  const ff = d2x * rx + d2y * ry + d2z * rz;
  let s;
  let t;
  if (aa < 1e-12) {
    s = 0;
    t = clampN(ff / ee, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    const bb = d1x * d2x + d1y * d2y + d1z * d2z;
    const denom = aa * ee - bb * bb;
    s = denom > 1e-12 ? clampN((bb * ff - c * ee) / denom, 0, 1) : 0;
    t = (bb * s + ff) / ee;
    if (t < 0) {
      t = 0;
      s = clampN(-c / aa, 0, 1);
    } else if (t > 1) {
      t = 1;
      s = clampN((bb - c) / aa, 0, 1);
    }
  }
  const cx = p0[0] + d1x * s - (a[0] + d2x * t);
  const cy = p0[1] + d1y * s - (a[1] + d2y * t);
  const cz = p0[2] + d1z * s - (a[2] + d2z * t);
  const dsq = cx * cx + cy * cy + cz * cz;
  if (dsq > r * r)
    return -1;
  const segLen = Math.sqrt(aa);
  if (segLen < 1e-9)
    return 0;
  const back = Math.sqrt(Math.max(0, r * r - dsq)) / segLen;
  return clampN(s - back, 0, 1);
}

