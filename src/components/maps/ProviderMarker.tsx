/**
 * ProviderMarker — Sprint 6.0A stub
 *
 * Placeholder typed to the intended future interface.
 * Sprint 6.0B will implement real marker injection into MapboxMap.
 *
 * Rendering is handled inside the Leaflet WebView via injectJavaScript.
 * This component exists as the React-facing interface layer so callers
 * in MapboxDiscoveryScreen can be written now and filled in later.
 */

export interface ProviderMarkerData {
  id: string;
  latitude: number;
  longitude: number;
  businessName: string | null;
  rating: number;
  isFeatured: boolean;
  profilePhotoUrl: string | null;
  businessLogo: string | null;
}

export interface ProviderMarkerProps {
  provider: ProviderMarkerData;
  selected?: boolean;
  onPress?: (id: string) => void;
}

// Sprint 6.0A: no-op — markers will be injected into MapboxMap WebView in 6.0B.
export default function ProviderMarker(_props: ProviderMarkerProps): null {
  return null;
}
