<template>
  <div>
    <div class="topbar">
      <button class="btn sm ghost" @click="router.push({ name: 'vault' })">← 返回</button>
      <div class="title">{{ isNew ? '添加密码' : '查看 / 编辑' }}</div>
      <button v-if="!isNew" class="btn sm danger" @click="askDelete">删除</button>
      <div v-else style="width: 60px" />
    </div>

    <div class="card">
      <div class="field">
        <label>名称 / 网站 <span class="danger-text">*</span></label>
        <input v-model="form.name" class="input" placeholder="例如：GitHub" />
      </div>
      <div class="field">
        <label>分类</label>
        <select v-model="form.category" class="input">
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="field">
        <label>用户名 / 账号</label>
        <input v-model="form.username" class="input" placeholder="例如：user@example.com" autocomplete="off" />
      </div>
      <div class="field">
        <label>密码</label>
        <div class="input-wrap">
          <input v-model="form.password" :type="showPw ? 'text' : 'password'" class="input mono" placeholder="••••••••" autocomplete="new-password" />
          <button type="button" class="eye" @click="showPw = !showPw">{{ showPw ? '🙈' : '👁' }}</button>
        </div>
        <div class="flex mt">
          <button class="btn sm" @click="genPassword">🎲 生成强密码</button>
          <button class="btn sm" :disabled="!form.password" @click="copy(form.password)">📋 复制</button>
        </div>
      </div>
      <div class="field">
        <label>网址 (可选)</label>
        <input v-model="form.url" class="input" placeholder="https://..." autocomplete="off" />
      </div>
      <div class="field">
        <label>备注 (可选)</label>
        <textarea v-model="form.notes" class="input" rows="3" placeholder="备注信息" style="resize: vertical" />
      </div>

      <button class="btn primary mt" :disabled="!form.name || busy" @click="save">
        <span v-if="busy" class="spinner" /> {{ isNew ? '保存' : '保存修改' }}
      </button>
    </div>

    <Modal ref="delModal" title="删除该条目？" desc="删除后无法恢复。" confirm-text="删除" @confirm="doDelete" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVaultStore } from '../stores/vault'
import Modal from '../components/Modal.vue'
import { copyWithClear } from '../utils/clipboard'
import { generatePassword } from '../utils/password'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const store = useVaultStore()
const delModal = ref(null)

const isNew = computed(() => route.params.id === 'new')
const categories = ['其他', '社交', '邮箱', '金融', '工作', '娱乐', '购物', '学习', '健康']
const showPw = ref(false)
const busy = ref(false)

const form = reactive({ name: '', category: '其他', username: '', password: '', url: '', notes: '' })

onMounted(() => {
  store.touch()
  if (!isNew.value) {
    const e = store.entries.find((x) => x.id === route.params.id)
    if (e) {
      form.name = e.name
      form.category = e.category || '其他'
      form.username = e.username || ''
      form.password = e.password || ''
      form.url = e.url || ''
      form.notes = e.notes || ''
    } else {
      toast('条目不存在')
      router.replace({ name: 'vault' })
    }
  }
})

function genPassword() {
  form.password = generatePassword({ length: 20 })
  showPw.value = true
}

function copy(text) {
  copyWithClear(text, store.settings.clipboardClearSeconds)
}

async function save() {
  if (!form.name) {
    toast('请填写名称')
    return
  }
  busy.value = true
  try {
    if (isNew.value) {
      await store.addEntry({ ...form })
      toast('已添加')
    } else {
      await store.updateEntry(route.params.id, { ...form })
      toast('已保存')
    }
    router.replace({ name: 'vault' })
  } catch (e) {
    toast('保存失败', 3000)
  } finally {
    busy.value = false
  }
}

function askDelete() {
  delModal.value.show()
}
async function doDelete() {
  await store.deleteEntry(route.params.id)
  toast('已删除')
  router.replace({ name: 'vault' })
}
</script>

<style scoped>
.danger-text {
  color: var(--danger);
}
</style>
