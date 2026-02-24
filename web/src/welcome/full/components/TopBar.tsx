import { CaretRight } from '@phosphor-icons/react'
import './TopBar.css'

export function TopBar() {
    return (
        <a href="#" className="top-bar" onClick={(e) => e.preventDefault()}>
            <div className="top-bar-content">
                <span className="top-bar-text">
                    <strong>Join the beta</strong> for early access.
                </span>
                <span className="top-bar-link">
                    Join now <CaretRight weight="bold" size={14} />
                </span>
            </div>
        </a>
    )
}
