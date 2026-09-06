<template>
  <div>
    <div class="topbar">
      <button class="btn sm ghost" @click="router.push({ name: 'vault' })">← 返回</button>
      <div class="title">设置</div>
      <div style="width: 60px" />
    </div>

    <!-- 安全状态 -->
    <div class="card">
      <h2>安全状态</h2>
      <div class="flex mb">
        <span class="security-pill" :class="isMax ? 'max' : 'warn'">
          {{ isMax ? '🛡️ 最高安全（双因子）' : '⚠️ 已降级' }}
        </span>
      </div>
      <p class="small muted" style="margin: 0; line-height: 1.7">
        所有密码条目以 <b>AES-256-GCM</b> 加密；主密钥由主密码经 <b>PBKDF2-SHA256（600,000 次迭代 + 随机盐）</b>保护。
        主密码与明文永不落盘。{{ isMax ? '解锁需同时提供主密码与指纹。' : '当前未强制指纹双因子，建议开启。' }}
      </p>
    </div>

    <!-- 指纹管理 -->
    <div class="card">
      <h2>指纹 / 生物识别</h2>
      <div class="flex mb" style="flex-wrap: wrap; gap: 8px">
        <span class="bio-badge">平台：{{ platformLabel }}</span>
        <span class="bio-badge">类型：{{ store.bioInfo.typeLabel }}</span>
        <span class="bio-badge" :class="store.biometricsEnrolled ? 'on' : ''">
          {{ store.biometricsEnrolled ? '已录入' : '未录入' }}
        </span>
        <span v-if="store.biometricsEnrolled" class="bio-badge">
          快捷解锁：{{ store.quickEnabled ? '开启' : '关闭' }}
        </span>
      </div>

      <template v-if="store.bioInfo.available">
        <button v-if="!store.biometricsEnrolled" class="btn primary mb" @click="enrollFactor">
          <span v-if="busy" class="spinner" /> 录入 {{ store.bioInfo.typeLabel }}（双因子）
        </button>
        <template v-else>
          <button v-if="!store.quickEnabled" class="btn mb" :disabled="busy" @click="enableQuick">
            <span v-if="busy" class="spinner" /> 启用指纹快捷解锁（仅指纹进入）
          </button>
          <button v-else class="btn ghost mb" :disabled="busy" @click="disableQuick">
            关闭指纹快捷解锁
          </button>
          <button class="btn danger" :disabled="busy" @click="removeBio">移除指纹</button>
        </template>
      </template>
      <div v-else class="alert warn">
        未检测到可用生物识别。Windows 请启用 Windows Hello；Linux 请安装并启用系统指纹(fprintd)；Android 请在系统设置中录入指纹。
      </div>

      <div v-if="lastQuickError" class="alert danger" style="margin-top: 8px">
        上次快捷解锁写入失败：{{ lastQuickError }}
      </div>

      <p class="small muted mt" style="margin-bottom: 0; line-height: 1.6">
        提示：指纹快捷解锁在 Android 由系统 Keystore 硬件加密保护；在 Windows/Linux 浏览器中基于 WebAuthn 平台认证器实现。
      </p>
    </div>

    <!-- 解锁安全 -->
    <div class="card">
      <h2>解锁安全</h2>
      <div class="setting-row">
        <div>
          <div class="t">双因子解锁（密码 + 指纹）</div>
          <div class="d">解锁时需同时验证主密码与生物识别</div>
        </div>
        <div class="r"><span class="switch">
          <input type="checkbox" :checked="twoFactor" @change="saveSettings({ twoFactorRequired: $event.target.checked })" />
          <span class="slider" />
        </span></div>
      </div>
      <div class="setting-row">
        <div>
          <div class="t">自动锁定</div>
          <div class="d">无操作后自动锁定保险库</div>
        </div>
        <div class="r">
          <select :value="autoLock" class="input" style="width: 130px" @change="saveSettings({ autoLockSeconds: Number($event.target.value) })">
            <option :value="30">30 秒</option>
            <option :value="60">1 分钟</option>
            <option :value="300">5 分钟</option>
            <option :value="900">15 分钟</option>
            <option :value="1800">30 分钟</option>
            <option :value="0">从不</option>
          </select>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="t">连续失败自动销毁</div>
          <div class="d">密码连续输错指定次数后清空全部数据</div>
        </div>
        <div class="r" style="display: flex; align-items: center; gap: 8px">
          <select :value="wipeN" class="input" style="width: 90px" @change="saveSettings({ wipeAfterFailures: Number($event.target.value) })">
            <option :value="5">5 次</option>
            <option :value="10">10 次</option>
            <option :value="20">20 次</option>
            <option :value="0">关闭</option>
          </select>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="t">剪贴板自动清除</div>
          <div class="d">复制密码后自动清空剪贴板</div>
        </div>
        <div class="r">
          <select :value="clipSec" class="input" style="width: 110px" @change="saveSettings({ clipboardClearSeconds: Number($event.target.value) })">
            <option :value="10">10 秒</option>
            <option :value="30">30 秒</option>
            <option :value="60">60 秒</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 修改主密码 -->
    <div class="card">
      <h2>主密码</h2>
      <p class="sub">修改主密码会使用新密码重新包装主密钥，不影响已保存的条目与指纹。</p>
      <button class="btn" @click="openChangePw">修改主密码</button>
    </div>

    <!-- 数据迁移 / 备份 -->
    <div class="card">
      <h2>数据迁移 / 备份</h2>
      <p class="sub">
        将整个密码库导出为加密备份文件；换手机后在新设备导入，输入原主密码即可恢复全部密码。<br />
        文件不含主密码；指纹等生物识别信息随设备绑定，换机后需重新录入。
      </p>
      <div class="flex" style="gap: 8px; flex-wrap: wrap">
        <button class="btn" :disabled="busy" @click="doExport">
          <span v-if="busy" class="spinner" /> 导出密码库
        </button>
        <button class="btn" :disabled="busy" @click="importFile && importFile.click()">导入密码库</button>
        <input ref="importFile" type="file" accept=".json,application/json" style="display: none" @change="onImportFile" />
      </div>
    </div>

    <!-- 危险区 -->
    <div class="card" style="border-color: rgba(255, 93, 108, 0.4)">
      <h2 style="color: var(--danger)">危险区</h2>
      <p class="sub">清空本机全部加密数据与指纹设置，并返回初始化界面。此操作不可恢复。</p>
      <button class="btn danger" @click="askWipe">清空所有数据</button>
    </div>

    <!-- 修改主密码弹窗 -->
    <Modal ref="pwModal" title="修改主密码" :show-cancel="true" confirm-text="确认修改" @confirm="doChangePw">
      <div class="field">
        <label>当前主密码</label>
        <PasswordInput v-model="oldPw" autocomplete="current-password" />
      </div>
      <div class="field">
        <label>新主密码</label>
        <PasswordInput v-model="newPw" show-strength autocomplete="new-password" />
      </div>
      <div class="field">
        <label>确认新主密码</label>
        <PasswordInput v-model="newPw2" autocomplete="new-password" />
      </div>
      <div v-if="newPw && newPw === newPw2 && !validNew" class="alert danger">新密码强度不足（需 ≥ 8 位且达到「强」）</div>
      <div v-if="newPw && newPw2 && newPw !== newPw2" class="alert warn">两次输入不一致</div>
    </Modal>

    <!-- 清空数据弹窗 -->
    <Modal ref="wipeModal" title="确认清空所有数据？" desc="此操作将永久删除本机全部加密数据，且无法恢复！" confirm-text="我确认，清空" @confirm="doWipe" />

    <!-- 导入备份确认弹窗 -->
    <Modal ref="importModal" title="导入密码库" :show-cancel="true" confirm-text="确认导入" @confirm="confirmImport">
      <p v-if="importPreview" class="sub" style="line-height: 1.8">
        将导入 <b>{{ importPreview.count }}</b> 条密码
        <template v-if="importPreview.exportedAt">（导出时间：{{ formatTs(importPreview.exportedAt) }}）</template>。<br />
        <b style="color: var(--danger)">⚠ 此操作会用备份数据覆盖本机当前密码库，且无法恢复！</b>
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
import { platformLabel } from '../services/platform'
import { exportBackupFile, parseBackup, readFileAsText } from '../services/backup'
import { toast } from '../utils/toast'

const store = useVaultStore()
const router = useRouter()

const busy = ref(false)
const twoFactor = ref(true)
const autoLock = ref(300)
const wipeN = ref(10)
const clipSec = ref(30)
const lastQuickError = ref('')

const pwModal = ref(null)
const wipeModal = ref(null)
const importModal = ref(null)
const importFile = ref(null)
const importPreview = ref(null)
const oldPw = ref('')
const newPw = ref('')
const newPw2 = ref('')

const isMax = computed(() => store.settings.twoFactorRequired && store.biometricsEnrolled)
const validNew = computed(() => isMasterPasswordValid(newPw.value))

function syncFromStore() {
  twoFactor.value = store.settings.twoFactorRequired
  autoLock.value = store.settings.autoLockSeconds
  wipeN.value = store.settings.wipeAfterFailures
  clipSec.value = store.settings.clipboardClearSeconds
}

async function saveSettings(partial) {
  await store.updateSettings(partial)
  syncFromStore()
  toast('设置已保存')
}

async function enrollFactor() {
  busy.value = true
  try {
    await store.enableBiometricFactor()
    toast('指纹已录入')
  } catch (e) {
    toast(e && e.message ? e.message : '录入失败', 3500)
  } finally {
    busy.value = false
  }
}

async function enableQuick() {
  busy.value = true
  try {
    await store.enableQuickUnlock()
    toast('指纹快捷解锁已开启')
  } catch (e) {
    if (e && e.message === 'PRF_UNSUPPORTED') {
      toast('此设备不支持指纹快捷解锁（无 WebAuthn PRF）', 4000)
    } else if (e && e.message && e.message.startsWith('QUICK_STORE_FAILED')) {
      const detail = e.message.split(':').slice(1).join(':').trim()
      toast(`安全存储写入失败：${detail}`, 5000)
    } else {
      toast(e && e.message ? e.message : '开启失败', 3500)
    }
  } finally {
    busy.value = false
  }
}

async function disableQuick() {
  busy.value = true
  try {
    await store.disableQuickUnlock()
    toast('已关闭指纹快捷解锁')
  } finally {
    busy.value = false
  }
}

async function removeBio() {
  busy.value = true
  try {
    await store.removeBiometric()
    toast('指纹已移除')
  } finally {
    busy.value = false
  }
}

function openChangePw() {
  oldPw.value = ''
  newPw.value = ''
  newPw2.value = ''
  pwModal.value.show()
}

async function doChangePw() {
  if (!oldPw.value || !newPw.value) {
    toast('请填写完整')
    return
  }
  if (newPw.value !== newPw2.value) {
    toast('两次新密码不一致')
    return
  }
  if (!validNew.value) {
    toast('新密码强度不足')
    return
  }
  try {
    await store.changeMasterPassword(oldPw.value, newPw.value)
    toast('主密码已修改')
  } catch {
    toast('当前主密码错误')
  }
}

function askWipe() {
  wipeModal.value.show()
}
async function doWipe() {
  await store.wipe()
  toast('数据已清空')
  router.replace({ name: 'root' })
}

function formatTs(ts) {
  if (!ts) return '未知'
  return new Date(ts).toLocaleString()
}

async function doExport() {
  busy.value = true
  try {
    const r = await exportBackupFile()
    toast(`已导出 ${r.count} 条密码，请妥善保存备份文件`)
  } catch (e) {
    toast(e && e.message ? e.message : '导出失败', 3500)
  } finally {
    busy.value = false
  }
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

onMounted(() => {
  store.touch()
  syncFromStore()
  store.refreshBioInfo()
  try {
    lastQuickError.value = localStorage.getItem('last_quick_error') || ''
  } catch { /* ignore */ }
})
</script>
