import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { List, X, Mailbox, FingerprintSimple, Flask } from '@phosphor-icons/react'
import { WordMark } from '../../components/WordMark'
import './NavBar.css'

export function NavBar() {
    const navigate = useNavigate()
    const [isScrolled, setIsScrolled] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    return (
        <>
            <nav className={`welcome-nav ${isScrolled ? 'scrolled' : ''}`}>
                <div className="nav-container">
                    <div className="nav-logo" onClick={() => navigate('/')}>
                        <WordMark size={28} />
                    </div>

                    {/* Center links removed as per user request */}
                    {/* <div className="nav-links">
                        <a href="#" className="nav-link">Product</a>
                        <a href="#" className="nav-link">Pricing</a>
                        <a href="#" className="nav-link">Beta</a>
                    </div> */}

                    <div className="nav-cta-container">
                        <a href="mailto:lucas@dropcal.ai" className="nav-secondary-link">
                            <Mailbox size={20} weight="duotone" />
                            Contact
                        </a>
                        <button onClick={() => navigate('/')} className="nav-secondary-link">
                            <FingerprintSimple size={20} weight="duotone" />
                            Log In
                        </button>
                        <button className="nav-cta-button" onClick={() => navigate('/')}>
                            <Flask size={20} weight="duotone" style={{ marginRight: '8px' }} />
                            Join Beta
                        </button>

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
