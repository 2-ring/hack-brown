

import { useNavigate } from 'react-router-dom'
import './BottomCTA.css'

export function BottomCTA() {
    const navigate = useNavigate()

    return (
        <section className="bottom-cta-section">
            <div className="bottom-cta-orb" />

            <div className="bottom-cta-container">
                <h2 className="bottom-cta-headline">
                    Start dropping
                </h2>

                <p className="bottom-cta-subtext">
                    One-click scheduling from photos, PDFs, emails, voice notes, and text. Join the beta and try it free.
                </p>

                <button
                    className="bottom-cta-button"
                    onClick={() => navigate('/signup')}
                >
                    Join the Beta
                </button>

                <div className="bottom-cta-availability">
                    <span>Available on web, iOS, and Android</span>
                </div>
            </div>
        </section>
    )
}
