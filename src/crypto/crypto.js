// ============================================================================
// 加密核心 —— 最高安全等级
// 方案：
//  1. 信封加密 (Envelope Encryption)：
//     - 随机生成 256 位「主密钥 vaultKey」，用于加密全部密码条目(AES-256-GCM)。
//     - 主密钥由「主密码」经 PBKDF2-SHA256(600,000 次迭代 + 随机盐) 派生的密钥
//       再次用 AES-256-GCM 包装(wrap)后落盘。主密码本身永不上传、永不落盘。
//  2. 每个条目使用独立随机 IV；GCM 认证标签保证密文完整性(防篡改)。
//  3. 密码正确性校验：解包主密钥时若密码错误，GCM 认证必然失败 -> 抛出异常。
// ============================================================================

const enc = new TextEncoder()
const dec = new TextDecoder()

// OWASP 推荐：PBKDF2-HMAC-SHA256 迭代次数 600,000
export const PBKDF2_ITERATIONS = 600000
export const KEY_ALGO = { name: 'AES-GCM', length: 256 }

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))

// ---------- base64 工具 ----------
export function bytesToB64(bytes) {
  let bin = ''
  const view = new Uint8Array(bytes)
  const chunk = 0x8000
  for (let i = 0; i < view.length; i += chunk) {
    bin += String.fromCharCode(...view.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bufToB64(buf) {
  return bytesToB64(new Uint8Array(buf))
}

export function b64ToBuf(b64) {
  return b64ToBytes(b64).buffer
}

// ---------- 随机数 ----------
export function randomBytesU8(n) {
  return randomBytes(n)
}

export function randomId() {
  return bytesToB64(randomBytes(16)).replace(/[^a-zA-Z0-9]/g, '')
}

// ---------- 密钥派生 ----------
export async function deriveKey(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    KEY_ALGO,
    false,
    ['encrypt', 'decrypt']
  )
}

export async function importRawKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, KEY_ALGO, false, ['encrypt', 'decrypt'])
}

// ---------- AES-256-GCM 加解密 ----------
async function aesGcmEncrypt(key, data) {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return { iv: bytesToB64(iv), ct: bufToB64(ct) }
}

async function aesGcmDecrypt(key, { iv, ct }) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(iv) },
    key,
    b64ToBuf(ct)
  )
  return new Uint8Array(plain)
}

// ---------- 信封加密：主密钥生成 / 包装 / 解包 ----------
export function generateVaultKey() {
  return randomBytes(32)
}

export async function wrapVaultKey(kek, vaultKeyBytes) {
  // vaultKeyBytes: Uint8Array(32)
  return aesGcmEncrypt(kek, vaultKeyBytes)
}

export async function unwrapVaultKey(kek, wrap) {
  const bytes = await aesGcmDecrypt(kek, wrap)
  if (bytes.length !== 32) throw new Error('主密钥解包失败')
  return bytes
}

// ---------- 条目加解密 ----------
export async function encryptEntry(vaultKey, plainObj) {
  return aesGcmEncrypt(vaultKey, enc.encode(JSON.stringify(plainObj)))
}

export async function decryptEntry(vaultKey, { iv, ct }) {
  const bytes = await aesGcmDecrypt(vaultKey, { iv, ct })
  return JSON.parse(dec.decode(bytes))
}

// ---------- 密码校验令牌(用于指纹快捷解锁时二次校验主密钥) ----------
export async function makeVerifyToken(vaultKey, vaultKeyB64) {
  return aesGcmEncrypt(vaultKey, enc.encode(vaultKeyB64))
}

export async function checkVerifyToken(key, token, vaultKeyBytes) {
  try {
    const b64 = dec.decode(await aesGcmDecrypt(key, token))
    return b64 === bytesToB64(vaultKeyBytes)
  } catch {
    return false
  }
}
