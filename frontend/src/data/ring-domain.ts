import type { EntryRow, PageResult, SortDirection } from '@/data/types'

export const RING_CREWS = ['盾构一班', '盾构二班', '盾构三班'] as const
export const RING_RECORDER_ROLE = '记录员'
export const RING_LIMIT_MM = 50
export const RING_PAGE_SIZE = 10

export const RING_FIELDS = [
  '环号',
  '掘进日期',
  '起始里程',
  '掘进速度',
  '总推力',
  '刀盘扭矩',
  '出土方量',
  '水平偏差',
  '垂直偏差',
  '掘进班组',
  '记录来源',
] as const

export type RingQuery = {
  ringStart?: string
  ringEnd?: string
  crew?: string
  progress?: string
  keyword?: string
  sortBy?: '起始里程' | '掘进速度' | '环号'
  sortOrder?: SortDirection
  page?: number
  size?: number
}

export type RingStats = {
  total: number
  completed: number
  active: number
  pending: number
  overLimit: number
  averageSpeed: number
  speedSource: string
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'boolean') {
    return null
  }
  const matched = String(value ?? '').match(/-?\d+(?:\.\d+)?/)
  return matched ? Number(matched[0]) : null
}

export function parseChainage(value: unknown): number {
  const text = String(value ?? '')
  const matched = text.match(/K(\d+)\+(\d+(?:\.\d+)?)/i)
  if (matched) {
    return Number(matched[1]) * 1000 + Number(matched[2])
  }
  return parseNumber(text) ?? 0
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function fallbackDate(ringNo: number): string {
  const day = ((ringNo - 1) % 24) + 1
  return `2026-09-${pad2(day)}`
}

function fallbackCrew(ringNo: number): string {
  return RING_CREWS[(ringNo - 1) % RING_CREWS.length]
}

export function ringNumber(row: EntryRow): number {
  return parseNumber(row['环号']) ?? Number(row.id)
}

export function ringDate(row: EntryRow): string {
  const raw = String(row['掘进日期'] ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10)
  }
  return fallbackDate(ringNumber(row))
}

function isPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && value.includes('样例')
}

function numericOr(value: unknown, fallback: number): number {
  if (isPlaceholder(value)) {
    return fallback
  }
  return parseNumber(value) ?? fallback
}

function textOr(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim()
  return text && !isPlaceholder(text) ? text : fallback
}

/**
 * 老版本只有状态流，字段多是占位文本。这里按环号补齐可查询、可统计的数据；
 * 已经有值的字段不覆盖，保证浏览器里的历史改动继续算数。
 */
export function migrateRingRow(row: EntryRow, seedIndex = 0): EntryRow {
  const originalNo = parseNumber(row['环号'])
  const no = originalNo ?? Number(row.id)
  const status = ['待掘进', '掘进中', '已贯通', '已纠偏'].includes(row.status)
    ? row.status
    : no <= 20
      ? '已贯通'
      : no <= 23
        ? '掘进中'
        : '待掘进'
  const crew = textOr(row['掘进班组'], fallbackCrew(no))
  const source = String(row['记录来源'] ?? '').trim()
    || (status === '已贯通' && no === 20 ? '贯通过程记录' : '正式掘进记录')
  const migrated: EntryRow = {
    ...row,
    status,
    pending: status === '待掘进' || status === '掘进中',
    '环号': no,
    '掘进日期': status === '待掘进' ? '' : ringDate({ ...row, '环号': no } as EntryRow),
    '起始里程': textOr(row['起始里程'], `K1+${String(120 + (no - 1) * 18).padStart(3, '0')}.000`),
    '掘进速度': numericOr(row['掘进速度'], Number((31 + ((no * 7) % 18) + Number((no % 5) * 0.4).toFixed(1)))),
    '总推力': numericOr(row['总推力'], 10500 + (no % 7) * 350),
    '刀盘扭矩': numericOr(row['刀盘扭矩'], 2400 + (no % 9) * 180),
    '出土方量': numericOr(row['出土方量'], 46 + (no % 4)),
    '水平偏差': isPlaceholder(row['水平偏差']) ? 0 : numericOr(row['水平偏差'], 0),
    '垂直偏差': isPlaceholder(row['垂直偏差']) ? 0 : numericOr(row['垂直偏差'], 0),
    '掘进班组': crew,
    '记录来源': source,
  }

  if (seedIndex >= 0) {
    const deviations: Record<number, [number, number]> = {
      7: [52, -8],
      13: [-12, 54],
      18: [55, 18],
      20: [-58, -6],
    }
    if (
      deviations[no]
      && (isPlaceholder(row['水平偏差']) || parseNumber(row['水平偏差']) === null)
      && (isPlaceholder(row['垂直偏差']) || parseNumber(row['垂直偏差']) === null)
    ) {
      migrated['水平偏差'] = deviations[no][0]
      migrated['垂直偏差'] = deviations[no][1]
    }
  }

  migrated.abnormal = isOverLimitRing(migrated) || migrated.status === '已纠偏'
  return migrated
}

/** 一份掘进环次台账是唯一事实源；轴线复核与进度台账都从这里投影。 */
export function canonicalRings(rows: EntryRow[]): EntryRow[] {
  const byRing = new Map<number, EntryRow>()
  for (const row of rows) {
    const migrated = migrateRingRow(row)
    const no = ringNumber(migrated)
    const current = byRing.get(no)
    if (!current) {
      byRing.set(no, migrated)
    } else {
      const currentRank = sourceRank(current)
      const nextRank = sourceRank(migrated)
      if (
        nextRank > currentRank
        || (nextRank === currentRank && Number(migrated.id) > Number(current.id))
      ) {
        byRing.set(no, migrated)
      }
    }
  }
  return [...byRing.values()].sort((a, b) => ringNumber(a) - ringNumber(b))
}

function sourceRank(row: EntryRow): number {
  return String(row['记录来源']) === '正式掘进记录' ? 2 : 1
}

export function isOverLimitRing(row: EntryRow): boolean {
  const horizontal = Math.abs(parseNumber(row['水平偏差']) ?? 0)
  const vertical = Math.abs(parseNumber(row['垂直偏差']) ?? 0)
  return horizontal > RING_LIMIT_MM || vertical > RING_LIMIT_MM
}

export function averageRingSpeed(rows: EntryRow[]): { value: number; source: string } {
  const rings = canonicalRings(rows).filter((row) => row.status !== '待掘进')
  const official = rings.filter((row) => String(row['记录来源']) === '正式掘进记录')
  // 同环有正式记录时正式记录算数；只有贯通过程数据的老环次才用过程值补入。
  const officialRings = new Set(official.map(ringNumber))
  const fallbackProcess = rings.filter(
    (row) => String(row['记录来源']) !== '正式掘进记录' && !officialRings.has(ringNumber(row)),
  )
  const values = [...official, ...fallbackProcess]
    .map((row) => parseNumber(row['掘进速度']))
    .filter((value): value is number => value !== null)
  if (!values.length) {
    return { value: 0, source: '正式掘进记录' }
  }
  return {
    value: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
    source: fallbackProcess.length ? '正式掘进记录+老贯通过程补录' : '正式掘进记录',
  }
}

export function ringStats(rows: EntryRow[]): RingStats {
  const rings = canonicalRings(rows)
  const speed = averageRingSpeed(rings)
  return {
    total: rings.length,
    completed: rings.filter((row) => row.status === '已贯通' || row.status === '已纠偏').length,
    active: rings.filter((row) => row.status === '掘进中').length,
    pending: rings.filter((row) => row.status === '待掘进').length,
    overLimit: rings.filter(isOverLimitRing).length,
    averageSpeed: speed.value,
    speedSource: speed.source,
  }
}

function progressLabel(row: EntryRow): string {
  if (row.status === '待掘进') return '待掘进'
  if (row.status === '掘进中') return '掘进中'
  return '已贯通'
}

export function queryRings(rows: EntryRow[], query: RingQuery = {}): PageResult {
  const all = canonicalRings(rows)
  const startText = query.ringStart?.trim() ?? ''
  const endText = query.ringEnd?.trim() ?? ''
  const start = /^\d+$/.test(startText) ? Number(startText) : null
  const end = /^\d+$/.test(endText) ? Number(endText) : null
  const invalidRangeText =
    (startText && start === null) || (endText && end === null)
      ? `环号必须是正整数：起始「${startText || '空'}」、截止「${endText || '空'}」。`
      : start !== null && end !== null && start > end
        ? `起始环号 ${start} 大于截止环号 ${end}，请调整环号区间。`
        : ''
  const crew = query.crew?.trim() ?? ''
  const progress = query.progress?.trim() ?? ''
  const keyword = query.keyword?.trim() ?? ''
  const sortBy = query.sortBy ?? '起始里程'
  const sortOrder: SortDirection = query.sortOrder ?? 'asc'
  const size = query.size && query.size > 0 ? query.size : RING_PAGE_SIZE

  const rangeClauses: { label: string; test: (row: EntryRow) => boolean }[] = []
  if (start !== null) rangeClauses.push({ label: `起始环号 ${start}`, test: (row: EntryRow) => ringNumber(row) >= start })
  if (end !== null) rangeClauses.push({ label: `截止环号 ${end}`, test: (row: EntryRow) => ringNumber(row) <= end })
  const clauses: { label: string; test: (row: EntryRow) => boolean }[] = [
    ...rangeClauses,
    { label: `掘进班组「${crew}」`, test: (row: EntryRow) => !crew || String(row['掘进班组']) === crew },
    {
      label: `环次进度「${progress}」`,
      test: (row: EntryRow) => !progress || progressLabel(row) === progress || row.status === progress,
    },
    {
      label: `关键词「${keyword}」`,
      test: (row: EntryRow) => !keyword || RING_FIELDS.some((field) => String(row[field] ?? '').includes(keyword)),
    },
  ]

  let matched = invalidRangeText ? [] : all.filter((row) => clauses.every((clause) => clause.test(row)))

  const direction = sortOrder === 'desc' ? -1 : 1
  matched = [...matched].sort((a, b) => {
    const av = sortBy === '环号' ? ringNumber(a) : sortBy === '起始里程' ? parseChainage(a[sortBy]) : parseNumber(a[sortBy]) ?? 0
    const bv = sortBy === '环号' ? ringNumber(b) : sortBy === '起始里程' ? parseChainage(b[sortBy]) : parseNumber(b[sortBy]) ?? 0
    return (av - bv) * direction || ringNumber(a) - ringNumber(b)
  })

  const total = matched.length
  const page = Number.isFinite(query.page) && (query.page ?? 1) > 0 ? Number(query.page) : 1
  const items = matched.slice((page - 1) * size, page * size)
  let mismatch: string | undefined
  if (total === 0 && (start !== null || end !== null || crew || progress || keyword)) {
    const failed = clauses
      .filter((clause) => !all.some(clause.test))
      .map((clause) => clause.label)
    if (invalidRangeText) {
      mismatch = `没有匹配记录：${invalidRangeText}`
    } else if (failed.length) {
      mismatch = `没有匹配记录：${failed.join('、')} 对不上号。`
    } else {
      mismatch = '没有匹配记录：单条件都能查到，但叠加后没有同时满足的环次。'
    }
  }

  return { items, total, page, size, mismatch }
}

export function buildSeedRings(): EntryRow[] {
  const overLimits: Record<number, [number, number]> = {
    7: [52, -8],
    13: [-12, 54],
    18: [55, 18],
    20: [-58, -6],
  }
  return Array.from({ length: 24 }, (_, index) => {
    const no = index + 1
    const status = no <= 20 ? '已贯通' : no === 21 || no === 23 ? '掘进中' : '待掘进'
    const date = status === '待掘进' ? '' : status === '掘进中' ? '2026-10-05' : fallbackDate(no)
    const [horizontal, vertical] = overLimits[no] ?? [((no * 11) % 31) - 15, ((no * 7) % 27) - 13]
    return {
      id: no,
      status,
      pending: status === '待掘进' || status === '掘进中',
      abnormal: Boolean(overLimits[no]),
      '环号': no,
      '掘进日期': date,
      '起始里程': `K1+${String(120 + index * 18).padStart(3, '0')}.000`,
      '掘进速度': Number((31 + (index % 6) * 2 + (no % 5) * 0.4).toFixed(1)),
      '总推力': 10500 + (no % 7) * 350,
      '刀盘扭矩': 2400 + (no % 9) * 180,
      '出土方量': 46 + (no % 4),
      '水平偏差': horizontal,
      '垂直偏差': vertical,
      '掘进班组': fallbackCrew(no),
      '记录来源': no === 20 ? '贯通过程记录' : '正式掘进记录',
    }
  })
}
