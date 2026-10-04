import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import * as store from './store'

// handle for debugging / automated tests in dev builds only
if (import.meta.env.DEV) (window as unknown as { __m: typeof store }).__m = store

createApp(App).mount('#app')
