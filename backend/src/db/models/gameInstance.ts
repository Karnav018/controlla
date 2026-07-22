import mongoose, { Schema, type Model } from 'mongoose';

/** One execution of a game plugin inside a session. Written from Phase 2 on; schema + indexes exist now. */
export interface GameInstanceDoc {
  _id: string;
  sessionId: string;
  pluginId: string;
  pluginVersion: string;
  randomSeed: string;
  startedAt: Date;
  finishedAt?: Date;
  results?: unknown;
}

const GameInstanceSchema = new Schema<GameInstanceDoc>(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true },
    pluginId: { type: String, required: true },
    pluginVersion: { type: String, required: true },
    randomSeed: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    results: { type: Schema.Types.Mixed }
  },
  { autoIndex: false }
);

GameInstanceSchema.index({ sessionId: 1, startedAt: -1 });
GameInstanceSchema.index({ pluginId: 1, finishedAt: -1 });
GameInstanceSchema.index({ startedAt: -1 }); // admin activity feed

export const GameInstance: Model<GameInstanceDoc> =
  (mongoose.models.GameInstance as Model<GameInstanceDoc>) ??
  mongoose.model<GameInstanceDoc>('GameInstance', GameInstanceSchema);
