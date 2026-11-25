import JSZip from 'jszip';
import QRCode from 'qrcode';
import type { CapturedPhoto, EventSession, SlideshowOverlayConfig } from '../types';

export async function generateQrDataUrl(text: string, width = 640): Promise<string> {
  const api = (QRCode as unknown as { toDataURL?: typeof QRCode.toDataURL; default?: { toDataURL?: typeof QRCode.toDataURL } });
  const toDataURL = api.toDataURL || api.default?.toDataURL;
  if (!toDataURL) {
    throw new Error('QR code renderer is unavailable.');
  }
  return toDataURL(text, {
    width,
    margin: 2,
    color: {
      dark: '#141416',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

export async function createSession(title?: string, subtitle?: string): Promise<EventSession> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, subtitle }),
  });
  if (!res.ok) {
    throw new Error('Could not create live event session.');
  }
  return (await res.json()) as EventSession;
}

export async function fetchSession(sessionId: string, summaryOnly = false): Promise<EventSession> {
  const url = `/api/sessions/${encodeURIComponent(sessionId)}${summaryOnly ? '?summary=1' : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Event session not found.');
  }
  return (await res.json()) as EventSession;
}

export async function updateSessionMeta(
  sessionId: string,
  hostToken: string,
  updates: {
    title?: string;
    subtitle?: string;
    slideshow?: Partial<SlideshowOverlayConfig>;
  }
): Promise<{
  id: string;
  title: string;
  subtitle: string;
  photoCount: number;
  slideshow: SlideshowOverlayConfig;
}> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Host-Token': hostToken,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error('Could not update event details.');
  }
  return (await res.json()) as {
    id: string;
    title: string;
    subtitle: string;
    photoCount: number;
    slideshow: SlideshowOverlayConfig;
  };
}

export async function uploadSessionPhoto(
  sessionId: string,
  payload: {
    imageData: string;
    guestName?: string;
    caption?: string;
    width?: number;
    height?: number;
  }
): Promise<CapturedPhoto> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Could not upload photo.');
  }
  const data = (await res.json()) as { photo: CapturedPhoto };
  return data.photo;
}

export async function patchSessionPhoto(
  sessionId: string,
  photoId: string,
  hostToken: string,
  updates: { favorite?: boolean; driveFileId?: string; driveWebViewLink?: string }
): Promise<CapturedPhoto> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/photos/${encodeURIComponent(photoId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Host-Token': hostToken,
      },
      body: JSON.stringify(updates),
    }
  );
  if (!res.ok) {
    throw new Error('Could not update photo metadata.');
  }
  const data = (await res.json()) as { photo: CapturedPhoto };
  return data.photo;
}

export async function deleteSessionPhoto(
  sessionId: string,
  photoId: string,
  hostToken: string
): Promise<void> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/photos/${encodeURIComponent(photoId)}`,
    {
      method: 'DELETE',
      headers: {
        'X-Host-Token': hostToken,
      },
    }
  );
  if (!res.ok) {
    throw new Error('Could not delete photo.');
  }
}

export interface RoomSocketEvent {
  type: 'connected' | 'photo:created' | 'photo:updated' | 'photo:deleted' | 'session:updated' | 'presence:update';
  photo?: CapturedPhoto;
  photoId?: string;
  session?: {
    id: string;
    title: string;
    subtitle: string;
    photoCount: number;
    slideshow?: SlideshowOverlayConfig;
  };
  guestCount?: number;
  hostCount?: number;
}

export function connectSessionSocket(
  sessionId: string,
  role: 'host' | 'guest' | 'slideshow',
  onEvent: (event: RoomSocketEvent) => void,
  onStatusChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void
): () => void {
  let socket: WebSocket | null = null;
  let closedByCaller = false;
  let retryAttempt = 0;
  let retryTimer: number | null = null;

  const scheduleReconnect = () => {
    if (closedByCaller) return;
    onStatusChange?.('reconnecting');
    const delay = Math.min(8000, 1000 * Math.pow(1.6, retryAttempt));
    retryAttempt++;
    retryTimer = window.setTimeout(connect, delay);
  };

  const connect = () => {
    if (closedByCaller) return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${encodeURIComponent(sessionId)}&role=${role}`;

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        retryAttempt = 0;
        onStatusChange?.('connected');
      };

      socket.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(String(evt.data)) as RoomSocketEvent;
          onEvent(parsed);
        } catch {
          // Ignore malformed payloads
        }
      };

      socket.onclose = () => {
        if (closedByCaller) {
          onStatusChange?.('disconnected');
          return;
        }
        scheduleReconnect();
      };

      socket.onerror = () => {
        try {
          socket?.close();
        } catch {
          // Ignore close errors
        }
      };
    } catch {
      scheduleReconnect();
    }
  };

  connect();

  return () => {
    closedByCaller = true;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
    }
    try {
      socket?.close();
    } catch {
      // Ignore close errors
    }
  };
}

export async function fileToOptimizedDataUrl(
  file: File,
  maxDimension = 2048,
  quality = 0.88
): Promise<{ dataUrl: string; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read image file.'));
      el.src = objectUrl;
    });

    let { naturalWidth: w, naturalHeight: h } = img;
    if (w > maxDimension || h > maxDimension) {
      const scale = Math.min(maxDimension / w, maxDimension / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported.');
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { dataUrl, width: w, height: h };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function downloadSinglePhoto(photo: CapturedPhoto): Promise<void> {
  const res = await fetch(photo.url);
  if (!res.ok) throw new Error('Failed to fetch photo for download.');
  const blob = await res.blob();
  const safeGuest = photo.guestName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'guest';
  const ext = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
  triggerBlobDownload(blob, `snapwall_${safeGuest}_${photo.id.slice(0, 6)}.${ext}`);
}

export async function downloadPhotosZip(photos: CapturedPhoto[], eventTitle: string): Promise<void> {
  const zip = new JSZip();
  const folderSlug = eventTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'SnapWall_Photos';
  const folder = zip.folder(folderSlug);
  if (!folder) throw new Error('Could not initialize ZIP archive.');

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const res = await fetch(photo.url);
    if (!res.ok) continue;
    const blob = await res.blob();
    const safeGuest = photo.guestName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20) || 'guest';
    const ext = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const index = String(i + 1).padStart(3, '0');
    folder.file(`${index}_${safeGuest}_${photo.id.slice(0, 6)}.${ext}`, blob);
  }

  const archiveBlob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(archiveBlob, `${folderSlug}_${photos.length}_photos.zip`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPhotoTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
