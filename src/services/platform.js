// 平台检测：Android(原生 Capacitor) / Web(Windows·Linux 浏览器)
export function isNative() {
  return (
    typeof window !== 'undefined' &&
    !!window.Capacitor &&
    !!window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  )
}

export function getPlatform() {
  if (isNative()) return window.Capacitor.getPlatform() // 'android' | 'ios'
  return 'web'
}

// 是否为安全上下文（WebAuthn / Web Crypto 的前提）
export function isSecureContext() {
  return typeof window !== 'undefined' && window.isSecureContext === true
}

export const platformLabel = isNative() ? (getPlatform() === 'android' ? 'Android' : 'iOS') : 'Web'
