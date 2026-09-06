<template>
  <div>
    <div class="topbar">
      <div class="title">密码保险库</div>
      <div class="topbar-actions">
        <button class="icon-btn" title="设置" @click="router.push({ name: 'settings' })">⚙️</button>
        <button class="icon-btn" title="立即锁定" @click="lockNow">🔒</button>
      </div>
    </div>

    <div class="searchbar">
      <input v-model="q" class="input" placeholder="搜索网站 / 用户名..." />
    </div>

    <div class="list-head">
      <span class="small muted">{{ filtered.length }} 个条目</span>
      <button class="btn sm primary" @click="addNew">＋ 添加密码</button>
    </div>

    <div v-if="filtered.length === 0" class="empty">
      <div class="big">{{ q ? '🔍' : '🗝️' }}</div>
      {{ q ? '未找到匹配条目' : '还没有任何条目，点击「添加密码」开始保存' }}
    </div>

    <div class="entry-list">
      <div v-for="e in filtered" :key="e.id" class="entry-item" @click="openEntry(e.id)">
        <div class="entry-icon">{{ iconOf(e) }}</div>
        <div class="entry-main">
          <div class="entry-name">{{ e.name }}</div>
          <div class="entry-user">
            {{ e.username || e.url || '无用户名' }}
            <span v-if="revealed[e.id]" class="mono" style="color: var(--accent2)"> · {{ e.password || '(无密码)' }}</span>
          </div>
        </div>
        <div class="entry-actions" @click.stop>
          <button class="icon-btn" :title="revealed[e.id] ? '隐藏' : '显示密码'" @click="toggleReveal(e.id)">
            {{ revealed[e.id] ? '🙈' : '👁' }}
          </button>
          <button class="icon-btn" title="复制密码" @click="copyPw(e)">📋</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVaultStore } from '../stores/vault'
import { copyWithClear } from '../utils/clipboard'
import { toast } from '../utils/toast'

const store = useVaultStore()
const router = useRouter()
const q = ref('')
const revealed = reactive({})

const CAT_ICONS = {
  其他: '🔑',
  社交: '👥',
  邮箱: '📧',
  金融: '💰',
  工作: '💼',
  娱乐: '🎮',
  购物: '🛒',
  学习: '📚',
  健康: '💊'
}

const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase()
  if (!kw) return store.entries
  return store.entries.filter(
    (e) =>
      (e.name || '').toLowerCase().includes(kw) ||
      (e.username || '').toLowerCase().includes(kw) ||
      (e.url || '').toLowerCase().includes(kw)
  )
})

function iconOf(e) {
  return CAT_ICONS[e.category] || '🔑'
}
function toggleReveal(id) {
  revealed[id] = !revealed[id]
}
function openEntry(id) {
  router.push({ name: 'entry', params: { id } })
}
async function copyPw(e) {
  if (!e.password) {
    toast('该条目没有密码')
    return
  }
  copyWithClear(e.password, store.settings.clipboardClearSeconds)
}
function addNew() {
  router.push({ name: 'entry', params: { id: 'new' } })
}
function lockNow() {
  store.lock()
  router.replace({ name: 'root' })
}

onMounted(() => {
  store.touch()
})
</script>
