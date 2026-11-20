import { drizzle } from 'drizzle-orm/expo-sqlite';
import { deleteDatabaseSync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'pack-draft.db';

type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let expoDb: SQLiteDatabase;
export let db: AppDb;

function openAppDb(): AppDb {
  expoDb = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
  db = drizzle(expoDb, { schema });
  return db;
}

openAppDb();

export type Db = AppDb;

export function resetDatabase(): Db {
  expoDb.closeSync();
  deleteDatabaseSync(DATABASE_NAME);
  return openAppDb();
}
