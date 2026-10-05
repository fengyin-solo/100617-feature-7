import { defineStore } from 'pinia'

import type { SessionUser } from '@/data/types'

// 纯前端没有登录服务，用切换身份模拟交接班：
// - recorder：某掘进班组的记录员，只能改本班组环次的掘进速度；
// - viewer：全项目共享入口的只读身份，任何提交都不受理。
export const SESSION_USERS: SessionUser[] = [
  { id: 'recorder-1', name: '张建国（掘进一班记录员）', role: 'recorder', crew: '掘进一班' },
  { id: 'recorder-2', name: '李海涛（掘进二班记录员）', role: 'recorder', crew: '掘进二班' },
  { id: 'recorder-3', name: '王卫东（掘进三班记录员）', role: 'recorder', crew: '掘进三班' },
  { id: 'recorder-4', name: '赵立军（掘进四班记录员）', role: 'recorder', crew: '掘进四班' },
  { id: 'shared-viewer', name: '全项目共享只读视图', role: 'viewer', crew: '' },
]

export const useSessionStore = defineStore('session', {
  state: () => ({
    userId: SESSION_USERS[0].id,
    shiftLabel: '白班 08:00-20:00',
    scope: '盾构隧道掘进施工管理平台',
  }),
  getters: {
    user(state): SessionUser {
      return SESSION_USERS.find((item) => item.id === state.userId) ?? SESSION_USERS[0]
    },
    operator(): string {
      return this.user.name
    },
    canOperate(): boolean {
      return this.user.role === 'recorder'
    },
  },
  actions: {
    setUser(userId: string) {
      if (SESSION_USERS.some((item) => item.id === userId)) {
        this.userId = userId
      }
    },
    setShift(label: string) {
      this.shiftLabel = label
    },
    // 越权判定收口在这一处：只有本班组的记录员能改本班组环次。
    canMutateRing(crew: string): boolean {
      return this.user.role === 'recorder' && this.user.crew === crew
    },
  },
})
