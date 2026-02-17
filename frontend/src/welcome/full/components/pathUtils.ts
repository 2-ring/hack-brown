export type Point = { x: number; y: number }

/**
 * Accepts either a raw SVG path string (backwards compat) or an array of
 * points. Points are converted to a smooth cubic-bezier spline using
 * Catmull-Rom interpolation.
 */
export type PathDescriptor = string | Point[]

/**
 * Resolve any PathDescriptor to a final SVG path `d` string and its
 * measured pixel length.
 */
export function resolvePath(descriptor: PathDescriptor): {
    path: string
    length: number
} {
    const path =
        typeof descriptor === 'string'
            ? descriptor
            : pointsToSmoothPath(descriptor)

    return { path, length: measurePathLength(path) }
}

/**
 * Convert an ordered array of points into a smooth SVG cubic-bezier path
 * using Catmull-Rom → cubic-bezier conversion.
 *
 * Needs at least 2 points. With exactly 2, produces a straight line.
 */
function pointsToSmoothPath(points: Point[]): string {
    if (points.length === 0) return 'M 0 0'
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
    }

    // Pad with duplicated endpoints so every original segment gets a full
    // P0-P1-P2-P3 Catmull-Rom window.
    const pts = [points[0], ...points, points[points.length - 1]]

    let d = `M ${points[0].x} ${points[0].y}`

    for (let i = 0; i < pts.length - 3; i++) {
        const p0 = pts[i]
        const p1 = pts[i + 1]
        const p2 = pts[i + 2]
        const p3 = pts[i + 3]

        // Catmull-Rom → cubic bezier control points
        const cp1x = p1.x + (p2.x - p0.x) / 6
        const cp1y = p1.y + (p2.y - p0.y) / 6
        const cp2x = p2.x - (p3.x - p1.x) / 6
        const cp2y = p2.y - (p3.y - p1.y) / 6

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
    }

    return d
}

/**
 * Measure the pixel length of an SVG path string using the browser's
 * native SVGPathElement.getTotalLength().
 */
function measurePathLength(d: string): number {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
    // Must be in the DOM briefly for getTotalLength to work in all browsers
    svg.style.position = 'absolute'
    svg.style.width = '0'
    svg.style.height = '0'
    svg.style.overflow = 'hidden'
    document.body.appendChild(svg)
    const length = path.getTotalLength()
    document.body.removeChild(svg)
    return length
}
