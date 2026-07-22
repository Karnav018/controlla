import mongoose, { Schema, type Model } from 'mongoose';

/** Optional accounts — guests are session-scoped and never create a user doc. */
export interface UserDoc {
  _id: string;
  displayName: string;
  avatar?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    displayName: { type: String, required: true },
    avatar: { type: String },
    email: { type: String }
  },
  { timestamps: true, autoIndex: false }
);

UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ createdAt: -1 });

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>('User', UserSchema);
