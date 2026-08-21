/**
 * 本地缓存：避免重复调用 GitHub API（开发迭代 + Actions 增量）
 * 按 fullName 缓存 contents / README，TTL 默认 24h
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(here, "../../data/cache");

function cachePath(kind: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join(CACHE_DIR, kind, `${safe}.json`);
}

function isFresh(path: string, ttlMs: number): boolean {
  if (!existsSync(path)) return false;
  return Date.now() - statSync(path).mtimeMs < ttlMs;
}

export function cacheGet<T>(kind: string, key: string, ttlMs = 24 * 3600_000): T | null {
  const p = cachePath(kind, key);
  if (!isFresh(p, ttlMs)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function cacheSet<T>(kind: string, key: string, value: T): void {
  const p = cachePath(kind, key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(value), "utf-8");
}

/** 缓存包装：命中返回，未命中执行 fetch 并写入 */
export async function cached<T>(
  kind: string,
  key: string,
  fetch: () => Promise<T>,
  ttlMs = 24 * 3600_000
): Promise<T> {
  const hit = cacheGet<T>(kind, key, ttlMs);
  if (hit !== null) return hit;
  const value = await fetch();
  if (value !== null) cacheSet(kind, key, value);
  return value;
}
