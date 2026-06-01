declare module 'expo-file-system' {
  export enum EncodingType {
    Base64 = 'base64',
    UTF8 = 'utf8',
  }

  export function readAsStringAsync(
    fileUri: string,
    options?: { encoding?: EncodingType }
  ): Promise<string>;
}
