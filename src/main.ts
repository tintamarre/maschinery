import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import * as bounce from './core/bounce'
import * as engine from './core/engine'
import * as midi from './core/midi'
import * as project from './core/project'
import * as samples from './core/samples'
import * as share from './core/share'
import * as selection from './selection'
import * as store from './store'

// handles for debugging / automated tests in dev builds only
if (import.meta.env.DEV) {
  Object.assign(window, { __m: store, __sel: selection, __core: { ...engine, ...project, ...bounce, ...share, samples, midi } })
}

createApp(App).mount('#app')

store.installAudioUnlock()
void store.loadFromHash()
window.addEventListener('hashchange', () => void store.loadFromHash())

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
