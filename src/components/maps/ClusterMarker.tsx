/**
 * ClusterMarker — Sprint 6.0A stub
 *
 * Placeholder typed to the intended future interface.
 * Sprint 6.0B+ will implement leaflet.markercluster inside MapboxMap.
 *
 * Cluster rendering will be handled inside the Leaflet WebView;
 * this component represents the React-layer contract for callers.
 */

import { ProviderMarkerData } from './ProviderMarker';

export interface ClusterMarkerProps {
  count: number;
  providers: ProviderMarkerData[];
  latitude: number;
  longitude: number;
  onPress?: (providers: ProviderMarkerData[]) => void;
}

// Sprint 6.0A: no-op — clustering not yet implemented.
export default function ClusterMarker(_props: ClusterMarkerProps): null {
  return null;
}
