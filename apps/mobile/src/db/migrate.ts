import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useState } from 'react';
import migrations from '../../drizzle/migrations';
import { db, resetDatabase, type Db } from './client';

type MigrationState = {
  success: boolean;
  error: Error | undefined;
};

export function useDatabaseMigrations(): MigrationState {
  const [attempt, setAttempt] = useState(0);
  const [fatalError, setFatalError] = useState<Error | undefined>();
  const [database, setDatabase] = useState<Db>(() => db);
  const { success, error } = useMigrations(database, migrations);

  if (error && attempt === 0 && !fatalError) {
    try {
      setDatabase(resetDatabase());
      setAttempt(1);
    } catch (resetFailure) {
      setFatalError(resetFailure instanceof Error ? resetFailure : new Error(String(resetFailure)));
    }
  }

  if (fatalError) {
    return { success: false, error: fatalError };
  }

  if (error && attempt === 0) {
    return { success: false, error: undefined };
  }

  return { success: Boolean(success), error: error ?? undefined };
}
