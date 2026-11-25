import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import { tables } from "@/lib/db/schema";
import { connect } from "./helpers";

// The SQL migrations are the source of truth; this keeps lib/db/schema.ts honest.
const { db, close } = connect();
afterAll(close);

describe("Drizzle schema matches the migrated database", () => {
  it.each(Object.values(tables).map((t) => [getTableConfig(t).name, t] as const))(
    "%s",
    async (name, table) => {
      const dbCols = await db.execute<{ column_name: string; is_nullable: "YES" | "NO" }>(sql`
        select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = ${name}
      `);
      const actual = Object.fromEntries(dbCols.map((c) => [c.column_name, c.is_nullable === "NO"]));
      const declared = Object.fromEntries(
        getTableConfig(table).columns.map((c) => [c.name, c.notNull]),
      );
      expect(declared).toEqual(actual);
    },
  );
});
