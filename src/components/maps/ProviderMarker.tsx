/**
 * ProviderMarker — Sprint 6.0B
 *
 * Typed data contract for provider markers rendered inside the Leaflet WebView.
 * Actual rendering happens via window.mapCmd.addMarker() / setMarkers() in MapboxMap.
 * This module owns the shared interface so MapboxMap, MapboxBottomSheet,
 * and MapboxDiscoveryScreen remain in sync.
 */

export interface ProviderMarkerData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: string | null;
  rating: number;
  isFeatured: boolean;
  imageUrl?: string | null;
  totalReviews?: number;
  hourlyRate?: number | null;
}

export interface ProviderMarkerProps {
  marker: ProviderMarkerData;
  selected?: boolean;
}

// Rendering is handled inside MapboxMap's Leaflet WebView via injectJavaScript.
export default function ProviderMarker(_props: ProviderMarkerProps): null {
  return null;
}
