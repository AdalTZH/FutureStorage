/**
 * graphLoader.js
 * Parses sg_roads.geojson into nodes/edges compatible with dijkstra.worker.js
 */

const R = 6371000; // Earth radius in metres

function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function coordKey([lng, lat]) {
  return `${lng.toFixed(5)},${lat.toFixed(5)}`;
}

let _cache = null;

export async function loadGraph() {
  if (_cache) return _cache;

  const resp = await fetch('/data/sg_roads.geojson');
  const geojson = await resp.json();

  const nodes = new Map();   // key → [lng, lat]
  const edges = new Map();   // key → [{to, weight, segment}]

  const addEdge = (fromKey, toKey, weight, segment) => {
    if (!edges.has(fromKey)) edges.set(fromKey, []);
    edges.get(fromKey).push({ to: toKey, weight, segment });
  };

  for (const feature of geojson.features) {
    const coords = feature.geometry.coordinates;
    const oneway = feature.properties?.oneway === 'yes';

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const ak = coordKey(a);
      const bk = coordKey(b);
      if (!nodes.has(ak)) nodes.set(ak, a);
      if (!nodes.has(bk)) nodes.set(bk, b);

      const w = haversine(a, b);
      const seg = [a, b];
      addEdge(ak, bk, w, seg);
      if (!oneway) addEdge(bk, ak, w, seg);
    }
  }

  _cache = { nodes, edges };
  return _cache;
}

export function nearestNode(nodes, [lng, lat]) {
  let best = null;
  let bestDist = Infinity;
  for (const [key, coord] of nodes) {
    const d = haversine([lng, lat], coord);
    if (d < bestDist) { bestDist = d; best = key; }
  }
  return best;
}
