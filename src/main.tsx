import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './lib/store'
import './lib/install' // v1.10.1: catch beforeinstallprompt early
import './index.css'

// The single-file build runs from file://, so it routes with the URL hash.
const Router = import.meta.env.VITE_HASH ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router basename={import.meta.env.VITE_HASH ? undefined : import.meta.env.BASE_URL}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </Router>
  </StrictMode>,
)

// Offline support for the hosted build (not in dev, not in the file:// single-file build).
if (import.meta.env.PROD && !import.meta.env.VITE_HASH && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => { /* offline support is optional */ })
  })
}
