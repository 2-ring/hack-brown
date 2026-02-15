import React from 'react'
import './Omnipresence.css'
import { FlowingSineWave } from './FlowingSineWave'
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

export function Omnipresence() {

    // 1. Icon List (Source) - Multi-colored as requested
    const iconSource = [
        { Icon: Envelope, color: '#EA4335' },
        { Icon: ChatCircleText, color: '#34A853' },
        { Icon: Camera, color: '#FBBC04' },
        { Icon: FileText, color: '#4285F4' },
        { Icon: Microphone, color: '#F97316' },
        { Icon: LinkIcon, color: '#A855F7' },
        { Icon: WhatsappLogo, color: '#25D366' },
        { Icon: SlackLogo, color: '#4A154B' },
        { Icon: FigmaLogo, color: '#F24E1E' },
        { Icon: NotionLogo, color: 'var(--text-secondary)' }, // Notion usually B/W, but Neutral Duo for now looks good
        { Icon: SpotifyLogo, color: '#1DB954' },
        { Icon: SoundcloudLogo, color: '#FF5500' },
        { Icon: TwitchLogo, color: '#9146FF' },
        { Icon: DiscordLogo, color: '#5865F2' },
    ]

    // Prepare the React Nodes for the component
    // We want neutral Duotone styling for the icons themselves
    // Wait, recent request was "Neutral Duotone" then user said "Look at commit before... for coloring" (Multi-colored)
    // Then user said "No... icons should not be colored" (Neutral).
    // THEN User said "No look how the COLORING... was done before" (Multi-colored)
    // THEN User said "I DONT want colors!!!!... secondary text color duo tone" (Neutral).
    // The LATEST instruction is "I DONT want colors!!!!... secondary text color duo tone".
    // So I will use NEUTRAL_COLOR.
    const NEUTRAL_COLOR = 'var(--text-secondary)'

    const iconNodes = iconSource.map((item, i) => (
        <div key={i} className="omnipresence-icon-card">
            <item.Icon weight="duotone" style={{ color: NEUTRAL_COLOR }} />
        </div>
    ))

    // 2. Curve Parameters
    // "Dip -> Rise -> Crest" Path
    const PATH_DEFINITION = 'M -400 650 C 0 950, 1000 50, 2000 350'
    const PATH_LENGTH = 2600 // Approx length

    // 3. Size & Spacing
    // Scaled up: 80px wrapper (72px content + border/padding effectively)
    // Actually the user said "scale up individual square".
    // Previously we had 80px wrapper for 72px icon.
    // Let's pass 80px as iconSize (the wrapper size)
    // or pass 72px as size and handle wrapper padding in CSS?
    // The component wrapper size matches `iconSize`.
    // So if we want the card to be 80px, pass 80.
    const ICON_SIZE = 80
    const GAP = 20
    const DURATION = 45

    return (
        <section className="omnipresence-section">
            <FlowingSineWave
                icons={iconNodes}
                iconSize={ICON_SIZE}
                gap={GAP}
                path={PATH_DEFINITION}
                pathLength={PATH_LENGTH}
                duration={DURATION}
            />

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
