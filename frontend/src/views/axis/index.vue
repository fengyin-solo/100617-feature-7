<template>
  <section class="page" data-module="axis">
    <header class="page-head">
      <div>
        <h2>轴线偏差复核清单</h2>
        <p class="page-desc">复核清单不另存台账，直接从掘进环次投影；这里的超限条数与掘进环次页面实时一致。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="{ name: 'ring' }">返回掘进环次台账</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">超限环次（掘进环次口径）</span>
        <strong class="stat-value">{{ reviews.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">本页复核清单条数</span>
        <strong class="stat-value">{{ reviews.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">复核阈值</span>
        <strong class="stat-value">水平/垂直 &gt; {{ RING_LIMIT_MM }} mm</strong>
      </article>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>复核序号</th>
          <th>测量编号</th>
          <th>对应环号</th>
          <th>掘进日期</th>
          <th>掘进班组</th>
          <th>设计轴线</th>
          <th>水平偏差</th>
          <th>垂直偏差</th>
          <th>复核状态</th>
          <th>环次详情</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in reviews" :key="String(row.id)">
          <td>{{ row['复核序号'] }}</td>
          <td>{{ row['测量编号'] }}</td>
          <td>{{ row['对应环号'] }}</td>
          <td>{{ row['掘进日期'] || '待安排' }}</td>
          <td>{{ row['掘进班组'] }}</td>
          <td>{{ row['设计轴线'] }}</td>
          <td class="warning">{{ row['水平偏差'] }} mm</td>
          <td class="warning">{{ row['垂直偏差'] }} mm</td>
          <td><span class="tag danger">超限待复核</span></td>
          <td><RouterLink class="link" :to="{ name: 'ring-detail', params: { ringNo: Number(row['对应环号']) } }">查看环次</RouterLink></td>
        </tr>
        <tr v-if="!reviews.length">
          <td colspan="10" class="empty-state">暂无超限环次；两处台账当前均为 0 条。</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>唯一事实源：掘进环次台账；本页只读，不能绕过班组记录员改数据。</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { listOverLimitReviews } from '@/api/ring-service'
import { RING_LIMIT_MM } from '@/data/ring-domain'

const reviews = computed(() => listOverLimitReviews())
</script>
