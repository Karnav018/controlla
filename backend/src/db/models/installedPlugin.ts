import mongoose, { Schema, type Model } from 'mongoose';

/** Registry the Plugin Runtime loads from (Phase 2); drives "what can the host select". */
export interface InstalledPluginDoc {
  _id: string;
  pluginId: string;
  version: string;
  /** local = provider package in GAMES_DIR; marketplace = Phase 4. */
  source: 'local' | 'marketplace';
  enabled: boolean;
  /** Pinned to the top of the host's game picker. */
  featured: boolean;
  installedAt: Date;
}

const InstalledPluginSchema = new Schema<InstalledPluginDoc>(
  {
    _id: { type: String, required: true },
    pluginId: { type: String, required: true },
    version: { type: String, required: true },
    source: { type: String, enum: ['local', 'marketplace'], required: true },
    enabled: { type: Boolean, required: true, default: true },
    featured: { type: Boolean, required: true, default: false },
    installedAt: { type: Date, required: true }
  },
  { autoIndex: false }
);

InstalledPluginSchema.index({ pluginId: 1, version: 1 }, { unique: true });
InstalledPluginSchema.index({ enabled: 1, pluginId: 1 });
InstalledPluginSchema.index({ installedAt: -1 }); // admin activity feed

export const InstalledPlugin: Model<InstalledPluginDoc> =
  (mongoose.models.InstalledPlugin as Model<InstalledPluginDoc>) ??
  mongoose.model<InstalledPluginDoc>('InstalledPlugin', InstalledPluginSchema);
