import mongoose from 'mongoose';
// Register every model so syncAllIndexes covers the whole DB.
import './models/gameSession';
import './models/gameInstance';
import './models/user';
import './models/installedPlugin';

export async function connectMongo(url: string): Promise<void> {
  await mongoose.connect(url, { autoIndex: false });
}

/**
 * The indexing contract: every index lives in a schema, and this runs at boot.
 * syncIndexes is destructive (drops indexes not in the schema) — which is the
 * point: the schemas are the single source of truth, guarded by the manifest
 * test in test/unit/indexes.spec.ts.
 */
export async function syncAllIndexes(): Promise<void> {
  for (const name of mongoose.modelNames()) {
    await mongoose.model(name).syncIndexes();
  }
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
