<template>
  <section class="page" data-module="ring">
    <header class="page-head">
      <div>
        <h2>掘进环次管理</h2>
        <p class="page-desc">环号区间、班组与环次进度叠加定位；支持按起始里程和掘进速度排序，定位后直达刀盘扭矩与出土方量详情。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="sharedLink">全项目共享只读视图</RouterLink>
        <button class="btn" type="button" @click="exportRows">导出掘进环次清单</button>
      </div>
    </header>

    <div v-if="readonly" class="readonly-banner">当前为全项目共享入口，只提供只读视图；任何掘进速度或状态提交均会被拒绝。</div>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar ring-filter" @submit.prevent="applyFilters">
      <label class="filter-item">
        <span>环号区间</span>
        <span class="range-inputs">
          <input v-model="ringStart" type="number" min="1" placeholder="起始环号" />
          <em>至</em>
          <input v-model="ringEnd" type="number" min="1" placeholder="截止环号" />
        </span>
      </label>
      <label class="filter-item">
        <span>掘进班组</span>
        <select v-model="crew">
          <option value="">全部班组</option>
          <option v-for="item in RING_CREWS" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>环次进度</span>
        <select v-model="progress">
          <option value="">全部进度</option>
          <option value="待掘进">待掘进</option>
          <option value="掘进中">掘进中</option>
          <option value="已贯通">已贯通</option>
        </select>
      </label>
      <label class="filter-item">
        <span>关键词</span>
        <input v-model="keyword" placeholder="里程/班组/来源" />
      </label>
      <label class="filter-item">
        <span>排序字段</span>
        <select v-model="sortBy">
          <option value="起始里程">起始里程</option>
          <option value="掘进速度">掘进速度</option>
          <option value="环号">环号</option>
        </select>
      </label>
      <label class="filter-item">
        <span>排序方向</span>
        <select v-model="sortOrder">
          <option value="asc">从小到大</option>
          <option value="desc">从大到小</option>
        </select>
      </label>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-if="!readonly" class="identity-strip">
      <span>当前提交身份</span>
      <input v-model="identity.name" placeholder="记录员姓名" />
      <select v-model="identity.crew">
        <option v-for="item in RING_CREWS" :key="item" :value="item">{{ item }}</option>
      </select>
      <select v-model="identity.role">
        <option :value="RING_RECORDER_ROLE">记录员</option>
        <option value="质检员">质检员</option>
      </select>
    </div>

    <p class="status-legend">
      <span v-for="item in progressSummary" :key="item.label" class="legend-item">
        {{ item.label }}：{{ item.count }}
      </span>
      <span class="legend-item warning">超限复核：{{ stats.overLimit }} 条（与轴线偏差清单一致）</span>
    </p>

    <table class="data-table">
      <thead>
        <tr>
          <th>环号</th>
          <th>掘进日期</th>
          <th>起始里程</th>
          <th>掘进速度 mm/min</th>
          <th>掘进班组 / 进度</th>
          <th>偏差复核</th>
          <th>详情</th>
          <th v-if="!readonly">本班组记录员操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td><strong>{{ row['环号'] }}</strong></td>
          <td>{{ row['掘进日期'] || '待安排' }}</td>
          <td>{{ row['起始里程'] }}</td>
          <td>
            <span>{{ row['掘进速度'] }}</span>
            <small v-if="row['记录来源'] === '贯通过程记录'">（贯通过程）</small>
          </td>
          <td>
            <div>{{ row['掘进班组'] }}</div>
            <span class="tag">{{ row.status }}</span>
          </td>
          <td>
            <span :class="{ warning: isOverLimitRing(row) }">
              {{ isOverLimitRing(row) ? `超限 ${Math.max(Math.abs(Number(row['水平偏差'])), Math.abs(Number(row['垂直偏差'])))}mm` : '未超限' }}
            </span>
          </td>
          <td><RouterLink class="link" :to="detailLink(Number(row['环号']))">查看详情</RouterLink></td>
          <td v-if="!readonly" class="ring-actions">
            <button class="btn small" type="button" @click="editSpeed(row)" :disabled="identity.role !== RING_RECORDER_ROLE || identity.crew !== row['掘进班组']">改速度</button>
            <button class="btn small" type="button" @click="setStatus(row, '掘进中')" :disabled="row.status === '掘进中' || identity.role !== RING_RECORDER_ROLE || identity.crew !== row['掘进班组']">开始掘进</button>
            <button class="btn small" type="button" @click="setStatus(row, '已贯通')" :disabled="row.status === '已贯通' || identity.role !== RING_RECORDER_ROLE || identity.crew !== row['掘进班组']">确认完成</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="readonly ? 7 : 8" class="empty-state">{{ mismatch || '暂无符合条件的掘进环次' }}</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <div class="pager">
        <button class="btn" type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <span>第 {{ page }} / {{ totalPages }} 页，共 {{ total }} 条</span>
        <button class="btn" type="button" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
      </div>
      <span>速度统计口径：{{ stats.speedSource }}</span>
      <span v-if="message" :class="messageOk ? 'success-text' : 'error-text'">{{ message }}</span>
    </footer>

    <div v-if="speedEditor.open" class="modal-mask" @click.self="speedEditor.open = false">
      <form class="modal-card" @submit.prevent="saveSpeed">
        <h3>修改第 {{ speedEditor.ringNo }} 环掘进速度</h3>
        <p>提交班组：{{ identity.crew }}；提交人：{{ identity.name || '未填写' }}</p>
        <label>
          掘进速度（mm/min）
          <input ref="speedInput" v-model="speedEditor.value" type="number" min="0.1" max="200" step="0.1" />
        </label>
        <p v-if="speedEditor.notice" class="error-text">{{ speedEditor.notice }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="speedEditor.open = false">取消</button>
          <button class="btn primary" type="submit">提交</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import {
  RING_CREWS,
  RING_PAGE_SIZE,
  RING_RECORDER_ROLE,
  isOverLimitRing,
  type RingQuery,
} from '@/data/ring-domain'
import {
  changeRingStatus,
  getRingStats,
  listRingPage,
  submitRingSpeed,
  type RingActor,
} from '@/api/ring-service'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const meta = moduleMeta('ring')
const readonly = computed(() => route.name === 'ring-shared')

const ringStart = ref('')
const ringEnd = ref('')
const crew = ref('')
const progress = ref('')
const keyword = ref('')
const sortBy = ref<RingQuery['sortBy']>('起始里程')
const sortOrder = ref<'asc' | 'desc'>('asc')
const page = ref(1)

const rows = ref<EntryRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const mismatch = ref('')
const message = ref('')
const messageOk = ref(false)
const speedInput = ref<HTMLInputElement | null>(null)
const speedEditor = reactive({ open: false, id: 0, ringNo: 0, value: '', notice: '' })
const identity = reactive({
  name: session.operator,
  crew: session.crew,
  role: session.role,
})

watch(
  () => ({ ...identity }),
  () => session.setIdentity(identity.name, identity.crew, identity.role),
)

const stats = computed(() => getRingStats())
const statCards = computed(() => [
  { label: '环次总条数', value: stats.value.total },
  { label: '已贯通', value: stats.value.completed },
  { label: '掘进中', value: stats.value.active },
  { label: '平均掘进速度', value: `${stats.value.averageSpeed} mm/min` },
  { label: '超限环数', value: stats.value.overLimit },
])

const progressSummary = computed(() => [
  { label: '待掘进', count: stats.value.pending },
  { label: '掘进中', count: stats.value.active },
  { label: '已贯通', count: stats.value.completed },
])

const sharedLink = computed(() => ({ name: 'ring-shared', query: route.query }))

function readRouteQuery() {
  const query = route.query
  ringStart.value = String(query.ringStart ?? '')
  ringEnd.value = String(query.ringEnd ?? '')
  crew.value = String(query.crew ?? '')
  progress.value = String(query.progress ?? '')
  keyword.value = String(query.keyword ?? '')
  sortBy.value = query.sortBy === '掘进速度' || query.sortBy === '环号' ? query.sortBy : '起始里程'
  sortOrder.value = query.sortOrder === 'desc' ? 'desc' : 'asc'
  page.value = Math.max(1, Number(query.page ?? 1))
}

function queryPayload(): RingQuery {
  return {
    ringStart: ringStart.value,
    ringEnd: ringEnd.value,
    crew: crew.value,
    progress: progress.value,
    keyword: keyword.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    page: page.value,
    size: RING_PAGE_SIZE,
  }
}

function reload() {
  const result = listRingPage(queryPayload())
  rows.value = result.items
  total.value = result.total
  page.value = result.page
  totalPages.value = Math.max(1, Math.ceil(result.total / result.size))
  mismatch.value = result.mismatch ?? ''
}

function pushRoute(resetPage = false) {
  const nextPage = resetPage ? 1 : page.value
  const query: Record<string, string> = {}
  const values: Record<string, string> = {
    ringStart: ringStart.value.trim(),
    ringEnd: ringEnd.value.trim(),
    crew: crew.value,
    progress: progress.value,
    keyword: keyword.value.trim(),
    sortBy: sortBy.value ?? '',
    sortOrder: sortOrder.value === 'desc' ? 'desc' : '',
    page: nextPage > 1 ? String(nextPage) : '',
  }
  for (const [key, value] of Object.entries(values)) {
    if (value) query[key] = value
  }
  router.push({ name: readonly.value ? 'ring-shared' : 'ring', query })
}

function applyFilters() {
  page.value = 1
  pushRoute(true)
}

function resetFilters() {
  Object.assign(ringStart, { value: '' })
  ringEnd.value = ''
  crew.value = ''
  progress.value = ''
  keyword.value = ''
  sortBy.value = '起始里程'
  sortOrder.value = 'asc'
  page.value = 1
  pushRoute(true)
}

function goPage(target: number) {
  page.value = target
  pushRoute()
}

function actor(): RingActor {
  return {
    name: identity.name,
    crew: identity.crew,
    role: identity.role,
    readonly: readonly.value,
  }
}

function showResult(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
  reload()
}

function editSpeed(row: EntryRow) {
  speedEditor.open = true
  speedEditor.id = Number(row.id)
  speedEditor.ringNo = Number(row['环号'])
  speedEditor.value = String(row['掘进速度'])
  speedEditor.notice = ''
  window.setTimeout(() => speedInput.value?.focus(), 0)
}

function saveSpeed() {
  const original = speedEditor.value
  const result = submitRingSpeed(speedEditor.id, original, actor())
  if (!result.ok) {
    speedEditor.notice = result.message
    speedEditor.value = original
    return
  }
  speedEditor.open = false
  showResult(true, result.message)
}

function setStatus(row: EntryRow, target: string) {
  const result = changeRingStatus(Number(row.id), target, actor())
  showResult(result.ok, result.message)
}

function detailLink(ringNo: number) {
  return {
    name: 'ring-detail',
    params: { ringNo },
    query: { from: readonly.value ? 'shared' : 'manage', ...route.query },
  }
}

function exportRows() {
  downloadEntries(meta.key)
}

watch(() => route.fullPath, () => {
  readRouteQuery()
  reload()
})

onBeforeRouteUpdate(() => {
  readRouteQuery()
  reload()
})

readRouteQuery()
reload()
</script>
