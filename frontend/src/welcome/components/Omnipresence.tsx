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

    // Icon definition - Neutral Duotone
    // User requested "secondary text color duo tone" and "no colors".
    const NEUTRAL_COLOR = 'var(--text-secondary)';

    const iconBase = [
        { Icon: Envelope },
        { Icon: ChatCircleText },
        { Icon: Camera },
        { Icon: FileText },
        { Icon: Microphone },
        { Icon: LinkIcon },
        { Icon: WhatsappLogo },
        { Icon: SlackLogo },
        { Icon: FigmaLogo },
        { Icon: NotionLogo },
        { Icon: SpotifyLogo },
        { Icon: SoundcloudLogo },
        { Icon: TwitchLogo },
        { Icon: DiscordLogo },
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
                    <FlowIcon key={i} index={i} total={TOTAL_ICONS} color={NEUTRAL_COLOR}>
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
