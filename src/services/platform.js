// 平台检测：Android(原生 Capacitor) / Electron 桌面(Windows·Linux·macOS) / Web 浏览器
function getCapacitorPlatform() {
  if (typeof window === 'undefined') return 'web'
  // Electron 桌面端：预加载脚本会注入 CapacitorCustomPlatform（早于 @capacitor/core）
  if (window.CapacitorCustomPlatform && window.CapacitorCustomPlatform.name) {
    return window.CapacitorCustomPlatform.name // 'electron'
  }
  if (
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  ) {
    return window.Capacitor.getPlatform() // 'android' | 'ios' | ...
  }
  return 'web'
}

export function isElectron() {
  return getCapacitorPlatform() === 'electron'
}

// 桌面端(Windows/Linux Electron)按 Web 逻辑处理：
// IndexedDB 存储、WebAuthn(Windows Hello / fprintd) 与 Blob 下载在 Electron 中均可用
export function isNative() {
  const p = getCapacitorPlatform()
  return p === 'android' || p === 'ios'
}

export function getPlatform() {
  return getCapacitorPlatform()
}

// 是否为安全上下文（WebAuthn / Web Crypto 的前提）
export function isSecureContext() {
  return typeof window !== 'undefined' && window.isSecureContext === true
}

function desktopOSLabel() {
  if (typeof navigator === 'undefined') return '桌面端'
  const ua = navigator.userAgent || ''
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return '桌面端'
}

export const platformLabel = (() => {
  const p = getCapacitorPlatform()
  if (p === 'android') return 'Android'
  if (p === 'ios') return 'iOS'
  if (p === 'electron') return desktopOSLabel()
  return 'Web'
})()
