import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { SkeletonWrapper } from './components/skeletons'
import { ThemeProvider } from './theme'

// Initialize PostHog
const posthogKey = import.meta.env.VITE_POSTHOG_KEY
const posthogHost = import.meta.env.VITE_POSTHOG_HOST

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost || 'https://us.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <SkeletonWrapper>
              <App />
            </SkeletonWrapper>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </PostHogProvider>
  </StrictMode>,
)
