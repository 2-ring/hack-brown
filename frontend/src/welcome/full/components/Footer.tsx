
import { WordMark } from '../../../components/WordMark'
import { TwitterLogo, InstagramLogo, LinkedinLogo } from '@phosphor-icons/react'
import './Footer.css'

export function Footer() {
    return (
        <footer className="footer-section">
            <div className="footer-container">

                {/* Left: Copyright */}
                <div className="footer-left">
                    <span className="footer-copyright">© 2026 DropCal</span>
                </div>

                {/* Center: Brand + Socials */}
                <div className="footer-center">
                    <WordMark size={24} themeOverride="white" />
                    <div className="footer-socials">
                        <TwitterLogo weight="duotone" className="social-link" />
                        <InstagramLogo weight="duotone" className="social-link" />
                        <LinkedinLogo weight="duotone" className="social-link" />
                    </div>
                </div>

                {/* Right: Legal */}
                <div className="footer-right">
                    <span className="footer-legal">
                        <a href="/privacy" className="footer-legal-link">Privacy Policy</a>
                        <span className="footer-legal-divider">·</span>
                        <a href="/terms" className="footer-legal-link">Terms of Service</a>
                    </span>
                </div>

            </div>
        </footer>
    )
}
