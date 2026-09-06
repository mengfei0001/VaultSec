// 密码库整体导入/导出服务（换机迁移）
// 导出文件含全部密文数据（条目均为 AES-256-GCM 密文，meta 含盐/包装密钥/验证令牌），
// 不含主密码与任何明文；导入后需用原主密码解锁。生物识别信息（设备绑定）不随文件迁移。
import { storage } from './storage'
import { isNative } from './platform'

export const BACKUP_FORMAT = 'vaultsec-backup'
export const BACKUP_VERSION = 1

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result.split(',')[1])
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

// 组装导出对象（剥离设备绑定的生物识别信息）
export function buildBackupData(meta, entries) {
  const { biometrics, ...metaRest } = meta
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    app: '账号密码保管箱',
    meta: metaRest,
    entries: Array.isArray(entries) ? entries : []
  }
}

// 导出：native 写缓存文件并调起系统分享；Web 直接下载
export async function exportBackupFile() {
  const meta = await storage.get('meta')
  const entries = (await storage.get('entries')) || []
  if (!meta) throw new Error('没有可导出的密码库数据')
  const data = buildBackupData(meta, entries)
  const json = JSON.stringify(data, null, 2)
  const filename = `vaultsec-backup-${new Date().toISOString().slice(0, 10)}.json`

  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const base64 = await blobToBase64(new Blob([json], { type: 'application/json' }))
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache, recursive: true })
    const uri = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
    await Share.share({
      title: '账号密码保管箱 备份',
      text: '账号密码保管箱 备份（含密文，需主密码解密）',
      url: uri.uri,
      dialogTitle: '导出密码库'
    })
  } else {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  return { filename, count: data.entries.length }
}

// 解析并校验备份文件文本
export function parseBackup(text) {
  let obj
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (!obj || obj.format !== BACKUP_FORMAT) throw new Error('不是账号密码保管箱备份文件')
  if (!obj.meta || !obj.meta.salt || !obj.meta.wrap || !obj.meta.verifyToken) {
    throw new Error('备份文件缺少必要的密钥信息，可能已损坏')
  }
  if (!Array.isArray(obj.entries)) throw new Error('备份文件缺少条目数据')
  return {
    meta: obj.meta,
    entries: obj.entries,
    exportedAt: obj.exportedAt || null,
    count: obj.entries.length
  }
}

// 读取 File 为文本
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error)
    fr.readAsText(file)
  })
}
