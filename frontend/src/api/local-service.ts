import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  appendSpeedAudits,
  listRows,
  listSpeedAudits,
  resetRows,
  saveRows,
} from '@/data/local-store'
import {
  AXIS_LIMIT_MM,
  RING_STATUSES,
  deviationSummary,
  isAxisOverLimit,
  parseChainage,
  parseRingNo,
  parseSpeed,
} from '@/data/ring-domain'
import type {
  ActionResult,
  CrewProgressCell,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
  RingPageResult,
  RingQuery,
  RingQueryDiagnosis,
  SessionUser,
  SpeedAudit,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export const PAGE_SIZE = 10

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// ---------------------------------------------------------------------------
// 掘进环次：唯一事实源。查询、统计、复核清单、进度台账重算全部从 ring 表取数。
// ---------------------------------------------------------------------------

export const DEFAULT_RING_QUERY: RingQuery = {
  ringFrom: '',
  ringTo: '',
  crew: '',
  progress: '',
  sortBy: 'ring',
  order: 'asc',
  page: 1,
}

function withinRange(value: number, from: number | null, to: number | null): boolean {
  return (from === null || value >= from) && (to === null || value <= to)
}

/** 环号区间 + 班组 + 环次进度的叠加过滤，条件之间是「与」。 */
export function filterRings(rows: EntryRow[], query: RingQuery): EntryRow[] {
  const from = query.ringFrom.trim() === '' ? null : Number(query.ringFrom)
  const to = query.ringTo.trim() === '' ? null : Number(query.ringTo)
  return rows.filter((row) => {
    const ringNo = parseRingNo(row['环号'], Number(row.id))
    if (!withinRange(ringNo, from, to)) {
      return false
    }
    if (query.crew !== '' && String(row['掘进班组'] ?? '') !== query.crew) {
      return false
    }
    if (query.progress !== '' && String(row.status) !== query.progress) {
      return false
    }
    return true
  })
}

/** 按起始里程或掘进速度排序；解析不出数值的统一排到最后，升降序都不插队。 */
export function sortRings(rows: EntryRow[], query: RingQuery): EntryRow[] {
  const direction = query.order === 'desc' ? -1 : 1
  const valueOf = (row: EntryRow): number => {
    if (query.sortBy === 'chainage') {
      return parseChainage(row['起始里程']) ?? Number.POSITIVE_INFINITY
    }
    if (query.sortBy === 'speed') {
      return parseSpeed(row['掘进速度']) ?? Number.NEGATIVE_INFINITY
    }
    return parseRingNo(row['环号'], Number(row.id))
  }
  return [...rows].sort((a, b) => {
    const va = valueOf(a)
    const vb = valueOf(b)
    // 缺测值恒定排最后，不受升降序影响。
    if (!Number.isFinite(va) && !Number.isFinite(vb)) {
      return 0
    }
    if (!Number.isFinite(va)) {
      return 1
    }
    if (!Number.isFinite(vb)) {
      return -1
    }
    if (va === vb) {
      return parseRingNo(a['环号'], Number(a.id)) - parseRingNo(b['环号'], Number(b.id))
    }
    return (va - vb) * direction
  })
}

/**
 * 空结果逐项回查：哪一项条件在全量里就一条都匹配不上，就指出哪一项。
 * 只对「过滤类」条件做诊断，排序与分页不会把结果筛没。
 */
export function diagnoseRingQuery(rows: EntryRow[], query: RingQuery): RingQueryDiagnosis[] {
  const diagnosis: RingQueryDiagnosis[] = []
  const from = query.ringFrom.trim() === '' ? null : Number(query.ringFrom)
  const to = query.ringTo.trim() === '' ? null : Number(query.ringTo)
  if (from !== null && to !== null && from > to) {
    diagnosis.push({
      field: 'ringRange',
      label: `环号区间填反了（${from} ～ ${to}）`,
      expected: `${query.ringFrom.trim()}-${query.ringTo.trim()}`,
      matched: 0,
    })
  }
  if (from !== null) {
    diagnosis.push({
      field: 'ringFrom',
      label: `环号 ≥ ${query.ringFrom.trim()}`,
      expected: query.ringFrom.trim(),
      matched: rows.filter((row) => parseRingNo(row['环号'], Number(row.id)) >= from).length,
    })
  }
  if (to !== null) {
    diagnosis.push({
      field: 'ringTo',
      label: `环号 ≤ ${query.ringTo.trim()}`,
      expected: query.ringTo.trim(),
      matched: rows.filter((row) => parseRingNo(row['环号'], Number(row.id)) <= to).length,
    })
  }
  if (query.crew !== '') {
    diagnosis.push({
      field: 'crew',
      label: `掘进班组 = ${query.crew}`,
      expected: query.crew,
      matched: rows.filter((row) => String(row['掘进班组'] ?? '') === query.crew).length,
    })
  }
  if (query.progress !== '') {
    diagnosis.push({
      field: 'progress',
      label: `环次进度 = ${query.progress}`,
      expected: query.progress,
      matched: rows.filter((row) => String(row.status) === query.progress).length,
    })
  }
  return diagnosis.filter((item) => item.matched === 0)
}

export function activeConditionCount(query: RingQuery): number {
  return [
    query.ringFrom.trim() !== '',
    query.ringTo.trim() !== '',
    query.crew !== '',
    query.progress !== '',
  ].filter(Boolean).length
}

/** 环次列表主查询：过滤 → 排序 → 分页，全项目只此一个取数口径。 */
export function queryRings(query: RingQuery): RingPageResult {
  const all = listRows('ring')
  const filtered = filterRings(all, query)
  const sorted = sortRings(filtered, query)
  const total = sorted.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, query.page), pageCount)
  const start = (page - 1) * PAGE_SIZE
  const diagnosis = total === 0 ? diagnoseRingQuery(all, query) : []
  return {
    items: sorted.slice(start, start + PAGE_SIZE),
    total,
    page,
    size: PAGE_SIZE,
    diagnosis,
    activeConditionCount: activeConditionCount(query),
  }
}

export function getRing(id: number): EntryRow | null {
  return listRows('ring').find((row) => Number(row.id) === id) ?? null
}

function currentMonthPrefix(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`
}

/**
 * 速度统计口径（已与业务确认，全项目按这一份算）：
 * 只统计 ring 台账「掘进速度」里能解析成正数的环；待掘进（无速度）不参与，
 * 老贯通过程记录里的速度只在迁移时回填一次，统计阶段不再二次读取。
 */
export type RingStats = {
  monthRingCount: number
  averageSpeed: number | null
  correctedRingCount: number
  totalRingCount: number
  measuredSpeedCount: number
}

export function ringStats(): RingStats {
  const rows = listRows('ring')
  const monthPrefix = currentMonthPrefix()
  const excavated = rows.filter((row) => String(row.status) !== '待掘进')
  const speeds = excavated
    .map((row) => parseSpeed(row['掘进速度']))
    .filter((value): value is number => value !== null)
  const averageSpeed =
    speeds.length === 0 ? null : Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
  return {
    monthRingCount: excavated.filter((row) => String(row['掘进日期'] ?? '').startsWith(monthPrefix)).length,
    averageSpeed,
    correctedRingCount: rows.filter((row) => String(row.status) === '已纠偏').length,
    totalRingCount: rows.length,
    measuredSpeedCount: speeds.length,
  }
}

/** 掘进班组 × 环次进度叠加表，可对全量也可对某次查询结果算，计数实时派生。 */
export function crewProgress(rows: EntryRow[] = listRows('ring')): CrewProgressCell[] {
  const crews = new Set<string>()
  for (const row of rows) {
    crews.add(String(row['掘进班组'] ?? '未分配班组'))
  }
  return [...crews].sort().map((crew) => {
    const crewRows = rows.filter((row) => String(row['掘进班组'] ?? '未分配班组') === crew)
    const byStatus: Record<string, number> = {}
    for (const status of RING_STATUSES) {
      byStatus[status] = crewRows.filter((row) => String(row.status) === status).length
    }
    return { crew, total: crewRows.length, byStatus }
  })
}

/**
 * 掘进速度修改：权限、幂等、退回全部在服务层收口。
 * - 共享只读身份：一律拒绝；
 * - 非本掘进班组记录员：提交一律退回（越权改动拦下）；
 * - 速度解析不成正数：原样退回，不入库；
 * - 与台账现值相同：视为重复提交，不再落审计（点两回只记一条）。
 */
export function updateRingSpeed(ringId: number, rawInput: string, user: SessionUser): ActionResult {
  if (user.role !== 'recorder') {
    return { ok: false, message: '当前是全项目共享只读视图，掘进速度不能在此修改' }
  }
  const rows = listRows('ring')
  const index = rows.findIndex((row) => Number(row.id) === ringId)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${ringId} 的掘进环` }
  }
  const target = rows[index]
  const crew = String(target['掘进班组'] ?? '')
  if (user.crew !== crew) {
    return {
      ok: false,
      message: `第 ${parseRingNo(target['环号'], ringId)} 环归属${crew}，${user.crew}记录员无权修改，提交已退回`,
    }
  }
  const input = rawInput.trim()
  const speed = parseSpeed(input)
  if (speed === null) {
    return { ok: false, message: `「${input}」解析不出有效掘进速度，原样退回，未写入台账` }
  }
  const current = parseSpeed(target['掘进速度'])
  if (current === speed) {
    return { ok: true, message: `掘进速度已是 ${speed} mm/min，重复提交未重复落账` }
  }
  const fromText = current === null ? '缺测' : String(current)
  const updated: EntryRow = { ...target, 掘进速度: speed }
  const next = [...rows]
  next[index] = updated
  saveRows('ring', next)
  const audit: SpeedAudit = {
    id: `speed-${ringId}-${Date.now()}`,
    ringId,
    ringNo: String(parseRingNo(updated['环号'], ringId)),
    crew,
    operator: user.name,
    from: fromText,
    to: String(speed),
    at: new Date().toISOString(),
  }
  appendSpeedAudits([audit])
  return { ok: true, message: `第 ${audit.ringNo} 环掘进速度已由 ${fromText} 改为 ${speed} mm/min` }
}

export function speedAuditsOfRing(ringId: number): SpeedAudit[] {
  return listSpeedAudits()
    .filter((item) => item.ringId === ringId)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
}

/**
 * 环次状态动作同样收口：共享只读身份与非本班组记录员的提交一律退回，
 * 页面即使漏藏按钮，服务层也会拦下越权改动。
 */
export function runRingAction(ringId: number, action: string, user: SessionUser): ActionResult {
  if (user.role !== 'recorder') {
    return { ok: false, message: '当前是全项目共享只读视图，状态流转不能在此提交' }
  }
  const target = getRing(ringId)
  if (!target) {
    return { ok: false, message: `没有找到编号为 ${ringId} 的掘进环` }
  }
  const crew = String(target['掘进班组'] ?? '')
  if (user.crew !== crew) {
    return {
      ok: false,
      message: `第 ${parseRingNo(target['环号'], ringId)} 环归属${crew}，${user.crew}记录员的提交已退回`,
    }
  }
  return runAction('ring', ringId, action)
}

/**
 * 轴线偏差复核清单：直接从 axis 台账按统一阈值（水平/垂直偏差任一绝对值 > 50mm）派生，
 * 不另建一张表，所以环次页面与轴线页面两处读到的超限条数必然对得上。
 */
export type AxisReviewItem = {
  id: number
  ringNo: number
  status: string
  deviation: string
  measure: string
  ringStatus: string
}

export function axisReviewList(): AxisReviewItem[] {
  const rings = listRows('ring')
  return listRows('axis')
    .filter((row) => isAxisOverLimit(row))
    .map((row) => {
      const ringNo = parseRingNo(row['对应环号'], Number(row.id))
      const ring = rings.find((item) => parseRingNo(item['环号'], Number(item.id)) === ringNo)
      return {
        id: Number(row.id),
        ringNo,
        status: String(row.status),
        deviation: deviationSummary(row),
        measure: String(row['纠偏措施'] ?? '待安排复核'),
        ringStatus: ring ? String(ring.status) : '环次台账缺环',
      }
    })
    .sort((a, b) => a.ringNo - b.ringNo)
}

export function axisLimitLabel(): string {
  return `水平/垂直偏差绝对值 > ${AXIS_LIMIT_MM}mm`
}

/**
 * 进度节点台账重算：实际掘进量不在 progress 表里另存，
 * 每次读取都按节点环号区间从 ring 唯一事实源实时算，环次一变这里跟着变。
 */
export type ProgressLedgerRow = {
  id: number
  name: string
  planRings: number
  actualRings: number
  completedRings: number
  delta: number
  planDate: string
  actualDate: string
  status: string
}

// 节点按计划环数依次切分主线环号区间，避免在 progress 表里再写一份环号。
const NODE_RANGES: { name: string; from: number; to: number }[] = [
  { name: '始发段掘进', from: 1, to: 8 },
  { name: '左线中段掘进', from: 9, to: 20 },
  { name: '接收段掘进', from: 21, to: 26 },
]

const DONE_STATUSES = new Set(['已贯通', '已纠偏'])

export function progressLedger(): ProgressLedgerRow[] {
  const rings = listRows('ring')
  return listRows('progress').map((node) => {
    const name = String(node['节点名称'])
    const range = NODE_RANGES.find((item) => item.name === name)
    const scoped = range
      ? rings.filter((row) => {
          const no = parseRingNo(row['环号'], Number(row.id))
          return no >= range.from && no <= range.to
        })
      : // 新增节点还没登记区间时回退到全量，保证台账页不白屏。
        rings
    const actualRings = scoped.filter((row) => String(row.status) !== '待掘进').length
    const completedRings = scoped.filter((row) => DONE_STATUSES.has(String(row.status))).length
    const planRings = Number(node['计划掘进量']) || 0
    return {
      id: Number(node.id),
      name,
      planRings,
      actualRings,
      completedRings,
      delta: actualRings - planRings,
      planDate: String(node['计划完成日'] ?? ''),
      actualDate: String(node['实际完成日'] ?? ''),
      status: String(node.status),
    }
  })
}
