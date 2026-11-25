import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { CapturedPhoto, EventSession, SlideshowOverlayConfig } from '../types';
import {
  connectSessionSocket,
  fetchSession,
  formatPhotoTime,
  generateQrDataUrl,
} from '../services/sessionApi';

const DEFAULT_SLIDESHOW_CONFIG: SlideshowOverlayConfig = {
  eventDate: '',
  venue: '',
  welcomeMessage: 'Scan the QR code to share your moments live on screen',
  showDate: true,
  showVenue: false,
  showWelcomeMessage: false,
  showGuestCredit: true,
  showCornerQr: true,
  intervalSeconds: 5,
};

interface SlideshowViewProps {
  mode: 'standalone' | 'embedded';
  sessionId: string;
  // Provided in embedded mode (in standalone mode, fetched live from server)
  session?: EventSession;
  photos?: CapturedPhoto[];
  captureBaseUrl?: string;
  onUpdateOverlay?: (
    title: string,
    overlay: SlideshowOverlayConfig
  ) => Promise<void>;
  onClose?: () => void;
}

export function SlideshowView({
  mode,
  sessionId,
  session: propSession,
  photos: propPhotos,
  captureBaseUrl,
  onUpdateOverlay,
  onClose,
}: SlideshowViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Standalone state
  const [loadedTitle, setLoadedTitle] = useState(propSession?.title || 'Live Event');
  const [loadedOverlay, setLoadedOverlay] = useState<SlideshowOverlayConfig>(
    propSession?.slideshow || {
      ...DEFAULT_SLIDESHOW_CONFIG,
      eventDate: propSession?.subtitle || '',
    }
  );
  const [loadedPhotos, setLoadedPhotos] = useState<CapturedPhoto[]>(propPhotos || []);
  const [loading, setLoading] = useState(mode === 'standalone');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>(
    'disconnected'
  );

  // Playback state
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progressKey, setProgressKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Overlay customizer drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(loadedTitle);
  const [draftOverlay, setDraftOverlay] = useState<SlideshowOverlayConfig>(loadedOverlay);
  const [isSavingOverlay, setIsSavingOverlay] = useState(false);

  // Corner QR image
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Keep embedded props synced
  useEffect(() => {
    if (mode !== 'embedded') return;
    if (propSession) {
      setLoadedTitle(propSession.title);
      const nextOverlay = propSession.slideshow || {
        ...DEFAULT_SLIDESHOW_CONFIG,
        eventDate: propSession.subtitle || '',
      };
      setLoadedOverlay(nextOverlay);
      if (!drawerOpen) {
        setDraftTitle(propSession.title);
        setDraftOverlay(nextOverlay);
      }
    }
  }, [mode, propSession, drawerOpen]);

  useEffect(() => {
    if (mode !== 'embedded' || !propPhotos) return;
    setLoadedPhotos(propPhotos);
  }, [mode, propPhotos]);

  // Standalone mode: initial fetch + live WebSocket + fallback polling when disconnected
  useEffect(() => {
    if (mode !== 'standalone') return;
    let active = true;

    const loadFull = async () => {
      try {
        const fresh = await fetchSession(sessionId, false);
        if (!active) return;
        setLoadedTitle(fresh.title);
        const cfg = fresh.slideshow || {
          ...DEFAULT_SLIDESHOW_CONFIG,
          eventDate: fresh.subtitle || '',
        };
        setLoadedOverlay(cfg);
        setDraftTitle(fresh.title);
        setDraftOverlay(cfg);
        setLoadedPhotos(fresh.photos);
        setLoadError(null);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Event slideshow not found.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadFull();

    const disconnect = connectSessionSocket(
      sessionId,
      'slideshow',
      (evt) => {
        if (!active) return;
        if (evt.type === 'connected') {
          loadFull();
        } else if (evt.type === 'session:updated' && evt.session) {
          setLoadedTitle(evt.session.title);
          if (evt.session.slideshow) {
            setLoadedOverlay(evt.session.slideshow);
          }
        } else if (evt.type === 'photo:created' && evt.photo) {
          const incoming = evt.photo;
          setLoadedPhotos((prev) =>
            prev.some((p) => p.id === incoming.id) ? prev : [incoming, ...prev]
          );
        } else if (evt.type === 'photo:updated' && evt.photo) {
          const updated = evt.photo;
          setLoadedPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else if (evt.type === 'photo:deleted' && evt.photoId) {
          setLoadedPhotos((prev) => prev.filter((p) => p.id !== evt.photoId));
        }
      },
      (status) => {
        if (active) setSocketStatus(status);
      }
    );

    return () => {
      active = false;
      disconnect();
    };
  }, [mode, sessionId]);

  // Quiet polling fallback in standalone mode only when WebSocket is not connected
  useEffect(() => {
    if (mode !== 'standalone' || socketStatus === 'connected') return;
    const timer = window.setInterval(() => {
      fetchSession(sessionId, false)
        .then((fresh) => {
          setLoadedTitle(fresh.title);
          if (fresh.slideshow) setLoadedOverlay(fresh.slideshow);
          setLoadedPhotos(fresh.photos);
        })
        .catch(() => {});
    }, 6000);
    return () => window.clearInterval(timer);
  }, [mode, sessionId, socketStatus]);

  const effectiveBaseUrl = (captureBaseUrl || window.location.origin).replace(/\/+$/, '');
  const captureUrl = `${effectiveBaseUrl}/?capture=${encodeURIComponent(sessionId)}`;
  const slideshowShareUrl = `${effectiveBaseUrl}/?slideshow=${encodeURIComponent(sessionId)}`;

  // Generate QR code for corner overlay & waiting state
  useEffect(() => {
    let active = true;
    generateQrDataUrl(captureUrl, 360)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [captureUrl]);

  // Live preview of overlay while editing in embedded drawer
  const activeTitle = drawerOpen ? draftTitle : loadedTitle;
  const activeOverlay = drawerOpen ? draftOverlay : loadedOverlay;
  const intervalMs = Math.max(2, activeOverlay.intervalSeconds || 5) * 1000;

  // Clamp activeIndex if photos shrink
  useEffect(() => {
    if (loadedPhotos.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= loadedPhotos.length) {
      setActiveIndex(0);
    }
  }, [loadedPhotos.length, activeIndex]);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (loadedPhotos.length > 0 ? (prev + 1) % loadedPhotos.length : 0));
    setProgressKey((k) => k + 1);
  }, [loadedPhotos.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) =>
      loadedPhotos.length > 0 ? (prev - 1 + loadedPhotos.length) % loadedPhotos.length : 0
    );
    setProgressKey((k) => k + 1);
  }, [loadedPhotos.length]);

  // Auto-advance timer (defaults to 5 seconds)
  useEffect(() => {
    if (!isPlaying || loadedPhotos.length <= 1 || drawerOpen) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % loadedPhotos.length);
      setProgressKey((k) => k + 1);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, loadedPhotos.length, intervalMs, drawerOpen]);

  // Fullscreen API tracking (graceful fallback inside restricted iframes)
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await (containerRef.current || document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen API can be blocked inside sandboxed iframes; overlay already fills viewport
    }
  }, []);

  const handleExit = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose?.();
  }, [onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (drawerOpen) {
        if (e.key === 'Escape') setDrawerOpen(false);
        return;
      }
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && mode === 'embedded') {
        handleExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, goNext, goPrev, toggleFullscreen, handleExit, mode]);

  const handleCopySlideshowUrl = async () => {
    try {
      await navigator.clipboard.writeText(slideshowShareUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const handleSaveOverlay = async () => {
    const cleanedTitle = draftTitle.trim() || 'Evening Celebration';
    setLoadedTitle(cleanedTitle);
    setLoadedOverlay(draftOverlay);
    if (onUpdateOverlay) {
      setIsSavingOverlay(true);
      try {
        await onUpdateOverlay(cleanedTitle, draftOverlay);
      } finally {
        setIsSavingOverlay(false);
      }
    }
    setDrawerOpen(false);
  };

  const currentPhoto = loadedPhotos[activeIndex] || null;

  const topMetaItems = useMemo(() => {
    const parts: string[] = [];
    if (activeOverlay.showDate && activeOverlay.eventDate.trim()) {
      parts.push(activeOverlay.eventDate.trim());
    }
    if (activeOverlay.showVenue && activeOverlay.venue.trim()) {
      parts.push(activeOverlay.venue.trim());
    }
    return parts;
  }, [activeOverlay]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] text-white">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="mt-4 text-sm text-zinc-400">Connecting to live slideshow…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-center text-white">
        <p className="font-mono text-xs text-zinc-400">Session {sessionId}</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Slideshow unavailable</h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">{loadError}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role={mode === 'embedded' ? 'dialog' : undefined}
      aria-modal={mode === 'embedded' ? true : undefined}
      aria-label={`${activeTitle} live photo slideshow`}
      className={`${
        mode === 'embedded' ? 'fixed inset-0 z-50' : 'relative min-h-screen'
      } flex h-screen w-screen flex-col overflow-hidden bg-[#050505] text-white select-none`}
    >
      {/* Subtle ambient blurred backdrop from the current photo */}
      {currentPhoto && (
        <div
          key={`bg-${currentPhoto.id}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden opacity-30 transition-opacity duration-700"
        >
          <img
            src={currentPhoto.url}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full scale-110 object-cover blur-3xl"
          />
          <div className="absolute inset-0 bg-black/55" />
        </div>
      )}

      {/* TOP OVERLAY HEADER: Event Name + Selected Event Metadata */}
      <header className="relative z-20 flex items-start justify-between gap-6 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-6 pt-6 pb-12 sm:px-10 sm:pt-8">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-white drop-shadow-sm [text-wrap:balance] sm:text-4xl lg:text-5xl">
            {activeTitle}
          </h1>

          {topMetaItems.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-white/80 sm:text-sm">
              {topMetaItems.map((item, idx) => (
                <span key={`${item}-${idx}`} className="inline-flex items-center gap-2.5">
                  {idx > 0 && (
                    <span className="text-white/45" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <span>{item}</span>
                </span>
              ))}
            </div>
          )}

          {activeOverlay.showWelcomeMessage && activeOverlay.welcomeMessage.trim() && (
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/75 sm:text-sm">
              {activeOverlay.welcomeMessage.trim()}
            </p>
          )}
        </div>

        {/* Top-Right Compact Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopySlideshowUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/45 px-3 py-2 text-xs font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-white/15 whitespace-nowrap"
          >
            {copiedUrl ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>URL Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Slideshow URL</span>
              </>
            )}
          </button>

          {mode === 'embedded' && (
            <button
              type="button"
              onClick={() => {
                setDraftTitle(loadedTitle);
                setDraftOverlay(loadedOverlay);
                setDrawerOpen((v) => !v);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium backdrop-blur-md transition-colors whitespace-nowrap ${
                drawerOpen
                  ? 'border-white bg-white text-zinc-950'
                  : 'border-white/15 bg-black/45 text-white/90 hover:bg-white/15'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Customize Overlay</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit browser fullscreen' : 'Enter browser fullscreen'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white/90 backdrop-blur-md transition-colors hover:bg-white/15"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {mode === 'embedded' && (
            <button
              type="button"
              onClick={handleExit}
              aria-label="Exit slideshow"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* CENTER PHOTOGRAPH STAGE */}
      <main className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-4 sm:px-12">
        {currentPhoto ? (
          <>
            {loadedPhotos.length > 1 && (
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous photo"
                className="absolute left-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/75 hover:text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <div className="flex h-full max-h-[72vh] w-full items-center justify-center">
              <img
                key={currentPhoto.id}
                src={currentPhoto.url}
                alt={currentPhoto.caption || `Photo captured by ${currentPhoto.guestName}`}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl transition-opacity duration-500"
              />
            </div>

            {loadedPhotos.length > 1 && (
              <button
                type="button"
                onClick={goNext}
                aria-label="Next photo"
                className="absolute right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/75 hover:text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </>
        ) : (
          /* Waiting state before the first photo arrives */
          <div className="flex flex-col items-center text-center">
            {qrDataUrl && (
              <div className="rounded-2xl bg-white p-5 shadow-2xl">
                <img
                  src={qrDataUrl}
                  alt={`QR code to join ${activeTitle}`}
                  className="h-56 w-56 sm:h-64 sm:w-64"
                />
              </div>
            )}
            <h2 className="mt-7 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Scan to add the first photo
            </h2>
            <p className="mt-2 max-w-md text-sm text-zinc-400">
              Photos captured by guests will appear here automatically and rotate every{' '}
              {activeOverlay.intervalSeconds || 5} seconds.
            </p>
          </div>
        )}
      </main>

      {/* BOTTOM OVERLAY BAR: Guest Credit + Playback Controls + Corner QR */}
      <footer className="relative z-20 flex items-end justify-between gap-6 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-6 pt-10 pb-6 sm:px-10 sm:pb-7">
        {/* Bottom-left: Guest credit & slide counter */}
        <div className="min-w-0 flex-1">
          {currentPhoto && activeOverlay.showGuestCredit ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                <span className="truncate">{currentPhoto.guestName}</span>
                <span className="text-white/40" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-xs text-white/70 tabular-nums">
                  {formatPhotoTime(currentPhoto.createdAt)}
                </span>
              </div>
              {currentPhoto.caption && (
                <p className="mt-1 truncate text-xs text-white/75 sm:text-sm">
                  {currentPhoto.caption}
                </p>
              )}
            </div>
          ) : (
            <div />
          )}

          {/* Playback controls */}
          <div className="mt-3 flex items-center gap-3">
            {loadedPhotos.length > 1 && (
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-white/15 whitespace-nowrap"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    <span>Resume</span>
                  </>
                )}
              </button>
            )}

            <span className="font-mono text-xs text-white/65 tabular-nums">
              {loadedPhotos.length > 0
                ? `${activeIndex + 1} / ${loadedPhotos.length} · ${activeOverlay.intervalSeconds || 5}s per photo`
                : `Session ${sessionId}`}
            </span>
          </div>
        </div>

        {/* Bottom-right: Compact Scan-to-Join Corner QR */}
        {activeOverlay.showCornerQr && qrDataUrl && loadedPhotos.length > 0 && (
          <div className="hidden items-center gap-3 rounded-xl border border-white/15 bg-black/65 p-2.5 backdrop-blur-md sm:flex">
            <div className="rounded-lg bg-white p-1.5">
              <img src={qrDataUrl} alt="Scan to upload photo" className="h-16 w-16" />
            </div>
            <div className="pr-2 text-left">
              <p className="font-display text-xs font-semibold text-white">Join the wall</p>
              <p className="mt-0.5 max-w-[120px] text-[11px] leading-snug text-white/70">
                Scan to open camera &amp; appear live
              </p>
            </div>
          </div>
        )}
      </footer>

      {/* Hairline 5-Second Progress Bar along bottom edge */}
      {isPlaying && loadedPhotos.length > 1 && !drawerOpen && (
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-30 h-[3px] bg-white/10">
          <div
            key={`${progressKey}-${intervalMs}`}
            style={{
              animation: `slideshowProgress ${intervalMs}ms linear forwards`,
            }}
            className="h-full bg-[#E11D48]"
          />
        </div>
      )}

      {/* CUSTOMIZE OVERLAY DRAWER (Host Full-Screen Controls) */}
      {drawerOpen && mode === 'embedded' && (
        <aside
          aria-label="Customize slideshow overlay"
          className="fixed top-0 right-0 bottom-0 z-40 flex w-full max-w-sm flex-col border-l border-white/15 bg-[#121214]/95 text-white shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Slideshow Overlay
              </h2>
              <p className="text-xs text-zinc-400">
                Choose what appears on screen &amp; on the shared URL
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close overlay editor"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {/* Event Name */}
            <div>
              <label className="block text-xs font-medium text-zinc-300">Event Name (Top)</label>
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={80}
                placeholder="Evening Celebration"
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
              />
            </div>

            {/* Event Date */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-zinc-200">
                <span>Show Event Date</span>
                <input
                  type="checkbox"
                  checked={draftOverlay.showDate}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, showDate: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>
              {draftOverlay.showDate && (
                <input
                  type="text"
                  value={draftOverlay.eventDate}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, eventDate: e.target.value }))
                  }
                  maxLength={80}
                  placeholder="e.g., November 24, 2026"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                />
              )}
            </div>

            {/* Venue / Location */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-zinc-200">
                <span>Show Venue / Location</span>
                <input
                  type="checkbox"
                  checked={draftOverlay.showVenue}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, showVenue: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>
              {draftOverlay.showVenue && (
                <input
                  type="text"
                  value={draftOverlay.venue}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, venue: e.target.value }))
                  }
                  maxLength={100}
                  placeholder="e.g., The Grand Courtyard, Mumbai"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                />
              )}
            </div>

            {/* Custom Welcome Message */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-zinc-200">
                <span>Show Welcome Message</span>
                <input
                  type="checkbox"
                  checked={draftOverlay.showWelcomeMessage}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, showWelcomeMessage: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>
              {draftOverlay.showWelcomeMessage && (
                <textarea
                  rows={2}
                  value={draftOverlay.welcomeMessage}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, welcomeMessage: e.target.value }))
                  }
                  maxLength={160}
                  placeholder="Welcome! Scan the QR code to share your photos live."
                  className="w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                />
              )}
            </div>

            {/* Additional Display Toggles */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-zinc-200">
                <span>Show Guest Name &amp; Caption</span>
                <input
                  type="checkbox"
                  checked={draftOverlay.showGuestCredit}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, showGuestCredit: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-zinc-200">
                <span>Show Corner QR Code</span>
                <input
                  type="checkbox"
                  checked={draftOverlay.showCornerQr}
                  onChange={(e) =>
                    setDraftOverlay((o) => ({ ...o, showCornerQr: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#E11D48]"
                />
              </label>
            </div>

            {/* Slide Interval Selector */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-medium text-zinc-300">Rotation Speed</p>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[3, 5, 8, 12].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDraftOverlay((o) => ({ ...o, intervalSeconds: sec }))}
                    className={`rounded-lg border py-1.5 font-mono text-xs font-medium transition-colors tabular-nums ${
                      draftOverlay.intervalSeconds === sec
                        ? 'border-white bg-white text-zinc-950'
                        : 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Separate Slideshow Web URL Box */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-medium text-zinc-300">Dedicated Slideshow URL</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                Open this URL on a TV, projector, or second screen for a live auto-updating
                slideshow.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 font-mono text-[11px] text-zinc-300">
                  {slideshowShareUrl}
                </code>
                <button
                  type="button"
                  onClick={handleCopySlideshowUrl}
                  className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
                >
                  {copiedUrl ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOverlay}
              disabled={isSavingOverlay}
              className="rounded-lg bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white hover:bg-[#BE123C] disabled:opacity-50"
            >
              {isSavingOverlay ? 'Saving…' : 'Apply & Sync'}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
