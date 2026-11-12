/**
 * Chat media (chat-media bucket) helpers.
 *
 * messages.image_url may contain any of:
 *   - a legacy public URL:  https://<proj>.supabase.co/storage/v1/object/public/chat-media/<bookingId>/<file>
 *   - a signed URL:         https://<proj>.supabase.co/storage/v1/object/sign/chat-media/<bookingId>/<file>?token=...
 *   - a raw object path:    <bookingId>/<file>   (current write format)
 *
 * The chat-media bucket is private; images are always rendered via
 * short-lived signed URLs generated from the object path.
 */

const CHAT_MEDIA_MARKERS = [
  '/object/public/chat-media/',
  '/object/sign/chat-media/',
  '/object/authenticated/chat-media/',
];

/**
 * Extract the object path inside the chat-media bucket from a stored
 * image_url value. Returns null when the value is not a chat-media
 * reference (e.g. a local file:// URI or a different bucket).
 */
export function extractChatMediaObjectPath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;

  for (const marker of CHAT_MEDIA_MARKERS) {
    const idx = urlOrPath.indexOf(marker);
    if (idx !== -1) {
      const path = urlOrPath.slice(idx + marker.length);
      // Strip query string (signed URL tokens) if present.
      const q = path.indexOf('?');
      return q === -1 ? path : path.slice(0, q);
    }
  }

  // Raw object path: no scheme, no leading slash, no bucket prefix.
  if (!urlOrPath.includes('://') && !urlOrPath.startsWith('/')) {
    return urlOrPath;
  }

  return null;
}
