import { formatChainage } from './ring-domain'
import type { EntryRow } from './types'

// 掘进主线相关模块的演示数据：环号、里程、速度、偏差按真实形态生成。
// ring 是唯一事实源，axis / progress 的派生数字都由服务层实时算，这里只播种原始记录。

const CREW_OF_RING = ['掘进一班', '掘进一班', '掘进一班', '掘进一班', '掘进一班', '掘进一班',
  '掘进二班', '掘进二班', '掘进二班', '掘进二班', '掘进二班', '掘进二班',
  '掘进三班', '掘进三班', '掘进三班', '掘进三班', '掘进三班', '掘进三班',
  '掘进四班', '掘进四班', '掘进四班', '掘进四班', '掘进四班', '掘进四班']

// 第 7、16 环超 50mm 阈值，进轴线偏差复核清单；第 14 环偏差在阈值内且已完成纠偏。
const DEVIATIONS: Record<number, { h: number; v: number; status?: string }> = {
  7: { h: 62, v: -8, status: '超限' },
  14: { h: 18, v: 12, status: '已纠偏' },
  16: { h: -12, v: -58, status: '超限' },
}

function ringStatus(no: number): string {
  if (no <= 21) {
    return no === 14 ? '已纠偏' : '已贯通'
  }
  return no <= 23 ? '掘进中' : '待掘进'
}

function buildRingRows(): EntryRow[] {
  const rows: EntryRow[] = []
  for (let no = 1; no <= 24; no += 1) {
    const status = ringStatus(no)
    const chainageMeters = 10000 + (no - 1) * 1.5
    const legacy = no === 1 || no === 2
    const speed = status === '待掘进' ? '' : 38 + ((no * 7) % 19) + (no % 3) * 2
    // 从 2026-09-12 起逐环掘进；待掘进环还没日期。按 UTC 构造，避免月末跨月被时区拨回。
    const date = status === '待掘进' ? '' : new Date(Date.UTC(2026, 8, 11 + no)).toISOString().slice(0, 10)
    rows.push({
      id: no,
      status,
      pending: status !== '已纠偏' && status !== '已贯通',
      abnormal: false,
      环号: no,
      起始里程: formatChainage(chainageMeters),
      掘进日期: date,
      掘进速度: speed,
      总推力: 30200 + (no % 5) * 640,
      刀盘扭矩: 3900 + (no % 7) * 120,
      出土方量: 56 + (no % 4),
      掘进班组: CREW_OF_RING[no - 1],
      环次状态: status,
      ...(legacy
        ? {
            贯通过程记录速度: speed,
            贯通过程备注: '老贯通过程记录，迁移时已回填进掘进速度',
          }
        : {}),
    })
  }
  return rows
}

function axisStatus(no: number): string {
  return DEVIATIONS[no]?.status ?? '测量中'
}

function buildAxisRows(): EntryRow[] {
  const rows: EntryRow[] = []
  for (let no = 1; no <= 24; no += 1) {
    const dev = DEVIATIONS[no] ?? { h: ((no * 13) % 34) - 17, v: ((no * 11) % 28) - 14 }
    const status = no <= 21 ? axisStatus(no) : no <= 23 ? '测量中' : '待测量'
    rows.push({
      id: no,
      status,
      pending: status === '测量中' || status === '待测量',
      abnormal: status === '超限',
      测量编号: `AXIS-${String(no).padStart(4, '0')}`,
      对应环号: no,
      设计轴线: formatChainage(10000 + (no - 1) * 1.5),
      实测轴线: formatChainage(10000 + (no - 1) * 1.5 + dev.h / 1000),
      水平偏差: `${dev.h > 0 ? '+' : ''}${dev.h}mm`,
      垂直偏差: `${dev.v > 0 ? '+' : ''}${dev.v}mm`,
      纠偏措施: status === '已纠偏' ? '调整铰接油缸压力，复核已闭合' : status === '超限' ? '待复核：纳入轴线偏差复核清单' : '常规跟踪',
      测量状态: status,
    })
  }
  return rows
}

const CREW_SEED = [
  { id: 1, 编号: 'CREW-0001', 名称: '掘进一班', 班组长: '张建国', 人数: 18 },
  { id: 2, 编号: 'CREW-0002', 名称: '掘进二班', 班组长: '李海涛', 人数: 16 },
  { id: 3, 编号: 'CREW-0003', 名称: '掘进三班', 班组长: '王卫东', 人数: 17 },
  { id: 4, 编号: 'CREW-0004', 名称: '掘进四班', 班组长: '赵立军', 人数: 15 },
]

function buildCrewRows(): EntryRow[] {
  return CREW_SEED.map((item) => ({
    id: item.id,
    status: '在场',
    pending: true,
    abnormal: false,
    班组编号: item.编号,
    班组名称: item.名称,
    主要工种: '盾构掘进',
    班组长: item.班组长,
    进场人数: item.人数,
    安全交底日期: '2026-08-28',
    联系电话: `1380000${String(item.id).padStart(4, '0')}`,
    在场状态: '在场',
  }))
}

function buildProgressRows(): EntryRow[] {
  // 实际掘进量不手填：页面统一从 ring 台账按「已贯通/已纠偏」实时重算，这里只登记计划。
  const seed = [
    { id: 1, 编号: 'PROG-0001', 名称: '始发段掘进', 计划: 8, 计划完成日: '2026-09-10', 实际完成日: '2026-09-08', status: '已完成' },
    { id: 2, 编号: 'PROG-0002', 名称: '左线中段掘进', 计划: 12, 计划完成日: '2026-09-22', 实际完成日: '', status: '进行中' },
    { id: 3, 编号: 'PROG-0003', 名称: '接收段掘进', 计划: 6, 计划完成日: '2026-10-02', 实际完成日: '', status: '未开始' },
  ]
  return seed.map((item) => ({
    id: item.id,
    status: item.status,
    pending: item.status !== '已完成',
    abnormal: false,
    节点编号: item.编号,
    节点名称: item.名称,
    计划完成日: item.计划完成日,
    实际完成日: item.实际完成日,
    计划掘进量: item.计划,
    实际掘进量: '由掘进环次台账重算',
    偏差天数: item.status === '已完成' ? -2 : 0,
    节点状态: item.status,
  }))
}

export const BUSINESS_SEED: Record<string, EntryRow[]> = {
  ring: buildRingRows(),
  axis: buildAxisRows(),
  crew: buildCrewRows(),
  progress: buildProgressRows(),
}
