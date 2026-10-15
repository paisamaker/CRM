import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FolderKanban,
  FileText,
  Upload,
  Download,
  Trash2,
  Eye,
  Paperclip,
  Plus,
  Layers,
  Sparkles,
  ExternalLink,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getErrorMessage, getAuthenticatedFileUrl, downloadFile, isImageFile, isPdfFile } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Badge, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FilePreviewModal, type PreviewFile } from '@/components/files/FilePreviewModal';
import { AttachmentsSection, type AttachmentItem } from '@/components/files/AttachmentsSection';

interface ProjectFilesModalProps {
  projectId: string | null;
  projectName?: string;
  onClose: () => void;
  canManage?: boolean;
}

export function ProjectFilesModal({
  projectId,
  projectName = 'Project',
  onClose,
  canManage = true,
}: ProjectFilesModalProps) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'project' | 'workflow' | 'images' | 'pdfs'>('all');
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // Fetch full project details including direct attachments and workflowFiles
  const { data, isLoading } = useQuery({
    queryKey: ['project-files-detail', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}`);
      return res.data.data;
    },
    enabled: !!projectId,
  });

  const uploadToProject = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) {
        form.append('files', f);
      }
      return api.post(`/projects/${projectId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Files uploaded to project');
      qc.invalidateQueries({ queryKey: ['project-files-detail', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteProjectAttachment = useMutation({
    mutationFn: async (attachmentId: string) => {
      return api.delete(`/projects/${projectId}/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      toast.success('Attachment removed');
      qc.invalidateQueries({ queryKey: ['project-files-detail', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (!projectId) return null;

  const projectAttachments: (AttachmentItem & { source: 'project' })[] = (
    data?.attachments || []
  ).map((a: AttachmentItem) => ({ ...a, source: 'project' as const }));

  const workflowAttachments: (AttachmentItem & { source: 'workflow' })[] = (
    data?.workflowFiles || []
  ).map((f: { _id: string; name: string; url: string; size?: number; mime?: string; uploadedBy?: { name?: string; avatar?: string }; createdAt?: string }) => ({
    _id: f._id,
    name: f.name,
    url: f.url,
    size: f.size,
    mime: f.mime,
    uploadedBy: f.uploadedBy,
    createdAt: f.createdAt,
    source: 'workflow' as const,
  }));

  const allFiles = [...projectAttachments, ...workflowAttachments];

  // Filter based on active tab & search
  const filteredFiles = allFiles.filter((f) => {
    if (search.trim()) {
      const match = f.name.toLowerCase().includes(search.toLowerCase().trim());
      if (!match) return false;
    }
    if (activeTab === 'project') return f.source === 'project';
    if (activeTab === 'workflow') return f.source === 'workflow';
    if (activeTab === 'images') return isImageFile(f.mime || f.name);
    if (activeTab === 'pdfs') return isPdfFile(f.mime || f.name);
    return true;
  });

  return (
    <>
      <Modal
        open={!!projectId}
        onClose={onClose}
        title="Project & Workflow Content Files"
        size="lg"
        variant="dialog"
      >
        <div className="space-y-4">
          {/* Project Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/80 bg-teal-50/50 p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{data?.name || projectName}</h3>
                <p className="text-[11px] text-teal-800">
                  Shared documents, creative briefs, design images &amp; workflow attachments
                </p>
              </div>
            </div>
            {data?.status && (
              <Badge tone={statusTone(data.status)} className="capitalize text-[11px]">
                {data.status.replace('_', ' ')}
              </Badge>
            )}
          </div>

          {/* Quick Upload Section for this Project */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <AttachmentsSection
              attachments={[]}
              onUpload={async (files) => {
                await uploadToProject.mutateAsync(files);
              }}
              canUpload={canManage}
              isUploading={uploadToProject.isPending}
              title="Add New Content to Project"
              description="Upload project briefs, specifications, review PDFs, and creative image assets."
            />
          </div>

          {/* Filter Bar & Tabs */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Tab Pills */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Content ({allFiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('project')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === 'project'
                      ? 'bg-white text-teal-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Project Docs ({projectAttachments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('workflow')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === 'workflow'
                      ? 'bg-white text-teal-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Workflow Tasks ({workflowAttachments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === 'images'
                      ? 'bg-white text-teal-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Images ({allFiles.filter((f) => isImageFile(f.mime || f.name)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pdfs')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === 'pdfs'
                      ? 'bg-white text-rose-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  PDFs ({allFiles.filter((f) => isPdfFile(f.mime || f.name)).length})
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Content Files Gallery */}
            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading project content...</div>
            ) : filteredFiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[48vh] overflow-y-auto pr-1">
                {filteredFiles.map((file, idx) => {
                  const isImg = isImageFile(file.mime || file.name);
                  const isPdf = isPdfFile(file.mime || file.name);
                  const authUrl = getAuthenticatedFileUrl(file.url);

                  return (
                    <div
                      key={file._id || idx}
                      className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs hover:border-teal-400 hover:shadow-xs transition"
                    >
                      {/* Badge showing source */}
                      <div className="mb-1.5 flex items-center justify-between">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            file.source === 'project'
                              ? 'bg-teal-50 text-teal-700 border border-teal-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {file.source === 'project' ? 'Project Doc' : 'Workflow Task'}
                        </span>
                        {file.size ? (
                          <span className="text-[10px] text-slate-400">
                            {Math.round(file.size / 1024)} KB
                          </span>
                        ) : null}
                      </div>

                      {/* Visual Thumbnail */}
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
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 group-hover:opacity-100 transition">
                            <span className="flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                              <Eye className="h-3 w-3 text-teal-600" />
                              View
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
                              PDF
                            </span>
                            <FileText className="h-5 w-5 text-rose-500" />
                          </div>
                          <div>
                            <span className="line-clamp-1 text-xs font-semibold text-slate-800">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-rose-700 font-medium">Click to preview</span>
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
                            <Paperclip className="h-5 w-5 text-slate-500" />
                          </div>
                          <div>
                            <span className="line-clamp-1 text-xs font-semibold text-slate-800">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">Click to inspect</span>
                          </div>
                        </div>
                      )}

                      {/* File Details & Actions */}
                      <div className="flex items-center justify-between gap-2 mt-auto">
                        <div className="min-w-0 flex-1">
                          <div
                            onClick={() => setPreviewFile(file)}
                            title={file.name}
                            className="cursor-pointer truncate text-xs font-semibold text-slate-800 hover:text-teal-700 transition"
                          >
                            {file.name}
                          </div>
                          {file.uploadedBy?.name && (
                            <div className="text-[10px] text-slate-400 truncate">
                              By {file.uploadedBy.name}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-teal-700 transition"
                            title="Preview file"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadFile(file.url, file.name)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            title="Download file"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          {canManage && file.source === 'project' && file._id && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm(`Remove "${file.name}"?`)) {
                                  await deleteProjectAttachment.mutateAsync(file._id!);
                                }
                              }}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete file"
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
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                <div className="text-xs font-semibold text-slate-700">No content files found</div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Upload briefs, media assets, and PDFs above or attach them to workflow tasks.
                </p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Standalone Full-Screen Viewer for Image / PDF */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </>
  );
}
