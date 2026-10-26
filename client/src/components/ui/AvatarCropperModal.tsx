import { useState, useRef, useEffect, useCallback, type MouseEvent, type TouchEvent } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  Check,
  X,
  Upload,
  Loader2,
  Crop,
  Sparkles,
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
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Crop dimension inside the viewport (260px circle)
  const CROP_SIZE = 240;

  // Load image object URL when imageFile changes
  useEffect(() => {
    if (!imageFile) {
      setImageUrl(null);
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

  // Update preview canvas whenever image, zoom, offset, or rotation changes
  const updatePreview = useCallback(() => {
    const img = imageRef.current;
    const canvas = previewCanvasRef.current;
    if (!img || !canvas || !img.complete || img.naturalWidth === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 120;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    // Circular clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const scaleFactor = size / CROP_SIZE;

    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    const baseScale = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
    const drawWidth = img.naturalWidth * baseScale * zoom * scaleFactor;
    const drawHeight = img.naturalHeight * baseScale * zoom * scaleFactor;

    ctx.drawImage(
      img,
      -drawWidth / 2 + offset.x * scaleFactor,
      -drawHeight / 2 + offset.y * scaleFactor,
      drawWidth,
      drawHeight
    );
    ctx.restore();
  }, [zoom, rotation, offset]);

  useEffect(() => {
    if (imageUrl) {
      updatePreview();
    }
  }, [imageUrl, zoom, rotation, offset, updatePreview]);

  // Mouse drag handlers
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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile / tablet
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  // Reset adjustments
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  // Generate cropped output file (512x512 crisp square/circle)
  const handleCropAndSave = () => {
    const img = imageRef.current;
    if (!img) return;

    const exportCanvas = document.createElement('canvas');
    const OUTPUT_SIZE = 512;
    exportCanvas.width = OUTPUT_SIZE;
    exportCanvas.height = OUTPUT_SIZE;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    const scaleFactor = OUTPUT_SIZE / CROP_SIZE;
    const baseScale = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
    const drawWidth = img.naturalWidth * baseScale * zoom * scaleFactor;
    const drawHeight = img.naturalHeight * baseScale * zoom * scaleFactor;

    ctx.drawImage(
      img,
      -drawWidth / 2 + offset.x * scaleFactor,
      -drawHeight / 2 + offset.y * scaleFactor,
      drawWidth,
      drawHeight
    );
    ctx.restore();

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
      0.92
    );
  };

  return (
    <Modal
      open={open}
      onClose={isUploading ? () => {} : onClose}
      title="Adjust Profile Photo"
      description="Drag to reposition, use the zoom slider or rotate before uploading."
      size="md"
    >
      <div className="space-y-4">
        {/* Main Crop Area */}
        <div className="relative flex flex-col items-center justify-center rounded-2xl bg-slate-900/90 p-4 select-none overflow-hidden">
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative h-[280px] w-full max-w-[320px] flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing rounded-xl"
          >
            {/* Background image being manipulated */}
            {imageUrl && (
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Source"
                draggable={false}
                onLoad={updatePreview}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                  transformOrigin: 'center center',
                  maxHeight: 'none',
                  maxWidth: 'none',
                }}
                className="pointer-events-none transition-transform duration-75 ease-out select-none"
              />
            )}

            {/* Dark vignette overlay outside the crop circle */}
            <div
              className="pointer-events-none absolute inset-0 shadow-[0_0_0_9999px_rgba(15,23,42,0.7)] rounded-full"
              style={{
                width: `${CROP_SIZE}px`,
                height: `${CROP_SIZE}px`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                border: '2px solid rgba(255, 255, 255, 0.85)',
              }}
            >
              {/* Inner rule-of-thirds grid */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30 pointer-events-none">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>
            </div>
          </div>

          <span className="mt-2 text-[11px] font-medium text-slate-400">
            Click &amp; drag photo to center your face
          </span>
        </div>

        {/* Adjustments & Controls Bar */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="range"
              min="0.8"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#00a884]"
              aria-label="Zoom scale"
            />
            <ZoomIn className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="w-10 text-right text-xs font-semibold text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Quick Buttons: Rotate & Reset + Circular Preview */}
          <div className="flex items-center justify-between border-t border-slate-200/80 pt-2.5">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRotate}
                className="h-8 gap-1.5 text-xs text-slate-700 bg-white"
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
                className="h-8 gap-1.5 text-xs text-slate-700 bg-white"
                title="Reset zoom & position"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </Button>
            </div>

            {/* Live circular preview thumbnail */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-400">Preview:</span>
              <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-white shadow-xs bg-slate-200">
                <canvas ref={previewCanvasRef} className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
            className="bg-[#00a884] hover:bg-[#008069] text-white text-xs gap-1.5 shadow-xs"
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
