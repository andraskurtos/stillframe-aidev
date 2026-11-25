export var fmtTime = (s) => {
  const m2 = Math.floor(s / 60);
  const sec = s - m2 * 60;
  return `${m2}:${sec.toFixed(2).padStart(5, "0")}`;
};
