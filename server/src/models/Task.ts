import mongoose, { Schema, type Document, type Types } from 'mongoose';

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'completed'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_ISSUE_TYPES = ['task', 'subtask'] as const;

export interface ITaskComment {
  _id?: Types.ObjectId;
  user: Types.ObjectId;
  body: string;
  mentions: Types.ObjectId[];
  createdAt: Date;
}

export interface ITask extends Document {
  title: string;
  key?: string;
  description?: string;
  project?: Types.ObjectId;
  parentTask?: Types.ObjectId;
  issueType: (typeof TASK_ISSUE_TYPES)[number];
  assignees: Types.ObjectId[];
  priority: (typeof TASK_PRIORITIES)[number];
  status: (typeof TASK_STATUSES)[number];
  /** Planned start date */
  startDate?: Date;
  /** When work actually started (e.g. moved to In Progress) */
  startedAt?: Date;
  /** Deadline */
  dueDate?: Date;
  tags: string[];
  checklist: { text: string; done: boolean }[];
  dependsOn: Types.ObjectId[];
  attachments: {
    _id?: Types.ObjectId;
    name: string;
    url: string;
    size?: number;
    mime?: string;
    uploadedBy?: Types.ObjectId;
    createdAt?: Date;
  }[];
  comments: ITaskComment[];
  watchers: Types.ObjectId[];
  createdBy: Types.ObjectId;
  completedAt?: Date;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true },
    key: { type: String, index: true },
    description: String,
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    parentTask: { type: Schema.Types.ObjectId, ref: 'Task', index: true },
    issueType: { type: String, enum: TASK_ISSUE_TYPES, default: 'task', index: true },
    assignees: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium', index: true },
    status: { type: String, enum: TASK_STATUSES, default: 'todo', index: true },
    startDate: { type: Date, index: true },
    startedAt: Date,
    dueDate: { type: Date, index: true },
    tags: [String],
    checklist: [{ text: String, done: { type: Boolean, default: false } }],
    dependsOn: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        size: Number,
        mime: String,
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        body: String,
        mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    watchers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: Date,
    progress: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ status: 1, completedAt: 1 });
taskSchema.index({ assignees: 1, status: 1 });
taskSchema.index({ assignees: 1, dueDate: 1 });
taskSchema.index({ project: 1, parentTask: 1, status: 1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ createdAt: -1 });

export const Task = mongoose.model<ITask>('Task', taskSchema);
