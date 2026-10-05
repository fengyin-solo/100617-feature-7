<template>
  <section class="page" data-module="progress">
    <header class="page-head">
      <div>
        <h2>环次进度台账</h2>
        <p class="page-desc">进度台账复用掘进环次唯一数据源，班组进度、超限复核与速度统计随环次记录联动重算。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="{ name: 'ring' }">打开掘进环次</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">环次总条数</span>
        <strong class="stat-value">{{ ledger.total }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已贯通</span>
        <strong class="stat-value">{{ ledger.completed }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">掘进中</span>
        <strong class="stat-value">{{ ledger.active }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待掘进</span>
        <strong class="stat-value">{{ ledger.pending }}</strong>
      </article>
    </div>

    <h3>掘进班组 × 环次进度叠加</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>掘进班组</th>
          <th>环次总数</th>
          <th>已贯通</th>
          <th>掘进中</th>
          <th>待掘进</th>
          <th>超限待复核</th>
          <th>完成率</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="crew in ledger.crewRows" :key="crew.crew">
          <td>{{ crew.crew }}</td>
          <td>{{ crew.total }}</td>
          <td>{{ crew.completed }}</td>
          <td>{{ crew.active }}</td>
          <td>{{ crew.pending }}</td>
          <td :class="{ warning: crew.overLimit > 0 }">{{ crew.overLimit }}</td>
          <td>{{ crew.total ? Math.round((crew.completed / crew.total) * 100) : 0 }}%</td>
        </tr>
      </tbody>
    </table>

    <h3>环次明细（与掘进环次列表同源）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>环号</th>
          <th>掘进日期</th>
          <th>起始里程</th>
          <th>掘进班组</th>
          <th>环次进度</th>
          <th>掘进速度</th>
          <th>记录来源</th>
          <th>详情</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in ledger.items" :key="String(row.id)">
          <td>{{ row['环号'] }}</td>
          <td>{{ row['掘进日期'] || '待安排' }}</td>
          <td>{{ row['起始里程'] }}</td>
          <td>{{ row['掘进班组'] }}</td>
          <td>{{ row.status }}</td>
          <td>{{ row['掘进速度'] }}</td>
          <td>{{ row['记录来源'] }}</td>
          <td><RouterLink class="link" :to="{ name: 'ring-detail', params: { ringNo: Number(row['环号']) } }">查看详情</RouterLink></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { getRingProgressLedger } from '@/api/ring-service'

const ledger = computed(() => getRingProgressLedger())
</script>
