<template>
  <div>
    <div class="card">
      <div class="center">
        <div class="bio-icon">🔐</div>
        <h2>保险库已锁定</h2>
        <p class="sub center">输入主密码以解锁{{ settings.twoFactorRequired && store.biometricsEnrolled ? '，并按提示验证指纹' : '' }}</p>
      </div>

      <div class="field">
        <label>主密码</label>
        <PasswordInput
          v-model="pw"
          placeholder="请输入主密码"
          autocomplete="current-password"
          @keyup.enter="unlockByPw"
        />
      </div>

      <div v-if="error" class="alert danger">{{ error }}</div>
      <div v-if="remaining >= 0 && remaining <= 3 && remaining > 0" class="alert warn">
        警告：连续失败 {{ settings.wipeAfterFailures }} 次将自动销毁全部数据，剩余尝试次数 <b>{{ remaining }}</b>
      </div>

      <button class="btn primary mt" :disabled="busy || !pw" @click="unlockByPw">
        <span v-if="busy" class="spinner" /> 解锁
      </button>

      <div v-if="store.quickEnabled" class="sep" />
      <button v-if="store.quickEnabled" class="btn success mt" :disabled="busy" @click="unlockByBio">
        <span v-if="bioBusy" class="spinner" /> 指纹快捷解锁
      </button>

      <p class="small muted center mt">
        {{ store.bioInfo.available ? `已录入 ${store.bioInfo.typeLabel} · ${store.quickEnabled ? '指纹快捷解锁已开启' : '指纹作为第二因子'}` : '本设备未启用生物识别' }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVaultStore } from '../stores/vault'
import PasswordInput from '../components/PasswordInput.vue'
import { toast } from '../utils/toast'

const store = useVaultStore()
const router = useRouter()
const pw = ref('')
const busy = ref(false)
const bioBusy = ref(false)
const error = ref('')

const settings = computed(() => store.settings)
const remaining = computed(() => store.remainingAttempts)

function showError(msg) {
  error.value = msg
  setTimeout(() => {
    if (error.value === msg) error.value = ''
  }, 4000)
}

async function unlockByPw() {
  if (!pw.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await store.unlockWithPassword(pw.value)
    if (res.ok) {
      pw.value = ''
      router.replace({ name: 'vault' })
    } else if (res.reason === 'wrongPassword') {
      if (store.status === 'uninitialized') {
        toast('连续失败次数过多，数据已自动销毁', 4000)
        router.replace({ name: 'setup' })
      } else {
        showError('主密码错误，请重试')
      }
    } else if (res.reason === 'biometricFailed') {
      showError('指纹验证未通过，保险库保持锁定')
    }
  } finally {
    busy.value = false
  }
}

async function unlockByBio() {
  if (bioBusy.value) return
  bioBusy.value = true
  error.value = ''
  try {
    const res = await store.unlockWithBiometric()
    if (res.ok) {
      router.replace({ name: 'vault' })
    } else {
      showError('指纹验证未通过或不可用，请使用主密码解锁')
    }
  } finally {
    bioBusy.value = false
  }
}

onMounted(() => store.refreshBioInfo())
</script>
