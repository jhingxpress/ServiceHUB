import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { ProviderMarkerData } from './ProviderMarker';

// ─── Public Handle ─────────────────────────────────────────────────────────────
// Mirrors the imperative API that @rnmapbox/maps would expose.
// Swap MapboxMap internals in a future sprint; callers stay unchanged.
export interface MapboxMapHandle {
  flyTo: (latitude: number, longitude: number, zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  updateUserLocation: (latitude: number, longitude: number) => void;
  addMarker: (marker: ProviderMarkerData) => void;
  clearMarkers: () => void;
  setMarkers: (markers: ProviderMarkerData[]) => void;
  selectMarker: (id: string) => void;
  addClusterMarker: (marker: ProviderMarkerData) => void;
  clearClusterMarkers: () => void;
  drawRoute: (points: [number, number][]) => void;
  clearRoute: () => void;
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
  onMarkerPress?: (providerId: string) => void;
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
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#e5e5e5; }
    #map { width:100%; height:100%; }
    .leaflet-control-attribution { font-size:9px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView([${lat}, ${lng}], ${zoom});

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
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

    // ── Navigation commands ───────────────────────────────────────────
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

    // ── Provider markers + cluster group ─────────────────────────────
    var clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        var count = cluster.getChildCount();
        var size, bg, halo;
        if (count < 10) {
          size = 36; bg = '#3B82F6'; halo = 'rgba(59,130,246,0.25)';
        } else if (count < 50) {
          size = 44; bg = '#F97316'; halo = 'rgba(249,115,22,0.25)';
        } else {
          size = 52; bg = '#EF4444'; halo = 'rgba(239,68,68,0.25)';
        }
        var outer = size + 10;
        var label = count > 999 ? '999+' : String(count);
        var fs = count > 99 ? '10' : '13';
        var html = '<div style="width:' + outer + 'px;height:' + outer + 'px;border-radius:50%;background:' + halo + ';display:flex;align-items:center;justify-content:center;">'
          + '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + bg + ';border:2.5px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.28);">'
          + '<span style="color:#fff;font-weight:700;font-size:' + fs + 'px;line-height:1;">' + label + '</span>'
          + '</div></div>';
        return L.divIcon({ className: '', html: html, iconSize: [outer, outer], iconAnchor: [outer/2, outer/2] });
      },
    }).addTo(map);

    var providerMarkers = {};
    var selectedProviderId = null;

    function createMarkerIcon(m, isSelected) {
      var featured = m.isFeatured;
      var size = isSelected ? (featured ? 46 : 42) : (featured ? 40 : 34);
      var bg = featured ? '#F59E0B' : '#E31C3D';
      var borderColor = isSelected ? (featured ? '#FEF3C7' : '#7C3AED') : '#fff';
      var borderW = isSelected ? '3' : '2';
      var shadow = featured
        ? '0 2px 8px rgba(245,158,11,0.5)'
        : (isSelected ? '0 3px 12px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.25)');
      var ratingStr = m.rating > 0 ? Number(m.rating).toFixed(1) : '';
      var label = featured ? ('\u2B50' + ratingStr) : (ratingStr ? '\u2605' + ratingStr : '');
      var html = '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;'
        + 'background:' + bg + ';border:' + borderW + 'px solid ' + borderColor + ';'
        + 'box-shadow:' + shadow + ';cursor:pointer;'
        + 'display:flex;align-items:center;justify-content:center;">'
        + '<span style="color:#fff;font-size:9px;font-weight:700;white-space:nowrap;line-height:1;">'
        + label + '</span></div>';
      return L.divIcon({ className: '', html: html, iconSize: [size, size], iconAnchor: [size/2, size/2] });
    }

    window.mapCmd.addMarker = function(m) {
      if (!m || !m.latitude || !m.longitude) return;
      if (providerMarkers[m.id]) {
        clusterGroup.removeLayer(providerMarkers[m.id].lm);
        delete providerMarkers[m.id];
      }
      var icon = createMarkerIcon(m, false);
      var lm = L.marker([m.latitude, m.longitude], { icon: icon });
      lm.on('click', function() {
        if (selectedProviderId && providerMarkers[selectedProviderId]) {
          providerMarkers[selectedProviderId].lm.setIcon(
            createMarkerIcon(providerMarkers[selectedProviderId].data, false)
          );
          clusterGroup.refreshClusters(providerMarkers[selectedProviderId].lm);
        }
        lm.setIcon(createMarkerIcon(m, true));
        clusterGroup.refreshClusters(lm);
        selectedProviderId = m.id;
        postMsg({ type: 'markerPress', providerId: m.id });
      });
      clusterGroup.addLayer(lm);
      providerMarkers[m.id] = { lm: lm, data: m };
    };
    window.mapCmd.addClusterMarker = window.mapCmd.addMarker;

    window.mapCmd.clearMarkers = function() {
      clusterGroup.clearLayers();
      providerMarkers = {};
      selectedProviderId = null;
    };
    window.mapCmd.clearClusterMarkers = window.mapCmd.clearMarkers;

    window.mapCmd.setMarkers = function(arr) {
      window.mapCmd.clearMarkers();
      (arr || []).forEach(function(m) { window.mapCmd.addMarker(m); });
    };

    window.mapCmd.selectMarker = function(id) {
      if (selectedProviderId && providerMarkers[selectedProviderId]) {
        providerMarkers[selectedProviderId].lm.setIcon(
          createMarkerIcon(providerMarkers[selectedProviderId].data, false)
        );
        clusterGroup.refreshClusters(providerMarkers[selectedProviderId].lm);
      }
      selectedProviderId = null;
      if (id && providerMarkers[id]) {
        providerMarkers[id].lm.setIcon(createMarkerIcon(providerMarkers[id].data, true));
        clusterGroup.refreshClusters(providerMarkers[id].lm);
        selectedProviderId = id;
      }
    };

    // ── Route layer ────────────────────────────────────────────
    var routeLayer = null;

    window.mapCmd.drawRoute = function(points) {
      if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
      }
      if (!points || points.length < 2) return;
      routeLayer = L.polyline(points, {
        color: '#3B82F6',
        weight: 5.5,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);
    };

    window.mapCmd.clearRoute = function() {
      if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
      }
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
      onMarkerPress,
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
        addMarker: (marker) =>
          inject(`window.mapCmd.addMarker(${JSON.stringify(marker)})`),
        clearMarkers: () => inject('window.mapCmd.clearMarkers()'),
        setMarkers: (markers) =>
          inject(`window.mapCmd.setMarkers(${JSON.stringify(markers)})`),
        selectMarker: (id) =>
          inject(`window.mapCmd.selectMarker(${JSON.stringify(id)})`),
        addClusterMarker: (marker) =>
          inject(`window.mapCmd.addClusterMarker(${JSON.stringify(marker)})`),
        clearClusterMarkers: () => inject('window.mapCmd.clearClusterMarkers()'),
        drawRoute: (points) =>
          inject(`window.mapCmd.drawRoute(${JSON.stringify(points)})`),
        clearRoute: () => inject('window.mapCmd.clearRoute()'),
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
          } else if (payload.type === 'markerPress') {
            onMarkerPress?.(payload.providerId);
          }
        } catch {
          // ignore malformed messages
        }
      },
      [onMapReady, onRegionChange, onMarkerPress],
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
