import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const metadataColumns = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
};

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  ...metadataColumns,
});
