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

export type SortDirection = 'asc' | 'desc'

export type PageQuery = {
  page?: number
  size?: number
  sortBy?: string
  sortOrder?: SortDirection
  readonly?: boolean
  actor?: string
  actorCrew?: string
  actorRole?: string
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
  mismatch?: string
}

export type ActionResult = {
  ok: boolean
  message: string
  deduplicated?: boolean
  rejected?: boolean
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
