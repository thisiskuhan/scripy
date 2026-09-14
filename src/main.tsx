import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/appearance.css'
import './styles/notifications.css'
import './styles/annotations.css'
import './styles/panels.css'
import './styles/home.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
