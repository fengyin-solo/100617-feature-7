import { defineStore } from 'pinia'

import { RING_CREWS, RING_RECORDER_ROLE } from '@/data/ring-domain'

const SESSION_KEY = 'shield-tunnel-construction:session'

type PersistedSession = {
  operator: string
  crew: string
  role: string
  shiftLabel: string
}

function persisted(): Partial<PersistedSession> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? '{}') as Partial<PersistedSession>
  } catch {
    return {}
  }
}

export const useSessionStore = defineStore('session', {
  state: () => {
    const saved = persisted()
    return {
      operator: saved.operator ?? '李记录',
      crew: saved.crew ?? RING_CREWS[0],
      role: saved.role ?? RING_RECORDER_ROLE,
      shiftLabel: saved.shiftLabel ?? '白班 08:00-20:00',
      scope: '盾构隧道掘进施工管理平台',
    }
  },
  getters: {
    canOperate: (state) => state.operator.trim().length > 0,
    isRingRecorder: (state) => state.role === RING_RECORDER_ROLE && RING_CREWS.includes(state.crew as (typeof RING_CREWS)[number]),
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
      this.persist()
    },
    setIdentity(operator: string, crew: string, role: string) {
      this.operator = operator.trim()
      this.crew = crew
      this.role = role
      this.persist()
    },
    persist() {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload: PersistedSession = {
          operator: this.operator,
          crew: this.crew,
          role: this.role,
          shiftLabel: this.shiftLabel,
        }
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
      }
    },
  },
})
