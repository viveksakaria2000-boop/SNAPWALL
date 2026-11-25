import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  Send,
  Timer,
} from 'lucide-react';
import type { CameraFilterId } from '../types';
import {
  connectSessionSocket,
  fetchSession,
  fileToOptimizedDataUrl,
  uploadSessionPhoto,
} from '../services/sessionApi';

interface GuestCameraViewProps {
  sessionId: string;
  isHostPreview?: boolean;
  onExitHostPreview?: () => void;
}

const FILTER_OPTIONS: Array<{ id: CameraFilterId; label: string; css: string }> = [
  { id: 'natural', label: 'Natural', css: 'none' },
  { id: 'warm-film', label: 'Warm Film', css: 'contrast(1.04) saturate(1.14) sepia(0.16)' },
  { id: 'editorial-bw', label: 'Monochrome', css: 'grayscale(1) contrast(1.16)' },
  { id: 'vivid', label: 'Vivid', css: 'contrast(1.08) saturate(1.28)' },
];

export function GuestCameraView({
  sessionId,
  isHostPreview = false,
  onExitHostPreview,
}: GuestCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeFileRef = useRef<HTMLInputElement | null>(null);

  const [eventTitle, setEventTitle] = useState('Live Photo Booth');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [activeFilter, setActiveFilter] = useState<CameraFilterId>('natural');
  const [timerSeconds, setTimerSeconds] = useState<0 | 3>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [instantSend, setInstantSend] = useState(true);
  const [flashActive, setFlashActive] = useState(false);

  const [captured, setCaptured] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);

  const [guestName, setGuestName] = useState('');
  const [caption, setCaption] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [showSentConfirm, setShowSentConfirm] = useState(false);

  // Load session title & register guest presence over WebSocket
  useEffect(() => {
    let active = true;
    fetchSession(sessionId, true)
      .then((s) => {
        if (!active) return;
        setEventTitle(s.title);
        setSessionError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setSessionError(err.message || 'This QR session could not be found.');
      });

    const disconnect = connectSessionSocket(sessionId, 'guest', (evt) => {
      if (evt.type === 'session:updated' && evt.session?.title) {
        setEventTitle(evt.session.title);
      }
    });

    return () => {
      active = false;
      disconnect();
    };
  }, [sessionId]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live browser camera is unavailable here. Use the camera button below to snap a photo.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError(
        'Camera permission was declined or no camera was detected. Tap "Open Phone Camera" below to capture or pick a photo.'
      );
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (sessionError || captured || showSentConfirm) {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
  }, [sessionError, captured, showSentConfirm, startCamera, stopCamera]);

  const sendPhotoPayload = useCallback(
    async (payload: { dataUrl: string; width: number; height: number }) => {
      setIsSending(true);
      setSendError(null);
      try {
        await uploadSessionPhoto(sessionId, {
          imageData: payload.dataUrl,
          width: payload.width,
          height: payload.height,
          guestName: guestName.trim() || 'Guest',
          caption: caption.trim(),
        });
        setSentCount((c) => c + 1);
        setCaptured(null);
        setCaption('');
        setShowSentConfirm(true);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
        setCaptured(payload);
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, guestName, caption]
  );

  const captureFrameNow = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    setFlashActive(true);
    window.setTimeout(() => setFlashActive(false), 300);

    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const filterCss = FILTER_OPTIONS.find((f) => f.id === activeFilter)?.css || 'none';
    ctx.filter = filterCss;

    if (facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const snapshot = { dataUrl, width: w, height: h };

    if (instantSend) {
      sendPhotoPayload(snapshot);
    } else {
      setCaptured(snapshot);
    }
  }, [activeFilter, facingMode, instantSend, sendPhotoPayload]);

  const handleShutterClick = () => {
    if (isSending || countdown !== null) return;
    if (timerSeconds === 0) {
      captureFrameNow();
      return;
    }
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      captureFrameNow();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, captureFrameNow]);

  const handleNativeFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const optimized = await fileToOptimizedDataUrl(file, 2048, 0.88);
      if (instantSend) {
        await sendPhotoPayload(optimized);
      } else {
        setCaptured(optimized);
      }
    } catch {
      setSendError('Could not process the selected photo. Please try another image.');
    }
  };

  const activeFilterCss = FILTER_OPTIONS.find((f) => f.id === activeFilter)?.css || 'none';

  if (sessionError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-center text-white">
        <div className="max-w-sm space-y-4">
          <p className="font-mono text-xs text-zinc-400">Session {sessionId}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Event camera link expired
          </h1>
          <p className="text-sm leading-relaxed text-zinc-400">{sessionError}</p>
          {isHostPreview && onExitHostPreview && (
            <button
              type="button"
              onClick={onExitHostPreview}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Host Studio</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#050505] text-white">
      {/* Hidden native camera input for 100% mobile fallback compatibility */}
      <input
        ref={nativeFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeFileChange}
        className="hidden"
      />

      {/* Compact Top Bar (<= 15% mobile height) */}
      <header className="z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-[#050505]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          {isHostPreview && onExitHostPreview && (
            <button
              type="button"
              onClick={onExitHostPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Studio</span>
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold tracking-tight text-white">
              {eventTitle}
            </h1>
            <p className="font-mono text-[11px] text-zinc-400 tabular-nums">
              {sessionId}
              {sentCount > 0 ? ` · ${sentCount} sent` : ' · Direct to Host'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setInstantSend((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            instantSend
              ? 'border-white/25 bg-white text-zinc-950'
              : 'border-white/15 bg-white/5 text-zinc-300'
          }`}
        >
          {instantSend ? 'Auto-Send: On' : 'Review First'}
        </button>
      </header>

      {/* Main Viewport: Sent Confirmation / Review / Live Camera */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {showSentConfirm ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-zinc-950">
              <Check className="h-8 w-8 stroke-[2.5]" />
            </div>
            <h2 className="mt-6 font-display text-2xl font-semibold tracking-tight">
              Photo delivered to host
            </h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-400">
              Your shot is now live on the event wall and ready for the collage.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowSentConfirm(false)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E11D48] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#BE123C]"
              >
                <Camera className="h-4 w-4" />
                <span>Take Another Photo</span>
              </button>
              {isHostPreview && onExitHostPreview && (
                <button
                  type="button"
                  onClick={onExitHostPreview}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white hover:bg-white/10"
                >
                  <span>View in Gallery</span>
                </button>
              )}
            </div>
          </div>
        ) : captured ? (
          <div className="flex flex-1 flex-col justify-between bg-[#0A0A0B] p-4 sm:p-6">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
              <img
                src={captured.dataUrl}
                alt="Captured preview"
                className="max-h-[60dvh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>

            <div className="mx-auto mt-4 w-full max-w-md space-y-3">
              {sendError && (
                <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                  {sendError}
                </p>
              )}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={60}
                  className="min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                />
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Short caption (optional)"
                  maxLength={140}
                  className="min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCaptured(null);
                    setSendError(null);
                  }}
                  disabled={isSending}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendPhotoPayload(captured)}
                  disabled={isSending}
                  className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[#E11D48] px-4 text-sm font-semibold text-white hover:bg-[#BE123C] disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>{isSending ? 'Sending…' : 'Send to Host'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Live Camera Viewfinder */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
              {!cameraError ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    filter: activeFilterCss,
                    transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                  }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="max-w-sm px-6 text-center">
                  <Camera className="mx-auto h-10 w-10 text-zinc-500" />
                  <p className="mt-4 text-sm leading-relaxed text-zinc-300">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => nativeFileRef.current?.click()}
                    className="mt-6 inline-flex min-h-[46px] items-center gap-2 rounded-lg bg-[#E11D48] px-5 py-3 text-sm font-semibold text-white hover:bg-[#BE123C]"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Open Phone Camera</span>
                  </button>
                </div>
              )}

              {/* Shutter flash overlay */}
              {flashActive && (
                <div className="pointer-events-none absolute inset-0 bg-white animate-shutter-flash" />
              )}

              {/* Countdown overlay */}
              {countdown !== null && countdown > 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                  <span className="font-display text-8xl font-bold text-white tabular-nums drop-shadow-lg">
                    {countdown}
                  </span>
                </div>
              )}

              {/* Sending overlay */}
              {isSending && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 backdrop-blur-xs">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  <p className="mt-3 text-sm font-medium text-white">Sending photo to host…</p>
                </div>
              )}

              {/* Subtle Guest Name input overlay at top of viewfinder */}
              <div className="absolute top-3 left-1/2 z-10 w-full max-w-xs -translate-x-1/2 px-4">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Add your name (optional)"
                  maxLength={60}
                  className="w-full rounded-lg border border-white/15 bg-black/45 px-3 py-2 text-center text-xs text-white placeholder:text-white/60 backdrop-blur-md focus:border-white/40 focus:outline-none"
                />
              </div>

              {/* Filter Selector Strip */}
              {!cameraError && (
                <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-white/10 bg-black/55 p-1 backdrop-blur-md">
                  {FILTER_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActiveFilter(f.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        activeFilter === f.id
                          ? 'bg-white text-zinc-950'
                          : 'text-white/75 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Shutter Dock */}
            <div className="border-t border-white/10 bg-[#050505] px-6 pt-4 pb-6">
              {sendError && (
                <p className="mb-3 text-center text-xs text-rose-300">{sendError}</p>
              )}
              <div className="mx-auto flex max-w-md items-center justify-between">
                {/* Native camera / gallery upload */}
                <button
                  type="button"
                  onClick={() => nativeFileRef.current?.click()}
                  className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-zinc-300 transition-colors hover:text-white"
                  aria-label="Choose or snap with phone camera"
                >
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-[11px]">Camera / File</span>
                </button>

                {/* Primary Shutter Trigger */}
                <button
                  type="button"
                  onClick={cameraError ? () => nativeFileRef.current?.click() : handleShutterClick}
                  disabled={isSending || countdown !== null}
                  aria-label="Take photo"
                  className="group relative flex h-[74px] w-[74px] items-center justify-center rounded-full border-[3px] border-white p-1 transition-transform active:scale-95 disabled:opacity-50"
                >
                  <span className="h-full w-full rounded-full bg-[#E11D48] transition-colors group-hover:bg-[#F43F5E]" />
                </button>

                {/* Flip camera + Timer controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTimerSeconds((t) => (t === 0 ? 3 : 0))}
                    className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg px-2 transition-colors ${
                      timerSeconds === 3 ? 'text-[#FB7185]' : 'text-zinc-300 hover:text-white'
                    }`}
                    aria-label="Toggle 3 second timer"
                  >
                    <Timer className="h-5 w-5" />
                    <span className="font-mono text-[11px] tabular-nums">
                      {timerSeconds === 3 ? '3s' : 'Off'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
                    className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-zinc-300 transition-colors hover:text-white"
                    aria-label="Switch front and back camera"
                  >
                    <RefreshCw className="h-5 w-5" />
                    <span className="text-[11px]">Flip</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
