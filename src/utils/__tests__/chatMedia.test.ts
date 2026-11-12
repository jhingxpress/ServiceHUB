import { extractChatMediaObjectPath } from '../chatMedia';

describe('extractChatMediaObjectPath', () => {
  const bookingId = '3f8a2c1e-1234-4abc-9def-0123456789ab';

  it('extracts path from legacy public URL', () => {
    const url = `https://xyz.supabase.co/storage/v1/object/public/chat-media/${bookingId}/1699999999999.jpg`;
    expect(extractChatMediaObjectPath(url)).toBe(`${bookingId}/1699999999999.jpg`);
  });

  it('extracts path from signed URL and strips token', () => {
    const url = `https://xyz.supabase.co/storage/v1/object/sign/chat-media/${bookingId}/1699999999999.png?token=abc123`;
    expect(extractChatMediaObjectPath(url)).toBe(`${bookingId}/1699999999999.png`);
  });

  it('extracts path from authenticated-endpoint URL', () => {
    const url = `https://xyz.supabase.co/storage/v1/object/authenticated/chat-media/${bookingId}/1.webp`;
    expect(extractChatMediaObjectPath(url)).toBe(`${bookingId}/1.webp`);
  });

  it('returns raw object path unchanged', () => {
    expect(extractChatMediaObjectPath(`${bookingId}/1699999999999.jpg`)).toBe(
      `${bookingId}/1699999999999.jpg`
    );
  });

  it('rejects local file URIs', () => {
    expect(extractChatMediaObjectPath('file:///data/user/0/cache/ImagePicker/abc.jpg')).toBeNull();
    expect(extractChatMediaObjectPath('content://media/external/images/123')).toBeNull();
  });

  it('rejects URLs from other buckets', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/public/avatars/user123.jpg';
    expect(extractChatMediaObjectPath(url)).toBeNull();
  });

  it('rejects null, undefined, and empty values', () => {
    expect(extractChatMediaObjectPath(null)).toBeNull();
    expect(extractChatMediaObjectPath(undefined)).toBeNull();
    expect(extractChatMediaObjectPath('')).toBeNull();
  });
});
