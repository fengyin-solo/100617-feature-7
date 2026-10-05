<template>
  <section class="page" data-module="ring">
    <header class="page-head">
      <div>
        <h2>
          掘进环次管理
          <span v-if="shared" class="badge readonly">全项目共享 · 只读视图</span>
        </h2>
        <p class="page-desc">交接班按环号区间定位环次，支持起始里程与掘进速度排序；掘进班组与环次进度叠加查看。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出掘进环次清单</button>
        <RouterLink v-if="shared" class="btn primary" to="/ring">进入班组记录入口</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statsCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="applyFilters">
      <label class="filter-item range-item">
        <span>环号区间</span>
        <span class="range-inputs">
          <input v-model="draft.ringFrom" inputmode="numeric" placeholder="起始环号" />
          <em>至</em>
          <input v-model="draft.ringTo" inputmode="numeric" placeholder="结束环号" />
        </span>
      </label>
      <label class="filter-item">
        <span>掘进班组</span>
        <select v-model="draft.crew">
          <option value="">全部班组</option>
          <option v-for="crew in crewOptions" :key="crew" :value="crew">{{ crew }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>环次进度</span>
        <select v-model="draft.progress">
          <option value="">全部进度</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>排序</span>
        <select v-model="draft.sortBy">
          <option value="ring">按环号</option>
          <option value="chainage">按起始里程</option>
          <option value="speed">按掘进速度</option>
        </select>
      </label>
      <label class="filter-item">
        <span>方向</span>
        <select v-model="draft.order">
          <option value="asc">升序</option>
          <option value="desc">降序</option>
        </select>
      </label>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <section class="overlay-card">
      <h3 class="overlay-title">掘进班组 × 环次进度（随上方条件联动）</h3>
      <table class="data-table compact">
        <thead>
          <tr>
            <th>掘进班组</th>
            <th v-for="status in statuses" :key="status">{{ status }}</th>
            <th>合计</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cell in overlay" :key="cell.crew">
            <td>{{ cell.crew }}</td>
            <td v-for="status in statuses" :key="status">{{ cell.byStatus[status] ?? 0 }}</td>
            <td><strong>{{ cell.total }}</strong></td>
          </tr>
          <tr v-if="!overlay.length">
            <td :colspan="statuses.length + 2" class="empty-state">当前条件下没有班组环次</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-if="pageData.total === 0" class="no-result" role="alert">
      <p class="no-result-title">一条都没查到</p>
      <template v-if="pageData.diagnosis.length">
        <p>下列条件在全部 {{ totalCount }} 环里单独就匹配不上，对不上号的是：</p>
        <ul class="diagnosis-list">
          <li v-for="item in pageData.diagnosis" :key="item.field">
            <strong>{{ item.label }}</strong>：全表 0 环命中，请核对{{ item.field === 'crew' ? '班组名称' : item.field === 'progress' ? '环次进度' : '环号' }}
          </li>
        </ul>
      </template>
      <p v-else>台账里暂时没有任何掘进环。</p>
    </div>

    <table v-else class="data-table">
      <thead>
        <tr>
          <th>环号</th>
          <th>起始里程</th>
          <th>掘进日期</th>
          <th>掘进速度(mm/min)</th>
          <th>总推力(kN)</th>
          <th>刀盘扭矩(kN·m)</th>
          <th>出土方量(m³)</th>
          <th>掘进班组</th>
          <th>环次进度</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in pageData.items" :key="String(row.id)">
          <td>
            <RouterLink class="link" :to="detailLink(row)">{{ row['环号'] }}</RouterLink>
          </td>
          <td>{{ row['起始里程'] }}</td>
          <td>{{ row['掘进日期'] || '—' }}</td>
          <td>
            <span v-if="!canEdit(row)">{{ row['掘进速度'] === '' || row['掘进速度'] === undefined ? '缺测' : row['掘进速度'] }}</span>
            <span v-else class="speed-edit">
              <input
                v-model="speedDrafts[Number(row.id)]"
                inputmode="decimal"
                class="speed-input"
                aria-label="修改掘进速度"
                @keydown.enter.prevent="submitSpeed(row)"
              />
              <button class="link" type="button" @click="submitSpeed(row)">提交速度</button>
            </span>
          </td>
          <td>{{ row['总推力'] }}</td>
          <td>{{ row['刀盘扭矩'] }}</td>
          <td>{{ row['出土方量'] }}</td>
          <td>{{ row['掘进班组'] }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <RouterLink class="link" :to="detailLink(row)">看详情</RouterLink>
            <template v-if="canEdit(row)">
              <button v-for="action in actions" :key="action" class="link" type="button" @click="doAction(action, row)">
                {{ action }}
              </button>
            </template>
            <span v-else-if="!shared" class="muted-hint">非本班组·只读</span>
          </td>
        </tr>
      </tbody>
    </table>

    <nav v-if="pageData.total > 0" class="pager">
      <button class="btn" type="button" :disabled="query.page <= 1" @click="goPage(query.page - 1)">上一页</button>
      <span>第 {{ pageData.page }} / {{ pageCount }} 页</span>
      <button class="btn" type="button" :disabled="pageData.page >= pageCount" @click="goPage(query.page + 1)">下一页</button>
    </nav>

    <footer class="page-foot">
      <span>
        共 {{ pageData.total }} 条
        <template v-if="pageData.activeConditionCount > 0">（已叠加 {{ pageData.activeConditionCount }} 项条件，条件保存在地址栏，翻页/跳转后不丢）</template>
      </span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="okMessage" class="ok-text">{{ okMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  crewProgress,
  DEFAULT_RING_QUERY,
  downloadEntries,
  filterRings,
  moduleMeta,
  queryRings,
  ringStats,
  runRingAction,
  sortRings,
  updateRingSpeed,
} from '@/api/local-service'
import { listRows } from '@/data/local-store'
import { RING_CREWS, RING_STATUSES } from '@/data/ring-domain'
import type { EntryRow, RingPageResult, RingQuery } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('ring')
const route = useRoute()
const router = useRouter()
const session = useSessionStore()

// /ring/shared 是对全项目共享的只读入口；同一份取数，只在视图层关闭写操作。
const shared = computed(() => route.path === '/ring/shared')
const statuses = [...RING_STATUSES]
const crewOptions = [...RING_CREWS]
const actions = ['开始掘进', '确认完成', '申请纠偏']

const query = ref<RingQuery>({ ...DEFAULT_RING_QUERY })
const draft = reactive<RingQuery>({ ...DEFAULT_RING_QUERY })
const pageData = ref<RingPageResult>({
  items: [], total: 0, page: 1, size: 10, diagnosis: [], activeConditionCount: 0,
})
const totalCount = ref(0)
const speedDrafts = reactive<Record<number, string>>({})
const errorMessage = ref('')
const okMessage = ref('')

const stats = ringStats()
const statsCards = computed(() => [
  { label: '本月掘进环数', value: stats.monthRingCount },
  { label: '平均掘进速度(mm/min)', value: stats.averageSpeed ?? '缺测' },
  { label: '纠偏环数', value: stats.correctedRingCount },
  { label: '登记环次总数', value: stats.totalRingCount },
])

const pageCount = computed(() => Math.max(1, Math.ceil(pageData.value.total / pageData.value.size)))

// 叠加表跟列表同一批过滤+排序后的全量结果，不受分页截断，两处环次条数始终一致。
const overlay = computed(() => crewProgress(sortRings(filterRings(allRingRows(), query.value), query.value)))

function allRingRows(): EntryRow[] {
  return listRows('ring')
}

function canEdit(row: EntryRow): boolean {
  return !shared.value && session.canMutateRing(String(row['掘进班组'] ?? ''))
}

function detailLink(row: EntryRow) {
  return { path: shared.value ? `/ring/shared/detail/${row.id}` : `/ring/detail/${row.id}`, query: route.query }
}

// ---- 条件与 URL 双向绑定：换页、跳详情再回来，条件都在 ----
function readQueryFromUrl() {
  const q = route.query
  const next: RingQuery = {
    ringFrom: String(q.ringFrom ?? ''),
    ringTo: String(q.ringTo ?? ''),
    crew: String(q.crew ?? ''),
    progress: String(q.progress ?? ''),
    sortBy: q.sortBy === 'chainage' || q.sortBy === 'speed' ? q.sortBy : 'ring',
    order: q.order === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(q.page) || 1),
  }
  query.value = next
  Object.assign(draft, next)
}

function pushQueryToUrl() {
  const params: Record<string, string> = {}
  if (query.value.ringFrom) params.ringFrom = query.value.ringFrom
  if (query.value.ringTo) params.ringTo = query.value.ringTo
  if (query.value.crew) params.crew = query.value.crew
  if (query.value.progress) params.progress = query.value.progress
  if (query.value.sortBy !== 'ring') params.sortBy = query.value.sortBy
  if (query.value.order !== 'asc') params.order = query.value.order
  if (query.value.page > 1) params.page = String(query.value.page)
  router.replace({ path: route.path, query: params })
}

function reload() {
  errorMessage.value = ''
  pageData.value = queryRings(query.value)
  // URL 里页码超界时，服务层已钳制到末页；把地址栏同步回来，避免显示与地址不一致。
  if (pageData.value.page !== query.value.page) {
    query.value = { ...query.value, page: pageData.value.page }
    pushQueryToUrl()
  }
  totalCount.value = allRingRows().length
  for (const row of pageData.value.items) {
    if (speedDrafts[Number(row.id)] === undefined) {
      speedDrafts[Number(row.id)] = String(row['掘进速度'] ?? '')
    }
  }
}

function applyFilters() {
  query.value = { ...draft, page: 1 }
  pushQueryToUrl()
  reload()
}

function resetFilters() {
  query.value = { ...DEFAULT_RING_QUERY }
  Object.assign(draft, DEFAULT_RING_QUERY)
  pushQueryToUrl()
  reload()
}

function goPage(page: number) {
  query.value = { ...query.value, page }
  pushQueryToUrl()
  reload()
}

function submitSpeed(row: EntryRow) {
  okMessage.value = ''
  errorMessage.value = ''
  const input = speedDrafts[Number(row.id)] ?? ''
  const result = updateRingSpeed(Number(row.id), input, session.user)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  okMessage.value = result.message
  speedDrafts[Number(row.id)] = input.trim()
  reload()
}

function doAction(action: string, row: EntryRow) {
  okMessage.value = ''
  errorMessage.value = ''
  const result = runRingAction(Number(row.id), action, session.user)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  okMessage.value = result.message
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

watch(() => route.fullPath, () => {
  readQueryFromUrl()
  reload()
})

readQueryFromUrl()
reload()
</script>
