import {
  RING_CREWS,
  formatChainage,
  hasLegacySpeed,
  isValidDateString,
  parseChainage,
  parseLegacySpeed,
  parseRingNo,
} from './ring-domain'
import type { EntryRow } from './types'

// 存量数据迁移：版本号只增不减，每个版本只跑一次。
// v1 的存量环次缺环号/里程/日期/速度等关键项，统一在 v2 按掘进日期顺序补录。
export const MIGRATION_VERSION = 2

const RING_BASE_DATE = new Date(Date.UTC(2026, 8, 1))

function addDays(base: Date, days: number): string {
  const date = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

function parseSpeedOf(row: EntryRow): number | null {
  const value = row['掘进速度']
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  const matched = String(value ?? '').match(/\d+(?:\.\d+)?/)
  return matched ? Number(matched[0]) : null
}

/**
 * 存量环次按掘进日期顺序迁移补录：
 * 1) 先按「已有掘进日期 → 环号」稳定排序，保证后续补录顺着掘进先后走；
 * 2) 环号取原字段里的数字，取不到按记录编号补；
 * 3) 起始里程解析不出的，按环号以 1.5m 环宽顺延补 DK 里程；
 * 4) 掘进日期合法的保留并作为锚点，缺日期的按排序位置从基准日逐环顺延；
 * 5) 掘进速度优先原值；老数据的贯通过程记录速度只在这里回填一次，之后不再读取；
 * 6) 掘进班组认不出的按记录编号轮替补到在册掘进班组。
 */
export function migrateRingRows(input: EntryRow[]): EntryRow[] {
  const ordered = [...input].sort((a, b) => {
    const da = String(a['掘进日期'] ?? '')
    const db = String(b['掘进日期'] ?? '')
    if (isValidDateString(da) && isValidDateString(db) && da !== db) {
      return da < db ? -1 : 1
    }
    if (isValidDateString(da) && !isValidDateString(db)) {
      return -1
    }
    if (!isValidDateString(da) && isValidDateString(db)) {
      return 1
    }
    return parseRingNo(a['环号'], Number(a.id)) - parseRingNo(b['环号'], Number(b.id))
  })

  return ordered.map((row, position) => {
    const next: EntryRow = { ...row }
    const ringNo = parseRingNo(next['环号'], Number(next.id))
    next['环号'] = ringNo
    if (parseChainage(next['起始里程']) === null) {
      next['起始里程'] = formatChainage(ringNo * 1.5)
    }
    if (!isValidDateString(next['掘进日期'])) {
      next['掘进日期'] = addDays(RING_BASE_DATE, position)
    }
    if (parseSpeedOf(next) === null) {
      const legacy = parseLegacySpeed(next)
      if (legacy !== null) {
        next['掘进速度'] = legacy
      }
    }
    const crew = String(next['掘进班组'] ?? '')
    if (!RING_CREWS.includes(crew as (typeof RING_CREWS)[number])) {
      next['掘进班组'] = RING_CREWS[(Number(next.id) - 1) % RING_CREWS.length]
    }
    return next
  })
}

/**
 * 迁移入口：根据已落盘的 schema 版本逐版本升级。
 * 返回升级后的全量数据与新版本号；已是最新版本时原样返回、不动数据。
 */
export function migrateData(
  raw: Record<string, EntryRow[]>,
  fromVersion: number,
): { rows: Record<string, EntryRow[]>; version: number } {
  if (fromVersion >= MIGRATION_VERSION) {
    return { rows: raw, version: fromVersion }
  }
  const rows = { ...raw }
  if (fromVersion < 2 && Array.isArray(rows.ring)) {
    rows.ring = migrateRingRows(rows.ring)
  }
  return { rows, version: MIGRATION_VERSION }
}

/** 自检用：一行里是否带着待回填的老贯通过程记录。 */
export function rowCarriesLegacySpeed(row: EntryRow): boolean {
  return hasLegacySpeed(row)
}
