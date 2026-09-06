import { createRouter, createWebHashHistory } from 'vue-router'
import { useVaultStore } from '../stores/vault'

const routes = [
  { path: '/', name: 'root', component: () => import('../views/HomeRouter.vue') },
  { path: '/setup', name: 'setup', component: () => import('../views/SetupView.vue') },
  { path: '/unlock', name: 'unlock', component: () => import('../views/UnlockView.vue') },
  { path: '/vault', name: 'vault', component: () => import('../views/VaultView.vue') },
  { path: '/entry/:id', name: 'entry', component: () => import('../views/EntryDetailView.vue') },
  { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') }
]

const router = createRouter({
  // hash 模式：Android WebView / file:// 兼容
  history: createWebHashHistory(),
  routes
})

// 基于保险库状态守卫路由
router.beforeEach((to) => {
  const store = useVaultStore()
  if (to.name === 'root') {
    if (store.status === 'uninitialized') return { name: 'setup' }
    if (store.status === 'locked') return { name: 'unlock' }
    if (store.status === 'unlocked') return { name: 'vault' }
    return true
  }
  if (to.name === 'setup') {
    if (store.status === 'uninitialized') return true
    return { name: 'root' }
  }
  if (to.name === 'unlock') {
    if (store.status === 'locked') return true
    return { name: 'root' }
  }
  // 需要解锁态
  if (store.status !== 'unlocked') return { name: 'root' }
  return true
})

export default router
