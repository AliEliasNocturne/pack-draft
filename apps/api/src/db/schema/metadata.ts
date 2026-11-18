import { timestamp, uuid } from "drizzle-orm/pg-core";

export const metadataColumns = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
};
