/**
 * Ticket 171e29fa: upload a profile picture to our own server instead of
 * forcing a member to host an image somewhere public.
 *
 * The file is read in the browser and sent as a data URL to /api/uploadAvatar
 * (a plain Express route, not a generated endpoint), which stores it on disk and
 * returns the /uploads/... URL the profile then saves as the avatar.
 */

const MAX_BYTES = 2 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export interface AvatarUploadResult {
  url: string;
}

export async function uploadAvatar(file: File): Promise<AvatarUploadResult> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error('Choose a PNG, JPG or WebP image.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That image is larger than 2 MB. Try a smaller one.');
  }
  const dataUrl = await readAsDataUrl(file);
  const res = await fetch('/api/uploadAvatar', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !body.url) throw new Error(body.message ?? 'Could not upload that image.');
  return { url: body.url };
}
