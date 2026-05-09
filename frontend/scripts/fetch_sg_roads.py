"""
fetch_sg_roads.py
Fetches Singapore's primary road network from Overpass API and saves as GeoJSON.
Run once: python scripts/fetch_sg_roads.py
"""
import json
import os
import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

QUERY = """
[out:json][timeout:120][bbox:1.19,103.59,1.48,104.01];
way["highway"~"^(motorway|trunk|primary|secondary)$"];
out geom qt;
""".strip()

OUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "public", "data", "sg_roads.geojson"
)

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

HEADERS = {
    "User-Agent": "MyStoreyApp/1.0 (demo road graph builder)",
    "Accept": "application/json",
}

print("Fetching SG road data from Overpass API (may take ~30s)…")
result = None
for mirror in MIRRORS:
    try:
        with httpx.Client(timeout=150.0) as client:
            resp = client.post(mirror, data={"data": QUERY}, headers=HEADERS)
            resp.raise_for_status()
            result = resp.json()
            print(f"  Used mirror: {mirror}")
            break
    except Exception as e:
        print(f"  Mirror {mirror} failed: {e}")

if result is None:
    raise SystemExit("All Overpass mirrors failed.")

features = []
for el in result.get("elements", []):
    if el["type"] != "way" or "geometry" not in el:
        continue
    coords = [[pt["lon"], pt["lat"]] for pt in el["geometry"]]
    if len(coords) < 2:
        continue
    tags = el.get("tags", {})
    features.append({
        "type": "Feature",
        "properties": {
            "name":    tags.get("name", ""),
            "highway": tags.get("highway", ""),
            "oneway":  tags.get("oneway", "no"),
        },
        "geometry": {"type": "LineString", "coordinates": coords},
    })

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": features}, f)

size_kb = os.path.getsize(OUT_PATH) // 1024
print(f"Saved {len(features)} road segments  →  {OUT_PATH}  ({size_kb} KB)")
