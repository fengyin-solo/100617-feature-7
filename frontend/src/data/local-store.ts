import { SEED_ROWS } from './seed'
import { migrateData } from './migrate'
import type { EntryRow, SpeedAudit } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// 浏览器用宿主 localStorage；自检环境（Node）注入了内存版 localStorage，走同一份逻辑。
const STORAGE_KEY = 'shield-tunnel-construction:entries'
const META_KEY = 'shield-tunnel-construction:meta'
const AUDIT_KEY = 'shield-tunnel-construction:speed-audit'

type StoreMeta = {
  schemaVersion?: number
}

function storage(): Storage | null {
  const holder = globalThis as unknown as { localStorage?: Storage; window?: { localStorage?: Storage } }
  return holder.localStorage ?? holder.window?.localStorage ?? null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readRaw(): Record<string, EntryRow[]> | null {
  const ls = storage()
  if (!ls) {
    return null
  }
  const raw = ls.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as Record<string, EntryRow[]>
  } catch {
    return null
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  const ls = storage()
  if (!ls) {
    return fallback
  }
  const raw = readRaw()
  if (!raw) {
    // 首次打开：示例数据直接播种，并把当前 schema 版本写进去。
    ls.setItem(STORAGE_KEY, JSON.stringify(fallback))
    setMeta({ schemaVersion: CURRENT_SCHEMA_VERSION })
    return fallback
  }
  // 已存在的存量数据先按掘进日期迁移补录，再与播种数据合并（浏览器里的改动优先）。
  const meta = readMeta()
  const migrated = migrateData(raw, meta.schemaVersion ?? 0)
  const merged = { ...fallback, ...migrated.rows }
  setMeta({ schemaVersion: migrated.version })
  ls.setItem(STORAGE_KEY, JSON.stringify(merged))
  return merged
}

export const CURRENT_SCHEMA_VERSION = 2

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
  const ls = storage()
  if (ls) {
    ls.setItem(STORAGE_KEY, JSON.stringify(next))
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

function readMeta(): StoreMeta {
  const ls = storage()
  if (!ls) {
    return {}
  }
  try {
    return (JSON.parse(ls.getItem(META_KEY) ?? '{}')) as StoreMeta
  } catch {
    return {}
  }
}

function setMeta(meta: StoreMeta): void {
  const ls = storage()
  if (ls) {
    ls.setItem(META_KEY, JSON.stringify(meta))
  }
}

// 速度修改审计：与业务数据分开存，重复提交在服务层去重，这里只负责落盘。
export function listSpeedAudits(): SpeedAudit[] {
  const ls = storage()
  if (!ls) {
    return auditMemory
  }
  try {
    return (JSON.parse(ls.getItem(AUDIT_KEY) ?? '[]')) as SpeedAudit[]
  } catch {
    return []
  }
}

export function appendSpeedAudits(entries: SpeedAudit[]): void {
  if (entries.length === 0) {
    return
  }
  const all = [...listSpeedAudits(), ...entries]
  const ls = storage()
  if (ls) {
    ls.setItem(AUDIT_KEY, JSON.stringify(all))
  } else {
    auditMemory = all
  }
}

// 非浏览器环境的兜底内存审计，正常产品代码不会走到。
let auditMemory: SpeedAudit[] = []
