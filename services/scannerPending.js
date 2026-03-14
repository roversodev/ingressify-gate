export function clampInt(value, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}

export function expiresAt(nowMs, timeoutMs) {
  return nowMs + timeoutMs;
}

export function remainingMs(expiresAtMs, nowMs) {
  return Math.max(0, expiresAtMs - nowMs);
}

export function shouldUseCache(cacheAtMs, nowMs, ttlMs) {
  return nowMs - cacheAtMs < ttlMs;
}

export function chunkArray(items, size) {
  const s = clampInt(size, 1, 1000);
  const out = [];
  for (let i = 0; i < items.length; i += s) {
    out.push(items.slice(i, i + s));
  }
  return out;
}
