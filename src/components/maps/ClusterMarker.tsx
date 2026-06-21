/**
 * ClusterMarker — Sprint 6.0D
 *
 * Clustering is fully implemented inside MapboxMap's Leaflet WebView
 * via leaflet.markercluster@1.5.3 (CDN). This module owns:
 *
 *   • ClusterConfig — typed appearance contract (matches the iconCreateFunction
 *     embedded in buildMapHTML).
 *   • DEFAULT_CLUSTER_CONFIG — the live threshold/colour values.
 *   • ClusterMarkerProps — React-layer type for future native port.
 *
 * The React component itself remains a no-op because rendering
 * happens entirely inside the WebView, not in React Native.
 */

import { ProviderMarkerData } from './ProviderMarker';

export interface ClusterTier {
  maxCount?: number;
  color: string;
  halo: string;
  size: number;
}

export interface ClusterConfig {
  small: ClusterTier;   // < small.maxCount
  medium: ClusterTier;  // < medium.maxCount
  large: ClusterTier;   // everything above
}

export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  small:  { maxCount: 10, color: '#3B82F6', halo: 'rgba(59,130,246,0.25)',  size: 36 },
  medium: { maxCount: 50, color: '#F97316', halo: 'rgba(249,115,22,0.25)',  size: 44 },
  large:  {               color: '#EF4444', halo: 'rgba(239,68,68,0.25)',   size: 52 },
};

export interface ClusterMarkerProps {
  count: number;
  providers: ProviderMarkerData[];
  latitude: number;
  longitude: number;
  onPress?: (providers: ProviderMarkerData[]) => void;
}

// Rendering is handled inside MapboxMap’s Leaflet WebView via leaflet.markercluster.
export default function ClusterMarker(_props: ClusterMarkerProps): null {
  return null;
}
