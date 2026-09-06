import { defineStore } from 'pinia'
import { storage } from '../services/storage'
import {
  PBKDF2_ITERATIONS,
  bytesToB64,
  b64ToBytes,
  generateVaultKey,
  deriveKey,
  wrapVaultKey,
  unwrapVaultKey,
  importRawKey,
  encryptEntry,
  decryptEntry,
  makeVerifyToken,
  checkVerifyToken,
  randomId
} from '../crypto/crypto'
import { biometrics } from '../services/biometrics'
import { isNative } from '../services/platform'
import { lockGate } from '../utils/gate'

const KEY_META = 'meta'
const KEY_ENTRIES = 'entries'

function defaultSettings() {
  return {
    twoFactorRequired: true, // 解锁需「密码 + 指纹」双因子
    autoLockSeconds: 300, // 自动锁定
    wipeAfterFailures: 10, // 连续失败 N 次自动销毁数据 (0=关闭)
    clipboardClearSeconds: 30 // 复制后自动清空剪贴板
  }
}

export const useVaultStore = defineStore('vault', {
  state: () => ({
    status: 'init', // 'init' | 'uninitialized' | 'locked' | 'unlocked'
    meta: null, // 未加密的元数据(盐/包装密文/设置/指纹信息)
    vaultKey: null, // 主密钥字节 (仅内存)
    vaultKeyCrypto: null, // 主密钥 CryptoKey (仅内存)
    entries: [], // 解密后的条目 (仅内存)
    bioInfo: { available: false, strong: false, typeLabel: '无', native: false, canQuick: false, hasQuick: false },
    busy: false,
    lastActivityAt: Date.now()
  }),

  getters: {
    settings: (s) => (s.meta ? s.meta.settings : defaultSettings()),
    biometricsEnrolled: (s) => !!(s.meta && s.meta.biometrics && s.meta.biometrics.enrolled),
    quickEnabled: (s) => {
      if (!s.meta || !s.meta.biometrics || !s.meta.biometrics.enrolled) return false
      if (isNative()) return s.bioInfo.hasQuick
      return !!(s.meta.biometrics.web && s.meta.biometrics.web.quick)
    },
    remainingAttempts: (s) => {
      const w = s.settings.wipeAfterFailures
      if (!w) return -1
      return Math.max(0, w - (s.meta ? s.meta.failedAttempts : 0))
    }
  },

  actions: {
    touch() {
      this.lastActivityAt = Date.now()
    },

    async init() {
      this.meta = (await storage.get(KEY_META)) || null
      this.status = this.meta ? 'locked' : 'uninitialized'
      if (this.meta) {
        await this.refreshBioInfo()
      }
    },

    async refreshBioInfo() {
      try {
        const info = await biometrics.check()
        this.bioInfo = {
          ...info,
          hasQuick: await biometrics.hasQuick().catch(() => false)
        }
      } catch {
        this.bioInfo = { available: false, strong: false, typeLabel: '无', native: false, canQuick: false, hasQuick: false }
      }
    },

    // ---------------- 首次创建 ----------------
    async createVault(password, { enrollBiometric = false, quickUnlock = false } = {}) {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const kek = await deriveKey(password, salt, PBKDF2_ITERATIONS)
      const vk = generateVaultKey()
      const wrap = await wrapVaultKey(kek, vk)
      const vkCrypto = await importRawKey(vk)
      const verifyToken = await makeVerifyToken(vkCrypto, bytesToB64(vk))

      const meta = {
        version: 1,
        salt: bytesToB64(salt),
        iterations: PBKDF2_ITERATIONS,
        wrap,
        verifyToken,
        settings: defaultSettings(),
        biometrics: { enrolled: false, enrolledAt: null, web: null },
        failedAttempts: 0,
        lastFailedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      this.meta = meta

      if (enrollBiometric) {
        lockGate.value = true
        try {
          let webBio = null
          try {
            webBio = await biometrics.enroll({ wantQuick: quickUnlock, vaultKeyBytes: vk })
          } catch (e) {
            // 设备不支持 PRF 快捷解锁时，降级为仅录入双因子
            if (quickUnlock && e && e.message === 'PRF_UNSUPPORTED') {
              webBio = await biometrics.enroll({ wantQuick: false, vaultKeyBytes: vk })
            } else {
              throw e
            }
          }
          if (webBio) {
            meta.biometrics.web = webBio
            meta.biometrics.enrolled = true
            meta.biometrics.enrolledAt = Date.now()
          } else if (isNative()) {
            meta.biometrics.enrolled = true
            meta.biometrics.enrolledAt = Date.now()
            meta.biometrics.quick = !!quickUnlock
          }
        } catch (e) {
          // native: 指纹已验证通过但 Keystore 写入失败 → 降级为仅双因子（quick 未生效）
          if (isNative() && quickUnlock && e && e.message && e.message.startsWith('QUICK_STORE_FAILED')) {
            meta.biometrics.enrolled = true
            meta.biometrics.enrolledAt = Date.now()
            meta.biometrics.quick = false
            console.warn('[vault] 快捷解锁 Keystore 写入失败，降级为仅双因子', e.cause)
          } else {
            // 生物识别录入失败时仍允许创建（后续可在设置中补录）
            console.warn('[vault] 生物识别录入失败', e)
          }
        } finally {
          lockGate.value = false
        }
      }

      await storage.set(KEY_META, meta)
      await storage.set(KEY_ENTRIES, [])
      this.vaultKey = vk
      this.vaultKeyCrypto = vkCrypto
      this.entries = []
      this.status = 'unlocked'
      await this.refreshBioInfo()
    },

    // ---------------- 解锁：主密码(可能附加指纹) ----------------
    async unlockWithPassword(password) {
      if (!this.meta) return { ok: false, reason: 'notInitialized' }
      const saltBytes = b64ToBytes(this.meta.salt)
      let kek
      try {
        kek = await deriveKey(password, saltBytes, this.meta.iterations)
      } catch {
        return this._wrongPassword()
      }
      let vk
      try {
        vk = await unwrapVaultKey(kek, this.meta.wrap)
      } catch {
        return this._wrongPassword()
      }

      // 双因子：若开启且已录入指纹，则需指纹验证通过
      if (this.settings.twoFactorRequired && this.biometricsEnrolled) {
        const bioOk = await this._biometricFactorVerify()
        if (!bioOk) return { ok: false, reason: 'biometricFailed' }
      }

      return this._finalizeUnlock(vk)
    },

    // ---------------- 解锁：指纹快捷解锁 ----------------
    async unlockWithBiometric() {
      if (!this.meta || !this.quickEnabled) return { ok: false, reason: 'notAvailable' }
      const quick = isNative() ? null : this.meta.biometrics.web.quick
      const vk = await biometrics.unlockQuick({ quick })
      if (!vk) return { ok: false, reason: 'biometricFailed' }
      try {
        const vkCrypto = await importRawKey(vk)
        const okToken = await checkVerifyToken(vkCrypto, this.meta.verifyToken, vk)
        if (!okToken) throw new Error('key mismatch')
        return this._finalizeUnlock(vk)
      } catch {
        return { ok: false, reason: 'invalidKey' }
      }
    },

    async _biometricFactorVerify() {
      if (isNative()) return biometrics.verify()
      if (this.meta.biometrics.web) return biometrics.webVerify(this.meta.biometrics.web)
      return true
    },

    _wrongPassword() {
      const remaining = this.registerFailed()
      return { ok: false, reason: 'wrongPassword', remaining }
    },

    async _finalizeUnlock(vk) {
      this.vaultKey = vk
      this.vaultKeyCrypto = await importRawKey(vk)
      const encrypted = (await storage.get(KEY_ENTRIES)) || []
      this.entries = []
      for (const e of encrypted) {
        try {
          const obj = await decryptEntry(this.vaultKeyCrypto, e)
          this.entries.push({ ...obj, id: e.id, updatedAt: e.updatedAt })
        } catch {
          // 跳过无法解密的条目
        }
      }
      this.meta.failedAttempts = 0
      this.meta.lastFailedAt = null
      this.meta.updatedAt = Date.now()
      await storage.set(KEY_META, this.meta)
      this.status = 'unlocked'
      this.touch()
      return { ok: true }
    },

    registerFailed() {
      if (!this.meta) return -1
      this.meta.failedAttempts = (this.meta.failedAttempts || 0) + 1
      this.meta.lastFailedAt = Date.now()
      storage.set(KEY_META, this.meta)
      const w = this.settings.wipeAfterFailures
      if (w && this.meta.failedAttempts >= w) {
        this.wipe()
        return 0
      }
      return Math.max(0, w - this.meta.failedAttempts)
    },

    async lock() {
      this.vaultKey = null
      this.vaultKeyCrypto = null
      this.entries = []
      this.status = 'locked'
    },

    async wipe() {
      await storage.clearAll()
      this.meta = null
      this.vaultKey = null
      this.vaultKeyCrypto = null
      this.entries = []
      this.status = 'uninitialized'
    },

    // ---------------- 导入备份 ----------------
    // 覆盖当前数据并回到锁定态；生物识别为设备绑定信息，导入后需在新设备重新录入
    async importBackup({ meta, entries }) {
      const cleanMeta = {
        ...meta,
        biometrics: { enrolled: false, enrolledAt: null, web: null },
        updatedAt: Date.now()
      }
      await storage.set(KEY_META, cleanMeta)
      await storage.set(KEY_ENTRIES, Array.isArray(entries) ? entries : [])
      this.meta = cleanMeta
      this.vaultKey = null
      this.vaultKeyCrypto = null
      this.entries = []
      this.status = 'locked'
      await this.refreshBioInfo()
    },

    // ---------------- 条目操作（仅解锁态） ----------------
    async _persistEntries() {
      const list = []
      for (const e of this.entries) {
        const { id, updatedAt, ...rest } = e
        const { iv, ct } = await encryptEntry(this.vaultKeyCrypto, rest)
        list.push({ id, iv, ct, updatedAt })
      }
      await storage.set(KEY_ENTRIES, list)
    },

    async addEntry(data) {
      const entry = {
        id: randomId(),
        name: data.name || '未命名',
        username: data.username || '',
        password: data.password || '',
        url: data.url || '',
        notes: data.notes || '',
        category: data.category || '其他',
        updatedAt: Date.now()
      }
      this.entries.unshift(entry)
      await this._persistEntries()
      return entry
    },

    async updateEntry(id, data) {
      const idx = this.entries.findIndex((e) => e.id === id)
      if (idx < 0) return
      this.entries[idx] = { ...this.entries[idx], ...data, id, updatedAt: Date.now() }
      await this._persistEntries()
    },

    async deleteEntry(id) {
      this.entries = this.entries.filter((e) => e.id !== id)
      await this._persistEntries()
    },

    // ---------------- 修改主密码 ----------------
    async changeMasterPassword(oldPw, newPw) {
      const saltBytes = b64ToBytes(this.meta.salt)
      const oldKek = await deriveKey(oldPw, saltBytes, this.meta.iterations)
      const vk = await unwrapVaultKey(oldKek, this.meta.wrap) // 旧密码错误会抛异常
      const newSalt = crypto.getRandomValues(new Uint8Array(16))
      const newKek = await deriveKey(newPw, newSalt, PBKDF2_ITERATIONS)
      const wrap = await wrapVaultKey(newKek, vk)
      this.meta.salt = bytesToB64(newSalt)
      this.meta.iterations = PBKDF2_ITERATIONS
      this.meta.wrap = wrap
      this.meta.updatedAt = Date.now()
      await storage.set(KEY_META, this.meta)
      return true
    },

    // ---------------- 设置 ----------------
    async updateSettings(partial) {
      this.meta.settings = { ...this.meta.settings, ...partial }
      this.meta.updatedAt = Date.now()
      await storage.set(KEY_META, this.meta)
    },

    // ---------------- 指纹管理 ----------------
    // 录入生物识别作为双因子
    async enableBiometricFactor() {
      if (!this.vaultKey) throw new Error('请先解锁')
      lockGate.value = true
      try {
        const webBio = await biometrics.enrollFactorOnly()
        if (webBio) {
          this.meta.biometrics.web = webBio
        }
        this.meta.biometrics.enrolled = true
        this.meta.biometrics.enrolledAt = Date.now()
        this.meta.updatedAt = Date.now()
        await storage.set(KEY_META, this.meta)
      } finally {
        lockGate.value = false
      }
      await this.refreshBioInfo()
    },

    // 启用指纹快捷解锁
    async enableQuickUnlock() {
      if (!this.vaultKey) throw new Error('请先解锁')
      if (!this.biometricsEnrolled && isNative()) {
        // 原生必须先有生物识别因子
        await this.enableBiometricFactor()
      }
      lockGate.value = true
      try {
        const quick = await biometrics.enrollQuick(this.vaultKey)
        if (quick) {
          if (!this.meta.biometrics.web) this.meta.biometrics.web = { credId: null, rpId: null, quick: null }
          this.meta.biometrics.web.quick = quick
          this.meta.biometrics.enrolled = true
          this.meta.biometrics.enrolledAt = this.meta.biometrics.enrolledAt || Date.now()
        }
        this.meta.updatedAt = Date.now()
        await storage.set(KEY_META, this.meta)
      } finally {
        lockGate.value = false
      }
      await this.refreshBioInfo()
    },

    // 关闭指纹快捷解锁
    async disableQuickUnlock() {
      await biometrics.removeQuick()
      if (this.meta.biometrics.web) this.meta.biometrics.web.quick = null
      this.meta.updatedAt = Date.now()
      await storage.set(KEY_META, this.meta)
      await this.refreshBioInfo()
    },

    // 移除指纹（因子 + 快捷解锁）
    async removeBiometric() {
      await biometrics.removeQuick()
      this.meta.biometrics.enrolled = false
      this.meta.biometrics.enrolledAt = null
      this.meta.biometrics.web = null
      this.meta.updatedAt = Date.now()
      await storage.set(KEY_META, this.meta)
      await this.refreshBioInfo()
    }
  }
})
