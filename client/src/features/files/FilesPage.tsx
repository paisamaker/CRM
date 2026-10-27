import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  Download,
  Trash2,
  Eye,
  FileText,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Folder,
  FolderPlus,
  Star,
  Share2,
  HardDrive,
  Image as ImageIcon,
  Film,
  File,
  Users,
  ChevronRight,
  Home,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  getErrorMessage,
  getAuthenticatedFileUrl,
  downloadFile,
  isImageFile,
  isPdfFile,
  isVideoFile,
} from '@/lib/api';
import { PageHeader, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Label, Select, Input } from '@/components/ui/Input';
import { formatDate, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { FilePreviewModal, type PreviewFile } from '@/components/files/FilePreviewModal';

type NavView =
  | 'all'
  | 'mine'
  | 'shared'
  | 'projects'
  | 'starred'
  | 'media'
  | 'documents'
  | 'trash';

type FileItem = {
  _id: string;
  name: string;
  url: string;
  mime?: string;
  size?: number;
  kind?: 'file' | 'folder';
  folder?: string;
  visibility?: string;
  project?: { _id: string; name: string } | string;
  uploadedBy?: { _id: string; name: string; avatar?: string };
  owner?: { _id: string; name: string };
  parentId?: string;
  createdAt?: string;
  updatedAt?: string;
  accessLevel?: string;
  shares?: Array<{ user: string | { _id: string; name: string }; level: string }>;
  starredBy?: string[];
};

const NAV: Array<{ id: NavView; label: string; icon: typeof Home; adminOnly?: boolean }> = [
  { id: 'all', label: 'Overview', icon: Home },
  { id: 'mine', label: 'My Files', icon: File },
  { id: 'shared', label: 'Shared with Me', icon: Users },
  { id: 'projects', label: 'Project Files', icon: Folder },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(item: FileItem) {
  if (item.kind === 'folder') return <Folder className="h-8 w-8 text-amber-500" />;
  if (isImageFile(item.mime || item.name)) return <ImageIcon className="h-8 w-8 text-teal-600" />;
  if (isVideoFile(item.mime || item.name)) return <Film className="h-8 w-8 text-violet-600" />;
  if (isPdfFile(item.mime || item.name)) {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500 text-[10px] font-bold text-white">
        PDF
      </span>
    );
  }
  return <FileText className="h-8 w-8 text-slate-500" />;
}

export function FilesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ceo';

  const [view, setView] = useState<NavView>('all');
  const [parentId, setParentId] = useState<string>('');
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [shareItem, setShareItem] = useState<FileItem | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [folderName, setFolderName] = useState('');
  const [shareUserId, setShareUserId] = useState('');
  const [shareLevel, setShareLevel] = useState('viewer');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: overview } = useQuery({
    queryKey: ['files-overview'],
    queryFn: async () => (await api.get('/files/overview')).data.data,
  });

  const { data: colleagues = [] } = useQuery({
    queryKey: ['files-colleagues'],
    queryFn: async () => {
      try {
        return (await api.get('/chat/colleagues')).data.data as Array<{
          _id: string;
          name: string;
          email: string;
        }>;
      } catch {
        return [];
      }
    },
    enabled: !!shareItem || isAdmin,
  });

  const listParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: 80, view };
    if (parentId) params.parentId = parentId;
    if (projectId) params.project = projectId;
    if (search.trim()) params.search = search.trim();
    return params;
  }, [view, parentId, projectId, search]);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['files', listParams],
    queryFn: async () => (await api.get('/files', { params: listParams })).data.data,
  });

  const items: FileItem[] = listData?.items || [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['files'] });
    void qc.invalidateQueries({ queryKey: ['files-overview'] });
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error('No file chosen');
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('visibility', projectId ? 'project' : 'private');
      if (parentId) form.append('parentId', parentId);
      if (projectId) {
        form.append('project', projectId);
        form.append('linkedModel', 'Project');
        form.append('linkedId', projectId);
      }
      return api.post('/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('File uploaded');
      setUploadOpen(false);
      setUploadFile(null);
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const folderMutation = useMutation({
    mutationFn: async () =>
      api.post('/files/folders', {
        name: folderName.trim(),
        parentId: parentId || undefined,
        project: projectId || undefined,
        visibility: projectId ? 'project' : 'private',
      }),
    onSuccess: () => {
      toast.success('Folder created');
      setFolderOpen(false);
      setFolderName('');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const trashMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/files/item/${id}`),
    onSuccess: () => {
      toast.success('Moved to trash');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => api.patch(`/files/item/${id}`, { restore: true }),
    onSuccess: () => {
      toast.success('Restored');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const starMutation = useMutation({
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) =>
      api.patch(`/files/item/${id}`, { starred }),
    onSuccess: invalidate,
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const shareMutation = useMutation({
    mutationFn: async (opts?: { revoke?: boolean; userId?: string }) => {
      if (!shareItem) throw new Error('No file');
      const userId = opts?.userId || shareUserId;
      if (!userId) throw new Error('Select a user');
      return api.post(`/files/item/${shareItem._id}/share`, {
        userId,
        level: shareLevel,
        revoke: !!opts?.revoke,
      });
    },
    onSuccess: (res, vars) => {
      toast.success(vars?.revoke ? 'Access revoked' : 'Access granted');
      if (!vars?.revoke) setShareUserId('');
      const updated = res.data?.data as FileItem | undefined;
      if (updated) setShareItem(updated);
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openFolder = (item: FileItem) => {
    setParentId(item._id);
    setBreadcrumbs((b) => [...b, { id: item._id, name: item.name }]);
    if (item.project) {
      setProjectId(typeof item.project === 'string' ? item.project : item.project._id);
    }
  };

  const goBreadcrumb = (index: number) => {
    if (index < 0) {
      setParentId('');
      setBreadcrumbs([]);
      return;
    }
    const crumb = breadcrumbs[index];
    setParentId(crumb.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const switchView = (v: NavView) => {
    setView(v);
    setParentId('');
    setBreadcrumbs([]);
    if (v !== 'projects') setProjectId('');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Files"
        description="Secure library for documents, media, and project folders."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFolderOpen(true)} className="gap-1.5">
              <FolderPlus className="h-4 w-4" />
              New Folder
            </Button>
            <Button onClick={() => setUploadOpen(true)} className="gap-1.5 bg-teal-600 hover:bg-teal-700">
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </div>
        }
      />

      <div className="flex min-h-[640px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Left nav */}
        <aside className="hidden w-[220px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 md:flex">
          <nav className="flex-1 space-y-0.5 p-3">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id && !parentId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchView(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition',
                    active
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          {isAdmin && (
            <div className="border-t border-slate-200 p-3">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] font-semibold text-slate-600 hover:bg-white"
                onClick={() => {
                  void api
                    .post('/files/admin/reconcile-project-folders')
                    .then((r) => toast.success(`Reconciled ${r.data.data.fixed} project folders`))
                    .catch((e) => toast.error(getErrorMessage(e)));
                }}
              >
                <HardDrive className="h-4 w-4" />
                Reconcile project folders
              </button>
            </div>
          )}
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Stats */}
          {view === 'all' && !parentId && (
            <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
              {[
                { label: 'Files', value: overview?.total ?? '—', icon: File },
                { label: 'Images', value: overview?.images ?? '—', icon: ImageIcon },
                { label: 'Documents', value: overview?.documents ?? '—', icon: FileText },
                {
                  label: 'Storage used',
                  value: formatBytes(overview?.storageBytes || 0),
                  icon: HardDrive,
                },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3"
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <c.icon className="h-3.5 w-3.5 text-teal-600" />
                    {c.label}
                  </div>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{c.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-slate-500">
              <button type="button" onClick={() => goBreadcrumb(-1)} className="hover:text-teal-700">
                Root
              </button>
              {breadcrumbs.map((b, i) => (
                <span key={b.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button
                    type="button"
                    onClick={() => goBreadcrumb(i)}
                    className="truncate font-medium text-slate-700 hover:text-teal-700"
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            </div>

            {(view === 'projects' || projectId) && (
              <Select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setParentId('');
                  setBreadcrumbs([]);
                }}
                className="h-9 w-44 text-xs"
              >
                <option value="">All projects</option>
                {(overview?.projects || []).map((p: { _id: string; name: string }) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files…"
                className="h-9 w-44 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/15 sm:w-56"
              />
            </div>

            <div className="flex rounded-xl border border-slate-200 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'rounded-lg p-1.5',
                  viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500'
                )}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'rounded-lg p-1.5',
                  viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500'
                )}
                aria-label="List view"
              >
                <TableIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title="No files here"
                description="Upload a file or open a project folder to get started."
                action={
                  <Button onClick={() => setUploadOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Upload
                  </Button>
                }
              />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {items.map((item) => {
                  const starred = (item.starredBy || []).map(String).includes(String(user?.id));
                  const thumb =
                    item.kind !== 'folder' && isImageFile(item.mime || item.name) && item.url
                      ? getAuthenticatedFileUrl(item.url)
                      : null;
                  return (
                    <div
                      key={item._id}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-teal-300 hover:shadow-sm"
                    >
                      <button
                        type="button"
                        className="flex h-28 items-center justify-center bg-slate-50"
                        onClick={() => {
                          if (item.kind === 'folder') openFolder(item);
                          else if (item.url) setPreview(item);
                        }}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          fileIcon(item)
                        )}
                      </button>
                      <div className="border-t border-slate-100 p-2.5">
                        <p className="truncate text-xs font-semibold text-slate-800" title={item.name}>
                          {item.name}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-slate-400">
                          {item.kind === 'folder'
                            ? 'Folder'
                            : formatBytes(item.size)}
                          {item.accessLevel ? ` · ${item.accessLevel}` : ''}
                        </p>
                      </div>
                      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                        {item.kind !== 'folder' && item.url && (
                          <button
                            type="button"
                            className="rounded-lg bg-white/95 p-1.5 text-slate-600 shadow ring-1 ring-slate-200"
                            onClick={() => setPreview(item)}
                            title="Preview"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-lg bg-white/95 p-1.5 text-slate-600 shadow ring-1 ring-slate-200"
                          onClick={() => starMutation.mutate({ id: item._id, starred: !starred })}
                          title="Star"
                        >
                          <Star className={cn('h-3.5 w-3.5', starred && 'fill-amber-400 text-amber-500')} />
                        </button>
                        {(isAdmin || String(item.owner?._id || item.uploadedBy?._id) === user?.id) && (
                          <button
                            type="button"
                            className="rounded-lg bg-white/95 p-1.5 text-slate-600 shadow ring-1 ring-slate-200"
                            onClick={() => setShareItem(item)}
                            title="Share"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Name</th>
                      <th className="px-3 py-2.5 font-semibold">Owner</th>
                      <th className="px-3 py-2.5 font-semibold">Project</th>
                      <th className="px-3 py-2.5 font-semibold">Modified</th>
                      <th className="px-3 py-2.5 font-semibold">Size</th>
                      <th className="px-3 py-2.5 font-semibold">Access</th>
                      <th className="px-3 py-2.5 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item._id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            className="flex items-center gap-2 font-medium text-slate-800 hover:text-teal-700"
                            onClick={() => {
                              if (item.kind === 'folder') openFolder(item);
                              else if (item.url) setPreview(item);
                            }}
                          >
                            <span className="scale-75">{fileIcon(item)}</span>
                            <span className="truncate max-w-[220px]">{item.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {item.uploadedBy?.name || item.owner?.name || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {typeof item.project === 'object' ? item.project?.name : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {item.updatedAt ? formatDate(item.updatedAt) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {item.kind === 'folder' ? '—' : formatBytes(item.size)}
                        </td>
                        <td className="px-3 py-2.5 capitalize text-slate-600">
                          {item.accessLevel || item.visibility || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            {item.url && item.kind !== 'folder' && (
                              <>
                                <button
                                  type="button"
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                                  onClick={() => setPreview(item)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                                  onClick={() => downloadFile(item.url, item.name)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {view === 'trash' ? (
                              <button
                                type="button"
                                className="rounded p-1 text-teal-600 hover:bg-teal-50"
                                onClick={() => restoreMutation.mutate(item._id)}
                                title="Restore"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="rounded p-1 text-rose-500 hover:bg-rose-50"
                                onClick={() => {
                                  if (window.confirm(`Move "${item.name}" to trash?`)) {
                                    trashMutation.mutate(item._id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload file"
        description="Files upload privately by default, or into a project folder when selected."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!uploadFile || uploadMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>File</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="mt-1 block w-full text-xs"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <Label>Project (optional)</Label>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1"
            >
              <option value="">Personal / private</option>
              {(overview?.projects || []).map((p: { _id: string; name: string }) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>

      <Modal
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        title="New folder"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => folderMutation.mutate()}
              disabled={folderName.trim().length < 1 || folderMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              Create
            </Button>
          </div>
        }
      >
        <div>
          <Label>Folder name</Label>
          <Input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            className="mt-1"
            placeholder="e.g. Contracts Q4"
          />
        </div>
      </Modal>

      <Modal
        open={!!shareItem}
        onClose={() => setShareItem(null)}
        title="Manage access"
        description={shareItem ? `Share “${shareItem.name}” with a teammate.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShareItem(null)}>
              Close
            </Button>
            <Button
              onClick={() => shareMutation.mutate()}
              disabled={!shareUserId || shareMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              Grant access
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(shareItem?.shares?.length ?? 0) > 0 && (
            <div>
              <Label>Current access</Label>
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {shareItem!.shares!.map((s) => {
                  const uid = typeof s.user === 'string' ? s.user : s.user?._id;
                  const uname =
                    typeof s.user === 'string'
                      ? colleagues.find((c) => c._id === s.user)?.name || s.user
                      : s.user?.name || 'User';
                  return (
                    <li
                      key={uid}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="truncate text-slate-700">
                        {uname}{' '}
                        <span className="text-slate-400">· {s.level}</span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-rose-600"
                        disabled={!uid || shareMutation.isPending}
                        onClick={() => shareMutation.mutate({ revoke: true, userId: uid })}
                      >
                        Revoke
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div>
            <Label>Employee</Label>
            <Select
              value={shareUserId}
              onChange={(e) => setShareUserId(e.target.value)}
              className="mt-1"
            >
              <option value="">Select user…</option>
              {colleagues.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Permission</Label>
            <Select
              value={shareLevel}
              onChange={(e) => setShareLevel(e.target.value)}
              className="mt-1"
            >
              <option value="viewer">Viewer — preview & download</option>
              <option value="contributor">Contributor — upload into folder</option>
              <option value="editor">Editor — rename & organize</option>
              {isAdmin && <option value="manager">Manager — manage access</option>}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
