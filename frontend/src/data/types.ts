/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 掘进环次列表查询条件：环号区间、班组、状态叠加排序，全部可序列化进 URL。 */
export type RingQuery = {
  ringFrom: string
  ringTo: string
  crew: string
  progress: string
  sortBy: 'chainage' | 'speed' | 'ring'
  order: 'asc' | 'desc'
  page: number
}

/** 空结果时逐项回查用的诊断信息：哪一项把结果筛没了，一眼看出来。 */
export type RingQueryDiagnosis = {
  field: string
  label: string
  expected: string
  matched: number
}

export type RingPageResult = PageResult & {
  diagnosis: RingQueryDiagnosis[]
  activeConditionCount: number
}

/** 速度变更审计：谁、在什么时候、把哪一环改成了多少，重复提交只落一条。 */
export type SpeedAudit = {
  id: string
  ringId: number
  ringNo: string
  crew: string
  operator: string
  from: string
  to: string
  at: string
}

/** 班组 × 环次进度叠加表：全部由 ring 台账实时派生，进度台账不另存一份。 */
export type CrewProgressCell = {
  crew: string
  total: number
  byStatus: Record<string, number>
}

/** 会话身份：记录员带所属班组，共享入口只有只读身份。 */
export type SessionRole = 'recorder' | 'viewer'

export type SessionUser = {
  id: string
  name: string
  role: SessionRole
  crew: string
}
