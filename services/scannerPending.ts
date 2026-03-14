export function clampInt(value: unknown, min: number, max: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}

export function expiresAt(nowMs: number, timeoutMs: number) {
  return nowMs + timeoutMs;
}

export function remainingMs(expiresAtMs: number, nowMs: number) {
  return Math.max(0, expiresAtMs - nowMs);
}

export function shouldUseCache(cacheAtMs: number, nowMs: number, ttlMs: number) {
  return nowMs - cacheAtMs < ttlMs;
}

export function chunkArray<T>(items: T[], size: number) {
  const s = clampInt(size, 1, 1000);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += s) {
    out.push(items.slice(i, i + s));
  }
  return out;
}
