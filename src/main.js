// src/main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'bulma/css/bulma.min.css'
// Import Bulma and custom styles
import './assets/main.css' // This will import Bulma

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')

