import React from 'react'
import './Omnipresence.css'
import {
    GoogleLogo,
    AppleLogo,
    MicrosoftOutlookLogo,
    Envelope,
    ChatCircleText,
    Camera,
    FileText,
    Microphone,
    Link as LinkIcon,
    WhatsappLogo,
    SlackLogo,
    FigmaLogo,
    NotionLogo,
    SpotifyLogo,
    SoundcloudLogo,
    TwitchLogo,
    DiscordLogo
} from '@phosphor-icons/react'

/**
 * FlowIcon moves along the CSS offset-path.
 */
const FlowIcon = ({ index, total, children, color = 'var(--text-primary)' }: { index: number, total: number, children: React.ReactNode, color?: string }) => {
    // Total duration of animation must match CSS (45s)
    const duration = 45
    // Calculate negative delay to distribute initially
    // delay = -1 * (duration * index / total)
    const delay = -1 * (duration * index / total)

    return (
        <div
            className="flow-icon-wrapper"
            style={{ animationDelay: `${delay}s` }}
        >
            <div className="flow-icon" style={{ color }}>
                {children}
            </div>
        </div>
    )
}

export function Omnipresence() {

    // Icon definition
    const iconBase = [
        { Icon: Envelope, color: '#EA4335' },
        { Icon: ChatCircleText, color: '#34A853' },
        { Icon: Camera, color: '#FBBC04' },
        { Icon: FileText, color: '#4285F4' },
        { Icon: Microphone, color: '#F97316' },
        { Icon: LinkIcon, color: '#A855F7' },
        { Icon: WhatsappLogo, color: '#25D366' },
        { Icon: SlackLogo, color: '#4A154B' },
        { Icon: FigmaLogo, color: '#F24E1E' },
        { Icon: NotionLogo, color: '#ffffff' },
        { Icon: SpotifyLogo, color: '#1DB954' },
        { Icon: SoundcloudLogo, color: '#FF5500' },
        { Icon: TwitchLogo, color: '#9146FF' },
        { Icon: DiscordLogo, color: '#5865F2' },
    ]

    // Create a density of icons.
    // Adjusted for "constant padding" and "no overlapping".
    // Path Length ~2600px. Stride (56px width + 16px gap) = 72px.
    // Max Capacity = 2600 / 72 = ~36 icons.
    const TOTAL_ICONS = 36

    const flowIcons = Array.from({ length: TOTAL_ICONS }, (_, i) => {
        const item = iconBase[i % iconBase.length]
        return {
            ...item,
            id: i
        }
    })

    return (
        <section className="omnipresence-section">
            <div className="floating-icons-container">
                {flowIcons.map((item, i) => (
                    <FlowIcon key={i} index={i} total={TOTAL_ICONS} color={item.color}>
                        <item.Icon weight="duotone" />
                    </FlowIcon>
                ))}
            </div>

            <div className="omnipresence-container">
                {/* Left Side: Content */}
                <div className="omnipresence-content">
                    <div className="platform-chips">
                        <div className="platform-chip">
                            <GoogleLogo weight="duotone" className="platform-icon" />
                            Google Calendar
                        </div>
                        <div className="platform-chip">
                            <AppleLogo weight="duotone" className="platform-icon" />
                            Apple Calendar
                        </div>
                        <div className="platform-chip">
                            <MicrosoftOutlookLogo weight="duotone" className="platform-icon" />
                            Outlook
                        </div>
                    </div>

                    <h2 className="omnipresence-title">
                        Schedule from anywhere,<br />
                        on any device
                    </h2>

                    <p className="omnipresence-subtext">
                        DropCal lives wherever scheduling information exists. Share a screenshot, forward an email, text a photo, paste a link. Your preferences sync across every surface.
                    </p>

                    <button className="omnipresence-cta">
                        See how it works
                    </button>
                </div>

                {/* Right Side: Visual (Phone) */}
                <div className="omnipresence-visual">
                    <div className="phone-mockup">
                        <div className="phone-notch"></div>
                        <div className="phone-screen">
                            <div className="app-screen-placeholder">
                                <div className="app-header-ph"></div>
                                <div style={{ marginTop: '20px' }}></div>
                                <div className="app-card-ph"></div>
                                <div className="app-card-ph"></div>
                                <div className="app-card-ph"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
