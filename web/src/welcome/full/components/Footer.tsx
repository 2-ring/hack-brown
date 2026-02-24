
import { WordMark } from '../../../components/WordMark'
import { TwitterLogo, InstagramLogo, LinkedinLogo } from '@phosphor-icons/react'
import './Footer.css'

export function Footer() {
    return (
        <footer className="footer-section">
            <div className="footer-container">

                {/* Center: Brand + Socials */}
                <div className="footer-center">
                    <WordMark size={24} themeOverride="white" />
                    <div className="footer-socials">
                        <TwitterLogo weight="duotone" className="social-link" />
                        <InstagramLogo weight="duotone" className="social-link" />
                        <LinkedinLogo weight="duotone" className="social-link" />
                    </div>
                </div>

            </div>
        </footer>
    )
}
