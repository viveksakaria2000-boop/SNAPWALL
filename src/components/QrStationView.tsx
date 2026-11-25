import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Camera,
  Check,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FolderDown,
  LayoutGrid,
  Maximize2,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { CapturedPhoto, DriveFolderInfo, EventSession } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import {
  formatPhotoTime,
  generateQrDataUrl,
  triggerBlobDownload,
} from '../services/sessionApi';

interface QrStationViewProps {
  session: EventSession;
  photos: CapturedPhoto[];
  socketStatus: 'connected' | 'reconnecting' | 'disconnected';
  connectedGuests: number;
  captureBaseUrl: string;
  onCaptureBaseUrlChange: (url: string) => void;
  onUpdateEventMeta: (title: string, subtitle: string) => Promise<void>;
  onCreateNewSession: () => Promise<void>;
  onOpenHostCameraTest: () => void;
  onUploadFromLaptop: (files: FileList) => Promise<void>;
  onOpenLightbox: (photoId: string) => void;
  onNavigateTab: (tab: 'gallery' | 'collage' | 'drive') => void;
  onStartSlideshow: () => void;
  // Google Drive props
  driveUser: User | null;
  driveFolder: DriveFolderInfo | null;
  isSigningIn: boolean;
  autoSyncDrive: boolean;
  onToggleAutoSyncDrive: (val: boolean) => void;
  onGoogleSignIn: () => void;
  // Laptop auto-save props
  autoSaveLaptop: boolean;
  laptopFolderName: string | null;
  onToggleAutoSaveLaptop: () => void;
}

export function QrStationView({
  session,
  photos,
  socketStatus,
  connectedGuests,
  captureBaseUrl,
  onCaptureBaseUrlChange,
  onUpdateEventMeta,
  onCreateNewSession,
  onOpenHostCameraTest,
  onUploadFromLaptop,
  onOpenLightbox,
  onNavigateTab,
  onStartSlideshow,
  driveUser,
  driveFolder,
  isSigningIn,
  autoSyncDrive,
  onToggleAutoSyncDrive,
  onGoogleSignIn,
  autoSaveLaptop,
  laptopFolderName,
  onToggleAutoSaveLaptop,
}: QrStationViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [kioskOpen, setKioskOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [titleDraft, setTitleDraft] = useState(session.title);
  const [subtitleDraft, setSubtitleDraft] = useState(session.subtitle);
  const [editingBaseUrl, setEditingBaseUrl] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState(captureBaseUrl);
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  const captureUrl = `${captureBaseUrl.replace(/\/+$/, '')}/?capture=${encodeURIComponent(session.id)}`;
  const slideshowUrl = `${captureBaseUrl.replace(/\/+$/, '')}/?slideshow=${encodeURIComponent(session.id)}`;
  const [copiedSlideUrl, setCopiedSlideUrl] = useState(false);

  useEffect(() => {
    setTitleDraft(session.title);
    setSubtitleDraft(session.subtitle);
  }, [session.title, session.subtitle]);

  useEffect(() => {
    setBaseUrlDraft(captureBaseUrl);
  }, [captureBaseUrl]);

  useEffect(() => {
    let active = true;
    generateQrDataUrl(captureUrl, 640)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('QR code generation failed:', err);
      });
    return () => {
      active = false;
    };
  }, [captureUrl]);

  useEffect(() => {
    if (!kioskOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKioskOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [kioskOpen]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(captureUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleDownloadQrPoster = async () => {
    if (!qrDataUrl) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 1200, 1600);

    // Subtle hairline border frame
    ctx.strokeStyle = '#E4E4E7';
    ctx.lineWidth = 3;
    ctx.strokeRect(56, 56, 1088, 1488);

    ctx.fillStyle = '#71717A';
    ctx.textAlign = 'center';
    ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('LIVE PHOTO BOOTH', 600, 170);

    ctx.fillStyle = '#141416';
    ctx.font = '600 68px "Fraunces", Georgia, serif';
    ctx.fillText(session.title.slice(0, 32), 600, 260);

    if (session.subtitle) {
      ctx.fillStyle = '#52525B';
      ctx.font = '500 28px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(session.subtitle.slice(0, 48), 600, 324);
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = qrDataUrl;
    });

    const qrSize = 740;
    const qrX = (1200 - qrSize) / 2;
    const qrY = 400;
    ctx.strokeStyle = '#E4E4E7';
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48);
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = '#141416';
    ctx.font = '600 40px "Outfit", sans-serif';
    ctx.fillText('Scan with your phone camera', 600, 1260);

    ctx.fillStyle = '#52525B';
    ctx.font = '400 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Tap to snap a photo — it arrives live in the event collage', 600, 1320);

    ctx.fillStyle = '#A1A1AA';
    ctx.font = '500 24px "JetBrains Mono", monospace';
    ctx.fillText(`SESSION ${session.id}`, 600, 1440);

    canvas.toBlob((blob) => {
      if (blob) {
        const slug = session.title.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'Event';
        triggerBlobDownload(blob, `SnapWall_QR_Poster_${slug}.png`);
      }
    }, 'image/png');
  };

  const handleSaveEventMeta = async () => {
    setIsSavingMeta(true);
    try {
      await onUpdateEventMeta(titleDraft.trim() || 'Evening Celebration', subtitleDraft.trim());
      setEditingMeta(false);
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFromLaptop(e.target.files);
      e.target.value = '';
    }
  };

  const syncedCount = photos.filter((p) => Boolean(p.driveFileId)).length;
  const recentPhotos = photos.slice(0, 6);

  return (
    <div className="space-y-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Split-Screen Editorial Hero */}
      <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
        {/* Left Column: Event Header + Live QR Code Station */}
        <section className="flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-6 sm:p-8 lg:col-span-6">
          <div>
            {/* Event Title Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-500">
                  Live QR Camera Station · Session{' '}
                  <span className="font-mono text-zinc-700">{session.id}</span>
                </p>

                {editingMeta ? (
                  <div className="mt-3 space-y-2.5">
                    <input
                      type="text"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      maxLength={80}
                      placeholder="Event title"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-serif text-xl font-semibold text-zinc-950 focus:border-zinc-900 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={subtitleDraft}
                      onChange={(e) => setSubtitleDraft(e.target.value)}
                      maxLength={120}
                      placeholder="Date or venue subtitle"
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveEventMeta}
                        disabled={isSavingMeta}
                        className="rounded-lg bg-zinc-950 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
                      >
                        {isSavingMeta ? 'Saving…' : 'Save Details'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTitleDraft(session.title);
                          setSubtitleDraft(session.subtitle);
                          setEditingMeta(false);
                        }}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-baseline gap-2.5">
                    <h1 className="font-serif text-3xl font-semibold tracking-tight text-zinc-950 [text-wrap:balance] sm:text-4xl">
                      {session.title}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setEditingMeta(true)}
                      aria-label="Edit event title"
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {!editingMeta && (
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                    Guests scan this QR code to open their phone camera. Every shot streams live
                    straight to your laptop and Google Drive.
                  </p>
                )}
              </div>
            </div>

            {/* Scannable QR Stage */}
            <div className="mt-6 flex flex-col items-center gap-6 rounded-xl border border-zinc-200/80 bg-[#F8F8F7] p-6 sm:flex-row sm:items-center">
              <div className="relative flex h-52 w-52 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white p-3">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${session.title}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <QrCode className="h-12 w-12 text-zinc-300" />
                )}
              </div>

              <div className="flex flex-1 flex-col justify-between space-y-4 text-center sm:text-left">
                <div className="space-y-1.5">
                  <h2 className="font-display text-base font-semibold text-zinc-950">
                    Ready for guests to scan
                  </h2>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Point any iPhone or Android camera at the code — no app install or login needed
                    for guests.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <button
                    type="button"
                    onClick={() => setKioskOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Projector QR Screen</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadQrPoster}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Print Poster</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Copied Link</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Utility Row: Test Camera + Optional Public URL override */}
          <div className="mt-6 space-y-3 border-t border-zinc-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onOpenHostCameraTest}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#BE123C] whitespace-nowrap"
              >
                <Camera className="h-4 w-4" />
                <span>Test Camera Here</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Add from Laptop</span>
                </button>
                <button
                  type="button"
                  onClick={onCreateNewSession}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Session</span>
                </button>
              </div>
            </div>

            {/* Capture URL row with optional base URL switch */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              {editingBaseUrl ? (
                <div className="flex w-full items-center gap-2">
                  <input
                    type="url"
                    value={baseUrlDraft}
                    onChange={(e) => setBaseUrlDraft(e.target.value)}
                    placeholder="https://your-public-app-url"
                    className="flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = baseUrlDraft.trim();
                      if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
                        onCaptureBaseUrlChange(trimmed);
                      }
                      setEditingBaseUrl(false);
                    }}
                    className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBaseUrlDraft(captureBaseUrl);
                      setEditingBaseUrl(false);
                    }}
                    className="rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="truncate font-mono text-[11px] text-zinc-500">
                    {captureUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingBaseUrl(true)}
                    className="shrink-0 text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950"
                  >
                    Change QR domain
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Live Destinations + Instant Arrival Wall */}
        <section className="flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-6 sm:p-8 lg:col-span-6">
          <div>
            {/* Destinations Bar: Google Drive & Laptop Save */}
            <div className="flex flex-col gap-4 border-b border-zinc-100 pb-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight text-zinc-950">
                    Automatic Destinations
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Choose where incoming guest photos are saved as soon as they click.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('drive')}
                  className="text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 whitespace-nowrap shrink-0"
                >
                  Sync settings
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Google Drive Destination */}
                <div className="flex flex-col justify-between rounded-xl border border-zinc-200/80 bg-[#F8F8F7] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-900">Google Drive</span>
                    <span className="text-[11px] text-zinc-500">
                      {driveUser ? (autoSyncDrive ? 'Auto-sync on' : 'Manual sync') : 'Not connected'}
                    </span>
                  </div>

                  {driveUser ? (
                    <div className="mt-3 space-y-2.5">
                      <p className="truncate text-xs text-zinc-600">
                        Folder:{' '}
                        <span className="font-medium text-zinc-900">
                          {driveFolder?.name || `SnapWall - ${session.title}`}
                        </span>
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleAutoSyncDrive(!autoSyncDrive)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                            autoSyncDrive
                              ? 'bg-zinc-950 text-white'
                              : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                          }`}
                        >
                          {autoSyncDrive ? 'Auto-Upload Active' : 'Enable Auto-Upload'}
                        </button>
                        {driveFolder?.webViewLink && (
                          <a
                            href={driveFolder.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950 whitespace-nowrap"
                          >
                            <span>Open</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <GoogleSignInButton
                        onClick={onGoogleSignIn}
                        disabled={isSigningIn}
                        label={isSigningIn ? 'Connecting…' : 'Sign in with Google'}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>

                {/* Laptop Local Folder Destination */}
                <div className="flex flex-col justify-between rounded-xl border border-zinc-200/80 bg-[#F8F8F7] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-900">This Laptop</span>
                    <span className="text-[11px] text-zinc-500">
                      {autoSaveLaptop ? 'Auto-save on' : 'On demand'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <p className="truncate text-xs text-zinc-600">
                      {laptopFolderName
                        ? `Saving into "${laptopFolderName}"`
                        : autoSaveLaptop
                        ? 'Auto-downloading to Downloads'
                        : 'Save every shot to your computer'}
                    </p>
                    <button
                      type="button"
                      onClick={onToggleAutoSaveLaptop}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                        autoSaveLaptop
                          ? 'bg-zinc-950 text-white hover:bg-zinc-800'
                          : 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
                      }`}
                    >
                      <FolderDown className="h-3.5 w-3.5" />
                      <span>
                        {autoSaveLaptop ? 'Stop Auto-Saving' : 'Enable Laptop Auto-Save'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Incoming Photos Preview */}
            <div className="mt-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-semibold tracking-tight text-zinc-950">
                  Live Photo Arrivals
                </h2>
                {photos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('gallery')}
                    className="text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 whitespace-nowrap"
                  >
                    View all {photos.length}
                  </button>
                )}
              </div>

              {recentPhotos.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {recentPhotos.map((photo, idx) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => onOpenLightbox(photo.id)}
                      className={`group relative overflow-hidden rounded-xl bg-zinc-100 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48] ${
                        idx === 0 && recentPhotos.length >= 3
                          ? 'col-span-2 row-span-2 aspect-[4/3]'
                          : 'aspect-square'
                      }`}
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || `Photo by ${photo.guestName}`}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pt-8 pb-2.5 text-white">
                        <p className="truncate text-xs font-medium">{photo.guestName}</p>
                        <p className="font-mono text-[10px] text-white/75 tabular-nums">
                          {formatPhotoTime(photo.createdAt)}
                          {photo.driveFileId ? ' · Drive' : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-[#F8F8F7] px-6 py-10 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700">
                    <Camera className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-zinc-900">
                    Waiting for the first shot
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-600">
                    Scan the QR code with your phone, or click{' '}
                    <span className="font-semibold text-zinc-900">Test Camera Here</span> to snap
                    right now and watch photos appear instantly.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={onOpenHostCameraTest}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Open Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload from Laptop</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onStartSlideshow}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Start Slideshow</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(slideshowUrl);
                    setCopiedSlideUrl(true);
                    window.setTimeout(() => setCopiedSlideUrl(false), 1800);
                  } catch {
                    // Ignore
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap"
              >
                {copiedSlideUrl ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Slideshow URL Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Slideshow URL</span>
                  </>
                )}
              </button>
            </div>

            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigateTab('collage')}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Open Collage Studio</span>
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Full-Width 4-Column Session Overview Strip Below Hero Split */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200/90 bg-white px-5 py-4">
          <p className="text-xs text-zinc-500">Photos Received</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-950 tabular-nums">
            {photos.length}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200/90 bg-white px-5 py-4">
          <p className="text-xs text-zinc-500">Live Stream</p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                socketStatus === 'connected'
                  ? 'bg-emerald-600'
                  : socketStatus === 'reconnecting'
                  ? 'bg-amber-500'
                  : 'bg-zinc-400'
              }`}
              aria-hidden="true"
            />
            <span className="font-mono text-sm font-semibold text-zinc-950 tabular-nums">
              {socketStatus === 'connected'
                ? `${connectedGuests} guest${connectedGuests === 1 ? '' : 's'} active`
                : socketStatus === 'reconnecting'
                ? 'Reconnecting…'
                : 'Offline'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/90 bg-white px-5 py-4">
          <p className="text-xs text-zinc-500">Saved to Google Drive</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-950 tabular-nums">
            {syncedCount}
            <span className="text-sm font-normal text-zinc-400"> / {photos.length}</span>
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200/90 bg-white px-5 py-4">
          <p className="text-xs text-zinc-500">Event Code</p>
          <p className="mt-1 font-mono text-xl font-semibold text-zinc-950 tabular-nums">
            {session.id}
          </p>
        </div>
      </div>

      {/* Projector / TV Full-Screen QR Kiosk Modal */}
      {kioskOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#050505] p-6 text-white sm:p-10"
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen QR code display"
        >
          <div className="flex w-full max-w-5xl items-center justify-between">
            <div>
              <p className="font-mono text-xs text-zinc-400">SESSION {session.id}</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">
                {session.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setKioskOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
              <span>Close Display</span>
            </button>
          </div>

          <div className="my-auto flex flex-col items-center text-center">
            <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Fullscreen QR code for ${session.title}`}
                  className="h-64 w-64 sm:h-80 sm:w-80 md:h-96 md:w-96"
                />
              ) : (
                <RefreshCw className="h-12 w-12 animate-spin text-zinc-400" />
              )}
            </div>
            <p className="mt-8 font-display text-2xl font-semibold tracking-tight sm:text-4xl">
              Scan to open camera &amp; join the photo wall
            </p>
            <p className="mt-2 font-mono text-sm text-zinc-400 tabular-nums">
              {photos.length} photo{photos.length === 1 ? '' : 's'} captured live
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <CloudUpload className="h-4 w-4" />
            <span>Photos stream directly to the host gallery</span>
          </div>
        </div>
      )}
    </div>
  );
}
