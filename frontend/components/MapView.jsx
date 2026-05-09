'use client';

import { useEffect, useRef, useState } from 'react';
import { mascotSay } from '@/utils/mascot';

const SG_CENTER = [103.8198, 1.3521];
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function NoTokenBanner() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
      <span className="text-5xl mb-4">🗺️</span>
      <p className="font-semibold text-slate-700 mb-1">Map ready</p>
      <p className="text-sm text-slate-500 max-w-xs">
        Add <code className="bg-slate-100 px-1 rounded text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{' '}
        <code className="bg-slate-100 px-1 rounded text-xs">frontend/.env.local</code> to activate
        the live Singapore map with Dijkstra routing.
      </p>
      <p className="text-xs text-slate-400 mt-3">
        Road graph loaded: 28,528 segments ready.
      </p>
    </div>
  );
}

export function MapView({ hosts = [], selectedHostId = null, onSelectHost, onUserLocation, autoRoute = 0 }) {
  const mapContainerRef  = useRef(null);
  const mapRef           = useRef(null);
  const workerRef        = useRef(null);
  const markersRef       = useRef([]);
  const userMarkerRef    = useRef(null);
  const routeLayerRef      = useRef(false);
  const userCoordRef       = useRef(SG_CENTER);
  const pendingSegmentsRef = useRef([]);
  const exploreTimerRef    = useRef(null);
  const exploreAddedRef    = useRef(false);

  const [routing, setRouting]           = useState(false);
  const [routeInfo, setRouteInfo]       = useState(null);
  const [mapVersion, setMapVersion]     = useState(0);
  const [graphReady, setGraphReady]     = useState(false);
  const [graphData, setGraphData]       = useState(null);
  const [locationStatus, setLocationStatus] = useState('requesting'); // requesting | granted | denied | unavailable
  const [multiRoutes, setMultiRoutes]       = useState([]);
  const multiRouteLayersRef                 = useRef([]);
  const lastAutoRouteRef                    = useRef(0);

  // Load graph in background
  useEffect(() => {
    import('@/utils/graphLoader').then(({ loadGraph }) => {
      loadGraph().then(graph => {
        setGraphData(graph);
        setGraphReady(true);
      }).catch(console.error);
    });
  }, []);

  // Request geolocation as soon as component mounts
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coord = [pos.coords.longitude, pos.coords.latitude];
        userCoordRef.current = coord;
        setLocationStatus('granted');
        onUserLocation?.(coord);
        // Pan map to user if already loaded
        if (mapRef.current) {
          mapRef.current.flyTo({ center: coord, zoom: 13, duration: 1200 });
          placeUserMarker(coord);
        }
      },
      () => setLocationStatus('denied'),
      { timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  function placeUserMarker(coord) {
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      userMarkerRef.current?.remove();
      const el = document.createElement('div');
      el.style.cssText = `
        width:16px;height:16px;border-radius:50%;
        background:#2563eb;border:3px solid #fff;
        box-shadow:0 0 0 3px rgba(37,99,235,0.3);
      `;
      userMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(coord)
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('Your location'))
        .addTo(mapRef.current);
    });
  }

  // Init Mapbox
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || mapRef.current) return;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style:     'mapbox://styles/mapbox/streets-v12',
        center:    SG_CENTER,
        zoom:      12,
      });

      map.addControl(new mapboxgl.NavigationControl(), 'top-right');

      map.on('load', () => {
        mapRef.current = map;
        setMapVersion(v => v + 1);
        // If we already have the user's location, place the marker now
        if (locationStatus === 'granted') {
          placeUserMarker(userCoordRef.current);
          map.flyTo({ center: userCoordRef.current, zoom: 13, duration: 1200 });
        }
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      if (mapContainerRef.current) mapContainerRef.current.innerHTML = '';
    };
  }, []);

  // Re-place user marker when location resolves after map is already loaded
  useEffect(() => {
    if (locationStatus === 'granted' && mapRef.current) {
      placeUserMarker(userCoordRef.current);
      mapRef.current.flyTo({ center: userCoordRef.current, zoom: 13, duration: 1200 });
    }
  }, [locationStatus]);

  // Add host markers whenever map loads or hosts change
  useEffect(() => {
    if (!mapVersion || !mapRef.current) return;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      hosts.forEach(host => {
        if (!host.lng || !host.lat) return;
        const el = document.createElement('div');
        el.className = 'cursor-pointer';
        el.innerHTML = `
          <div style="
            background:${selectedHostId === host.id ? '#0ea5e9' : '#fff'};
            color:${selectedHostId === host.id ? '#fff' : '#334155'};
            border:2px solid ${selectedHostId === host.id ? '#0ea5e9' : '#cbd5e1'};
            border-radius:20px;padding:4px 10px;font-size:12px;font-weight:600;
            box-shadow:0 2px 8px rgba(0,0,0,0.15);white-space:nowrap
          ">
            🏠 S$${host.pricePerMonth}/mo
          </div>`;
        el.addEventListener('click', () => onSelectHost?.(host));

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([host.lng, host.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <strong>${host.name}</strong><br/>
            <span style="font-size:12px;color:#64748b">${host.address}</span><br/>
            <span style="font-size:12px;color:#0ea5e9">S$${host.pricePerMonth}/month</span>
          `))
          .addTo(mapRef.current);

        markersRef.current.push(marker);
      });
    });
  }, [mapVersion, hosts, selectedHostId]);

  // ── Exploration layer helpers ──────────────────────────────────
  function updateExploreSource(segments) {
    const map = mapRef.current;
    if (!map) return;
    const data = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segments } };
    if (!exploreAddedRef.current) {
      map.addSource('explore', { type: 'geojson', data });
      // Glow layer (wide, low opacity)
      map.addLayer({
        id: 'explore-glow',
        type: 'line', source: 'explore',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f97316', 'line-width': 5, 'line-opacity': 0.18 },
      });
      // Core layer (narrow, visible)
      map.addLayer({
        id: 'explore-core',
        type: 'line', source: 'explore',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#fb923c', 'line-width': 1.5, 'line-opacity': 0.85 },
      });
      exploreAddedRef.current = true;
    } else {
      map.getSource('explore')?.setData(data);
    }
  }

  function clearExploreLayer() {
    const map = mapRef.current;
    if (!map || !exploreAddedRef.current) return;
    ['explore-core', 'explore-glow'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource('explore')) map.removeSource('explore');
    exploreAddedRef.current = false;
  }

  function clearMultiRouteLayers() {
    const map = mapRef.current;
    if (!map) return;
    multiRouteLayersRef.current.forEach(id => {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch(e) {}
      try { if (map.getSource(id)) map.removeSource(id); } catch(e) {}
    });
    multiRouteLayersRef.current = [];
  }

  // ── Animated playback after worker finishes ──────────────────────
  function startExplorationPlayback(allSegments, finalPath, totalDist, host) {
    clearTimeout(exploreTimerRef.current);
    const TARGET_MS = 3200;
    const TICK_MS   = 60;
    const ticks     = Math.ceil(TARGET_MS / TICK_MS);           // ~53 ticks
    const perTick   = Math.max(1, Math.ceil(allSegments.length / ticks));
    let idx = 0;
    const shown = [];

    const tick = async () => {
      const end = Math.min(idx + perTick, allSegments.length);
      for (let i = idx; i < end; i++) shown.push(allSegments[i]);
      idx = end;
      updateExploreSource(shown);

      if (idx < allSegments.length) {
        exploreTimerRef.current = setTimeout(tick, TICK_MS);
      } else {
        // Exploration complete — pause, then reveal final route
        await new Promise(r => setTimeout(r, 450));
        clearExploreLayer();

        const coords  = finalPath.flatMap(seg => seg);
        const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };
        const map     = mapRef.current;
        if (!map) return;

        if (routeLayerRef.current) {
          map.getSource('route')?.setData(geojson);
        } else {
          map.addSource('route', { type: 'geojson', data: geojson });
          // Glow
          map.addLayer({
            id: 'route-glow', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#38bdf8', 'line-width': 10, 'line-opacity': 0.25 },
          });
          // Core
          map.addLayer({
            id: 'route', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#0ea5e9', 'line-width': 4, 'line-opacity': 0.95 },
          });
          routeLayerRef.current = true;
        }

        const km     = (totalDist / 1000).toFixed(1);
        const minEst = Math.ceil((totalDist / 1000) / 30 * 60);
        setRouteInfo({ km, min: minEst, hostName: host.name });
        setRouting(false);
        mascotSay('speaking', `Route found — ${km} km, about ${minEst} minutes to ${host.name}.`);

        const mapboxgl = (await import('mapbox-gl')).default;
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 60 });
      }
    };

    tick();
  }

  function startExplorationPlaybackPromise(allSegments, finalPath, color, layerIdx) {
    return new Promise((resolve) => {
      clearTimeout(exploreTimerRef.current);
      const TARGET_MS = 1500;
      const TICK_MS   = 60;
      const ticks     = Math.ceil(TARGET_MS / TICK_MS);
      const perTick   = Math.max(1, Math.ceil(allSegments.length / ticks));
      let idx = 0;
      const shown = [];

      const tick = async () => {
        const end = Math.min(idx + perTick, allSegments.length);
        for (let i = idx; i < end; i++) shown.push(allSegments[i]);
        idx = end;
        updateExploreSource(shown);

        if (idx < allSegments.length) {
          exploreTimerRef.current = setTimeout(tick, TICK_MS);
        } else {
          await new Promise(r => setTimeout(r, 250));
          clearExploreLayer();

          const coords  = finalPath.flatMap(seg => seg);
          const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };
          const map     = mapRef.current;
          if (!map) { resolve(); return; }

          const srcId  = `multi-src-${layerIdx}`;
          const glowId = `multi-glow-${layerIdx}`;
          const lineId = `multi-line-${layerIdx}`;

          map.addSource(srcId, { type: 'geojson', data: geojson });
          map.addLayer({
            id: glowId, type: 'line', source: srcId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': color, 'line-width': 8, 'line-opacity': 0.18 },
          });
          map.addLayer({
            id: lineId, type: 'line', source: srcId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': color, 'line-width': 3, 'line-opacity': 0.92 },
          });
          multiRouteLayersRef.current.push(glowId, lineId, srcId);
          resolve();
        }
      };

      tick();
    });
  }

  async function runRoute(host) {
    if (!graphData || !mapRef.current) return;

    // Reset state
    setRouting(true);
    setRouteInfo(null);
    pendingSegmentsRef.current = [];
    clearTimeout(exploreTimerRef.current);
    clearExploreLayer();
    // Clear previous route layers
    const map = mapRef.current;
    ['route', 'route-glow'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    if (map.getSource('route')) { map.removeSource('route'); routeLayerRef.current = false; }

    mascotSay('scanning', 'Searching for best route…');

    const { nearestNode } = await import('@/utils/graphLoader');
    const userCoord = userCoordRef.current;
    const hostCoord = [host.lng, host.lat];

    if (!workerRef.current) {
      workerRef.current = new Worker('/workers/dijkstra.worker.js');
    }

    const { nodes, edges } = graphData;
    const startId  = nearestNode(nodes, userCoord);
    const targetId = nearestNode(nodes, hostCoord);

    workerRef.current.onmessage = ({ data }) => {
      if (data.type === 'batch') {
        for (const frame of data.frames) {
          if (frame.type === 'relax' && frame.segment) {
            pendingSegmentsRef.current.push(frame.segment);
          }
        }
      }
      if (data.type === 'path_found') {
        startExplorationPlayback(
          pendingSegmentsRef.current, data.path, data.totalDist, host
        );
      }
    };

    workerRef.current.postMessage({
      nodes:    [...nodes],
      edges:    [...edges].map(([k, v]) => [k, v]),
      startId,
      targetId,
    });
  }

  async function runAllRoutes() {
    const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
    setMultiRoutes([]);
    clearMultiRouteLayers();
    const map = mapRef.current;
    if (map) {
      ['route', 'route-glow'].forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch(e) {} });
      try { if (map.getSource('route')) { map.removeSource('route'); routeLayerRef.current = false; } } catch(e) {}
    }
    setRouting(true);
    setRouteInfo(null);
    mascotSay('scanning', 'Mapping routes to all storage locations…');

    const { nearestNode } = await import('@/utils/graphLoader');
    const { nodes, edges } = graphData;
    const validHosts = hosts.filter(h => h.lat && h.lng);

    for (let i = 0; i < validHosts.length; i++) {
      const host  = validHosts[i];
      const color = COLORS[i % COLORS.length];

      await new Promise((resolve) => {
        pendingSegmentsRef.current = [];
        if (!workerRef.current) workerRef.current = new Worker('/workers/dijkstra.worker.js');
        const startId  = nearestNode(nodes, userCoordRef.current);
        const targetId = nearestNode(nodes, [host.lng, host.lat]);

        workerRef.current.onmessage = async ({ data }) => {
          if (data.type === 'batch') {
            for (const frame of data.frames) {
              if (frame.type === 'relax' && frame.segment) pendingSegmentsRef.current.push(frame.segment);
            }
          }
          if (data.type === 'path_found') {
            await startExplorationPlaybackPromise(pendingSegmentsRef.current, data.path, color, i);
            const km          = (data.totalDist / 1000).toFixed(1);
            const min         = Math.ceil((data.totalDist / 1000) / 30 * 60);
            const deliveryFee = parseFloat(km) < 5 ? 15 : parseFloat(km) < 10 ? 25 : 35;
            setMultiRoutes(prev => [...prev, { host, km, min, deliveryFee, color }]);
            resolve();
          }
        };

        workerRef.current.postMessage({
          nodes:    [...nodes],
          edges:    [...edges].map(([k, v]) => [k, v]),
          startId,
          targetId,
        });
      });
    }

    setRouting(false);
    mascotSay('happy', `All ${validHosts.length} routes mapped! Pick your best storage.`);
  }

  // Auto-route to all hosts when triggered after scan
  useEffect(() => {
    if (!autoRoute || !graphReady || !mapRef.current || !hosts.length) return;
    if (locationStatus !== 'granted' && locationStatus !== 'denied') return;
    if (lastAutoRouteRef.current === autoRoute) return;
    lastAutoRouteRef.current = autoRoute;
    runAllRoutes();
  }, [autoRoute, graphReady, locationStatus, hosts.length]);

  const selectedHost = hosts.find(h => h.id === selectedHostId);

  if (!MAPBOX_TOKEN) return <NoTokenBanner />;

  return (
    <div className="relative w-full h-full flex flex-col" style={{ minHeight: 420 }}>
      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1 w-full" style={{ minHeight: 320 }} />

      {/* Route info banner */}
      {routeInfo && (
        <div className="absolute top-3 left-3 right-3 bg-white/95 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-lg flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800">
            🏠 {routeInfo.hostName}
          </span>
          <span className="text-sky-600 font-medium">
            {routeInfo.km} km · ~{routeInfo.min} min
          </span>
        </div>
      )}

      {/* Multi-route results overlay */}
      {multiRoutes.length > 0 && (
        <div className="absolute left-3 right-3 bg-slate-900/95 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 max-h-44 overflow-y-auto z-10" style={{ bottom: '90px' }}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            {routing
              ? `Routing… ${multiRoutes.length} / ${hosts.filter(h => h.lat && h.lng).length}`
              : `All ${multiRoutes.length} routes mapped`}
          </p>
          <div className="space-y-1.5">
            {multiRoutes.map(({ host, km, min, deliveryFee, color }) => (
              <div key={host.id} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-white font-medium truncate flex-1">{host.name}</span>
                <span className="text-slate-300 font-mono">{km} km</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">~{min} min</span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-400 font-semibold">S${deliveryFee} delivery</span>
                <button
                  onClick={() => onSelectHost?.(host)}
                  className="ml-1 text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-400/10 rounded px-1.5 py-0.5"
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="bg-white border-t border-slate-100 p-3 space-y-2">
        {/* Location status */}
        <div className="flex items-center gap-2 text-xs">
          {locationStatus === 'requesting' && (
            <span className="text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse inline-block" />
              Requesting location…
            </span>
          )}
          {locationStatus === 'granted' && (
            <span className="text-emerald-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Using your GPS location
            </span>
          )}
          {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
            <span className="text-amber-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              {locationStatus === 'denied'
                ? 'Location denied — routing from central SG (allow location for accuracy)'
                : 'Geolocation unavailable — use HTTPS (ngrok) on mobile'}
            </span>
          )}
        </div>

        {!graphReady && (
          <p className="text-xs text-center text-slate-400">Loading road graph…</p>
        )}
        {graphReady && !selectedHost && (
          <p className="text-xs text-center text-slate-400">
            Select a host from the Hosts tab to route to them
          </p>
        )}
        {graphReady && selectedHost && (
          <button
            onClick={() => runRoute(selectedHost)}
            disabled={routing}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {routing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Exploring routes…
              </>
            ) : (
              `📍 Route to ${selectedHost.name}`
            )}
          </button>
        )}
      </div>
    </div>
  );
}
