import os
import asyncio
from typing import Any

try:
    from neo4j import AsyncGraphDatabase
    HAS_NEO4J = True
except ImportError:
    HAS_NEO4J = False
    print("[graph_db] neo4j driver not installed")

try:
    from supabase import create_client, Client as SupabaseClient
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False
    print("[graph_db] supabase not installed")

NEO4J_URI      = os.getenv("NEO4J_URI")
NEO4J_USER     = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
SUPABASE_URL   = os.getenv("SUPABASE_URL")
SUPABASE_KEY   = os.getenv("SUPABASE_KEY")

_neo4j_driver = None
_supabase_client: Any = None


def _get_neo4j():
    global _neo4j_driver
    if _neo4j_driver is None and HAS_NEO4J and NEO4J_URI:
        _neo4j_driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _neo4j_driver


def _get_supabase():
    global _supabase_client
    if _supabase_client is None and HAS_SUPABASE and SUPABASE_URL:
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase_client


QUERY_TEMPLATES = {
    "list_all_items": {
        "description": "List all items for a user",
        "params": ["user_id"],
        "cypher": """
            MATCH (u:User {id: $user_id})-[:OWNS]->(i:Item)
            MATCH (i)-[:PART_OF]->(g:InventoryGroup)-[:STORED_AT]->(s:StorageUnit)
            RETURN i.name AS name, i.volume_m3 AS volume,
                   s.address AS location, s.provider AS provider,
                   g.created_at AS stored_since
            ORDER BY g.created_at DESC
        """,
    },
    "find_item_by_name": {
        "description": "Find a specific item by name (partial match)",
        "params": ["user_id", "item_query"],
        "cypher": """
            MATCH (u:User {id: $user_id})-[:OWNS]->(i:Item)
            WHERE toLower(i.name) CONTAINS toLower($item_query)
            MATCH (i)-[:PART_OF]->(g:InventoryGroup)-[:STORED_AT]->(s:StorageUnit)
            MATCH (s)-[:MANAGED_BY]->(h:Host)
            RETURN i.id AS item_id, i.name AS name,
                   s.address AS storage_address, s.lat AS lat, s.lng AS lng,
                   h.name AS host_name, h.phone AS host_phone
            LIMIT 5
        """,
    },
    "check_lease_expiry": {
        "description": "Find bookings expiring within N days",
        "params": ["user_id", "days"],
        "cypher": """
            MATCH (u:User {id: $user_id})-[:MADE]->(b:Booking)
            WHERE b.end_date <= date() + duration({days: $days})
              AND b.status = 'active'
            MATCH (b)-[:COVERS]->(g)-[:STORED_AT]->(s:StorageUnit)
            RETURN b.id, b.end_date, s.address, s.provider
        """,
    },
    "climate_mismatch": {
        "description": "Find climate-sensitive items in non-climate units",
        "params": ["user_id"],
        "cypher": """
            MATCH (u:User {id: $user_id})-[:OWNS]->(i:Item)-[:REQUIRES_CLIMATE_CONTROL]->()
            MATCH (i)-[:PART_OF]->(g)-[:STORED_AT]->(s:StorageUnit)
            WHERE NOT s.climate_controlled
            RETURN i.name, s.address, s.provider
        """,
    },
}


class InventoryStore:
    async def create_item(self, item: dict, booking_id: str, user_id: str):
        await asyncio.gather(
            self._write_neo4j(item, booking_id, user_id),
            self._write_supabase(item, booking_id, user_id),
            return_exceptions=True,
        )

    async def get_items(self, user_id: str) -> list:
        try:
            return await asyncio.wait_for(self._query_neo4j(user_id), timeout=3.0)
        except Exception as e:
            print(f"[graph_db] Neo4j fallback triggered: {e}")
            return await self._query_supabase(user_id)

    async def _write_neo4j(self, item: dict, booking_id: str, user_id: str):
        driver = _get_neo4j()
        if driver is None:
            return
        async with driver.session() as session:
            await session.run(
                """
                MERGE (u:User {id: $user_id})
                MERGE (g:InventoryGroup {booking_id: $booking_id})
                  ON CREATE SET g.created_at = datetime()
                CREATE (i:Item {id: $item_id, name: $name, volume_m3: $volume})
                MERGE (u)-[:OWNS]->(i)
                MERGE (i)-[:PART_OF]->(g)
                """,
                user_id=user_id,
                booking_id=booking_id,
                item_id=item.get("id", booking_id + "_item"),
                name=item.get("name", "Unknown"),
                volume=item.get("volume_m3", 0.0),
            )

    async def _write_supabase(self, item: dict, booking_id: str, user_id: str):
        sb = _get_supabase()
        if sb is None:
            return
        sb.table("inventory_items").insert({
            "user_id":    user_id,
            "booking_id": booking_id,
            "item_data":  item,
        }).execute()

    async def _query_neo4j(self, user_id: str) -> list:
        driver = _get_neo4j()
        if driver is None:
            raise RuntimeError("Neo4j not configured")
        async with driver.session() as session:
            result = await session.run(
                QUERY_TEMPLATES["list_all_items"]["cypher"],
                user_id=user_id,
            )
            return [dict(r) async for r in result]

    async def _query_supabase(self, user_id: str) -> list:
        sb = _get_supabase()
        if sb is None:
            return _mock_items(user_id)
        resp = sb.table("inventory_items").select("*").eq("user_id", user_id).execute()
        return [r["item_data"] for r in (resp.data or [])]


def _mock_items(user_id: str) -> list:
    return [
        {"name": "Suitcase (large)", "volume_m3": 0.12, "location": "Tampines Ave 8", "provider": "Jane Tan"},
        {"name": "Cardboard boxes (×4)", "volume_m3": 0.08, "location": "Tampines Ave 8", "provider": "Jane Tan"},
        {"name": "Guitar", "volume_m3": 0.05, "location": "Tampines Ave 8", "provider": "Jane Tan"},
    ]


inventory_store = InventoryStore()
