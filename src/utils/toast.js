import { reactive } from 'vue'

export const toasts = reactive([])
let seq = 0

export function toast(msg, ms = 2600) {
  const id = ++seq
  toasts.push({ id, msg })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i > -1) toasts.splice(i, 1)
  }, ms)
}
