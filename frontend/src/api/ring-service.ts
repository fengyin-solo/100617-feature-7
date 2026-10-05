import { saveRows, listRows } from '@/data/local-store'
import {
  RING_RECORDER_ROLE,
  canonicalRings,
  isOverLimitRing,
  parseNumber,
  queryRings,
  ringNumber,
  ringStats,
  type RingQuery,
  type RingStats,
} from '@/data/ring-domain'
import type { ActionResult, EntryRow, PageResult } from '@/data/types'

export type RingActor = {
  name: string
  crew: string
  role: string
  readonly: boolean
}

const RING_KEY = 'ring'
const IDEMPOTENCY_KEY = 'shield-tunnel-construction:ring-speed-requests'

function loadTokens(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  try {
    return JSON.parse(window.localStorage.getItem(IDEMPOTENCY_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function saveTokens(tokens: string[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(IDEMPOTENCY_KEY, JSON.stringify(tokens.slice(-200)))
  }
}

export function listRingPage(query: RingQuery): PageResult {
  return queryRings(listRows(RING_KEY), query)
}

export function getRingStats(): RingStats {
  return ringStats(listRows(RING_KEY))
}

export function getRingByNo(ringNo: number): EntryRow | undefined {
  return canonicalRings(listRows(RING_KEY)).find((row) => ringNumber(row) === ringNo)
}

export function listOverLimitReviews(): EntryRow[] {
  return canonicalRings(listRows(RING_KEY))
    .filter(isOverLimitRing)
    .map((row, index) => ({
      id: Number(row.id),
      status: '超限',
      pending: true,
      abnormal: true,
      '测量编号': `AX-R${String(ringNumber(row)).padStart(3, '0')}`,
      '对应环号': ringNumber(row),
      '掘进日期': row['掘进日期'],
      '掘进班组': row['掘进班组'],
      '设计轴线': row['起始里程'],
      '实测轴线': `水平 ${row['水平偏差']} mm / 垂直 ${row['垂直偏差']} mm`,
      '水平偏差': row['水平偏差'],
      '垂直偏差': row['垂直偏差'],
      '纠偏措施': '待轴线复核',
      '复核序号': index + 1,
    }))
}

export type RingProgressLedger = {
  total: number
  completed: number
  active: number
  pending: number
  crewRows: { crew: string; total: number; completed: number; active: number; pending: number; overLimit: number }[]
  items: EntryRow[]
}

export function getRingProgressLedger(): RingProgressLedger {
  const rings = canonicalRings(listRows(RING_KEY))
  const crewNames = [...new Set(rings.map((row) => String(row['掘进班组'])))]
  return {
    total: rings.length,
    completed: rings.filter((row) => row.status === '已贯通' || row.status === '已纠偏').length,
    active: rings.filter((row) => row.status === '掘进中').length,
    pending: rings.filter((row) => row.status === '待掘进').length,
    crewRows: crewNames.map((crew) => {
      const items = rings.filter((row) => String(row['掘进班组']) === crew)
      return {
        crew,
        total: items.length,
        completed: items.filter((row) => row.status === '已贯通' || row.status === '已纠偏').length,
        active: items.filter((row) => row.status === '掘进中').length,
        pending: items.filter((row) => row.status === '待掘进').length,
        overLimit: items.filter(isOverLimitRing).length,
      }
    }),
    items: rings,
  }
}

export function changeRingStatus(id: number, target: string, actor: RingActor): ActionResult {
  if (actor.readonly) {
    return { ok: false, message: '当前是全项目共享只读视图，不能提交环次状态改动。', rejected: true }
  }
  const rings = canonicalRings(listRows(RING_KEY))
  const targetRow = rings.find((row) => Number(row.id) === id)
  if (!targetRow) {
    return { ok: false, message: `没有找到编号为 ${id} 的掘进环`, rejected: true }
  }
  if (actor.role !== RING_RECORDER_ROLE || actor.crew !== targetRow['掘进班组']) {
    return {
      ok: false,
      message: `越权改动已拒绝：只有${targetRow['掘进班组']}的记录员能操作第 ${ringNumber(targetRow)} 环。`,
      rejected: true,
    }
  }
  if (targetRow.status === target) {
    return { ok: true, message: `第 ${ringNumber(targetRow)} 环已经是「${target}」，重复提交只保留一条。`, deduplicated: true }
  }  const next = rings.map((row) =>
    Number(row.id) === id
      ? {
          ...row,
          status: target,
          pending: target === '待掘进' || target === '掘进中',
          abnormal: target === '已纠偏' || isOverLimitRing(row),
        }
      : row,
  )
  saveRows(RING_KEY, next)
  return { ok: true, message: `第 ${ringNumber(targetRow)} 环已更新为「${target}」。` }
}

export function submitRingSpeed(id: number, rawSpeed: string, actor: RingActor): ActionResult {
  if (actor.readonly) {
    return { ok: false, message: '当前是全项目共享只读视图，不能改动掘进速度。', rejected: true }
  }

  const rings = canonicalRings(listRows(RING_KEY))
  const targetRow = rings.find((row) => Number(row.id) === id)
  if (!targetRow) {
    return { ok: false, message: `没有找到编号为 ${id} 的掘进环，原值「${rawSpeed}」已退回。`, rejected: true }
  }
  if (actor.role !== RING_RECORDER_ROLE || actor.crew !== targetRow['掘进班组']) {
    return {
      ok: false,
      message: `越权改动已拒绝：只有${targetRow['掘进班组']}的记录员能修改第 ${ringNumber(targetRow)} 环，提交值「${rawSpeed}」已原样退回。`,
      rejected: true,
    }
  }

  const speed = parseNumber(rawSpeed)
  if (speed === null || speed <= 0 || speed > 200) {
    return { ok: false, message: `掘进速度「${rawSpeed}」未通过校验，内容已原样退回。`, rejected: true }
  }

  const normalizedSpeed = Number(speed.toFixed(1))
  if (parseNumber(targetRow['掘进速度']) === normalizedSpeed) {
    return {
      ok: true,
      message: `第 ${ringNumber(targetRow)} 环掘进速度已是 ${normalizedSpeed} mm/min，重复提交不再落第二条。`,
      deduplicated: true,
    }
  }
  const token = JSON.stringify({ id, speed: normalizedSpeed, actor: actor.name, crew: actor.crew })
  const tokens = loadTokens()
  if (tokens.includes(token)) {
    return {
      ok: true,
      message: `第 ${ringNumber(targetRow)} 环的相同速度提交已受理过，重复点击不再落第二条。`,
      deduplicated: true,
    }
  }

  const next = rings.map((row) =>
    Number(row.id) === id ? { ...row, '掘进速度': normalizedSpeed } : row,
  )
  saveRows(RING_KEY, next)
  saveTokens([...tokens, token])
  return { ok: true, message: `第 ${ringNumber(targetRow)} 环掘进速度已记为 ${normalizedSpeed} mm/min。` }
}
