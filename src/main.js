import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useVaultStore } from './stores/vault'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// 先完成保险库初始化，再安装路由并挂载。
// 若先安装路由，首屏导航会在 status='init' 时被放行到 HomeRouter，之后状态变化不会再次触发守卫，导致卡在加载页。
useVaultStore(pinia)
  .init()
  .catch((err) => console.error('保险库初始化失败:', err))
  .finally(() => {
    app.use(router)
    app.mount('#app')
  })
