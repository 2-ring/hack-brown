import { useNavigate } from 'react-router-dom'
import { Mailbox, FingerprintSimple } from '@phosphor-icons/react'
import { WordMark } from './WordMark'
import './PageHeader.css'

export function PageHeader() {
  const navigate = useNavigate()

  return (
    <header className="page-header">
      <div className="page-header-logo" onClick={() => navigate('/')}>
        <WordMark size={32} />
      </div>
      <nav className="page-header-nav">
        <a href="mailto:lucas@dropcal.ai" className="page-header-link">
          <Mailbox size={20} weight="duotone" />
          Contact
        </a>
        <button onClick={() => navigate('/')} className="page-header-link">
          <FingerprintSimple size={20} weight="duotone" />
          Log In
        </button>
      </nav>
    </header>
  )
}
