
import { WordMark } from '../../components/WordMark'
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
                    <div className="footer-logo">
                        <WordMark size={24} themeOverride="dark" />
                    </div>
                    <div className="footer-socials">
                        <a href="#" className="social-link" aria-label="Twitter">
                            <TwitterLogo weight="duotone" />
                        </a>
                        <a href="#" className="social-link" aria-label="Instagram">
                            <InstagramLogo weight="duotone" />
                        </a>
                        <a href="#" className="social-link" aria-label="LinkedIn">
                            <LinkedinLogo weight="duotone" />
                        </a>
                    </div>
                </div>

                {/* Right: Legal */}
                <div className="footer-right">
                    {/* Legal links handled by global footer */}
                </div>

            </div>
        </footer>
    )
}
