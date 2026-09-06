import { toast } from './toast'

let clearTimer = null

// 复制到剪贴板并在指定秒数后自动清空
export async function copyWithClear(text, seconds = 30) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } catch {
      /* 忽略 */
    }
    ta.remove()
  }
  toast(`已复制，${seconds} 秒后自动清除`)
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => {})
    clearTimer = null
  }, seconds * 1000)
}
