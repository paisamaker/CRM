import { useState, useRef, useEffect, useCallback, type MouseEvent, type TouchEvent } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  Check,
  Loader2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface AvatarCropperModalProps {
  open: boolean;
  imageFile: File | null;
  onClose: () => void;
  onCropComplete: (croppedFile: File) => void;
  isUploading?: boolean;
}

/** Viewport crop circle size (px). */
const CROP_SIZE = 280;
/** Exported avatar edge length — high-res square that keeps the full framed image. */
const OUTPUT_SIZE = 1024;

export function AvatarCropperModal({
  open,
  imageFile,
  onClose,
  onCropComplete,
  isUploading = false,
}: AvatarCropperModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  const imageRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Fit the FULL image inside the crop circle (contain), not cover/crop.
  const baseScale =
    naturalSize.w > 0 && naturalSize.h > 0
      ? Math.min(CROP_SIZE / naturalSize.w, CROP_SIZE / naturalSize.h)
      : 1;

  const displayWidth = naturalSize.w * baseScale * zoom;
  const displayHeight = naturalSize.h * baseScale * zoom;

  useEffect(() => {
    if (!imageFile) {
      setImageUrl(null);
      setNaturalSize({ w: 0, h: 0 });
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  const drawToCanvas = useCallback(
    (
      canvas: HTMLCanvasElement,
      size: number,
      opts?: { circularClip?: boolean }
    ) => {
      const img = imageRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) return false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      canvas.width = size;
      canvas.height = size;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (opts?.circularClip) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }

      const scaleFactor = size / CROP_SIZE;
      const fit = Math.min(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      const drawWidth = img.naturalWidth * fit * zoom * scaleFactor;
      const drawHeight = img.naturalHeight * fit * zoom * scaleFactor;

      // Fill with soft background so letterboxed areas aren't transparent black
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(
        img,
        -drawWidth / 2 + offset.x * scaleFactor,
        -drawHeight / 2 + offset.y * scaleFactor,
        drawWidth,
        drawHeight
      );
      ctx.restore();

      if (opts?.circularClip) ctx.restore();
      return true;
    },
    [zoom, rotation, offset]
  );

  const updatePreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    drawToCanvas(canvas, 120, { circularClip: true });
  }, [drawToCanvas]);

  useEffect(() => {
    if (imageUrl && naturalSize.w > 0) updatePreview();
  }, [imageUrl, naturalSize, zoom, rotation, offset, updatePreview]);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const handleCropAndSave = () => {
    const exportCanvas = document.createElement('canvas');
    if (!drawToCanvas(exportCanvas, OUTPUT_SIZE)) return;

    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], imageFile?.name || 'profile_avatar.jpg', {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        onCropComplete(croppedFile);
      },
      'image/jpeg',
      0.94
    );
  };

  return (
    <Modal
      open={open}
      onClose={isUploading ? () => {} : onClose}
      title="Adjust Profile Photo"
      description="Full photo fits by default. Drag, zoom, or rotate if you want a tighter frame."
      size="md"
    >
      <div className="space-y-4">
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-slate-900/90 p-4 select-none">
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative flex h-[320px] w-full max-w-[360px] cursor-grab items-center justify-center overflow-hidden rounded-xl active:cursor-grabbing"
          >
            {imageUrl && (
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Source"
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                  updatePreview();
                }}
                style={{
                  width: displayWidth || undefined,
                  height: displayHeight || undefined,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                }}
                className="pointer-events-none absolute left-1/2 top-1/2 select-none transition-[width,height] duration-75 ease-out"
              />
            )}

            {/* Crop circle guide — full image is fitted inside this by default */}
            <div
              className="pointer-events-none absolute rounded-full shadow-[0_0_0_9999px_rgba(15,23,42,0.72)]"
              style={{
                width: `${CROP_SIZE}px`,
                height: `${CROP_SIZE}px`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                border: '2px solid rgba(255, 255, 255, 0.9)',
              }}
            >
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-25">
                <div className="border-b border-r border-white" />
                <div className="border-b border-r border-white" />
                <div className="border-b border-white" />
                <div className="border-b border-r border-white" />
                <div className="border-b border-r border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>
            </div>
          </div>

          <span className="mt-2 text-[11px] font-medium text-slate-400">
            Full image is shown — zoom in only if you want a closer crop
          </span>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#00a884]"
              aria-label="Zoom scale"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="w-10 text-right text-xs font-semibold text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200/80 pt-2.5">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRotate}
                className="h-8 gap-1.5 bg-white text-xs text-slate-700"
                title="Rotate 90 degrees"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>Rotate</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="h-8 gap-1.5 bg-white text-xs text-slate-700"
                title="Reset zoom & position"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-400">Preview:</span>
              <div className="h-9 w-9 overflow-hidden rounded-full border-2 border-white bg-slate-200 shadow-xs">
                <canvas ref={previewCanvasRef} className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isUploading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCropAndSave}
            disabled={isUploading}
            className="gap-1.5 bg-[#00a884] text-xs text-white shadow-xs hover:bg-[#008069]"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading…</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Save &amp; Apply Photo</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
