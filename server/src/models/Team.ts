import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface ITeam extends Document {
  name: string;
  description?: string;
  lead?: Types.ObjectId;
  members: Types.ObjectId[];
  project?: Types.ObjectId;
  department?: string;
  status: 'active' | 'archived';
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    lead: { type: Schema.Types.ObjectId, ref: 'User' },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    department: { type: String, trim: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

teamSchema.index({ name: 1 });
teamSchema.index({ project: 1 });

export const Team = mongoose.model<ITeam>('Team', teamSchema);
