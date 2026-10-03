// Admins can "preview as" a pretend (preview) account. The chosen id lives in sessionStorage.
const KEY = 'ashtec-preview-as';
export const previewId = () => sessionStorage.getItem(KEY) || undefined;
export const pv = () => { const id = previewId(); return id ? { previewAs: id } : {}; };
export function startPreview(id: string) { sessionStorage.setItem(KEY, id); window.location.href = '/'; }
export function exitPreview() { sessionStorage.removeItem(KEY); window.location.href = '/admin/members'; }
