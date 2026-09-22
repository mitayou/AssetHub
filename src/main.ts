import { createApp } from 'vue'
import App from './App.vue'
import './styles/variables.css'
import { syncPageTitle } from './utils/title'

// 初始化并同步网页标题（支持 iframe 嵌套宿主标题同步）
syncPageTitle()

const app = createApp(App)
app.mount('#app')


