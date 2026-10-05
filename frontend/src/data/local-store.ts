import { buildSeedRings, migrateRingRow } from './ring-domain'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'shield-tunnel-construction:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeModule(key: string, rows: EntryRow[]): EntryRow[] {
  if (key !== 'ring') {
    return rows
  }
  const oldById = new Map(rows.map((row) => [Number(row.id), row]))
  // 新台账给出 24 环完整骨架；旧库里的前三环按 id 合入，状态和人工改过的速度等字段继续保留。
  return buildSeedRings().map((seedRow) => migrateRingRow(oldById.get(Number(seedRow.id)) ?? seedRow))
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = Object.fromEntries(
    Object.entries(clone(SEED_ROWS)).map(([key, rows]) => [key, normalizeModule(key, rows)]),
  )
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...fallback, ...parsed }
    const normalized = Object.fromEntries(
      Object.entries(merged).map(([key, rows]) => [key, normalizeModule(key, rows)]),
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
