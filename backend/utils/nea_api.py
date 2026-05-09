import httpx

NEA_TEMPERATURE_URL = "https://api.data.gov.sg/v1/environment/air-temperature"

DISTRICT_STATION_MAP = {
    "orchard":     "S121",
    "tampines":    "S107",
    "jurong":      "S44",
    "woodlands":   "S115",
    "clementi":    "S60",
    "bishan":      "S116",
    "pasir ris":   "S106",
    "ang mo kio":  "S109",
}


async def get_district_temperature(district: str) -> float:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(NEA_TEMPERATURE_URL)
            resp.raise_for_status()
            data = resp.json()

        readings = data["items"][0]["readings"]
        target_station = DISTRICT_STATION_MAP.get(district.lower())

        reading = next(
            (r for r in readings if target_station and r["station_id"] == target_station),
            readings[0] if readings else None,
        )
        if reading is None:
            return 30.0
        ambient = float(reading["value"])
        return round(ambient + 2.0, 1)
    except Exception as e:
        print(f"[nea_api] Failed to fetch temperature: {e}")
        return 30.0


async def get_all_station_readings() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(NEA_TEMPERATURE_URL)
            resp.raise_for_status()
            data = resp.json()
        return data["items"][0]["readings"]
    except Exception as e:
        print(f"[nea_api] Failed to fetch all readings: {e}")
        return []
