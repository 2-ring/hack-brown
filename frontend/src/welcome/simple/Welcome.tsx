import { NavBar } from './NavBar'
import { Omnipresence } from '../full/components/Omnipresence'
import { WordMark } from '../../components/WordMark'
import { TwitterLogo, InstagramLogo, LinkedinLogo } from '@phosphor-icons/react'
import './Welcome.css'

export function Welcome() {
  return (
    <div className="welcome-simple">
      <NavBar />
      <Omnipresence />
      <div className="simple-footer">
        <WordMark size={24} themeOverride="white" />
        <div className="simple-footer-socials">
          <TwitterLogo weight="duotone" className="simple-social-link" />
          <InstagramLogo weight="duotone" className="simple-social-link" />
          <LinkedinLogo weight="duotone" className="simple-social-link" />
        </div>
      </div>
      <span className="simple-copyright">&copy; 2026 DropCal</span>
      <span className="simple-legal">
        <a href="/privacy">Privacy</a>
        <span>&middot;</span>
        <a href="/terms">Terms</a>
      </span>
    </div>
  )
}
