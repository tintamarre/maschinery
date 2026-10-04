import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import * as bounce from './core/bounce'
import * as engine from './core/engine'
import * as project from './core/project'
import * as samples from './core/samples'
import * as selection from './selection'
import * as store from './store'

// handles for debugging / automated tests in dev builds only
if (import.meta.env.DEV) {
  Object.assign(window, { __m: store, __sel: selection, __core: { ...engine, ...project, ...bounce, samples } })
}

createApp(App).mount('#app')
