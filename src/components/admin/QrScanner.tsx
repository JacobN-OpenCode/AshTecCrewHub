import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
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
 * Decoding uses the native BarcodeDetector (Chrome/Edge/Android WebView, Safari
 * 17+). Where it is missing - notably Firefox - the scanner says so and offers
 * the code typed or pasted instead, so the flow never dead-ends.
 */

type DetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement | ImageBitmap) => Promise<Array<{ rawValue: string }>>;
};

const detectorAvailable = () =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window;

/** Pull the token out of an approval URL, or accept a bare token. */
export function tokenFromScan(raw: string): string | null {
  const value = raw.trim();
  const fromUrl = value.match(/\/a\/([A-Za-z0-9]+)/);
  if (fromUrl) return fromUrl[1];
  // A bare token, e.g. from the manual-entry box.
  if (/^[A-Za-z0-9]{8,64}$/.test(value)) return value;
  return null;
}

export default function QrScanner({ open, onToken, onClose }: {
  open: boolean;
  onToken: (token: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>();
  const [state, setState] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
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
      return;
    }
    let cancelled = false;

    const start = async () => {
      if (!detectorAvailable()) {
        setState('error');
        setError('This browser cannot scan QR codes. Type the code shown on the member’s phone instead.');
        return;
      }
      setState('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        setState('scanning');

        const Detector = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length) {
              const token = tokenFromScan(codes[0].rawValue);
              if (token) {
                stop();
                onToken(token);
                return;
              }
            }
          } catch {
            // A single failed frame is normal while the camera settles.
          }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch (e) {
        if (cancelled) return;
        setState('error');
        setError(
          (e as Error)?.name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow it in your browser settings, or type the code instead.'
            : 'Could not start the camera. Type the code shown on the member’s phone instead.',
        );
      }
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
          {state !== 'scanning' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white/80">
              {state === 'starting' || state === 'idle' ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
              {state === 'error' && <p>{error}</p>}
            </div>
          )}
          {state === 'scanning' && (
            <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-primary/70" />
          )}
        </div>

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
