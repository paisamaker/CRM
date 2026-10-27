import mongoose, { Schema, type Document as Doc, type Types } from 'mongoose';

export type FileVisibility = 'private' | 'project' | 'shared' | 'company';
export type FileShareLevel = 'viewer' | 'contributor' | 'editor' | 'manager';
export type FileKind = 'file' | 'folder';

export interface IFileShare {
  user: Types.ObjectId;
  level: FileShareLevel;
  grantedBy?: Types.ObjectId;
  grantedAt?: Date;
}

export interface IDocument extends Doc {
  name: string;
  url: string;
  mime: string;
  size: number;
  /** Legacy category label (general, projects, …) — kept for compatibility */
  folder: string;
  kind: FileKind;
  parentId?: Types.ObjectId;
  owner?: Types.ObjectId;
  uploadedBy: Types.ObjectId;
  visibility: FileVisibility;
  shares: IFileShare[];
  starredBy: Types.ObjectId[];
  project?: Types.ObjectId;
  /** Idempotent key for auto-created project folder roots/subs, e.g. `${projectId}:root` */
  projectFolderKey?: string;
  folderType?: 'root' | 'project_root' | 'project_sub' | 'user' | 'general';
  linkedModel?: string;
  linkedId?: Types.ObjectId;
  publicId?: string;
  storageProvider?: 'local' | 'cloudinary';
  trashedAt?: Date;
  trashedBy?: Types.ObjectId;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shareSchema = new Schema<IFileShare>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    level: {
      type: String,
      enum: ['viewer', 'contributor', 'editor', 'manager'],
      default: 'viewer',
    },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    grantedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const documentSchema = new Schema<IDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 255 },
    url: { type: String, default: '' },
    mime: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    folder: { type: String, default: 'general', index: true },
    kind: { type: String, enum: ['file', 'folder'], default: 'file', index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Document', index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    visibility: {
      type: String,
      enum: ['private', 'project', 'shared', 'company'],
      default: 'private',
      index: true,
    },
    shares: { type: [shareSchema], default: [] },
    starredBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    projectFolderKey: { type: String, sparse: true, unique: true },
    folderType: {
      type: String,
      enum: ['root', 'project_root', 'project_sub', 'user', 'general'],
    },
    linkedModel: {
      type: String,
      enum: ['Project', 'Task', 'Client', 'Invoice', 'Lead', 'User', 'Team'],
    },
    linkedId: { type: Schema.Types.ObjectId, refPath: 'linkedModel' },
    publicId: String,
    storageProvider: { type: String, enum: ['local', 'cloudinary'] },
    trashedAt: { type: Date, index: true },
    trashedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    archivedAt: Date,
  },
  { timestamps: true }
);

documentSchema.index({ parentId: 1, trashedAt: 1, name: 1 });
documentSchema.index({ owner: 1, trashedAt: 1, createdAt: -1 });
documentSchema.index({ project: 1, kind: 1, trashedAt: 1 });
documentSchema.index({ 'shares.user': 1, trashedAt: 1 });
documentSchema.index({ starredBy: 1, trashedAt: 1 });
documentSchema.index({ name: 'text' });

documentSchema.pre('validate', function (next) {
  if (!this.owner && this.uploadedBy) this.owner = this.uploadedBy;
  if (!this.kind) this.kind = this.mime === 'inode/directory' ? 'folder' : 'file';
  // Migrate legacy company default for existing semantics on new docs without explicit visibility
  next();
});

export const DocumentFile = mongoose.model<IDocument>('Document', documentSchema);

/** Default subfolders created under each project root */
export const PROJECT_SUBFOLDERS = [
  'Briefs & Requirements',
  'Documents',
  'Images & Designs',
  'Videos & Media',
  'Reports',
  'Deliverables',
] as const;
