import { Platform } from 'react-native';

export type BucketName =
  | 'avatars'
  | 'chat-media'
  | 'review-media'
  | 'service-images'
  | 'provider-documents'
  | 'provider-profile-images'
  | 'provider-cover-images'
  | 'kyc-documents'
  | 'booking-photos';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const DANGEROUS_EXTENSIONS = [
  'exe', 'apk', 'zip', 'rar', 'js', 'html', 'htm', 'php', 'sh', 'bat',
  'cmd', 'com', 'dll', 'jar', 'py', 'rb', 'pl', 'cgi', 'asp', 'aspx',
  'jsp', 'war', 'ear', 'bin', 'msi', 'dmg', 'pkg', 'deb', 'rpm',
];

const BUCKET_SIZE_LIMITS: Record<BucketName, number> = {
  'avatars': 5 * 1024 * 1024,
  'chat-media': 5 * 1024 * 1024,
  'review-media': 5 * 1024 * 1024,
  'service-images': 10 * 1024 * 1024,
  'provider-documents': 15 * 1024 * 1024,
  'provider-profile-images': 5 * 1024 * 1024,
  'provider-cover-images': 5 * 1024 * 1024,
  'kyc-documents': 15 * 1024 * 1024,
  'booking-photos': 5 * 1024 * 1024,
};

/**
 * Extract extension from a filename or URI
 */
export function getFileExtension(uri: string): string {
  try {
    const filename = uri.split('/').pop() || uri.split('\\').pop() || uri;
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ext;
  } catch {
    return '';
  }
}

/**
 * Check if MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Check if file extension is dangerous
 */
export function hasDangerousExtension(uri: string): boolean {
  const ext = getFileExtension(uri);
  return DANGEROUS_EXTENSIONS.includes(ext);
}

/**
 * Get human-readable size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate file before upload
 * Returns validation result with optional error message
 */
export function validateFileForUpload(
  uri: string,
  mimeType: string,
  sizeInBytes: number,
  bucket: BucketName
): FileValidationResult {
  // 1. Extension check
  const ext = getFileExtension(uri);
  if (hasDangerousExtension(uri)) {
    return { valid: false, error: `Dangerous file type (.${ext}) is not allowed.` };
  }

  // 2. MIME type check
  if (!isAllowedMimeType(mimeType)) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Allowed: JPEG, PNG, WebP.`,
    };
  }

  // 3. MIME-extension consistency check
  const mimeToExtMap: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/jpg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
  };
  const expectedExts = mimeToExtMap[mimeType] || [];
  if (!expectedExts.includes(ext)) {
    return {
      valid: false,
      error: `File extension (.${ext}) does not match MIME type (${mimeType}). Possible spoofing attempt.`,
    };
  }

  // 4. Size check
  const limit = BUCKET_SIZE_LIMITS[bucket];
  if (sizeInBytes > limit) {
    return {
      valid: false,
      error: `File size (${formatFileSize(sizeInBytes)}) exceeds ${formatFileSize(limit)} limit for ${bucket}.`,
    };
  }

  return { valid: true };
}

/**
 * Validate image picked from ImagePicker
 * Works with Expo ImagePicker result
 */
export function validateImagePickerAsset(
  asset: { uri: string; mimeType?: string; fileSize?: number; type?: string },
  bucket: BucketName
): FileValidationResult {
  const mimeType = asset.mimeType || asset.type || 'image/jpeg';
  const size = asset.fileSize || 0;
  return validateFileForUpload(asset.uri, mimeType, size, bucket);
}
