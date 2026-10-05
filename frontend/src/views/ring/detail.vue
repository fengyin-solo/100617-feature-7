<template>
  <section class="page ring-detail">
    <header class="page-head">
      <div>
        <h2>掘进环第 {{ ringNo }} 环详情</h2>
        <p class="page-desc">本页读取掘进环次唯一台账，交接班可直接核对刀盘扭矩、出土方量与轴线超限情况。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="backLink">返回环次列表</RouterLink>
      </div>
    </header>

    <article v-if="ring" class="detail-panel">
      <div class="detail-grid">
        <div><span>环号</span><strong>{{ ring['环号'] }}</strong></div>
        <div><span>掘进日期</span><strong>{{ ring['掘进日期'] || '待安排' }}</strong></div>
        <div><span>起始里程</span><strong>{{ ring['起始里程'] }}</strong></div>
        <div><span>掘进速度</span><strong>{{ ring['掘进速度'] }} mm/min</strong></div>
        <div class="highlight"><span>刀盘扭矩</span><strong>{{ ring['刀盘扭矩'] }} kN·m</strong></div>
        <div class="highlight"><span>出土方量</span><strong>{{ ring['出土方量'] }} m³</strong></div>
        <div><span>总推力</span><strong>{{ ring['总推力'] }} kN</strong></div>
        <div><span>掘进班组</span><strong>{{ ring['掘进班组'] }}</strong></div>
        <div><span>环次进度</span><strong>{{ ring.status }}</strong></div>
        <div><span>记录来源</span><strong>{{ ring['记录来源'] }}</strong></div>
        <div><span>水平偏差</span><strong :class="{ warning: Math.abs(Number(ring['水平偏差'])) > RING_LIMIT_MM }">{{ ring['水平偏差'] }} mm</strong></div>
        <div><span>垂直偏差</span><strong :class="{ warning: Math.abs(Number(ring['垂直偏差'])) > RING_LIMIT_MM }">{{ ring['垂直偏差'] }} mm</strong></div>
      </div>
      <p v-if="overLimit" class="warning-box">该环已进入轴线偏差复核清单，复核口径为水平或垂直偏差绝对值大于 {{ RING_LIMIT_MM }} mm。</p>
    </article>

    <div v-else class="empty-state detail-missing">
      没有找到第 {{ ringNo }} 环。它可能尚未迁移补录，请返回列表核对环号区间。
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { getRingByNo } from '@/api/ring-service'
import { RING_LIMIT_MM, isOverLimitRing } from '@/data/ring-domain'

const route = useRoute()
const ringNo = Number(route.params.ringNo)
const ring = computed(() => getRingByNo(ringNo))
const overLimit = computed(() => Boolean(ring.value && isOverLimitRing(ring.value)))
const backQuery = computed(() => {
  const query = { ...route.query }
  delete query.from
  return query
})
const backLink = computed(() => ({
  name: route.query.from === 'shared' ? 'ring-shared' : 'ring',
  query: backQuery.value,
}))
</script>
