import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { X } from 'lucide-react';
import type {
  CapturedPhoto,
  DriveFolderInfo,
  EventSession,
  SlideshowOverlayConfig,
  ToastMessage,
  WorkspaceTab,
} from './types';
import {
  connectSessionSocket,
  createSession,
  deleteSessionPhoto,
  downloadPhotosZip,
  downloadSinglePhoto,
  fetchSession,
  fileToOptimizedDataUrl,
  patchSessionPhoto,
  updateSessionMeta,
  uploadSessionPhoto,
} from './services/sessionApi';
import {
  deleteDriveFile,
  ensureEventFolder,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
  uploadBlobToDrive,
} from './services/googleDrive';
import { GuestCameraView } from './components/GuestCameraView';
import { QrStationView } from './components/QrStationView';
import { LiveGalleryView } from './components/LiveGalleryView';
import { CollageStudioView } from './components/CollageStudioView';
import { DriveSyncView } from './components/DriveSyncView';
import { LightboxModal } from './components/LightboxModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SlideshowView } from './components/SlideshowView';

interface DirectoryHandleLike {
  name: string;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
  }
}

export default function App() {
  const [routeMode] = useState<{
    captureSessionId: string | null;
    slideshowSessionId: string | null;
  }>(() => {
    const params = new URLSearchParams(window.location.search);
    const capture = params.get('capture');
    const slideshow = params.get('slideshow');
    return {
      captureSessionId: capture ? capture.trim().toUpperCase() : null,
      slideshowSessionId: slideshow ? slideshow.trim().toUpperCase() : null,
    };
  });

  // If opened from a scanned QR code (?capture=SW-XXXXXX), launch straight into Guest Mobile Camera
  if (routeMode.captureSessionId) {
    return <GuestCameraView sessionId={routeMode.captureSessionId} />;
  }

  // If opened via dedicated Slideshow Web URL (?slideshow=SW-XXXXXX), launch live 5-second Slideshow
  if (routeMode.slideshowSessionId) {
    return <SlideshowView mode="standalone" sessionId={routeMode.slideshowSessionId} />;
  }

  return <HostStudioApp />;
}

function HostStudioApp() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('qr');
  const [hostCameraPreview, setHostCameraPreview] = useState(false);
  const [slideshowOpen, setSlideshowOpen] = useState(false);

  const [session, setSession] = useState<EventSession | null>(null);
  const [hostToken, setHostToken] = useState<string>('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [selectedCollageIds, setSelectedCollageIds] = useState<string[]>([]);
  const [loadingSession, setLoadingSession] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [socketStatus, setSocketStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>(
    'disconnected'
  );
  const [connectedGuests, setConnectedGuests] = useState(0);
  const [captureBaseUrl, setCaptureBaseUrl] = useState(() => window.location.origin);

  // Google Drive state (token kept strictly in memory inside googleDrive.ts)
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveFolder, setDriveFolder] = useState<DriveFolderInfo | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [autoSyncDrive, setAutoSyncDrive] = useState(true);
  const [syncingPhotoIds, setSyncingPhotoIds] = useState<Set<string>>(new Set());
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);

  // Laptop local saving state
  const [autoSaveLaptop, setAutoSaveLaptop] = useState(false);
  const [laptopDirHandle, setLaptopDirHandle] = useState<DirectoryHandleLike | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const supportsFolderPicker = typeof window.showDirectoryPicker === 'function';

  // Lightbox & Delete confirmation dialog
  const [lightboxPhotoId, setLightboxPhotoId] = useState<string | null>(null);
  const [pendingDeletePhoto, setPendingDeletePhoto] = useState<CapturedPhoto | null>(null);
  const [deleteAlsoFromDrive, setDeleteAlsoFromDrive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast feedback
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Refs for fresh closures inside WebSocket listener
  const autoSyncDriveRef = useRef(autoSyncDrive);
  autoSyncDriveRef.current = autoSyncDrive;
  const autoSaveLaptopRef = useRef(autoSaveLaptop);
  autoSaveLaptopRef.current = autoSaveLaptop;
  const laptopDirHandleRef = useRef(laptopDirHandle);
  laptopDirHandleRef.current = laptopDirHandle;
  const driveFolderRef = useRef(driveFolder);
  driveFolderRef.current = driveFolder;
  const hostTokenRef = useRef(hostToken);
  hostTokenRef.current = hostToken;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'neutral') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  // Initialize Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setDriveUser(user);
      },
      () => {
        setDriveUser(null);
        setDriveFolder(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Bootstrap new event session on load
  const startFreshSession = useCallback(async () => {
    setLoadingSession(true);
    setInitError(null);
    try {
      const created = await createSession('Evening Celebration');
      setSession(created);
      setHostToken(created.hostToken || '');
      setPhotos(created.photos || []);
      setSelectedCollageIds([]);
      setDriveFolder(null);
    } catch (err) {
      setInitError(err instanceof Error ? err.message : 'Unable to start event session.');
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    startFreshSession();
  }, [startFreshSession]);

  // Helper: write a single photo to the chosen laptop folder or trigger browser download
  const savePhotoToLaptopAuto = useCallback(
    async (photo: CapturedPhoto) => {
      try {
        const res = await fetch(photo.url);
        if (!res.ok) return;
        const blob = await res.blob();
        const safeGuest = photo.guestName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20) || 'guest';
        const ext = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const filename = `snapwall_${safeGuest}_${photo.id.slice(0, 6)}.${ext}`;

        const dir = laptopDirHandleRef.current;
        if (dir) {
          const handle = await dir.getFileHandle(filename, { create: true });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          await downloadSinglePhoto(photo);
        }
      } catch (err) {
        console.error('Auto-save to laptop failed:', err);
      }
    },
    []
  );

  // Helper: ensure Drive folder exists for current session
  const getOrCreateDriveFolder = useCallback(async (): Promise<DriveFolderInfo | null> => {
    if (!getAccessToken()) return null;
    if (driveFolderRef.current) return driveFolderRef.current;
    const title = sessionRef.current?.title || 'Event Photos';
    const folder = await ensureEventFolder(`SnapWall - ${title}`);
    setDriveFolder(folder);
    driveFolderRef.current = folder;
    return folder;
  }, []);

  // Helper: upload a captured photo to Google Drive
  const syncPhotoToDrive = useCallback(
    async (photo: CapturedPhoto, silent = false) => {
      if (!getAccessToken()) {
        if (!silent) notify('Sign in with Google Drive first to upload photos.', 'neutral');
        return;
      }
      if (photo.driveFileId) return;

      setSyncingPhotoIds((prev) => new Set(prev).add(photo.id));
      try {
        const folder = await getOrCreateDriveFolder();
        const res = await fetch(photo.url);
        if (!res.ok) throw new Error('Could not read photo data.');
        const blob = await res.blob();
        const safeGuest = photo.guestName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'guest';
        const ext = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const filename = `${safeGuest}_${photo.id.slice(0, 6)}.${ext}`;

        const uploaded = await uploadBlobToDrive(blob, filename, folder?.id);

        const activeSession = sessionRef.current;
        if (activeSession && hostTokenRef.current) {
          const updated = await patchSessionPhoto(activeSession.id, photo.id, hostTokenRef.current, {
            driveFileId: uploaded.id,
            driveWebViewLink: uploaded.webViewLink,
          });
          setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else {
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === photo.id
                ? { ...p, driveFileId: uploaded.id, driveWebViewLink: uploaded.webViewLink }
                : p
            )
          );
        }

        if (!silent) {
          notify(`Saved "${photo.guestName}" photo to Google Drive.`, 'success');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google Drive upload failed.';
        if (msg.toLowerCase().includes('expired')) {
          setDriveUser(null);
          setDriveFolder(null);
        }
        if (!silent) notify(msg, 'error');
      } finally {
        setSyncingPhotoIds((prev) => {
          const next = new Set(prev);
          next.delete(photo.id);
          return next;
        });
      }
    },
    [getOrCreateDriveFolder, notify]
  );

  // Live WebSocket connection for the active session
  useEffect(() => {
    if (!session?.id) return;
    const sessionId = session.id;

    const disconnect = connectSessionSocket(
      sessionId,
      'host',
      (evt) => {
        if (evt.type === 'connected') {
          // Reconcile state on connect/reconnect
          fetchSession(sessionId)
            .then((fresh) => {
              setPhotos(fresh.photos);
            })
            .catch(() => {});
        } else if (evt.type === 'presence:update') {
          setConnectedGuests(evt.guestCount ?? 0);
        } else if (evt.type === 'session:updated' && evt.session) {
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  title: evt.session!.title,
                  subtitle: evt.session!.subtitle,
                  slideshow: evt.session!.slideshow || prev.slideshow,
                }
              : prev
          );
        } else if (evt.type === 'photo:created' && evt.photo) {
          const incoming = evt.photo;
          let wasAdded = false;
          setPhotos((prev) => {
            if (prev.some((p) => p.id === incoming.id)) return prev;
            wasAdded = true;
            return [incoming, ...prev];
          });
          setSelectedCollageIds((prev) => {
            if (prev.includes(incoming.id) || prev.length >= 12) return prev;
            return [...prev, incoming.id];
          });

          // Trigger live automatic destinations only on genuinely new arrival
          window.setTimeout(() => {
            if (!wasAdded) return;
            notify(`New photo arrived from ${incoming.guestName}.`, 'success');
            if (autoSyncDriveRef.current && getAccessToken()) {
              syncPhotoToDrive(incoming, true);
            }
            if (autoSaveLaptopRef.current) {
              savePhotoToLaptopAuto(incoming);
            }
          }, 0);
        } else if (evt.type === 'photo:updated' && evt.photo) {
          const updated = evt.photo;
          setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else if (evt.type === 'photo:deleted' && evt.photoId) {
          const deletedId = evt.photoId;
          setPhotos((prev) => prev.filter((p) => p.id !== deletedId));
          setSelectedCollageIds((prev) => prev.filter((id) => id !== deletedId));
          setLightboxPhotoId((prev) => (prev === deletedId ? null : prev));
        }
      },
      (status) => setSocketStatus(status)
    );

    return () => disconnect();
  }, [session?.id, notify, syncPhotoToDrive, savePhotoToLaptopAuto]);

  // Handlers
  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const result = await googleSignIn();
      setDriveUser(result.user);
      const title = session?.title || 'Event Photos';
      const folder = await ensureEventFolder(`SnapWall - ${title}`);
      setDriveFolder(folder);
      driveFolderRef.current = folder;
      notify(`Connected Google Drive folder "${folder.name}".`, 'success');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.',
        'error'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logoutGoogle();
    setDriveUser(null);
    setDriveFolder(null);
    driveFolderRef.current = null;
    notify('Disconnected from Google Drive.', 'neutral');
  };

  const handleSyncAllPendingToDrive = async () => {
    if (!getAccessToken()) {
      await handleGoogleSignIn();
      return;
    }
    const pending = photos.filter((p) => !p.driveFileId);
    if (pending.length === 0) return;

    setIsBulkSyncing(true);
    try {
      await getOrCreateDriveFolder();
      for (const p of pending) {
        await syncPhotoToDrive(p, true);
      }
      notify(`Uploaded ${pending.length} photo${pending.length === 1 ? '' : 's'} to Google Drive.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Bulk Drive sync failed.', 'error');
    } finally {
      setIsBulkSyncing(false);
    }
  };

  const handleSaveCollageToDrive = async (blob: Blob, filename: string): Promise<string | null> => {
    if (!getAccessToken()) {
      notify('Please sign in with Google Drive first.', 'neutral');
      return null;
    }
    try {
      const folder = await getOrCreateDriveFolder();
      const uploaded = await uploadBlobToDrive(blob, filename, folder?.id);
      notify(`Saved collage "${filename}" to Google Drive.`, 'success');
      return uploaded.webViewLink;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload collage to Google Drive.';
      if (msg.toLowerCase().includes('expired')) {
        setDriveUser(null);
        setDriveFolder(null);
      }
      notify(msg, 'error');
      return null;
    }
  };

  const handleToggleAutoSaveLaptop = async () => {
    if (autoSaveLaptop) {
      setAutoSaveLaptop(false);
      setLaptopDirHandle(null);
      notify('Laptop auto-save turned off.', 'neutral');
      return;
    }

    if (supportsFolderPicker && window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        setLaptopDirHandle(handle);
        setAutoSaveLaptop(true);
        notify(`Auto-saving incoming photos directly into "${handle.name}".`, 'success');
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return;
        }
        // Fall through to browser auto-download mode if folder picker is restricted in iframe
      }
    }

    setLaptopDirHandle(null);
    setAutoSaveLaptop(true);
    notify('Incoming guest photos will auto-download to your laptop Downloads folder.', 'success');
  };

  const handleUpdateEventMeta = async (title: string, subtitle: string) => {
    if (!session || !hostToken) return;
    try {
      const updated = await updateSessionMeta(session.id, hostToken, {
        title,
        subtitle,
        slideshow: {
          ...session.slideshow,
          eventDate: subtitle || session.slideshow.eventDate,
        },
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              title: updated.title,
              subtitle: updated.subtitle,
              slideshow: updated.slideshow,
            }
          : prev
      );
      setDriveFolder(null);
      driveFolderRef.current = null;
      notify('Updated event details.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update event details.', 'error');
    }
  };

  const handleUpdateSlideshowOverlay = async (
    title: string,
    overlay: SlideshowOverlayConfig
  ) => {
    if (!session || !hostToken) return;
    try {
      const updated = await updateSessionMeta(session.id, hostToken, {
        title,
        slideshow: overlay,
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              title: updated.title,
              slideshow: updated.slideshow,
            }
          : prev
      );
      notify('Slideshow overlay updated & synced.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save slideshow overlay.', 'error');
    }
  };

  const handleUploadFromLaptop = async (fileList: FileList) => {
    if (!session) return;
    const files = Array.from(fileList).slice(0, 20);
    let uploadedCount = 0;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const optimized = await fileToOptimizedDataUrl(file, 2048, 0.88);
        const created = await uploadSessionPhoto(session.id, {
          imageData: optimized.dataUrl,
          width: optimized.width,
          height: optimized.height,
          guestName: 'Host Upload',
          caption: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
        });
        setPhotos((prev) => (prev.some((p) => p.id === created.id) ? prev : [created, ...prev]));
        setSelectedCollageIds((prev) =>
          prev.includes(created.id) || prev.length >= 12 ? prev : [...prev, created.id]
        );
        uploadedCount++;
        if (autoSyncDrive && getAccessToken()) {
          syncPhotoToDrive(created, true);
        }
      } catch {
        // Continue uploading remaining files
      }
    }

    if (uploadedCount > 0) {
      notify(`Added ${uploadedCount} photo${uploadedCount === 1 ? '' : 's'} from your laptop.`, 'success');
    } else {
      notify('Could not upload selected image files.', 'error');
    }
  };

  const handleToggleFavorite = async (photo: CapturedPhoto) => {
    if (!session || !hostToken) return;
    const nextFav = !photo.favorite;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, favorite: nextFav } : p)));
    try {
      await patchSessionPhoto(session.id, photo.id, hostToken, { favorite: nextFav });
    } catch {
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, favorite: !nextFav } : p)));
    }
  };

  const handleDownloadSingle = async (photo: CapturedPhoto) => {
    try {
      await downloadSinglePhoto(photo);
    } catch {
      notify('Failed to download photo.', 'error');
    }
  };

  const handleDownloadZip = async () => {
    if (!session || photos.length === 0) return;
    setIsZipping(true);
    try {
      await downloadPhotosZip(photos, session.title);
      notify(`Downloaded ZIP archive with ${photos.length} photos.`, 'success');
    } catch {
      notify('Could not create ZIP archive.', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const handleRequestDelete = (photo: CapturedPhoto) => {
    setPendingDeletePhoto(photo);
    setDeleteAlsoFromDrive(false);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeletePhoto || !session || !hostToken) return;
    setIsDeleting(true);
    try {
      if (deleteAlsoFromDrive && pendingDeletePhoto.driveFileId && getAccessToken()) {
        await deleteDriveFile(pendingDeletePhoto.driveFileId);
      }
      await deleteSessionPhoto(session.id, pendingDeletePhoto.id, hostToken);
      setPhotos((prev) => prev.filter((p) => p.id !== pendingDeletePhoto.id));
      setSelectedCollageIds((prev) => prev.filter((id) => id !== pendingDeletePhoto.id));
      setLightboxPhotoId((prev) => (prev === pendingDeletePhoto.id ? null : prev));
      notify(
        deleteAlsoFromDrive && pendingDeletePhoto.driveFileId
          ? 'Photo deleted from session and Google Drive.'
          : 'Photo removed from session.',
        'neutral'
      );
      setPendingDeletePhoto(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete photo.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Host in-app mobile camera test mode
  if (hostCameraPreview && session) {
    return (
      <GuestCameraView
        sessionId={session.id}
        isHostPreview
        onExitHostPreview={() => setHostCameraPreview(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7] text-[#141416]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single text element Brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className="font-display text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E11D48]"
          >
            SnapWall
          </button>

          {/* Zone 2: 4 clean single-line text navigation links */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-7 text-sm font-medium md:flex"
          >
            {(
              [
                { id: 'qr', label: 'Capture QR' },
                { id: 'gallery', label: 'Live Gallery' },
                { id: 'collage', label: 'Collage Studio' },
                { id: 'drive', label: 'Drive Sync' },
              ] as Array<{ id: WorkspaceTab; label: string }>
            ).map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-1 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-zinc-950'
                      : 'text-zinc-500 hover:text-zinc-950'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute right-0 -bottom-[17px] left-0 h-[2px] bg-zinc-950" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                if (selectedCollageIds.length === 0 && photos.length > 0) {
                  setSelectedCollageIds(photos.slice(0, 12).map((p) => p.id));
                }
                setActiveTab('collage');
              }}
              className="rounded-lg bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#BE123C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48] whitespace-nowrap shrink-0"
            >
              Create Collage
            </button>
          </div>
        </div>

        {/* Mobile navigation row */}
        <nav
          aria-label="Mobile navigation"
          className="flex items-center justify-between gap-2 overflow-x-auto border-t border-zinc-100 px-4 py-2 md:hidden"
        >
          {(
            [
              { id: 'qr', label: 'Capture QR' },
              { id: 'gallery', label: 'Gallery' },
              { id: 'collage', label: 'Collage' },
              { id: 'drive', label: 'Drive Sync' },
            ] as Array<{ id: WorkspaceTab; label: string }>
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        {loadingSession ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950" />
            <p className="mt-4 text-sm text-zinc-600">Preparing your live QR photo session…</p>
          </div>
        ) : initError || !session ? (
          <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center">
            <h1 className="font-display text-lg font-semibold text-zinc-950">
              Could not start session
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              {initError || 'Please retry connecting to the event server.'}
            </p>
            <button
              type="button"
              onClick={startFreshSession}
              className="mt-5 rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'qr' && (
              <QrStationView
                session={session}
                photos={photos}
                socketStatus={socketStatus}
                connectedGuests={connectedGuests}
                captureBaseUrl={captureBaseUrl}
                onCaptureBaseUrlChange={setCaptureBaseUrl}
                onUpdateEventMeta={handleUpdateEventMeta}
                onCreateNewSession={startFreshSession}
                onOpenHostCameraTest={() => setHostCameraPreview(true)}
                onUploadFromLaptop={handleUploadFromLaptop}
                onOpenLightbox={(id) => setLightboxPhotoId(id)}
                onNavigateTab={(tab) => {
                  if (tab === 'collage' && selectedCollageIds.length === 0 && photos.length > 0) {
                    setSelectedCollageIds(photos.slice(0, 12).map((p) => p.id));
                  }
                  setActiveTab(tab);
                }}
                onStartSlideshow={() => setSlideshowOpen(true)}
                driveUser={driveUser}
                driveFolder={driveFolder}
                isSigningIn={isSigningIn}
                autoSyncDrive={autoSyncDrive}
                onToggleAutoSyncDrive={setAutoSyncDrive}
                onGoogleSignIn={handleGoogleSignIn}
                autoSaveLaptop={autoSaveLaptop}
                laptopFolderName={laptopDirHandle?.name || null}
                onToggleAutoSaveLaptop={handleToggleAutoSaveLaptop}
              />
            )}

            {activeTab === 'gallery' && (
              <LiveGalleryView
                photos={photos}
                isDriveConnected={Boolean(driveUser)}
                syncingPhotoIds={syncingPhotoIds}
                isBulkSyncing={isBulkSyncing}
                isZipping={isZipping}
                onOpenLightbox={(id) => setLightboxPhotoId(id)}
                onToggleFavorite={handleToggleFavorite}
                onDownloadSingle={handleDownloadSingle}
                onDownloadZip={handleDownloadZip}
                onSyncSingleToDrive={(p) => syncPhotoToDrive(p, false)}
                onSyncAllPendingToDrive={handleSyncAllPendingToDrive}
                onRequestDelete={handleRequestDelete}
                onUploadFromLaptop={handleUploadFromLaptop}
                onOpenCameraTest={() => setHostCameraPreview(true)}
                onCreateCollageFromFilter={(ids) => {
                  setSelectedCollageIds(ids);
                  setActiveTab('collage');
                }}
                onStartSlideshow={() => setSlideshowOpen(true)}
                slideshowUrl={`${captureBaseUrl.replace(/\/+$/, '')}/?slideshow=${encodeURIComponent(session.id)}`}
              />
            )}

            {activeTab === 'collage' && (
              <CollageStudioView
                photos={photos}
                eventTitle={session.title}
                eventSubtitle={session.subtitle}
                selectedPhotoIds={selectedCollageIds}
                onChangeSelectedPhotoIds={setSelectedCollageIds}
                isDriveConnected={Boolean(driveUser)}
                onSaveCollageToDrive={handleSaveCollageToDrive}
                onGoogleSignIn={handleGoogleSignIn}
                onUploadFromLaptop={handleUploadFromLaptop}
                onOpenCameraTest={() => setHostCameraPreview(true)}
                onNotify={notify}
              />
            )}

            {activeTab === 'drive' && (
              <DriveSyncView
                eventTitle={session.title}
                photos={photos}
                driveUser={driveUser}
                driveFolder={driveFolder}
                isSigningIn={isSigningIn}
                autoSyncDrive={autoSyncDrive}
                onToggleAutoSyncDrive={setAutoSyncDrive}
                onGoogleSignIn={handleGoogleSignIn}
                onGoogleSignOut={handleGoogleSignOut}
                syncingPhotoIds={syncingPhotoIds}
                isBulkSyncing={isBulkSyncing}
                onSyncSingleToDrive={(p) => syncPhotoToDrive(p, false)}
                onSyncAllPendingToDrive={handleSyncAllPendingToDrive}
                autoSaveLaptop={autoSaveLaptop}
                laptopFolderName={laptopDirHandle?.name || null}
                supportsFolderPicker={supportsFolderPicker}
                onToggleAutoSaveLaptop={handleToggleAutoSaveLaptop}
                onDownloadSingle={handleDownloadSingle}
                onDownloadZip={handleDownloadZip}
                isZipping={isZipping}
                onRequestDelete={handleRequestDelete}
              />
            )}
          </>
        )}
      </main>

      {/* Fullscreen Lightbox Viewer */}
      <LightboxModal
        photos={photos}
        activePhotoId={lightboxPhotoId}
        onClose={() => setLightboxPhotoId(null)}
        onNavigate={(id) => setLightboxPhotoId(id)}
        onToggleFavorite={handleToggleFavorite}
        onDownload={handleDownloadSingle}
        onSyncToDrive={(p) => syncPhotoToDrive(p, false)}
        onRequestDelete={handleRequestDelete}
        isDriveConnected={Boolean(driveUser)}
        syncingPhotoIds={syncingPhotoIds}
      />

      {/* Fullscreen Rotating 5-Second Event Slideshow Overlay */}
      {slideshowOpen && session && (
        <SlideshowView
          mode="embedded"
          sessionId={session.id}
          session={session}
          photos={photos}
          captureBaseUrl={captureBaseUrl}
          onUpdateOverlay={handleUpdateSlideshowOverlay}
          onClose={() => setSlideshowOpen(false)}
        />
      )}

      {/* Explicit Confirmation Modal for Deleting Session & Google Drive Files */}
      <ConfirmDialog
        open={Boolean(pendingDeletePhoto)}
        title="Delete photo?"
        description={
          pendingDeletePhoto?.driveFileId
            ? `Remove the photo by ${pendingDeletePhoto.guestName} from this live session. You can also choose whether to permanently delete its saved copy from Google Drive.`
            : `Remove the photo by ${pendingDeletePhoto?.guestName || 'Guest'} from this live session? This action cannot be undone.`
        }
        confirmLabel={
          deleteAlsoFromDrive && pendingDeletePhoto?.driveFileId
            ? 'Delete from Session & Drive'
            : 'Delete Photo'
        }
        cancelLabel="Cancel"
        destructive
        checkboxLabel={
          pendingDeletePhoto?.driveFileId && driveUser
            ? 'Also permanently delete this file from Google Drive'
            : undefined
        }
        checkboxChecked={deleteAlsoFromDrive}
        onCheckboxChange={setDeleteAlsoFromDrive}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setPendingDeletePhoto(null);
        }}
      />

      {/* Clean Floating Toast Notifications */}
      {toasts.length > 0 && (
        <div
          className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col gap-2"
          aria-live="polite"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
                toast.tone === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : toast.tone === 'success'
                  ? 'border-zinc-900 bg-zinc-950 text-white'
                  : 'border-zinc-200 bg-white text-zinc-900'
              }`}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                aria-label="Dismiss notification"
                className="opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
