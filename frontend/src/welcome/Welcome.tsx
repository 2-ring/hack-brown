import { useNavigate } from 'react-router-dom'
import { Mailbox, FingerprintSimple, ShootingStar, Link, Drop } from '@phosphor-icons/react'
import wordImageLight from '../assets/brand/light/word.png'
import './Welcome.css'

export function Welcome() {
  const navigate = useNavigate()

  return (
    <div className="welcome">
      <header className="welcome-header">
        <div className="welcome-logo">
          <Drop size={32} weight="fill" color="#1170C5" />
          <img src={wordImageLight} alt="DropCal" className="welcome-word" />
        </div>
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
