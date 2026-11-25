import { useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  ExternalLink,
  Heart,
  Trash2,
  X,
} from 'lucide-react';
import type { CapturedPhoto } from '../types';
import { formatBytes, formatPhotoTime } from '../services/sessionApi';

interface LightboxModalProps {
  photos: CapturedPhoto[];
  activePhotoId: string | null;
  onClose: () => void;
  onNavigate: (photoId: string) => void;
  onToggleFavorite: (photo: CapturedPhoto) => void;
  onDownload: (photo: CapturedPhoto) => void;
  onSyncToDrive: (photo: CapturedPhoto) => void;
  onRequestDelete: (photo: CapturedPhoto) => void;
  isDriveConnected: boolean;
  syncingPhotoIds: Set<string>;
}

export function LightboxModal({
  photos,
  activePhotoId,
  onClose,
  onNavigate,
  onToggleFavorite,
  onDownload,
  onSyncToDrive,
  onRequestDelete,
  isDriveConnected,
  syncingPhotoIds,
}: LightboxModalProps) {
  const index = activePhotoId ? photos.findIndex((p) => p.id === activePhotoId) : -1;
  const photo = index >= 0 ? photos[index] : null;

  useEffect(() => {
    if (!photo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) {
        onNavigate(photos[index - 1].id);
      }
      if (e.key === 'ArrowRight' && index < photos.length - 1) {
        onNavigate(photos[index + 1].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photo, index, photos, onClose, onNavigate]);

  if (!photo) return null;

  const isSyncing = syncingPhotoIds.has(photo.id);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#050505]/95 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo by ${photo.guestName}`}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-sm font-medium text-white">
            <span className="truncate">{photo.guestName}</span>
            <span className="text-white/35" aria-hidden="true">·</span>
            <span className="font-mono text-xs text-white/65 tabular-nums">
              {formatPhotoTime(photo.createdAt)}
            </span>
            <span className="text-white/35" aria-hidden="true">·</span>
            <span className="font-mono text-xs text-white/65 tabular-nums">
              {index + 1} / {photos.length}
            </span>
          </div>
          {photo.caption && (
            <p className="mt-0.5 truncate text-xs text-white/65">{photo.caption}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleFavorite(photo)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              photo.favorite
                ? 'border-[#E11D48] bg-[#E11D48]/15 text-rose-200'
                : 'border-white/15 bg-white/5 text-white/85 hover:bg-white/10'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${photo.favorite ? 'fill-[#E11D48] text-[#E11D48]' : ''}`} />
            <span>{photo.favorite ? 'Favorited' : 'Favorite'}</span>
          </button>

          <button
            type="button"
            onClick={() => onDownload(photo)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Save to Laptop</span>
          </button>

          {photo.driveWebViewLink ? (
            <a
              href={photo.driveWebViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>View in Drive</span>
            </a>
          ) : (
            isDriveConnected && (
              <button
                type="button"
                onClick={() => onSyncToDrive(photo)}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 disabled:opacity-50 whitespace-nowrap"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                <span>{isSyncing ? 'Uploading…' : 'Save to Drive'}</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onRequestDelete(photo)}
            aria-label="Delete photo"
            className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 p-2 text-white/75 transition-colors hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-200"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            className="ml-1 inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main image stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
        {index > 0 && (
          <button
            type="button"
            onClick={() => onNavigate(photos[index - 1].id)}
            aria-label="Previous photo"
            className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white transition-colors hover:bg-black/80"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <img
          src={photo.url}
          alt={photo.caption || `Photo captured by ${photo.guestName}`}
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />

        {index < photos.length - 1 && (
          <button
            type="button"
            onClick={() => onNavigate(photos[index + 1].id)}
            aria-label="Next photo"
            className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white transition-colors hover:bg-black/80"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Subtle EXIF-style footer metadata */}
      <div className="flex items-center justify-center gap-3 border-t border-white/10 px-6 py-3 font-mono text-xs text-white/55 tabular-nums">
        {photo.width && photo.height && (
          <>
            <span>
              {photo.width} × {photo.height}px
            </span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{formatBytes(photo.sizeBytes)}</span>
        <span aria-hidden="true">·</span>
        <span>{photo.driveFileId ? 'Saved in Google Drive' : 'Stored in live session'}</span>
      </div>
    </div>
  );
}
