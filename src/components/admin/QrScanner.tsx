import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import jsQR from 'jsqr';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Camera, Keyboard, Loader2 } from 'lucide-react';

/**
 * In-app QR scanner for venue check-in.
 *
 * Why it lives in the app: a QR scanned from the phone's normal camera app opens
 * the URL in the DEFAULT browser, and an installed PWA cannot claim that. On a
 * phone whose default is Firefox that is not the app at all. Scanning inside the
 * app sidesteps the OS entirely.
 *
 * ORDER MATTERS, and the first version got it wrong: it checked for the native
 * BarcodeDetector BEFORE asking for the camera, so on any phone without that API
 * (iOS Safari, Firefox) it claimed "this device cannot scan" without ever
 * requesting the camera - which reads as a lie, because the camera was there all
 * along. Now the camera is requested first, and decoding has two paths:
 *   - the native BarcodeDetector when present (fastest), and
 *   - a bundled jsQR decoder over a canvas frame otherwise, so iOS and Firefox
 *     work too.
 * Typing the code stays as a final fallback.
 */

type DetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement | ImageBitmap) => Promise<Array<{ rawValue: string }>>;
};

/** Pull the token out of an approval URL, or accept a bare token. */
export function tokenFromScan(raw: string): string | null {
  const value = raw.trim();
  const fromUrl = value.match(/\/a\/([A-Za-z0-9]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[A-Za-z0-9]{8,64}$/.test(value)) return value;
  return null;
}

export default function QrScanner({ open, onToken, onClose }: {
  open: boolean;
  onToken: (token: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>();
  const [state, setState] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<'native' | 'jsqr' | null>(null);
  const [manual, setManual] = useState('');

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      stop();
      setState('idle');
      setError(null);
      setManual('');
      setEngine(null);
      return;
    }
    let cancelled = false;

    const start = async () => {
      setState('starting');
      setError(null);

      // 1. Camera FIRST. Never claim it is unavailable before asking.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (e) {
        if (cancelled) return;
        setState('error');
        const name = (e as Error)?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow the camera for this site, then try again — or type the code below.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device. Type the code shown on the member’s phone instead.'
              : 'Could not start the camera. Type the code shown on the member’s phone instead.',
        );
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      try {
        await v.play();
      } catch {
        // Some browsers reject play() until the element is visible; the tick
        // below still runs once frames arrive.
      }
      setState('scanning');

      // 2. Decode. Native detector if we have it, else the bundled jsQR.
      const hasNative = 'BarcodeDetector' in window;
      setEngine(hasNative ? 'native' : 'jsqr');
      const Detector = hasNative
        ? (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
        : null;
      const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;

      const finish = (token: string) => {
        stop();
        onToken(token);
      };

      const tick = async () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            if (detector) {
              const codes = await detector.detect(video);
              if (codes.length) {
                const tok = tokenFromScan(codes[0].rawValue);
                if (tok) return finish(tok);
              }
            } else if (ctx && canvas) {
              // Draw a downscaled frame; full resolution is slow and jsQR does
              // not need it.
              const w = Math.min(video.videoWidth, 640);
              const h = Math.round((video.videoHeight / video.videoWidth) * w);
              if (w > 0 && h > 0) {
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(video, 0, 0, w, h);
                const img = ctx.getImageData(0, 0, w, h);
                const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
                if (code?.data) {
                  const tok = tokenFromScan(code.data);
                  if (tok) return finish(tok);
                }
              }
            }
          } catch {
            // A single bad frame is normal while the camera settles.
          }
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      void tick();
    };

    void start();
    return () => { cancelled = true; stop(); };
  }, [open, onToken]);

  const submitManual = () => {
    const token = tokenFromScan(manual);
    if (!token) { toast.error('That does not look like a valid code.'); return; }
    stop();
    onToken(token);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4 text-primary" />Scan a check-in code</DialogTitle>
          <DialogDescription>Point the camera at the member’s QR code.</DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-xl border bg-black/60" style={{ aspectRatio: '1 / 1' }}>
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          {state !== 'scanning' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white/80">
              {(state === 'starting' || state === 'idle') && <Loader2 className="h-6 w-6 animate-spin" />}
              {state === 'error' && <p>{error}</p>}
            </div>
          )}
          {state === 'scanning' && (
            <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-primary/70" />
          )}
        </div>

        {state === 'scanning' && engine && (
          <p className="text-center text-[11px] text-muted-foreground">
            {engine === 'native' ? 'Scanning (device decoder)…' : 'Scanning…'}
          </p>
        )}

        <div className="space-y-2 border-t pt-3">
          <label htmlFor="manual-code" className="flex items-center gap-1.5 text-sm font-medium">
            <Keyboard className="h-3.5 w-3.5" /> Or type / paste the code
          </label>
          <div className="flex gap-2">
            <Input
              id="manual-code"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Code or link"
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
            />
            <Button onClick={submitManual} disabled={!manual.trim()}>Go</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
