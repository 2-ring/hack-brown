import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    List, X, Mailbox, FingerprintSimple, Flask,
    Envelope, ChatCircleText, Camera, FileText, Microphone,
    Link as LinkIcon, WhatsappLogo, SlackLogo, FigmaLogo, NotionLogo,
    SpotifyLogo, SoundcloudLogo, TwitchLogo, DiscordLogo,
    EyesIcon, ArrowSquareOut,
} from '@phosphor-icons/react'
import { Logo } from '../../components/Logo'
import { FlowPath } from '../full/components/FlowPath'
import { CTAButton } from '../full/components/CTAButton'
import phoneDemoLight from '../../assets/demo/phone-light.png'
import './Welcome.css'

function GoogleLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
            <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
            <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
            <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.001-.001 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
        </svg>
    )
}

function AppleLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 18 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.4556 7.15814C16.7692 7.5784 16.2006 8.16594 15.8031 8.86579C15.4055 9.56563 15.1921 10.3549 15.1826 11.1597C15.1853 12.0655 15.4537 12.9506 15.9545 13.7054C16.4553 14.4602 17.1665 15.0515 18 15.4061C17.6714 16.4664 17.185 17.4712 16.5572 18.3868C15.659 19.6798 14.7198 20.9727 13.2908 20.9727C11.8617 20.9727 11.4942 20.1425 9.84729 20.1425C8.24129 20.1425 7.66959 21 6.36297 21C5.05635 21 4.14455 19.8022 3.09649 18.3323C1.71208 16.2732 0.951222 13.8583 0.905212 11.3774C0.905212 7.29427 3.55931 5.13028 6.17241 5.13028C7.56069 5.13028 8.71769 6.04208 9.58869 6.04208C10.419 6.04208 11.712 5.07572 13.2908 5.07572C14.1025 5.05478 14.9069 5.23375 15.6332 5.59689C16.3595 5.96003 16.9853 6.49619 17.4556 7.15814ZM12.5422 3.34726C13.2382 2.52858 13.6321 1.49589 13.6583 0.421702C13.6595 0.280092 13.6458 0.13875 13.6175 0C12.422 0.116777 11.3165 0.686551 10.5278 1.59245C9.82519 2.37851 9.41639 3.38362 9.37089 4.43697C9.37139 4.56507 9.38509 4.69278 9.41179 4.81808C9.50599 4.8359 9.60169 4.84503 9.69759 4.84536C10.2485 4.80152 10.7848 4.64611 11.2738 4.38858C11.7629 4.13104 12.1944 3.77676 12.5422 3.34726Z" fill="currentColor"/>
        </svg>
    )
}

function MicrosoftLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 20 19" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9.12427 9.02804H0.0947876V0H9.12427V9.02804Z" fill="#F1511B"/>
            <path d="M19.0951 9.02804H10.0648V0H19.0943V9.02804H19.0951Z" fill="#80CC28"/>
            <path d="M9.12427 19.0012H0.0947876V9.97314H9.12427V19.0012Z" fill="#00ADEF"/>
            <path d="M19.0951 19.0012H10.0648V9.97314H19.0943V19.0012H19.0951Z" fill="#FBBC09"/>
        </svg>
    )
}

export function Welcome() {
    const navigate = useNavigate()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const iconSource = [
        Envelope, ChatCircleText, Camera, FileText, Microphone, LinkIcon,
        WhatsappLogo, SlackLogo, FigmaLogo, NotionLogo,
        SpotifyLogo, SoundcloudLogo, TwitchLogo, DiscordLogo,
    ]

    const iconNodes = iconSource.map((Icon, i) => (
        <div key={i} className="omnipresence-icon-card">
            <Icon weight="duotone" style={{ color: 'var(--text-secondary)' }} />
        </div>
    ))

    return (
        <div className="welcome-simple">
            {/* Nav — always docked */}
            <nav className="welcome-nav">
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

            <div className={`mobile-drawer-backdrop ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)} />
            <div className={`mobile-drawer ${mobileMenuOpen ? 'open' : ''}`}>
                <div className="mobile-drawer-handle" />
                <div className="mobile-drawer-links">
                    <a href="mailto:lucas@dropcal.ai" onClick={() => setMobileMenuOpen(false)}>
                        <Mailbox size={20} weight="duotone" />
                        Contact
                    </a>
                    <button onClick={() => { setMobileMenuOpen(false); navigate('/') }}>
                        <FingerprintSimple size={20} weight="duotone" />
                        Log In
                    </button>
                </div>
                <CTAButton
                    text="Join Beta"
                    iconLeft={<Flask size={20} weight="duotone" />}
                    to="/"
                    backgroundColor="var(--primary)"
                    textColor="white"
                    className="drawer-cta-button"
                />
            </div>

            {/* Omnipresence section */}
            <section className="omnipresence-section">
                <FlowPath
                    icons={iconNodes}
                    iconSize={80}
                    gap={20}
                    path="M -400 650 C 0 950, 1000 50, 2000 350"
                    pathLength={2600}
                    duration={45}
                />
                <div className="omnipresence-container">
                    <div className="omnipresence-content">
                        <div className="platform-chips">
                            <div className="platform-chip">
                                <GoogleLogo className="platform-icon" /> Google
                            </div>
                            <div className="platform-chip">
                                <AppleLogo className="platform-icon" /> Apple
                            </div>
                            <div className="platform-chip">
                                <MicrosoftLogo className="platform-icon" /> Microsoft
                            </div>
                        </div>
                        <h2 className="omnipresence-title">Schedule<br /> from anywhere</h2>
                        <p className="omnipresence-subtext">
                            DropCal lives wherever scheduling information exists. Share a screenshot, forward an email, text a photo, paste a link. Your preferences sync across every surface.
                        </p>
                        <CTAButton
                            text="See how it works"
                            to="/"
                            backgroundColor="#ffffff"
                            textColor="var(--primary-color)"
                            className="see-how-cta-desktop"
                            iconLeft={<EyesIcon size={22} weight="duotone" />}
                            iconRight={<ArrowSquareOut size={20} weight="duotone" />}
                        />
                    </div>
                    <div className="omnipresence-visual">
                        <div className="phone-mockup">
                            <div className="phone-notch"></div>
                            <div className="phone-screen">
                                <img
                                    src={phoneDemoLight}
                                    alt="DropCal app demo"
                                    className="phone-demo-img"
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <CTAButton
                    text="See how it works"
                    to="/"
                    backgroundColor="#ffffff"
                    textColor="var(--primary-color)"
                    className="see-how-cta-mobile"
                    iconLeft={<EyesIcon size={22} weight="duotone" />}
                    iconRight={<ArrowSquareOut size={20} weight="duotone" />}
                />
            </section>

        </div>
    )
}
