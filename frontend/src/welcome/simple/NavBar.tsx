import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { List, X, Mailbox, FingerprintSimple, Flask } from '@phosphor-icons/react'
import { Logo } from '../../components/Logo'
import { CTAButton } from '../full/components/CTAButton'
import { useTheme } from '../../theme/ThemeProvider'
import wordImageLight from '../../assets/brand/light/word.png'
import wordImageDark from '../../assets/brand/dark/word.png'
import './NavBar.css'

export function NavBar() {
    const navigate = useNavigate()
    const { resolvedTheme } = useTheme()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const wordImage = resolvedTheme === 'dark' ? wordImageDark : wordImageLight

    return (
        <>
            <nav className="welcome-nav nav-docked">
                <div className="nav-container">
                    <div className="nav-logo" onClick={() => navigate('/')}>
                        <Logo size={32} />
                        <img
                            src={wordImage}
                            alt="DropCal"
                            className="nav-wordmark-text"
                        />
                    </div>

                    <div className="nav-cta-container">
                        <a href="mailto:lucas@dropcal.ai" className="nav-secondary-link">
                            <Mailbox size={20} weight="duotone" />
                            Contact
                        </a>
                        <button onClick={() => navigate('/')} className="nav-secondary-link">
                            <FingerprintSimple size={20} weight="duotone" />
                            Log In
                        </button>
                        <CTAButton
                            text="Join Beta"
                            iconLeft={<Flask size={20} weight="duotone" />}
                            to="/"
                            backgroundColor="var(--primary)"
                            textColor="white"
                            className="nav-cta-button"
                        />

                        <button
                            className="mobile-menu-toggle"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? <X size={24} weight="duotone" /> : <List size={24} weight="duotone" />}
                        </button>
                    </div>
                </div>
            </nav>

            {mobileMenuOpen && (
                <div className="mobile-menu">
                    <div className="mobile-menu-links">
                        <a href="#" onClick={() => setMobileMenuOpen(false)}>Product</a>
                        <a href="#" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
                        <a href="#" onClick={() => setMobileMenuOpen(false)}>Beta</a>
                        <button className="mobile-cta-button" onClick={() => navigate('/')}>
                            Join the Beta
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
