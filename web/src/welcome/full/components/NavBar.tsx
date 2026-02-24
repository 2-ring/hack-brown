import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { List, X, Mailbox, FingerprintSimple, Flask } from '@phosphor-icons/react'
import { Logo } from '../../../components/Logo'
import { CTAButton } from './CTAButton'
import './NavBar.css'

export function NavBar() {
    const navigate = useNavigate()
    const [isDocked, setIsDocked] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setIsDocked(window.scrollY > 150)
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    return (
        <>
            <nav className={`welcome-nav ${isDocked ? 'nav-docked' : ''}`}>
                <div className="nav-container">
                    <div className="nav-logo" onClick={() => navigate('/')}>
                        <Logo size={32} />
                        <span className="display-text nav-wordmark-text">dropcal</span>
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

            {/* Mobile Menu Overlay */}
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
