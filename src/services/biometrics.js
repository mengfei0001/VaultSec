// ============================================================================
// 生物识别服务
//  - Android 原生: @aparajita/capacitor-biometric-auth (指纹/面容验证)
//                  + @aparajita/capacitor-secure-storage (Keystore 硬件加密存储主密钥)
//  - Web (Windows Hello / Linux fprintd): WebAuthn 平台认证器
//                  + PRF 扩展实现「仅指纹解锁」(Chrome/Edge 支持时)
// ============================================================================
import { isNative } from './platform'
import { bytesToB64, b64ToBytes, randomBytesU8, importRawKey } from '../crypto/crypto'

const VAULT_KEY_STORAGE = 'vault_key'
const PRF_UNSUPPORTED = 'PRF_UNSUPPORTED'

function typeName(t) {
  const map = {
    1: '指纹',
    2: '面容',
    3: '指纹',
    4: '面容',
    5: '虹膜',
    touchID: '指纹',
    faceID: '面容',
    fingerprint: '指纹',
    iris: '虹膜',
    strong: '强生物识别(指纹)',
    weak: '弱生物识别(面部/虹膜)'
  }
  return map[t] || '无'
}

// ---------- Android 原生 ----------
async function nativeCheck() {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  const r = await BiometricAuth.checkBiometry()
  const bt = r.biometryType || r.strongBiometryType || r.weakBiometryType
  return {
    available: !!r.isAvailable,
    strong: !!r.strongBiometryIsAvailable,
    typeLabel: typeName(bt),
    deviceIsSecure: !!r.deviceIsSecure,
    native: true
  }
}

const nativeAuthOpts = {
  reason: '验证指纹以继续',
  cancelTitle: '取消',
  allowDeviceCredential: false,
  androidTitle: '账号密码保管箱 生物识别',
  androidSubtitle: '请验证您的指纹以继续',
  androidConfirmationRequired: false
}

async function nativeVerify() {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  try {
    await BiometricAuth.authenticate(nativeAuthOpts)
    return true
  } catch {
    return false
  }
}

async function nativeEnrollQuick(vaultKeyBytes) {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  await BiometricAuth.authenticate({
    ...nativeAuthOpts,
    reason: '验证指纹以录入指纹快捷解锁',
    androidTitle: '录入指纹快捷解锁'
  })
  // 指纹验证已通过（双因子因子已录入）。若安全存储写入失败则抛出，
  // 由上层决定降级为仅双因子或向用户提示快捷解锁失败。
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  try {
    // 注意：SecureStorage.set(key, data) 是位置参数，不是 {key, value} 对象
    await SecureStorage.set(VAULT_KEY_STORAGE, bytesToB64(vaultKeyBytes))
  } catch (e) {
    // 指纹已验证通过，仅 Keystore 写入失败。携带专用标记与底层原因，供上层降级/提示
    const causeMsg = (e && e.message) || String(e)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('last_quick_error', `${causeMsg} [${Date.now()}]`)
      }
    } catch { /* ignore */ }
    const err = new Error(`QUICK_STORE_FAILED: ${causeMsg}`)
    err.cause = e
    throw err
  }
}

async function nativeUnlockQuick() {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  try {
    await BiometricAuth.authenticate({ ...nativeAuthOpts, androidTitle: '账号密码保管箱 指纹解锁' })
  } catch {
    return null
  }
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  const res = await SecureStorage.get(VAULT_KEY_STORAGE)
  if (res) return b64ToBytes(res)
  return null
}

async function nativeHasQuick() {
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    const r = await SecureStorage.keys()
    const keys = Array.isArray(r) ? r : (r && r.keys) || []
    return keys.includes(VAULT_KEY_STORAGE)
  } catch {
    return false
  }
}

async function nativeRemoveQuick() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  await SecureStorage.remove(VAULT_KEY_STORAGE)
}

// ---------- Web: WebAuthn ----------
function webAuthnSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    !!navigator.credentials &&
    !!window.PublicKeyCredential
  )
}

async function webAuthnPlatformAvailable() {
  if (!webAuthnSupported()) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

function b64urlToBytes(s) {
  return b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/'))
}
function bytesToB64url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function abToB64url(ab) {
  return bytesToB64url(new Uint8Array(ab))
}

const rpId = () => window.location.hostname
const challenge = () => randomBytesU8(32)

// 创建平台凭据。wantQuick 时请求 PRF 扩展以获得可恢复的密钥
async function webCreate({ wantQuick, vaultKeyBytes }) {
  if (!webAuthnSupported()) throw new Error('当前环境不支持 WebAuthn（需要 HTTPS 或 localhost）')
  const createOpts = {
    publicKey: {
      challenge: challenge(),
      rp: { name: '账号密码保管箱', id: rpId() },
      user: { id: randomBytesU8(16), name: 'vault-user', displayName: '账号密码保管箱 用户' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -8 }
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required'
      },
      timeout: 60000,
      attestation: 'none'
    }
  }
  const prfSalt = randomBytesU8(32)
  if (wantQuick) {
    createOpts.publicKey.extensions = { prf: { eval: { first: prfSalt } } }
  }

  let cred
  try {
    cred = await navigator.credentials.create(createOpts)
  } catch (e) {
    if (wantQuick && e.name === 'NotSupportedError') {
      throw new Error(PRF_UNSUPPORTED)
    }
    throw e
  }
  if (!cred) throw new Error('未创建凭据')

  const result = { credId: abToB64url(cred.rawId), rpId: rpId(), quick: null }

  if (wantQuick) {
    const res = cred.getClientExtensionResults()
    const first = res && res.prf && res.prf.results && res.prf.results.first
    if (!first) throw new Error(PRF_UNSUPPORTED)
    const prfKey = await importRawKey(new Uint8Array(first))
    const iv = randomBytesU8(12)
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, prfKey, vaultKeyBytes)
    result.quick = {
      credId: result.credId,
      rpId: result.rpId,
      prfSalt: bytesToB64(prfSalt),
      iv: bytesToB64(iv),
      ct: bytesToB64(new Uint8Array(ct))
    }
  }
  return result
}

async function webVerify(webBio) {
  if (!webAuthnSupported() || !webBio || !webBio.credId) return false
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        rpId: webBio.rpId || rpId(),
        allowCredentials: [{ type: 'public-key', id: b64urlToBytes(webBio.credId) }],
        userVerification: 'required',
        timeout: 60000
      }
    })
    return !!assertion
  } catch {
    return false
  }
}

async function webUnlockQuick(quick) {
  if (!webAuthnSupported() || !quick || !quick.credId) return null
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        rpId: quick.rpId || rpId(),
        allowCredentials: [{ type: 'public-key', id: b64urlToBytes(quick.credId) }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: b64ToBytes(quick.prfSalt) } } }
      }
    })
    if (!assertion) return null
    const res = assertion.getClientExtensionResults()
    const first = res && res.prf && res.prf.results && res.prf.results.first
    if (!first) return null
    const prfKey = await importRawKey(new Uint8Array(first))
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(quick.iv) },
      prfKey,
      b64ToBytes(quick.ct)
    )
    const vk = new Uint8Array(plain)
    return vk.length === 32 ? vk : null
  } catch {
    return null
  }
}

// ---------- 对外统一接口 ----------
export const biometrics = {
  isNative: isNative(),

  async check() {
    if (isNative()) return nativeCheck()
    const available = await webAuthnPlatformAvailable()
    return {
      available,
      strong: available,
      typeLabel: available ? '指纹(WebAuthn)' : '无',
      deviceIsSecure: available,
      native: false
    }
  },

  // 设置/补录时的录入：wantQuick 则一并创建快捷解锁凭据
  async enroll({ wantQuick, vaultKeyBytes }) {
    if (isNative()) {
      if (wantQuick) await nativeEnrollQuick(vaultKeyBytes)
      else await nativeVerify()
      return null
    }
    return webCreate({ wantQuick, vaultKeyBytes })
  },

  // 单独录入 2FA 因子（不涉及快捷解锁）
  async enrollFactorOnly() {
    if (isNative()) {
      const ok = await nativeVerify()
      if (!ok) throw new Error('生物识别验证未通过')
      return null
    }
    return webCreate({ wantQuick: false, vaultKeyBytes: null })
  },

  // 单独启用指纹快捷解锁（native 存 Keystore / web 新建 PRF 凭据）
  async enrollQuick(vaultKeyBytes) {
    if (isNative()) {
      await nativeEnrollQuick(vaultKeyBytes)
      return null
    }
    return webCreate({ wantQuick: true, vaultKeyBytes })
  },

  // 生物识别验证（2FA 第二因子）
  async verify() {
    if (isNative()) return nativeVerify()
    return false
  },

  async webVerify(webBio) {
    return webVerify(webBio)
  },

  // 指纹快捷解锁
  async unlockQuick({ quick }) {
    if (isNative()) return nativeUnlockQuick()
    return webUnlockQuick(quick)
  },

  async removeQuick() {
    if (isNative()) await nativeRemoveQuick()
  },

  async hasQuick() {
    if (isNative()) return nativeHasQuick()
    return false
  }
}
