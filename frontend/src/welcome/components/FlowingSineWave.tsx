import React, { useMemo } from 'react'
import './FlowingSineWave.css'

interface FlowingSineWaveProps {
    /** List of icon elements to rotate through */
    icons: React.ReactNode[];
    /** Size of each icon in pixels (width/height) */
    iconSize: number;
    /** Exact spacing/padding between icons in pixels */
    gap: number;
    /** SVG path definition (d attribute) for the curve */
    path: string;
    /** Total length of the path in pixels (used for distribution) */
    pathLength: number;
    /** Duration of one full loop in seconds */
    duration: number;
    /** Optional class name for the wrapper */
    className?: string;
}

export function FlowingSineWave({
    icons,
    iconSize,
    gap,
    path,
    pathLength,
    duration,
    className = ''
}: FlowingSineWaveProps) {

    // Calculate layout
    const stride = iconSize + gap
    // Use floor to ensure we don't overflow the path (no overlap at loop point)
    const capacity = Math.floor(pathLength / stride)

    // Generate the display list by repeating the source icons
    const displayItems = useMemo(() => {
        if (!icons.length || capacity <= 0) return []
        return Array.from({ length: capacity }, (_, i) => {
            return {
                id: i,
                content: icons[i % icons.length],
                // Calculate delay: -1 * (duration * index / total_capacity)
                // This ensures instant distribution along the path
                delay: -1 * (duration * i / capacity)
            }
        })
    }, [icons, capacity, duration])

    return (
        <div className={`flowing-sine-wave-container ${className}`}>
            {displayItems.map((item) => (
                <div
                    key={item.id}
                    className="fsw-item-wrapper"
                    style={{
                        width: `${iconSize}px`,
                        height: `${iconSize}px`,
                        // @ts-ignore - CSS custom properties
                        '--path': `path('${path}')`,
                        '--duration': `${duration}s`,
                        '--delay': `${item.delay}s`,
                    } as React.CSSProperties}
                >
                    <div className="fsw-item-content">
                        {item.content}
                    </div>
                </div>
            ))}
        </div>
    )
}
