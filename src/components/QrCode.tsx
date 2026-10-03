import { useMemo } from 'react';
import { qrSvgPath, type QrEcc } from '../lib/qr';

/**
 * Renders a scannable QR code as inline SVG.
 *
 * Scanners need a light quiet zone of at least four modules on every side, or
 * the corner finder patterns get clipped and the code will not read. That is
 * why the padding is baked into the viewBox rather than left to CSS margins:
 * a margin does not travel with the SVG, and a member screenshotting this
 * code to send to an admin would otherwise lose the border and break scanning.
 *
 * The modules are drawn in near-black on white deliberately. The surrounding
 * page chrome can be any colour the design wants - including the red frame the
 * attendance screen uses - but the code itself stays high contrast, because
 * that is what decides whether a phone camera reads it in a dim venue.
 */
export default function QrCode({
  value,
  className = '',
  level = 'M',
}: {
  value: string
  className?: string
  level?: QrEcc
}) {
  const { path, size } = useMemo(() => {
    try {
      return qrSvgPath(value, level)
    } catch {
      // Never crash the page over a code that failed to encode: show nothing
      // rather than a half-rendered symbol an admin cannot scan.
      return { path: '', size: 0 }
    }
  }, [value, level])

  if (!size) return null

  const quiet = 4
  const extent = size + quiet * 2

  return (
    <svg
      // The content is a scannable code, not decoration, so it needs an
      // accessible name that says what it is rather than reading as noise.
      role="img"
      aria-label="Scan this code to confirm your attendance"
      className={className}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <g transform={`translate(${quiet} ${quiet})`} fill="#0a0a0a">
        <path d={path} />
      </g>
    </svg>
  )
}