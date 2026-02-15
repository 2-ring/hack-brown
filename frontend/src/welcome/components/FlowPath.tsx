import React, { useMemo } from 'react'
import './FlowPath.css'
import type { PathDescriptor } from './pathUtils'
import { resolvePath } from './pathUtils'

interface FlowPathProps {
    /** List of icon elements to rotate through */
    icons: React.ReactNode[];
    /** Size of each icon in pixels (width/height) */
    iconSize: number;
    /** Exact spacing/padding between icons in pixels */
    gap: number;
    /** SVG path string or array of {x,y} points (smooth spline) */
    path: PathDescriptor;
    /** Total length of the path in pixels. Auto-calculated if omitted. */
    pathLength?: number;
    /** Duration of one full loop in seconds */
    duration: number;
    /** Optional class name for the wrapper */
    className?: string;
}

export function FlowPath({
    icons,
    iconSize,
    gap,
    path,
    pathLength: pathLengthOverride,
    duration,
    className = ''
}: FlowPathProps) {

    // Resolve path descriptor to SVG path string + measured length
    const resolved = useMemo(() => resolvePath(path), [path])
    const svgPath = resolved.path
    const pathLength = pathLengthOverride ?? resolved.length

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
        <div className={`flow-path-container ${className}`}>
            {displayItems.map((item) => (
                <div
                    key={item.id}
                    className="fp-item-wrapper"
                    style={{
                        width: `${iconSize}px`,
                        height: `${iconSize}px`,
                        // @ts-ignore - CSS custom properties
                        '--path': `path('${svgPath}')`,
                        '--duration': `${duration}s`,
                        '--delay': `${item.delay}s`,
                    } as React.CSSProperties}
                >
                    <div className="fp-item-content">
                        {item.content}
                    </div>
                </div>
            ))}
        </div>
    )
}
