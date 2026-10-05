<template>
  <section class="page" data-module="axis">
    <header class="page-head">
      <div>
        <h2>轴线偏差管理</h2>
        <p class="page-desc">超限环次进入复核清单；清单与掘进环次详情取同一份数据，超限条数两处一致。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出轴线偏差清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待测量环数</span>
        <strong class="stat-value">{{ pendingCount }}</strong>
      </article>
      <article class="stat-card alert" :class="{ focus: reviewItems.length > 0 }">
        <span class="stat-label">复核清单超限环数</span>
        <strong class="stat-value">{{ reviewItems.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">平均水平偏差(mm)</span>
        <strong class="stat-value">{{ averageDeviation }}</strong>
      </article>
    </div>

    <section class="overlay-card">
      <h3 class="overlay-title">超限复核清单（判定口径：{{ limitLabel }}）</h3>
      <table v-if="reviewItems.length" class="data-table compact">
        <thead>
          <tr><th>环号</th><th>偏差情况</th><th>测量状态</th><th>环次进度</th><th>复核/纠偏措施</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in reviewItems" :key="item.id">
            <td>
              <RouterLink class="link" :to="`/ring/detail/${findRingId(item.ringNo)}`">第 {{ item.ringNo }} 环</RouterLink>
            </td>
            <td>{{ item.deviation }}</td>
            <td>{{ item.status }}</td>
            <td>{{ item.ringStatus }}</td>
            <td>{{ item.measure }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted-hint">当前没有超 {{ limitLabel }} 的环次。</p>
    </section>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-over-limit': isOver(row) }">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无轴线偏差数据</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条轴线偏差记录，其中复核清单 {{ reviewItems.length }} 条</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  axisLimitLabel,
  axisReviewList,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listRows } from '@/data/local-store'
import { isAxisOverLimit, parseDeviationMm, parseRingNo } from '@/data/ring-domain'
import type { AxisReviewItem } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('axis')
const columns = ['测量编号', '对应环号', '设计轴线', '实测轴线', '水平偏差', '垂直偏差', '纠偏措施', '测量状态']
const actions = ['提交测量', '执行纠偏', '标记超限']
const filterFields = columns.slice(0, 3)

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})

const reviewItems = ref<AxisReviewItem[]>([])
const limitLabel = axisLimitLabel()

const pendingCount = computed(
  () => listRows('axis').filter((row) => row.pending).length,
)
const averageDeviation = computed(() => {
  const values = listRows('axis')
    .map((row) => parseDeviationMm(row['水平偏差']))
    .filter((value): value is number => value !== null)
  if (!values.length) {
    return '缺测'
  }
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
})

function isOver(row: EntryRow): boolean {
  return isAxisOverLimit(row)
}

function findRingId(ringNo: number): number {
  return listRows('ring').find((row) => parseRingNo(row['环号'], Number(row.id)) === ringNo)?.id ?? ringNo
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    reviewItems.value = axisReviewList()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '轴线偏差列表读取失败'
  }
}

onMounted(reload)
</script>
