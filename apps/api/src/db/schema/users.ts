import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { metadataColumns } from "./metadata.js";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  ...metadataColumns,
});
