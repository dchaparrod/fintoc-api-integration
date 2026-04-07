import { PGlite } from "@electric-sql/pglite";
import { SCHEMA_SQL, SEED_SQL } from "./schema";

let db: PGlite | null = null;

export async function getDb(): Promise<PGlite> {
  if (db) return db;
  db = new PGlite("idb://fintoc-transfers-v2");
  await db.exec(SCHEMA_SQL);
  await db.exec(SEED_SQL);
  return db;
}
