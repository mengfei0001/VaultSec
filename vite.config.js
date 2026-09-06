import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base: './' 让 Capacitor 以 file:// 加载打包产物时资源路径正确
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: true,
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false
  }
})
