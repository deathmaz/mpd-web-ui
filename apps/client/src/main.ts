import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router/index.js'
import { useColorScheme } from './composables/useColorScheme'
import './assets/styles/main.css'

const { initColorScheme } = useColorScheme()
initColorScheme()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
