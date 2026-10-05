<template>
  <section class="page" data-module="ring-detail">
    <header class="page-head">
      <div>
        <h2>
          掘进环详情 · 第 {{ ringNo }} 环
          <span v-if="shared" class="badge readonly">全项目共享 · 只读视图</span>
        </h2>
        <p class="page-desc">交接班定位到本环节点，直接核对刀盘扭矩、出土方量与速度修改记录。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="backLink">返回环次列表（保留查询条件）</RouterLink>
      </div>
    </header>

    <div v-if="!ring" class="no-result" role="alert">
      <p class="no-result-title">找不到这一环</p>
      <p>编号 {{ ringId }} 在掘进环次台账里不存在，可能环号有误或该环尚未登记。</p>
      <RouterLink class="btn primary" :to="shared ? '/ring/shared' : '/ring'">回到列表</RouterLink>
    </div>

    <template v-else>
      <div v-if="overLimit" class="alert-banner">
        本环轴线偏差超限（{{ overLimitInfo }}），已写入「轴线偏差」复核清单，两处超限条数一致。
      </div>

      <div class="detail-grid">
        <article class="detail-card focus">
          <span class="stat-label">刀盘扭矩</span>
          <strong class="stat-value">{{ ring['刀盘扭矩'] ?? '缺测' }}</strong>
          <span class="card-unit">kN·m</span>
        </article>
        <article class="detail-card focus">
          <span class="stat-label">出土方量</span>
          <strong class="stat-value">{{ ring['出土方量'] ?? '缺测' }}</strong>
          <span class="card-unit">m³</span>
        </article>
        <article class="detail-card">
          <span class="stat-label">掘进速度</span>
          <strong class="stat-value">{{ ring['掘进速度'] === '' || ring['掘进速度'] === undefined ? '缺测' : ring['掘进速度'] }}</strong>
          <span class="card-unit">mm/min</span>
        </article>
        <article class="detail-card">
          <span class="stat-label">总推力</span>
          <strong class="stat-value">{{ ring['总推力'] ?? '缺测' }}</strong>
          <span class="card-unit">kN</span>
        </article>
      </div>

      <table class="data-table detail-table">
        <tbody>
          <tr v-for="field in meta.fields" :key="field">
            <th>{{ field }}</th>
            <td>{{ ring[field] === '' || ring[field] === undefined ? '—' : ring[field] }}</td>
          </tr>
        </tbody>
      </table>

      <section class="overlay-card">
        <h3 class="overlay-title">掘进速度修改记录</h3>
        <table v-if="audits.length" class="data-table compact">
          <thead>
            <tr><th>提交人</th><th>班组</th><th>原值</th><th>新值(mm/min)</th><th>提交时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in audits" :key="item.id">
              <td>{{ item.operator }}</td>
              <td>{{ item.crew }}</td>
              <td>{{ item.from }}</td>
              <td>{{ item.to }}</td>
              <td>{{ formatTime(item.at) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted-hint">暂无速度修改记录（重复提交只记一条，非本班组提交直接退回，不在这里留痕）。</p>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { axisReviewList, getRing, moduleMeta, speedAuditsOfRing } from '@/api/local-service'
import { parseRingNo } from '@/data/ring-domain'

const route = useRoute()
const meta = moduleMeta('ring')

const ringId = Number(route.params.id)
const shared = computed(() => route.path.startsWith('/ring/shared'))
const ring = computed(() => getRing(ringId))
const ringNo = computed(() => (ring.value ? parseRingNo(ring.value['环号'], ringId) : ringId))
const audits = computed(() => speedAuditsOfRing(ringId))
const review = computed(() =>
  axisReviewList().find((item) => parseRingNo(item.ringNo, item.id) === ringNo.value),
)
const overLimit = computed(() => Boolean(review.value))
const overLimitInfo = computed(() => review.value?.deviation ?? '')

const backLink = computed(() => ({
  path: shared.value ? '/ring/shared' : '/ring',
  query: route.query,
}))

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}
</script>
