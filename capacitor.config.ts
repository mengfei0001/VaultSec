import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.vault.secure',
  appName: '账号密码保管箱',
  webDir: 'dist',
  // https scheme 是 Android WebView 内 Web Crypto(crypto.subtle) 可用的必要条件
  server: {
    androidScheme: 'https'
  }
}

export default config
