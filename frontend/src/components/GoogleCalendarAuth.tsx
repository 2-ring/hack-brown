import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowSquareOut } from '@phosphor-icons/react'
import './GoogleCalendarAuth.css'

interface GoogleCalendarAuthProps {
  onAuthChange?: (isAuthenticated: boolean) => void
}

export function GoogleCalendarAuth({ onAuthChange }: GoogleCalendarAuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    setIsChecking(true)
    try {
      const response = await fetch('http://localhost:5000/api/oauth/status')
      const data = await response.json()
      setIsAuthenticated(data.authenticated)
      onAuthChange?.(data.authenticated)
    } catch (error) {
      console.error('Failed to check auth status:', error)
      setIsAuthenticated(false)
      onAuthChange?.(false)
    } finally {
      setIsChecking(false)
    }
  }

  const handleSignIn = () => {
    // Open OAuth authorization in a new window/tab
    window.open('http://localhost:5000/api/oauth/authorize', '_blank')

    // Set up a listener to check auth status when user returns
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:5000/api/oauth/status')
        const data = await response.json()
        if (data.authenticated) {
          setIsAuthenticated(true)
          onAuthChange?.(true)
          clearInterval(checkInterval)
        }
      } catch (error) {
        console.error('Failed to check auth status:', error)
      }
    }, 2000)

    // Stop checking after 5 minutes
    setTimeout(() => clearInterval(checkInterval), 300000)
  }

  if (isChecking) {
    return (
      <div className="google-calendar-auth">
        <div className="auth-status checking">
          <span className="status-indicator"></span>
          <span>Checking Google Calendar connection...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="google-calendar-auth">
      {isAuthenticated ? (
        <motion.button
          className="google-sign-in-button google-connected"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          onClick={() => window.open('https://calendar.google.com', '_blank')?.focus()}
        >
          <svg className="google-icon" viewBox="0 0 48 48" width="20" height="20">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Connected to Google
          <ArrowSquareOut size={14} weight="regular" />
        </motion.button>
      ) : (
        <button
          className="google-sign-in-button"
          onClick={handleSignIn}
        >
          <svg className="google-icon" viewBox="0 0 48 48" width="20" height="20">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Sign in with Google
        </button>
      )}
    </div>
  )
}
