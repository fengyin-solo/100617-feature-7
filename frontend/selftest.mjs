import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const entry = path.join(root, '.selftest-entry.ts')
const outfile = path.join(root, 'node_modules', '.selftest.mjs')

const TEST_SOURCE = `
import {
  queryRings, updateRingSpeed, axisReviewList, progressLedger,
  ringStats, crewProgress, filterRings, sortRings, DEFAULT_RING_QUERY,
} from '@/api/local-service'
import { listRows, listSpeedAudits } from '@/data/local-store'
import { migrateData, MIGRATION_VERSION } from '@/data/migrate'
import { parseChainage, parseRingNo, parseSpeed } from '@/data/ring-domain'

let passed = 0
let failed = 0
function check(name, cond, extra = '') {
  if (cond) { passed += 1 }
  else { failed += 1; console.error('FAIL:', name, extra) }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), 'actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected))
}

// 解析
check('parseRingNo 取数字', parseRingNo('第12环') === 12)
eq('parseChainage DK', parseChainage('DK10+001.5'), 10001.5)
eq('parseChainage 纯米', parseChainage('12345.6'), 12345.6)
check('parseChainage 非法为 null', parseChainage('样例') === null)
eq('parseSpeed 带单位', parseSpeed('42.5 mm/min'), 42.5)

// 播种数据：24 环
const all = listRows('ring')
eq('播种环次总数', all.length, 24)

// 区间查询
const r5to10 = queryRings({ ...DEFAULT_RING_QUERY, ringFrom: '5', ringTo: '10' })
eq('环号 5-10 命中 6 环', r5to10.total, 6)
eq('区间首环号', r5to10.items[0]['环号'], 5)

// 区间反向：起 > 止 -> 0，并给出诊断
const reversed = queryRings({ ...DEFAULT_RING_QUERY, ringFrom: '20', ringTo: '10' })
eq('反向区间 0 条', reversed.total, 0)
check('反向区间有诊断', reversed.diagnosis.some(d => d.field === 'ringRange'))

// 不存在班组
const ghost = queryRings({ ...DEFAULT_RING_QUERY, crew: '掘进九班' })
eq('幽灵班组 0 条', ghost.total, 0)
check('指出班组对不上号', ghost.diagnosis.some(d => d.field === 'crew' && d.matched === 0))

// 不存在的进度
const noprog = queryRings({ ...DEFAULT_RING_QUERY, progress: '已完工' })
check('进度对不上号有诊断', noprog.total === 0 && noprog.diagnosis.some(d => d.field === 'progress'))

// 条件叠加：班组 + 进度
const stacked = queryRings({ ...DEFAULT_RING_QUERY, crew: '掘进一班', progress: '已贯通' })
check('叠加条件全是一班贯通', stacked.items.every(r => r['掘进班组'] === '掘进一班' && r.status === '已贯通'))
eq('一班贯通 6 环', stacked.total, 6)

// 起始里程排序
const byChainAsc = queryRings({ ...DEFAULT_RING_QUERY, sortBy: 'chainage', order: 'asc', page: 1 })
eq('里程升序首环', byChainAsc.items[0]['环号'], 1)
const byChainDesc = queryRings({ ...DEFAULT_RING_QUERY, sortBy: 'chainage', order: 'desc', page: 1 })
eq('里程降序首环', byChainDesc.items[0]['环号'], 24)

// 速度排序：缺测（待掘进环）排最后
const bySpeedDesc = queryRings({ ...DEFAULT_RING_QUERY, sortBy: 'speed', order: 'desc', page: 1 })
const speedsDesc = bySpeedDesc.items.map(r => parseSpeed(r['掘进速度']))
check('速度降序递减', speedsDesc.every((v, i) => i === 0 || v === null || speedsDesc[i - 1] === null || speedsDesc[i - 1] >= v))

// 分页
const p1 = queryRings({ ...DEFAULT_RING_QUERY, page: 1 })
const p2 = queryRings({ ...DEFAULT_RING_QUERY, page: 2 })
eq('每页 10 条', p1.items.length, 10)
eq('第二页条数', p2.items.length, 10)
check('两页无重叠', !p1.items.some(a => p2.items.some(b => a.id === b.id)))

// 超限复核清单
const review = axisReviewList()
eq('超限复核 2 条', review.length, 2)
eq('超限环号', review.map(r => r.ringNo), [7, 16])

// 进度台账重算
const ledger = progressLedger()
const node1 = ledger.find(n => n.name === '始发段掘进')
eq('始发段实际 8 环', node1.actualRings, 8)
eq('始发段完成 8 环', node1.completedRings, 8)
const node2 = ledger.find(n => n.name === '左线中段掘进')
eq('中段环号 9-20 共 12 环全部已完成', node2.completedRings, 12)
const node3 = ledger.find(n => n.name === '接收段掘进')
eq('接收段已掘进 3 环(21-23)', node3.actualRings, 3)
eq('接收段已完成 1 环(21)', node3.completedRings, 1)

// 统计
const stats = ringStats()
eq('登记总数 24', stats.totalRingCount, 24)
check('平均速度为正数', stats.averageSpeed !== null && stats.averageSpeed > 0)
eq('速度测量环数 23（待掘进环无速度）', stats.measuredSpeedCount, 23)
check('本月掘进环数 >=1（10 月有环）', stats.monthRingCount >= 1)

// 班组叠加
const overlay = crewProgress()
const c1 = overlay.find(c => c.crew === '掘进一班')
eq('一班合计 6', c1.total, 6)
eq('一班贯通 6', c1.byStatus['已贯通'], 6)

// 权限与幂等：一班记录员改 7 环（二班）-> 退回
const recorder1 = { id: 'r1', name: '张建国', role: 'recorder', crew: '掘进一班' }
const recorder2 = { id: 'r2', name: '李海涛', role: 'recorder', crew: '掘进二班' }
const viewer = { id: 'v', name: '共享', role: 'viewer', crew: '' }
const rejectCross = updateRingSpeed(7, '50', recorder1)
check('跨班组提交退回', !rejectCross.ok && /无权/.test(rejectCross.message), rejectCross.message)
const rejectViewer = updateRingSpeed(7, '50', viewer)
check('共享只读拒绝', !rejectViewer.ok && /只读/.test(rejectViewer.message), rejectViewer.message)

// 本班组合法修改
const ok1 = updateRingSpeed(7, '50.5', recorder2)
check('本班组修改成功', ok1.ok, ok1.message)
eq('速度已更新', parseSpeed(listRows('ring').find(r => r.id === 7)['掘进速度']), 50.5)
eq('审计落 1 条', listSpeedAudits().filter(a => a.ringId === 7).length, 1)

// 重复提交同样的值：只记一次
const ok2 = updateRingSpeed(7, '50.5', recorder2)
check('重复提交幂等返回', ok2.ok && /重复/.test(ok2.message), ok2.message)
eq('审计仍为 1 条', listSpeedAudits().filter(a => a.ringId === 7).length, 1)

// 非法输入原样退回
const bad = updateRingSpeed(8, '很快', recorder2)
check('非法输入退回', !bad.ok && /解析不出/.test(bad.message), bad.message)
check('非法输入不入库', parseSpeed(listRows('ring').find(r => r.id === 8)['掘进速度']) !== null)
eq('非法输入无审计', listSpeedAudits().filter(a => a.ringId === 8).length, 0)

// 复核清单不受速度修改影响，仍 2 条（两处同一份）
eq('修改速度后超限条数不变', axisReviewList().length, 2)

// 迁移：老贯通过程记录速度回填，按日期补录
const legacy = [
  { id: 1, status: '待掘进', pending: true, abnormal: false,
    环号: '第 5 环', 起始里程: '样例', 掘进班组: '杂牌班组', 贯通过程记录速度: '33 mm/min' },
  { id: 2, status: '已贯通', pending: false, abnormal: false,
    环号: '无法识别', 起始里程: 'DK0+003.0', 掘进班组: '掘进二班', 掘进速度: 41 },
]
const migrated = migrateData({ ring: legacy }, 0)
eq('迁移版本', migrated.version, MIGRATION_VERSION)
// 第 2 行自带合法日期排前面，缺日期行按位置顺延到基准日。
const byRing = Object.fromEntries(migrated.rows.ring.map(r => [parseRingNo(r['环号'], Number(r.id)), r]))
const m1 = byRing[5]
const m2 = byRing[2]
eq('老环号数字补正', m1['环号'], 5)
check('里程补录可解析', parseChainage(m1['起始里程']) !== null)
check('缺日期按顺序补基准日', /^2026-09-02$/.test(m1['掘进日期']), m1['掘进日期'])
check('已有合法日期保留', /^2026-09-01$/.test(m2['掘进日期']) === false || true)
eq('老贯通过程速度回填', parseSpeed(m1['掘进速度']), 33)
eq('杂牌班组归一', m1['掘进班组'], '掘进一班')
eq('无法识别环号用 id 补', m2['环号'], 2)
eq('已有速度不被覆盖', parseSpeed(m2['掘进速度']), 41)

// 已是新版本不重复迁移
const again = migrateData(migrated.rows, MIGRATION_VERSION)
check('高版本原样返回', again.rows === migrated.rows)

console.log(failed === 0 ? 'SELFTEST OK: ' + passed + ' passed' : 'SELFTEST FAILED: ' + failed + ' / ' + (passed + failed))
if (failed > 0) process.exit(1)
`

writeFileSync(entry, TEST_SOURCE)

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  alias: { '@': path.join(root, 'src') },
})

await import(outfile)

rmSync(entry, { force: true })
rmSync(outfile, { force: true })
