<template>
  <div class="app-shell">
    <div class="brand">
      <div class="logo">🔐</div>
      <span>账号密码保管箱</span>
      <span v-if="store.status === 'unlocked'" class="security-pill" :class="store.settings.twoFactorRequired ? 'max' : 'warn'" style="margin-left: auto">
        {{ store.settings.twoFactorRequired ? '最高安全' : '已降级' }}
      </span>
    </div>

    <router-view />

    <p class="footer-note">
      AES-256-GCM · PBKDF2-600,000 · 主密码永不上传<br />
      Android / Windows / Linux 跨端安全存储
    </p>

    <div class="toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="toast">{{ t.msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVaultStore } from './stores/vault'
import { toasts } from './utils/toast'
import { lockGate } from './utils/gate'

const store = useVaultStore()
const router = useRouter()

let idleTimer = null

function stopIdleTimer() {
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}

function startIdleTimer() {
  stopIdleTimer()
  idleTimer = setInterval(() => {
    if (store.status !== 'unlocked') return
    const limit = store.settings.autoLockSeconds
    if (limit && Date.now() - store.lastActivityAt > limit * 1000) {
      store.lock()
    }
  }, 1000)
}

function onVisibility() {
  if (document.hidden && store.status === 'unlocked' && !lockGate.value) {
    store.lock()
  }
}

function onActivity() {
  store.touch()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pointerdown', onActivity)
  window.addEventListener('keydown', onActivity)
})

onBeforeUnmount(() => {
  stopIdleTimer()
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pointerdown', onActivity)
  window.removeEventListener('keydown', onActivity)
})

// 状态变化时启停空闲锁，并同步路由
watch(
  () => store.status,
  (s) => {
    if (s === 'unlocked') startIdleTimer()
    else stopIdleTimer()
    if (s === 'locked') router.push({ name: 'unlock' })
    else if (s === 'uninitialized') router.push({ name: 'setup' })
  }
)
</script>
