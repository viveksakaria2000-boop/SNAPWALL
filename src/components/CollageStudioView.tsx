import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import {
  Camera,
  Check,
  CloudUpload,
  Download,
  ExternalLink,
  Shuffle,
  Upload,
} from 'lucide-react';
import type {
  CapturedPhoto,
  CollageAspectRatio,
  CollageLayoutId,
  CollageSettings,
  CollageThemeId,
} from '../types';
import {
  COLLAGE_THEMES,
  exportCollageBlob,
  getCanvasDimensions,
  renderCollageToCanvas,
  type CollageSlotRect,
} from '../utils/collageRenderer';
import { triggerBlobDownload } from '../services/sessionApi';

interface CollageStudioViewProps {
  photos: CapturedPhoto[];
  eventTitle: string;
  eventSubtitle: string;
  selectedPhotoIds: string[];
  onChangeSelectedPhotoIds: (ids: string[]) => void;
  isDriveConnected: boolean;
  onSaveCollageToDrive: (blob: Blob, filename: string) => Promise<string | null>;
  onGoogleSignIn: () => void;
  onUploadFromLaptop: (files: FileList) => Promise<void>;
  onOpenCameraTest: () => void;
  onNotify: (text: string, tone?: 'neutral' | 'success' | 'error') => void;
}

const LAYOUT_OPTIONS: Array<{ id: CollageLayoutId; label: string; desc: string }> = [
  { id: 'grid', label: 'Smart Grid', desc: 'Balanced rows & columns' },
  { id: 'bento', label: 'Editorial Bento', desc: 'Featured hero + mosaic' },
  { id: 'polaroid', label: 'Polaroid Wall', desc: 'Instant frames with captions' },
  { id: 'contact-sheet', label: 'Contact Sheet', desc: '35mm numbered proof sheet' },
  { id: 'spotlight', label: 'Spotlight', desc: 'Centerpiece + gallery ring' },
];

const ASPECT_OPTIONS: Array<{ id: CollageAspectRatio; label: string }> = [
  { id: '1:1', label: '1:1 Square' },
  { id: '4:5', label: '4:5 Portrait' },
  { id: '16:9', label: '16:9 Wide' },
  { id: '3:4', label: '3:4 Poster' },
];

export function CollageStudioView({
  photos,
  eventTitle,
  eventSubtitle,
  selectedPhotoIds,
  onChangeSelectedPhotoIds,
  isDriveConnected,
  onSaveCollageToDrive,
  onGoogleSignIn,
  onUploadFromLaptop,
  onOpenCameraTest,
  onNotify,
}: CollageStudioViewProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const slotsRef = useRef<CollageSlotRect[]>([]);

  const [settings, setSettings] = useState<CollageSettings>({
    layout: 'bento',
    aspectRatio: '4:5',
    theme: 'ivory',
    gap: 28,
    cornerRadius: 12,
    padding: 72,
    showHeader: true,
    headerTitle: eventTitle,
    headerSubtitle: eventSubtitle,
    fitMode: 'cover',
    exportFormat: 'image/png',
  });

  const [swapSourceIndex, setSwapSourceIndex] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [lastDriveCollageLink, setLastDriveCollageLink] = useState<string | null>(null);

  // Sync default header title if untouched
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      headerTitle: prev.headerTitle || eventTitle,
      headerSubtitle: prev.headerSubtitle || eventSubtitle,
    }));
  }, [eventTitle, eventSubtitle]);

  // Resolve ordered selected photos
  const selectedPhotos = useMemo(() => {
    const map = new Map(photos.map((p) => [p.id, p]));
    return selectedPhotoIds
      .map((id) => map.get(id))
      .filter((p): p is CapturedPhoto => Boolean(p));
  }, [photos, selectedPhotoIds]);

  // Render live interactive preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || selectedPhotos.length === 0) return;

    let cancelled = false;
    renderCollageToCanvas(canvas, selectedPhotos, settings, 0.5).then((slots) => {
      if (!cancelled) {
        slotsRef.current = slots;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPhotos, settings]);

  const togglePhotoSelection = (id: string) => {
    setSwapSourceIndex(null);
    if (selectedPhotoIds.includes(id)) {
      onChangeSelectedPhotoIds(selectedPhotoIds.filter((item) => item !== id));
    } else {
      onChangeSelectedPhotoIds([...selectedPhotoIds, id]);
    }
  };

  const handleSelectAll = () => {
    setSwapSourceIndex(null);
    onChangeSelectedPhotoIds(photos.map((p) => p.id));
  };

  const handleSelectFavorites = () => {
    setSwapSourceIndex(null);
    const favIds = photos.filter((p) => p.favorite).map((p) => p.id);
    if (favIds.length === 0) {
      onNotify('Mark favorite photos in the Live Gallery first.', 'neutral');
      return;
    }
    onChangeSelectedPhotoIds(favIds);
  };

  const handleShuffle = () => {
    setSwapSourceIndex(null);
    const copy = [...selectedPhotoIds];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    onChangeSelectedPhotoIds(copy);
  };

  // Click any two tiles on the live canvas to swap their photo positions
  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || slotsRef.current.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const hit = slotsRef.current.find(
      (s) => clickX >= s.x && clickX <= s.x + s.w && clickY >= s.y && clickY <= s.y + s.h
    );
    if (!hit) {
      setSwapSourceIndex(null);
      return;
    }

    if (swapSourceIndex === null) {
      setSwapSourceIndex(hit.photoIndex);
      return;
    }

    if (swapSourceIndex === hit.photoIndex) {
      setSwapSourceIndex(null);
      return;
    }

    const updated = [...selectedPhotoIds];
    const temp = updated[swapSourceIndex];
    updated[swapSourceIndex] = updated[hit.photoIndex];
    updated[hit.photoIndex] = temp;
    onChangeSelectedPhotoIds(updated);
    setSwapSourceIndex(null);
  };

  const buildFilename = () => {
    const slug =
      (settings.headerTitle || eventTitle).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36) ||
      'SnapWall_Collage';
    const ext = settings.exportFormat === 'image/png' ? 'png' : 'jpg';
    return `${slug}_collage_${selectedPhotos.length}photos.${ext}`;
  };

  const handleDownloadCollage = async () => {
    if (selectedPhotos.length === 0) return;
    setIsExporting(true);
    try {
      const blob = await exportCollageBlob(selectedPhotos, settings);
      triggerBlobDownload(blob, buildFilename());
      onNotify('High-resolution collage downloaded to your laptop.', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not export collage image.',
        'error'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleUploadCollageToDrive = async () => {
    if (selectedPhotos.length === 0) return;
    if (!isDriveConnected) {
      onGoogleSignIn();
      return;
    }
    setIsUploadingDrive(true);
    try {
      const blob = await exportCollageBlob(selectedPhotos, settings);
      const link = await onSaveCollageToDrive(blob, buildFilename());
      if (link) {
        setLastDriveCollageLink(link);
      }
    } finally {
      setIsUploadingDrive(false);
    }
  };

  const handleLaptopUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFromLaptop(e.target.files);
      e.target.value = '';
    }
  };

  const fullDim = getCanvasDimensions(settings.aspectRatio, 1);

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-20 text-center">
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleLaptopUpload}
          className="hidden"
        />
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-zinc-950">
          Collage Studio
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
          Capture a few guest photos via your QR code — or upload photos from your laptop — to start
          composing your high-resolution event collage.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenCameraTest}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] whitespace-nowrap"
          >
            <Camera className="h-4 w-4" />
            <span>Snap Photos Now</span>
          </button>
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            <span>Upload from Laptop</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleLaptopUpload}
        className="hidden"
      />

      {/* Studio Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-zinc-950">
            Collage Studio
          </h1>
          <p className="mt-1 text-sm text-zinc-600 tabular-nums">
            {selectedPhotos.length} of {photos.length} photos selected · Output{' '}
            <span className="font-mono text-xs text-zinc-800">
              {fullDim.width} × {fullDim.height}px
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {lastDriveCollageLink && (
            <a
              href={lastDriveCollageLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
            >
              <span>Open Collage in Drive</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={handleUploadCollageToDrive}
            disabled={selectedPhotos.length === 0 || isUploadingDrive}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap"
          >
            <CloudUpload className="h-4 w-4" />
            <span>
              {isUploadingDrive
                ? 'Saving to Drive…'
                : isDriveConnected
                ? 'Save to Google Drive'
                : 'Connect Drive & Save'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCollage}
            disabled={selectedPhotos.length === 0 || isExporting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#BE123C] disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>{isExporting ? 'Rendering…' : 'Download Collage Image'}</span>
          </button>
        </div>
      </div>

      {/* 3-Column Studio Workbench */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Rail: Photo Picker Filmstrip */}
        <aside className="rounded-2xl border border-zinc-200/90 bg-white p-4 lg:col-span-3">
          <div className="flex items-center justify-between gap-2 pb-3">
            <h2 className="font-display text-sm font-semibold text-zinc-950">
              Select Photos
            </h2>
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-950 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 pb-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 whitespace-nowrap"
            >
              All
            </button>
            <button
              type="button"
              onClick={handleSelectFavorites}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 whitespace-nowrap"
            >
              Favorites
            </button>
            <button
              type="button"
              onClick={handleShuffle}
              disabled={selectedPhotoIds.length < 2}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 whitespace-nowrap"
            >
              <Shuffle className="h-3 w-3" />
              <span>Shuffle</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSwapSourceIndex(null);
                onChangeSelectedPhotoIds([]);
              }}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 whitespace-nowrap"
            >
              Clear
            </button>
          </div>

          <div className="mt-3 grid max-h-[560px] grid-cols-3 gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
            {photos.map((photo) => {
              const orderIndex = selectedPhotoIds.indexOf(photo.id);
              const isSelected = orderIndex !== -1;
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => togglePhotoSelection(photo.id)}
                  className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-zinc-950 ring-1 ring-zinc-950/15'
                      : 'border-transparent opacity-65 hover:opacity-100'
                  }`}
                >
                  <img
                    src={photo.url}
                    alt={`Select photo by ${photo.guestName}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                      {orderIndex + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center Stage: Live Collage Canvas Preview */}
        <section className="flex flex-col items-center rounded-2xl border border-zinc-200/90 bg-[#ECECE9] p-5 sm:p-8 lg:col-span-6">
          {selectedPhotos.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <p className="font-display text-base font-semibold text-zinc-800">
                Choose at least 1 photo from the left panel
              </p>
              <button
                type="button"
                onClick={handleSelectAll}
                className="mt-4 rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                Select All Photos ({photos.length})
              </button>
            </div>
          ) : (
            <>
              <div className="relative flex w-full items-center justify-center">
                <canvas
                  ref={previewCanvasRef}
                  onClick={handleCanvasClick}
                  title="Click any two photos on the collage to swap their positions"
                  className="max-h-[640px] w-auto max-w-full cursor-pointer rounded-lg shadow-lg"
                />
              </div>
              <p className="mt-4 text-center text-xs text-zinc-600">
                {swapSourceIndex !== null
                  ? `Slot #${swapSourceIndex + 1} selected — click another photo on the canvas to swap positions.`
                  : 'Tip: Click any two photos directly on the collage to swap their placement.'}
              </p>
            </>
          )}
        </section>

        {/* Right Rail: Editorial Layout & Style Inspector */}
        <aside className="space-y-5 rounded-2xl border border-zinc-200/90 bg-white p-5 lg:col-span-3">
          {/* Layout Selector */}
          <div>
            <h2 className="font-display text-sm font-semibold text-zinc-950">Layout</h2>
            <div className="mt-2.5 space-y-1.5">
              {LAYOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, layout: opt.id }))}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                    settings.layout === opt.id
                      ? 'border-zinc-950 bg-zinc-950 text-white'
                      : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                  }`}
                >
                  <div>
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p
                      className={`text-[11px] ${
                        settings.layout === opt.id ? 'text-zinc-300' : 'text-zinc-500'
                      }`}
                    >
                      {opt.desc}
                    </p>
                  </div>
                  {settings.layout === opt.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="border-t border-zinc-100 pt-4">
            <h2 className="font-display text-sm font-semibold text-zinc-950">Canvas Ratio</h2>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, aspectRatio: opt.id }))}
                  className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    settings.aspectRatio === opt.id
                      ? 'border-zinc-950 bg-zinc-950 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Paper / Background Theme */}
          <div className="border-t border-zinc-100 pt-4">
            <h2 className="font-display text-sm font-semibold text-zinc-950">Backdrop</h2>
            <div className="mt-2.5 flex items-center gap-2.5">
              {(Object.keys(COLLAGE_THEMES) as CollageThemeId[]).map((themeId) => {
                const palette = COLLAGE_THEMES[themeId];
                const active = settings.theme === themeId;
                return (
                  <button
                    key={themeId}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, theme: themeId }))}
                    title={palette.label}
                    aria-label={palette.label}
                    style={{ backgroundColor: palette.bg }}
                    className={`h-8 w-8 rounded-full border transition-transform ${
                      active
                        ? 'scale-110 border-[#E11D48] ring-2 ring-[#E11D48]/30'
                        : 'border-zinc-300 hover:scale-105'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Spacing & Radius Sliders */}
          <div className="space-y-3 border-t border-zinc-100 pt-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700">Photo Spacing</span>
                <span className="font-mono text-zinc-500 tabular-nums">{settings.gap}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={64}
                step={4}
                value={settings.gap}
                onChange={(e) => setSettings((s) => ({ ...s, gap: Number(e.target.value) }))}
                className="mt-1.5 w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700">Corner Radius</span>
                <span className="font-mono text-zinc-500 tabular-nums">
                  {settings.cornerRadius}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={36}
                step={2}
                value={settings.cornerRadius}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, cornerRadius: Number(e.target.value) }))
                }
                className="mt-1.5 w-full"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs font-medium text-zinc-700">Photo Framing</span>
              <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, fitMode: 'cover' }))}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                    settings.fitMode === 'cover' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  Fill
                </button>
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, fitMode: 'contain' }))}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                    settings.fitMode === 'contain' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  Fit
                </button>
              </div>
            </div>
          </div>

          {/* Header Banner Settings */}
          <div className="space-y-2.5 border-t border-zinc-100 pt-4">
            <label className="flex cursor-pointer items-center justify-between text-xs font-semibold text-zinc-900">
              <span>Event Title Header</span>
              <input
                type="checkbox"
                checked={settings.showHeader}
                onChange={(e) => setSettings((s) => ({ ...s, showHeader: e.target.checked }))}
                className="h-4 w-4 rounded accent-zinc-950"
              />
            </label>

            {settings.showHeader && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={settings.headerTitle}
                  onChange={(e) => setSettings((s) => ({ ...s, headerTitle: e.target.value }))}
                  placeholder="Collage heading"
                  maxLength={60}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                />
                <input
                  type="text"
                  value={settings.headerSubtitle}
                  onChange={(e) => setSettings((s) => ({ ...s, headerSubtitle: e.target.value }))}
                  placeholder="Subtitle or date"
                  maxLength={80}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 focus:border-zinc-900 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Export Format */}
          <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
            <span className="text-xs font-medium text-zinc-700">Export Format</span>
            <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, exportFormat: 'image/png' }))}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  settings.exportFormat === 'image/png'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600'
                }`}
              >
                PNG
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, exportFormat: 'image/jpeg' }))}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  settings.exportFormat === 'image/jpeg'
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600'
                }`}
              >
                JPG
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
