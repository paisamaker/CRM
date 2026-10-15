import { useState, useEffect } from 'react';
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  Image as ImageIcon,
  FileCheck,
} from 'lucide-react';
import { getAuthenticatedFileUrl, getFileDownloadUrl, downloadFile, isImageFile, isPdfFile } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';

export interface PreviewFile {
  _id?: string;
  name: string;
  url: string;
  size?: number;
  mime?: string;
  folder?: string;
  createdAt?: string | Date;
  uploadedBy?: {
    _id?: string;
    name?: string;
    email?: string;
    avatar?: string;
  };
}

interface Props {
  file: PreviewFile | null;
  onClose: () => void;
}

export function FilePreviewModal({ file, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [file]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (file) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [file, onClose]);

  if (!file) return null;

  const authUrl = getAuthenticatedFileUrl(file.url);
  const isImg = isImageFile(file.mime || file.name);
  const isPdf = isPdfFile(file.mime || file.name);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      {/* Top Navigation & Action Bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-4 md:px-6 text-white shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-teal-400">
            {isImg ? (
              <ImageIcon className="h-5 w-5" />
            ) : isPdf ? (
              <span className="flex items-center justify-center font-bold text-xs text-rose-400 border border-rose-500/40 rounded px-1 py-0.5">
                PDF
              </span>
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-white max-w-xs md:max-w-md">
              {file.name}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {file.size ? <span>{Math.round(file.size / 1024)} KB</span> : null}
              {file.createdAt ? (
                <>
                  <span>&bull;</span>
                  <span>{formatDate(String(file.createdAt))}</span>
                </>
              ) : null}
              {file.uploadedBy?.name ? (
                <div className="flex items-center gap-1.5 ml-1 border-l border-white/15 pl-2 text-slate-300">
                  <UserAvatar
                    name={file.uploadedBy.name}
                    avatar={file.uploadedBy.avatar}
                    className="h-4 w-4 text-[8px]"
                  />
                  <span className="truncate max-w-[120px]">{file.uploadedBy.name}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isImg && (
            <div className="mr-2 hidden sm:flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="px-1 text-xs font-mono text-slate-300">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                title="Rotate 90°"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
          )}

          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white transition"
            title="Open in new window / tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open in Tab</span>
          </a>

          <button
            type="button"
            onClick={() => downloadFile(file.url, file.name)}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
            title="Download file"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            title="Close viewer (ESC)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex-1 overflow-auto p-4 md:p-6 flex items-center justify-center">
        {isImg ? (
          <div className="flex h-full w-full items-center justify-center overflow-auto">
            <img
              src={authUrl}
              alt={file.name}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            />
          </div>
        ) : isPdf ? (
          <div className="h-full w-full max-w-6xl rounded-xl bg-white shadow-2xl overflow-hidden border border-white/20 flex flex-col">
            <iframe
              src={authUrl}
              title={file.name}
              className="w-full flex-1 border-0"
            />
          </div>
        ) : (
          /* Generic File Card */
          <div className="max-w-md rounded-2xl border border-white/15 bg-white/10 p-8 text-center text-white backdrop-blur-xl shadow-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-teal-400 mb-4">
              <FileText className="h-10 w-10" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{file.name}</h3>
            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              This document format can be downloaded and opened with its native desktop application.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => downloadFile(file.url, file.name)}
                className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition"
              >
                <Download className="h-4 w-4" />
                <span>Download File</span>
              </button>
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-semibold text-slate-200 transition"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open Raw</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
