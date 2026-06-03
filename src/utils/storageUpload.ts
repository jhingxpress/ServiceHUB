import { supabase } from '../lib/supabase';

/**
 * Upload an image from a local file URI to Supabase Storage.
 * Uses React Native FormData + fetch for Hermes compatibility.
 *
 * Hermes does NOT support:
 *   new Blob([ArrayBuffer]) or new Blob([ArrayBufferView])
 *   atob() in release builds
 *   Uint8Array → Blob
 *
 * React Native FormData accepts { uri, type, name } objects natively.
 * The native networking layer reads the file via Android's ContentResolver,
 * handling both file:// and content:// URIs without any Blob/ArrayBuffer/atob
 * in JS.
 *
 * @param bucket - Supabase storage bucket name
 * @param path - File path inside the bucket (e.g. "avatars/user123.jpg")
 * @param uri - Local file URI from expo-image-picker
 * @param contentType - MIME type (e.g. "image/jpeg")
 * @returns Public URL of the uploaded file
 */
export async function uploadImageToStorage(
  bucket: string,
  path: string,
  uri: string,
  contentType: string
): Promise<string> {
  // Build the Supabase Storage REST endpoint directly.
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  // Read auth token
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? '';

  // Extract filename from path for FormData
  const fileName = path.split('/').pop() ?? 'upload.jpg';

  // Upload via FormData + fetch (Hermes-compatible)
  const formData = new FormData();
  formData.append('cacheControl', '3600');
  // @ts-expect-error React Native FormData accepts { uri, type, name } for file uploads; TS typedefs don't model this
  formData.append('', { uri, type: contentType, name: fileName });

  const uploadResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: formData,
  });

  const uploadBody = await uploadResponse.text();

  if (!uploadResponse.ok) {
    throw new Error(`Storage upload failed: HTTP ${uploadResponse.status} — ${uploadBody}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
