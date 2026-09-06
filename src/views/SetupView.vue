<template>
  <div>
    <div class="card">
      <h2>{{ step === 1 ? '创建保险库' : '录入指纹' }}</h2>

      <!-- 步骤1：设置主密码 -->
      <div v-if="step === 1">
        <p class="sub">
          主密码是解密保险库的唯一凭证，<b>不会上传到任何服务器</b>。请牢记，丢失后无法找回。
        </p>
        <div class="field">
          <label>设置主密码</label>
          <PasswordInput v-model="pw" placeholder="至少 8 位且强度达到「强」" show-strength autocomplete="new-password" />
        </div>
        <div class="field">
          <label>确认主密码</label>
          <PasswordInput v-model="pw2" placeholder="再次输入主密码" autocomplete="new-password" />
        </div>

        <div v-if="pw && pw !== pw2" class="alert warn">两次输入的密码不一致</div>
        <div v-if="pw && pw2 && pw === pw2 && !validPw" class="alert danger">
          主密码强度不足，请使用更长的混合密码（建议 ≥ 12 位字母+数字+符号）
        </div>

        <button class="btn primary mt" :disabled="!canNext" @click="goStep2">下一步</button>

        <hr style="border: none; border-top: 1px solid var(--border); margin: 20px 0" />
        <p class="sub center">已有备份文件？可直接导入，无需设置新密码</p>
        <div class="center">
          <button class="btn ghost" :disabled="busy" @click="importFile && importFile.click()">从备份文件导入</button>
          <input ref="importFile" type="file" accept=".json,application/json" style="display: none" @change="onImportFile" />
        </div>
      </div>

      <!-- 步骤2：指纹录入 -->
      <div v-else>
        <p class="sub">录入指纹后即可用于解锁保险库（与主密码构成双因子，最高安全等级）。</p>

        <div class="center">
          <div class="bio-icon" :class="bioInfo.available ? 'fp-pulse' : ''">🫆</div>
        </div>

        <template v-if="bioInfo.available">
          <div class="field mt">
            <label class="flex">
              <span class="grow">录入 {{ bioInfo.typeLabel }} 作为解锁因子</span>
              <span class="switch">
                <input v-model="enrollBio" type="checkbox" />
                <span class="slider" />
              </span>
            </label>
          </div>
          <div v-if="enrollBio" class="field">
            <label class="flex">
              <span class="grow">
                启用指纹快捷解锁<br />
                <span class="small muted">仅指纹即可进入（不输入密码，仍受系统生物识别保护）</span>
              </span>
              <span class="switch">
                <input v-model="quickUnlock" type="checkbox" />
                <span class="slider" />
              </span>
            </label>
          </div>
        </template>
        <div v-else class="alert warn">
          当前设备未检测到可用生物识别（{{ bioReason }}）。您仍可继续使用主密码解锁，但无法使用指纹。<br />
          提示：Windows 请启用 Windows Hello；Linux 请启用系统指纹(fprintd)；Android 请在系统设置录入指纹。
        </div>

        <button class="btn primary mt" :disabled="busy" @click="create">
          <span v-if="busy" class="spinner" /> 创建保险库并进入
        </button>
        <button v-if="!bioInfo.available" class="btn ghost mt" @click="create">仍然继续（仅主密码）</button>
      </div>
    </div>

    <!-- 导入备份确认弹窗 -->
    <Modal ref="importModal" title="导入密码库" :show-cancel="true" confirm-text="确认导入" @confirm="confirmImport">
      <p v-if="importPreview" class="sub" style="line-height: 1.8">
        将导入 <b>{{ importPreview.count }}</b> 条密码
        <template v-if="importPreview.exportedAt">（导出时间：{{ formatTs(importPreview.exportedAt) }}）</template>。<br />
        导入后请使用<b>原主密码</b>解锁；生物识别需在导入后重新录入。
      </p>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVaultStore } from '../stores/vault'
import PasswordInput from '../components/PasswordInput.vue'
import Modal from '../components/Modal.vue'
import { isMasterPasswordValid } from '../utils/password'
import { parseBackup, readFileAsText } from '../services/backup'
import { toast } from '../utils/toast'

const store = useVaultStore()
const router = useRouter()

const step = ref(1)
const pw = ref('')
const pw2 = ref('')
const enrollBio = ref(true)
const quickUnlock = ref(false)
const busy = ref(false)
const importModal = ref(null)
const importFile = ref(null)
const importPreview = ref(null)

const bioInfo = computed(() => store.bioInfo)
const bioReason = computed(() =>
  !bioInfo.value.native ? (window.isSecureContext === false ? '当前非安全上下文，WebAuthn 不可用' : '未检测到平台认证器') : '未录入指纹'
)
const validPw = computed(() => isMasterPasswordValid(pw.value))
const canNext = computed(() => validPw.value && pw.value === pw2.value)

function goStep2() {
  step.value = 2
}

async function create() {
  if (!validPw.value || pw.value !== pw2.value) {
    toast('请先正确设置主密码', 3000)
    return
  }
  busy.value = true
  try {
    const enroll = enrollBio.value && bioInfo.value.available
    await store.createVault(pw.value, { enrollBiometric: enroll, quickUnlock: enroll && quickUnlock.value })
    toast('保险库创建成功')
    router.replace({ name: 'vault' })
  } catch (e) {
    console.error(e)
    toast('创建失败：' + (e && e.message ? e.message : e), 3500)
  } finally {
    busy.value = false
  }
}

onMounted(() => store.refreshBioInfo())

function formatTs(ts) {
  if (!ts) return '未知'
  return new Date(ts).toLocaleString()
}

async function onImportFile(e) {
  const file = e.target.files && e.target.files[0]
  if (e.target) e.target.value = ''
  if (!file) return
  busy.value = true
  try {
    const text = await readFileAsText(file)
    const parsed = parseBackup(text)
    importPreview.value = parsed
    importModal.value.show()
  } catch (err) {
    toast(err && err.message ? err.message : '导入失败', 3500)
  } finally {
    busy.value = false
  }
}

async function confirmImport() {
  if (!importPreview.value) return
  busy.value = true
  try {
    await store.importBackup(importPreview.value)
    toast('导入成功，请用原主密码解锁')
    router.replace({ name: 'unlock' })
  } catch (e) {
    toast(e && e.message ? e.message : '导入失败', 3500)
  } finally {
    busy.value = false
    importPreview.value = null
  }
}
</script>
