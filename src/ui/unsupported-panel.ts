export function showUnsupported(reason) {
  const panel = document.getElementById("unsupported");
  const reasonEl = document.getElementById("unsupported-reason");
  if (reasonEl)
    reasonEl.textContent = reason;
  if (panel)
    panel.hidden = false;
}

