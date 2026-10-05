import type { EntryRow } from './types'

// 掘进环次领域的解析与判定规则全部集中在这里：查询、统计、迁移、复核清单都走同一份，
// 页面与其它台账不允许再各自写一遍解析逻辑。

export const RING_STATUSES = ['待掘进', '掘进中', '已贯通', '已纠偏'] as const
export const RING_CREWS = ['掘进一班', '掘进二班', '掘进三班', '掘进四班'] as const

/** 超限判定阈值：水平或垂直偏差绝对值超过 50mm 进轴线偏差复核清单。 */
export const AXIS_LIMIT_MM = 50

/** 环号取整数部分；老数据里写不成数字的，回退用记录编号顶替，保证区间查询可用。 */
export function parseRingNo(value: unknown, fallbackId = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const matched = String(value ?? '').match(/\d+/)
  return matched ? Number(matched[0]) : fallbackId
}

/**
 * 起始里程解析成可比较的米数。
 * 支持 DK12+345.6 / K12+345 / 纯米数（12345.6）；解析不出来返回 null，排序时排最后。
 */
export function parseChainage(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const text = String(value ?? '').trim().toUpperCase().replace(/[：:\s]/g, '')
  if (!text) {
    return null
  }
  const dk = text.match(/(?:DK|K)(\d+)(?:\+(\d+(?:\.\d+)?))?/)
  if (dk) {
    return Number(dk[1]) * 1000 + Number(dk[2] ?? 0)
  }
  const plain = text.match(/^-?\d+(?:\.\d+)?$/)
  return plain ? Number(plain[0]) : null
}

export function formatChainage(meters: number): string {
  const km = Math.floor(meters / 1000)
  const rest = (meters - km * 1000).toFixed(1).padStart(6, '0')
  return `DK${km}+${rest}`
}

/** 掘进速度只认台账里能解析成数值的「掘进速度」(mm/min)，解析不出按缺测处理，不进平均。 */
export function parseSpeed(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const matched = String(value ?? '').match(/-?\d+(?:\.\d+)?/)
  if (!matched) {
    return null
  }
  const speed = Number(matched[0])
  return Number.isFinite(speed) && speed > 0 ? speed : null
}

/**
 * 兼容老数据：贯通过程记录（贯通过程记录速度 / 过程速度 / 掘进贯通过程）里的速度
 * 只在迁移补录时用来回填台账，回填之后统计一律以「掘进速度」字段为准。
 */
const LEGACY_SPEED_FIELDS = ['贯通过程记录速度', '贯通过程速度', '过程速度', '掘进贯通过程']

export function parseLegacySpeed(row: EntryRow): number | null {
  for (const field of LEGACY_SPEED_FIELDS) {
    const speed = parseSpeed(row[field])
    if (speed !== null) {
      return speed
    }
  }
  return null
}

export function hasLegacySpeed(row: EntryRow): boolean {
  return LEGACY_SPEED_FIELDS.some((field) => row[field] !== undefined && parseSpeed(row[field]) !== null)
}

/** 轴线偏差数值（带正负号，毫米）。 */
export function parseDeviationMm(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const matched = String(value ?? '').match(/-?\d+(?:\.\d+)?/)
  if (!matched) {
    return null
  }
  const num = Number(matched[0])
  return Number.isFinite(num) ? num : null
}

/** 超限环次的唯一判定口径：水平或垂直偏差任一绝对值超阈值。 */
export function isAxisOverLimit(row: EntryRow): boolean {
  const horizontal = parseDeviationMm(row['水平偏差'])
  const vertical = parseDeviationMm(row['垂直偏差'])
  return (
    (horizontal !== null && Math.abs(horizontal) > AXIS_LIMIT_MM) ||
    (vertical !== null && Math.abs(vertical) > AXIS_LIMIT_MM)
  )
}

export function deviationSummary(row: EntryRow): string {
  const parts: string[] = []
  const horizontal = parseDeviationMm(row['水平偏差'])
  const vertical = parseDeviationMm(row['垂直偏差'])
  if (horizontal !== null) {
    parts.push(`水平 ${horizontal > 0 ? '+' : ''}${horizontal}mm`)
  }
  if (vertical !== null) {
    parts.push(`垂直 ${vertical > 0 ? '+' : ''}${vertical}mm`)
  }
  return parts.join(' / ') || '偏差缺测'
}

export function isValidDateString(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}
