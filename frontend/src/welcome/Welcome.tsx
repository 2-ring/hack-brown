import { useNavigate } from 'react-router-dom'
import { Mailbox, FingerprintSimple, ShootingStar, Link } from '@phosphor-icons/react'
import wordmark from '../assets/brand/light/wordmark.png'
import './Welcome.css'

export function Welcome() {
  const navigate = useNavigate()

  return (
    <div className="welcome">
      <header className="welcome-header">
        <img src={wordmark} alt="DropCal" className="welcome-wordmark" />
        <nav className="welcome-nav">
          <a href="mailto:contact@dropcal.app" className="welcome-link">
            <Mailbox size={20} weight="duotone" />
            Contact
          </a>
          <button onClick={() => navigate('/')} className="welcome-link">
            <FingerprintSimple size={20} weight="duotone" />
            Log In
          </button>
        </nav>
      </header>

      <main className="welcome-main">
        <div className="welcome-content">
          <h1 className="welcome-hero">
            Drop anything in.
            <br />
            Get events out.
          </h1>
          <div className="welcome-demo-placeholder" />
          <button onClick={() => navigate('/')} className="welcome-cta">
            <ShootingStar size={22} weight="duotone" />
            See the magic
            <Link size={18} weight="bold" />
          </button>
        </div>
      </main>
    </div>
  )
}
