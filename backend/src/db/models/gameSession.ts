import mongoose, { Schema, type Model } from 'mongoose';

export interface SessionPlayerDoc {
  playerId: string;
  userId?: string;
  nickname: string;
  avatar?: string;
  joinedAt: Date;
  leftAt?: Date;
}

export interface GameSessionDoc {
  _id: string; // sessionId
  code: string;
  hostTokenHash: string;
  status: 'lobby' | 'playing' | 'ended';
  /** Partial-index flag: join codes are unique among active sessions only. */
  active: boolean;
  players: SessionPlayerDoc[];
  createdAt: Date;
  updatedAt: Date;
  endedAt?: Date;
  /** Set only on abandoned sessions — the TTL index purges the doc once set. */
  expiresAt?: Date;
}

const SessionPlayerSchema = new Schema<SessionPlayerDoc>(
  {
    playerId: { type: String, required: true },
    userId: { type: String },
    nickname: { type: String, required: true },
    avatar: { type: String },
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date }
  },
  { _id: false }
);

const GameSessionSchema = new Schema<GameSessionDoc>(
  {
    _id: { type: String, required: true },
    code: { type: String, required: true },
    hostTokenHash: { type: String, required: true },
    status: { type: String, enum: ['lobby', 'playing', 'ended'], required: true, default: 'lobby' },
    active: { type: Boolean, required: true, default: true },
    players: { type: [SessionPlayerSchema], default: [] },
    endedAt: { type: Date },
    expiresAt: { type: Date }
  },
  { timestamps: true, autoIndex: false }
);

// Partial indexes don't support $ne, hence the boolean `active` flag:
// codes are reusable once a session ends.
GameSessionSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { active: true } });
GameSessionSchema.index({ status: 1, updatedAt: -1 });
GameSessionSchema.index({ 'players.userId': 1 });
GameSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GameSession: Model<GameSessionDoc> =
  (mongoose.models.GameSession as Model<GameSessionDoc>) ??
  mongoose.model<GameSessionDoc>('GameSession', GameSessionSchema);
