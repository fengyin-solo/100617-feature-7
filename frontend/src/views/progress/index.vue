<template>
  <section class="page" data-module="progress">
    <header class="page-head">
      <div>
        <h2>进度节点管理</h2>
        <p class="page-desc">实际掘进量不单独登记，统一从掘进环次台账按节点环号区间实时重算，环次一变这里跟着变。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="reload">重新重算</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statsCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value" :class="{ 'warn-text': item.warn }">{{ item.value }}</strong>
      </article>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>节点名称</th>
          <th>计划掘进量(环)</th>
          <th>实际已掘进(环)</th>
          <th>其中已完成(环)</th>
          <th>偏差(环)</th>
          <th>计划完成日</th>
          <th>实际完成日</th>
          <th>节点状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ledger" :key="row.id">
          <td>{{ row.name }}</td>
          <td>{{ row.planRings }}</td>
          <td><strong>{{ row.actualRings }}</strong></td>
          <td>{{ row.completedRings }}</td>
          <td :class="row.delta < 0 ? 'error-text' : 'ok-text'">
            {{ row.delta > 0 ? `+${row.delta}` : row.delta }}
          </td>
          <td>{{ row.planDate }}</td>
          <td>{{ row.actualDate || '—' }}</td>
          <td>{{ row.status }}</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>实际掘进量 / 完成环数实时取自掘进环次台账（两处入口同一份），不在本台账重复登记。</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { progressLedger } from '@/api/local-service'
import type { ProgressLedgerRow } from '@/api/local-service'

const ledger = ref<ProgressLedgerRow[]>([])
const errorMessage = ref('')

const statsCards = computed(() => {
  const plan = ledger.value.reduce((sum, item) => sum + item.planRings, 0)
  const actual = ledger.value.reduce((sum, item) => sum + item.actualRings, 0)
  const done = ledger.value.reduce((sum, item) => sum + item.completedRings, 0)
  return [
    { label: '计划掘进总量(环)', value: plan, warn: false },
    { label: '实际已掘进(环，台账重算)', value: actual, warn: false },
    { label: '已贯通/纠偏完成(环)', value: done, warn: false },
    { label: '计划偏差(环)', value: actual - plan, warn: actual - plan < 0 },
  ]
})

function reload() {
  errorMessage.value = ''
  try {
    ledger.value = progressLedger()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '进度台账重算失败'
  }
}

onMounted(reload)
</script>
