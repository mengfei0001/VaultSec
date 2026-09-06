// 密码生成与强度评估（全部基于 crypto.getRandomValues，非 Math.random）

const CHARS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~'
}

export function generatePassword({ length = 20, lower = true, upper = true, digits = true, symbols = true } = {}) {
  const pool = []
  if (lower) pool.push(CHARS.lower)
  if (upper) pool.push(CHARS.upper)
  if (digits) pool.push(CHARS.digits)
  if (symbols) pool.push(CHARS.symbols)
  const all = pool.join('')
  if (!all) return ''
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  const out = []
  // 保证每类至少出现一次
  for (const set of pool) {
    out.push(set[bytes[out.length] % set.length])
  }
  for (let i = out.length; i < length; i++) {
    out.push(all[bytes[i] % all.length])
  }
  // 打乱顺序
  for (let i = out.length - 1; i > 0; i--) {
    const j = bytes[(i * 7) % length] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join('')
}

// 基于熵的强度评分 0-100
export function strengthScore(pw) {
  if (!pw) return 0
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33
  const entropy = pw.length * Math.log2(pool || 1)
  return Math.min(100, Math.round((entropy / 100) * 100))
}

export function strengthLabel(score) {
  if (score < 30) return { text: '极弱', cls: 's-weak' }
  if (score < 55) return { text: '弱', cls: 's-weak' }
  if (score < 75) return { text: '中等', cls: 's-mid' }
  if (score < 90) return { text: '强', cls: 's-strong' }
  return { text: '极强', cls: 's-max' }
}

// 主密码必须达到的安全门槛（要求至少 60 分且长度 >= 8）
export function isMasterPasswordValid(pw) {
  return !!pw && pw.length >= 8 && strengthScore(pw) >= 60
}
