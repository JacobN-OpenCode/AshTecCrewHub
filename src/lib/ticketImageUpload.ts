/**
 * Ticket 5a04aaf1: attach pictures to a support ticket.
 *
 * Same shape as the avatar uploader (read the file in the browser, POST a data
 * URL to a plain Express route, get back a path we host), but it posts to
 * /api/uploadTicketImage so ticket pictures land in their own folder.
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

export async function uploadTicketImage(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error('Choose a PNG, JPG or WebP image.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That image is larger than 2 MB. Try a smaller one.');
  }
  const dataUrl = await readAsDataUrl(file);
  const res = await fetch('/api/uploadTicketImage', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !body.url) throw new Error(body.message ?? 'Could not upload that image.');
  return body.url;
}
