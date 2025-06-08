// src/main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'bulma/css/bulma.min.css'
// Import Bulma and custom styles
import './assets/main.css' // This will import Bulma
// main.js 里全局配置 axios 拦截
import axios from 'axios'
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('proxy_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')

