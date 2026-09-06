// IndexedDB 持久化服务：所有落盘数据均为密文(base64 字符串)
const DB_NAME = 'vault_secure'
const STORE = 'kv'
const DB_VERSION = 1

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const storage = {
  async get(key) {
    return tx('readonly', (s) => s.get(key))
  },
  async set(key, value) {
    // 深度转为纯 JSON 对象再写入：Vue 响应式 Proxy 无法被结构化克隆，
    // 且本应用只落盘 JSON 安全的密文(字符串/数组)，此转换同时保证不泄露非纯数据。
    const plain = JSON.parse(JSON.stringify(value))
    await tx('readwrite', (s) => s.put(plain, key))
  },
  async remove(key) {
    await tx('readwrite', (s) => s.delete(key))
  },
  async clearAll() {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite')
      const store = t.objectStore(STORE)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}
