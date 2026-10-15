import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  Download,
  Trash2,
  Eye,
  FileText,
  File,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Filter,
  Paperclip,
  ExternalLink,
  FolderKanban,
  CheckCircle2,
  Plus,
  X,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  getErrorMessage,
  getAuthenticatedFileUrl,
  downloadFile,
  isImageFile,
  isPdfFile,
} from '@/lib/api';
import { PageHeader, Card, EmptyState, TableShell } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Label, Select, Input } from '@/components/ui/Input';
import { formatDate, cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuthStore } from '@/stores/auth';
import { FilePreviewModal, type PreviewFile } from '@/components/files/FilePreviewModal';

const FOLDERS = [
  { id: 'all', label: 'All Files' },
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks & Workflow' },
  { id: 'briefs', label: 'Briefs' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'general', label: 'General' },
];

export function FilesPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [folder, setFolder] = useState('all');
  const [selectedProject, setSelectedProject] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'images' | 'pdfs'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Preview state
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFolder, setUploadFolder] = useState('projects');
  const [uploadProjectId, setUploadProjectId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch projects list for filter dropdown & upload target
  const { data: projectsData } = useQuery({
    queryKey: ['projects-mini-list'],
    queryFn: async () => (await api.get('/projects', { params: { limit: 100 } })).data.data.items,
  });

  // Fetch files with queries
  const { data, isLoading } = useQuery({
    queryKey: ['files', folder, selectedProject, search, typeFilter],
    queryFn: async () => {
      const params: Record<string, unknown> = { limit: 100 };
      if (folder !== 'all') params.folder = folder;
      if (selectedProject) params.project = selectedProject;
      if (search.trim()) params.search = search.trim();
      if (typeFilter !== 'all') params.type = typeFilter;
      return (await api.get('/files', { params })).data.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error('No file chosen');
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('folder', uploadFolder);
      form.append('visibility', 'company');
      if (uploadProjectId) {
        form.append('project', uploadProjectId);
        form.append('linkedModel', 'Project');
        form.append('linkedId', uploadProjectId);
      }
      return api.post('/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('File uploaded successfully');
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadProjectId('');
      qc.invalidateQueries({ queryKey: ['files'] });
      qc.invalidateQueries({ queryKey: ['project-files-detail'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => {
      toast.success('File deleted');
      qc.invalidateQueries({ queryKey: ['files'] });
      qc.invalidateQueries({ queryKey: ['project-files-detail'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const files = (data?.items || []) as (PreviewFile & {
    _id: string;
    project?: { _id?: string; name?: string };
    visibility?: string;
  })[];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Files & Media Content"
        description="Centralized repository of creative assets, PDF briefs, project documents, and workflow attachments"
        actions={
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'rounded-lg p-2 transition',
                  viewMode === 'grid'
                    ? 'bg-slate-100 text-teal-800 font-semibold'
                    : 'text-slate-400 hover:text-slate-700'
                )}
                title="Grid / Visual Cards View"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'rounded-lg p-2 transition',
                  viewMode === 'table'
                    ? 'bg-slate-100 text-teal-800 font-semibold'
                    : 'text-slate-400 hover:text-slate-700'
                )}
                title="Table View"
              >
                <TableIcon className="h-4 w-4" />
              </button>
            </div>

            <Button
              onClick={() => setUploadModalOpen(true)}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white flex items-center gap-1.5 shadow-xs"
            >
              <Upload className="h-4 w-4" />
              <span>Upload Content</span>
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        {/* Folder Pills Bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          {FOLDERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolder(f.id)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                folder === f.id
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search & Secondary Filter Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search files by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 transition focus:border-teal-500 focus:bg-white focus:outline-hidden"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Project */}
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-teal-500 focus:outline-hidden shadow-2xs"
            >
              <option value="">All Projects</option>
              {(projectsData || []).map((p: { _id: string; name: string }) => (
                <option key={p._id} value={p._id}>
                  Project: {p.name}
                </option>
              ))}
            </select>

            {/* Filter by Media Type */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'images' | 'pdfs')}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-teal-500 focus:outline-hidden shadow-2xs"
            >
              <option value="all">All File Formats</option>
              <option value="images">Images Only</option>
              <option value="pdfs">PDFs Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area: Grid or Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
          Loading documents &amp; media content...
        </div>
      ) : files.length > 0 ? (
        viewMode === 'grid' ? (
          /* Visual Cards / Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((file) => {
              const isImg = isImageFile(file.mime || file.name);
              const isPdf = isPdfFile(file.mime || file.name);
              const authUrl = getAuthenticatedFileUrl(file.url);
              const canDelete =
                role === 'ceo' ||
                role === 'manager' ||
                file.uploadedBy?._id === currentUserId;

              return (
                <div
                  key={file._id}
                  className="group relative flex flex-col rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs hover:border-teal-400 hover:shadow-md transition"
                >
                  {/* Category & Project Badges */}
                  <div className="mb-2 flex items-center justify-between gap-1 text-[10px]">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold uppercase tracking-wider text-slate-600">
                      {file.folder || 'general'}
                    </span>
                    {file.project?.name && (
                      <span className="truncate max-w-[120px] rounded-md bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-800 border border-teal-200/60" title={file.project.name}>
                        {file.project.name}
                      </span>
                    )}
                  </div>

                  {/* Thumbnail / Preview Area */}
                  {isImg ? (
                    <div
                      onClick={() => setPreviewFile(file)}
                      className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-slate-100 mb-2.5 border border-slate-100"
                    >
                      <img
                        src={authUrl}
                        alt={file.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 group-hover:opacity-100 transition">
                        <span className="flex items-center gap-1 rounded-md bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-md">
                          <Eye className="h-3.5 w-3.5 text-teal-600" />
                          View Image
                        </span>
                      </div>
                    </div>
                  ) : isPdf ? (
                    <div
                      onClick={() => setPreviewFile(file)}
                      className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/70 p-3.5 flex flex-col justify-between mb-2.5 border border-rose-200/70 group-hover:border-rose-300 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white tracking-wider uppercase">
                          PDF Brief
                        </span>
                        <FileText className="h-6 w-6 text-rose-500" />
                      </div>
                      <div>
                        <span className="line-clamp-1 text-xs font-bold text-slate-900">
                          {file.name}
                        </span>
                        <span className="text-[11px] text-rose-700 font-semibold flex items-center gap-1 mt-0.5">
                          <Eye className="h-3 w-3" /> Preview Document
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setPreviewFile(file)}
                      className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-slate-50 p-3.5 flex flex-col justify-between mb-2.5 border border-slate-200/60 group-hover:border-slate-300 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-white tracking-wider uppercase">
                          Doc
                        </span>
                        <File className="h-6 w-6 text-slate-500" />
                      </div>
                      <div>
                        <span className="line-clamp-1 text-xs font-bold text-slate-900">
                          {file.name}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">Click to inspect</span>
                      </div>
                    </div>
                  )}

                  {/* Title & Metadata */}
                  <div className="flex-1 min-w-0">
                    <div
                      onClick={() => setPreviewFile(file)}
                      title={file.name}
                      className="cursor-pointer truncate text-xs font-bold text-slate-900 hover:text-teal-700 transition"
                    >
                      {file.name}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{Math.round((file.size || 0) / 1024)} KB</span>
                      <span>{formatDate(String(file.createdAt))}</span>
                    </div>
                  </div>

                  {/* Footer Bar: Uploader & Action Icons */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserAvatar
                        name={file.uploadedBy?.name || 'User'}
                        avatar={file.uploadedBy?.avatar}
                        className="h-5 w-5 text-[9px]"
                      />
                      <span className="truncate max-w-[90px] text-[11px] text-slate-600 font-medium">
                        {file.uploadedBy?.name || 'User'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-700 transition"
                        title="Preview"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadFile(file.url, file.name)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete "${file.name}"?`)) {
                              deleteMutation.mutate(file._id);
                            }
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
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
          /* Table View */
          <Card className="overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Project Link</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Uploaded By</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {files.map((f) => {
                  const isImg = isImageFile(f.mime || f.name);
                  const isPdf = isPdfFile(f.mime || f.name);
                  const canDelete =
                    role === 'ceo' ||
                    role === 'manager' ||
                    f.uploadedBy?._id === currentUserId;

                  return (
                    <tr key={f._id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div
                          onClick={() => setPreviewFile(f)}
                          className="flex items-center gap-2.5 cursor-pointer hover:text-teal-700"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            {isImg ? (
                              <Eye className="h-3.5 w-3.5 text-teal-600" />
                            ) : isPdf ? (
                              <span className="font-bold text-[9px] text-rose-600">PDF</span>
                            ) : (
                              <File className="h-3.5 w-3.5 text-slate-500" />
                            )}
                          </div>
                          <span className="truncate max-w-xs">{f.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 uppercase">
                          {f.folder}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {f.project?.name ? (
                          <span className="rounded bg-teal-50 px-2 py-0.5 text-teal-800 font-semibold border border-teal-200/60">
                            {f.project.name}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {Math.round((f.size || 0) / 1024)} KB
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <UserAvatar
                            name={f.uploadedBy?.name || 'User'}
                            avatar={f.uploadedBy?.avatar}
                            className="h-5 w-5 text-[9px]"
                          />
                          <span>{f.uploadedBy?.name || 'User'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(String(f.createdAt))}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewFile(f)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-700 transition"
                            title="Preview file"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadFile(f.url, f.name)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
                            title="Download file"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Delete "${f.name}"?`)) {
                                  deleteMutation.mutate(f._id);
                                }
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete file"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        <EmptyState
          title="No files or content found"
          description="Upload project documents, image assets, and PDF briefs or adjust your filter"
          action={
            <Button onClick={() => setUploadModalOpen(true)} className="bg-[#0D9488] text-white">
              <Upload className="h-4 w-4" />
              Upload First File
            </Button>
          }
        />
      )}

      {/* Upload Modal Dialog */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload File or Content"
        description="Share image assets, design files, PDF briefs, and documents with employees and team members"
        variant="dialog"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!uploadFile || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white flex items-center gap-1.5"
            >
              <Upload className="h-4 w-4" />
              <span>{uploadMutation.isPending ? 'Uploading...' : 'Confirm Upload'}</span>
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* File Selector Dropzone */}
          <div>
            <Label className="mb-1.5 block text-xs font-semibold text-slate-800">Choose File</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 p-6 text-center hover:border-teal-500 hover:bg-teal-50/40 transition"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700 mb-2">
                <Upload className="h-5 w-5" />
              </div>
              {uploadFile ? (
                <div>
                  <span className="text-xs font-bold text-slate-900">{uploadFile.name}</span>
                  <span className="block text-[10px] text-slate-500">
                    {Math.round(uploadFile.size / 1024)} KB &bull; Click to change
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-xs font-semibold text-slate-700">
                    Click to select file (PDF, Image, Document)
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Max size 50 MB
                  </span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setUploadFile(f);
              }}
            />
          </div>

          {/* Folder Category */}
          <div>
            <Label className="mb-1 block text-xs font-semibold text-slate-800">Folder Category</Label>
            <Select
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value)}
              className="text-xs"
            >
              <option value="projects">Projects Content</option>
              <option value="tasks">Workflow &amp; Tasks</option>
              <option value="briefs">Briefs &amp; Guidelines</option>
              <option value="contracts">Contracts</option>
              <option value="receipts">Receipts</option>
              <option value="general">General</option>
            </Select>
          </div>

          {/* Optional Project Linking */}
          <div>
            <Label className="mb-1 block text-xs font-semibold text-slate-800">
              Link to Project (Optional)
            </Label>
            <Select
              value={uploadProjectId}
              onChange={(e) => setUploadProjectId(e.target.value)}
              className="text-xs"
            >
              <option value="">No specific project (General)</option>
              {(projectsData || []).map((p: { _id: string; name: string }) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-slate-400">
              Files linked to a project will appear directly inside that project's workflow files.
            </p>
          </div>
        </div>
      </Modal>

      {/* Standalone Full-Resolution Image / PDF Preview Modal */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
