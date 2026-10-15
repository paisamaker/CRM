import { useRef, useState } from 'react';
import {
  Paperclip,
  Upload,
  Download,
  Trash2,
  Eye,
  FileText,
  File,
  Sparkles,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAuthenticatedFileUrl, downloadFile, isImageFile, isPdfFile } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FilePreviewModal, type PreviewFile } from './FilePreviewModal';

export interface AttachmentItem {
  _id?: string;
  name: string;
  url: string;
  size?: number;
  mime?: string;
  uploadedBy?: {
    _id?: string;
    name?: string;
    email?: string;
    avatar?: string;
  };
  createdAt?: string | Date;
}

interface Props {
  attachments?: AttachmentItem[];
  onUpload: (files: File[]) => Promise<void>;
  onDelete?: (attachmentId: string) => Promise<void>;
  canUpload?: boolean;
  canDelete?: boolean;
  isUploading?: boolean;
  title?: string;
  description?: string;
}

export function AttachmentsSection({
  attachments = [],
  onUpload,
  onDelete,
  canUpload = true,
  canDelete = true,
  isUploading = false,
  title = 'Content Files & Attachments',
  description = 'Attach briefs, design assets, PDFs, and media content for employees and team members',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function handleFileSelect(files: FileList | null) {
    if (!files || !files.length) return;
    const array = Array.from(files);
    try {
      await onUpload(array);
    } catch {
      /* error handled in caller */
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-teal-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {title} ({attachments.length})
          </h4>
        </div>
        {canUpload && (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition shadow-2xs disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isUploading ? 'Uploading...' : 'Add Files / PDF'}</span>
          </button>
        )}
      </div>

      {description && (
        <p className="text-[11px] text-slate-500 leading-relaxed -mt-1">{description}</p>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.csv"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Drop Area when no attachments or for drag and drop */}
      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileSelect(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center transition ${
            isDragging
              ? 'border-teal-500 bg-teal-50/70'
              : 'border-slate-200 hover:border-teal-400 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-teal-700 mb-1.5">
            <Upload className="h-4 w-4" />
          </div>
          <div className="text-xs font-semibold text-slate-700">
            Click to upload or drag files &amp; PDFs here
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Images (PNG, JPG, WEBP), PDFs, and Documents up to 50MB
          </div>
        </div>
      )}

      {/* Attachments Grid */}
      {attachments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
          {attachments.map((file, idx) => {
            const isImg = isImageFile(file.mime || file.name);
            const isPdf = isPdfFile(file.mime || file.name);
            const authUrl = getAuthenticatedFileUrl(file.url);

            return (
              <div
                key={file._id || `${file.url}-${idx}`}
                className="group relative flex flex-col rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs hover:border-teal-400 hover:shadow-xs transition"
              >
                {/* Visual Preview / Thumbnail Area */}
                {isImg ? (
                  <div
                    onClick={() => setPreviewFile(file)}
                    className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-slate-100 mb-2 border border-slate-100"
                  >
                    <img
                      src={authUrl}
                      alt={file.name}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 group-hover:opacity-100 transition duration-200">
                      <span className="flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                        <Eye className="h-3 w-3 text-teal-600" />
                        Preview Image
                      </span>
                    </div>
                  </div>
                ) : isPdf ? (
                  <div
                    onClick={() => setPreviewFile(file)}
                    className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-gradient-to-br from-rose-50 to-rose-100/60 p-3 flex flex-col justify-between mb-2 border border-rose-200/60 group-hover:border-rose-300 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white tracking-wider uppercase">
                        PDF Document
                      </span>
                      <FileText className="h-5 w-5 text-rose-500" />
                    </div>
                    <div>
                      <span className="line-clamp-1 text-xs font-semibold text-slate-800">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-rose-700 font-medium">Click to view PDF</span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setPreviewFile(file)}
                    className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-slate-50 p-3 flex flex-col justify-between mb-2 border border-slate-200/60 group-hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-white tracking-wider uppercase">
                        Doc
                      </span>
                      <File className="h-5 w-5 text-slate-500" />
                    </div>
                    <div>
                      <span className="line-clamp-1 text-xs font-semibold text-slate-800">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">Click to inspect</span>
                    </div>
                  </div>
                )}

                {/* File Info Bar */}
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <div className="min-w-0 flex-1">
                    <div
                      onClick={() => setPreviewFile(file)}
                      title={file.name}
                      className="cursor-pointer truncate text-xs font-semibold text-slate-800 hover:text-teal-700 transition"
                    >
                      {file.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      {file.size ? <span>{Math.round(file.size / 1024)} KB</span> : null}
                      {file.uploadedBy?.name && (
                        <>
                          <span>&bull;</span>
                          <span className="truncate max-w-[80px]" title={file.uploadedBy.name}>
                            {file.uploadedBy.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Action Icons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-teal-700 transition"
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFile(file.url, file.name)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {canDelete && file._id && onDelete && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm(`Remove attachment "${file.name}"?`)) {
                            await onDelete(file._id!);
                          }
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="Delete attachment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !canUpload && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
            No files attached yet.
          </div>
        )
      )}

      {/* Interactive Lightbox / PDF Modal */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
