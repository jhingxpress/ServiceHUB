import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

// ─── Public Handle ─────────────────────────────────────────────────────────────
// Mirrors the imperative API that @rnmapbox/maps would expose.
// Swap MapboxMap internals in a future sprint; callers stay unchanged.
export interface MapboxMapHandle {
  flyTo: (latitude: number, longitude: number, zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  updateUserLocation: (latitude: number, longitude: number) => void;
}

// ─── Props ─────────────────────────────────────────────────────────────────────
export interface MapboxMapProps {
  initialLatitude: number;
  initialLongitude: number;
  initialZoom?: number;
  showUserLocation?: boolean;
  style?: ViewStyle;
  onMapReady?: () => void;
  onRegionChange?: (latitude: number, longitude: number, zoom: number) => void;
}

// ─── HTML builder ──────────────────────────────────────────────────────────────
// Self-contained Leaflet page loaded via WebView source.html.
// Uses OpenStreetMap tiles (attribution-required, free, no API key).
function buildMapHTML(
  lat: number,
  lng: number,
  zoom: number,
  showUserLocation: boolean,
): string {
  const userLocationScript = showUserLocation
    ? `
      var userIcon = L.divIcon({
        className: '',
        html: '<div style="width:24px;height:24px;border-radius:50%;background:rgba(59,130,246,0.18);display:flex;align-items:center;justify-content:center;"><div style="width:12px;height:12px;border-radius:50%;background:#3B82F6;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      var userMarker = L.marker([${lat}, ${lng}], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      var accuracyCircle = L.circle([${lat}, ${lng}], {
        radius: 60,
        color: '#3B82F6',
        fillColor: '#3B82F6',
        fillOpacity: 0.07,
        weight: 1,
      }).addTo(map);
    `
    : 'var userMarker = null; var accuracyCircle = null;';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#e5e5e5; }
    #map { width:100%; height:100%; }
    .leaflet-control-attribution { font-size:9px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView([${lat}, ${lng}], ${zoom});

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    ${userLocationScript}

    function postMsg(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    map.on('moveend', function () {
      var c = map.getCenter();
      postMsg({ type: 'regionChange', latitude: c.lat, longitude: c.lng, zoom: map.getZoom() });
    });

    // Exposed to React Native via injectJavaScript
    window.mapCmd = {
      flyTo: function (lat, lng, z) {
        map.flyTo([lat, lng], z !== undefined ? z : map.getZoom(), { duration: 0.8 });
      },
      zoomIn:  function () { map.zoomIn(); },
      zoomOut: function () { map.zoomOut(); },
      updateUserLocation: function (lat, lng) {
        if (userMarker)      userMarker.setLatLng([lat, lng]);
        if (accuracyCircle)  accuracyCircle.setLatLng([lat, lng]);
      },
    };

    // Notify React Native that the map is ready
    setTimeout(function () {
      postMsg({ type: 'mapReady' });
    }, 400);
  </script>
</body>
</html>`;
}

// ─── Component ─────────────────────────────────────────────────────────────────
const MapboxMap = forwardRef<MapboxMapHandle, MapboxMapProps>(
  (
    {
      initialLatitude,
      initialLongitude,
      initialZoom = 14,
      showUserLocation = true,
      style,
      onMapReady,
      onRegionChange,
    },
    ref,
  ) => {
    const webViewRef = useRef<WebView>(null);

    const inject = useCallback((js: string) => {
      webViewRef.current?.injectJavaScript(`${js}; true;`);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        flyTo: (lat, lng, zoom?) =>
          inject(`window.mapCmd.flyTo(${lat}, ${lng}, ${zoom ?? 'undefined'})`),
        zoomIn:  () => inject('window.mapCmd.zoomIn()'),
        zoomOut: () => inject('window.mapCmd.zoomOut()'),
        updateUserLocation: (lat, lng) =>
          inject(`window.mapCmd.updateUserLocation(${lat}, ${lng})`),
      }),
      [inject],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const payload = JSON.parse(event.nativeEvent.data);
          if (payload.type === 'mapReady') {
            onMapReady?.();
          } else if (payload.type === 'regionChange') {
            onRegionChange?.(payload.latitude, payload.longitude, payload.zoom);
          }
        } catch {
          // ignore malformed messages
        }
      },
      [onMapReady, onRegionChange],
    );

    const html = buildMapHTML(
      initialLatitude,
      initialLongitude,
      initialZoom,
      showUserLocation,
    );

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          source={{ html, baseUrl: 'https://openstreetmap.org' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          onMessage={handleMessage}
          style={styles.webView}
        />
      </View>
    );
  },
);

MapboxMap.displayName = 'MapboxMap';
export default MapboxMap;

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  webView:   { flex: 1, backgroundColor: 'transparent' },
});
