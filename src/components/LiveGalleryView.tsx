import { useRef, useState, type ChangeEvent } from 'react';
import {
  Camera,
  Check,
  CloudCheck,
  CloudUpload,
  Download,
  FolderArchive,
  Heart,
  LayoutGrid,
  Link2,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CapturedPhoto } from '../types';
import { formatBytes, formatPhotoTime } from '../services/sessionApi';

type GalleryFilter = 'all' | 'favorites' | 'synced' | 'unsynced';

interface LiveGalleryViewProps {
  photos: CapturedPhoto[];
  isDriveConnected: boolean;
  syncingPhotoIds: Set<string>;
  isBulkSyncing: boolean;
  isZipping: boolean;
  onOpenLightbox: (photoId: string) => void;
  onToggleFavorite: (photo: CapturedPhoto) => void;
  onDownloadSingle: (photo: CapturedPhoto) => void;
  onDownloadZip: () => void;
  onSyncSingleToDrive: (photo: CapturedPhoto) => void;
  onSyncAllPendingToDrive: () => void;
  onRequestDelete: (photo: CapturedPhoto) => void;
  onUploadFromLaptop: (files: FileList) => Promise<void>;
  onOpenCameraTest: () => void;
  onCreateCollageFromFilter: (photoIds: string[]) => void;
  onStartSlideshow: () => void;
  slideshowUrl: string;
}

export function LiveGalleryView({
  photos,
  isDriveConnected,
  syncingPhotoIds,
  isBulkSyncing,
  isZipping,
  onOpenLightbox,
  onToggleFavorite,
  onDownloadSingle,
  onDownloadZip,
  onSyncSingleToDrive,
  onSyncAllPendingToDrive,
  onRequestDelete,
  onUploadFromLaptop,
  onOpenCameraTest,
  onCreateCollageFromFilter,
  onStartSlideshow,
  slideshowUrl,
}: LiveGalleryViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [copiedSlideUrl, setCopiedSlideUrl] = useState(false);

  const handleCopySlideshowUrl = async () => {
    try {
      await navigator.clipboard.writeText(slideshowUrl);
      setCopiedSlideUrl(true);
      window.setTimeout(() => setCopiedSlideUrl(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const filtered = photos.filter((p) => {
    if (filter === 'favorites') return p.favorite;
    if (filter === 'synced') return Boolean(p.driveFileId);
    if (filter === 'unsynced') return !p.driveFileId;
    return true;
  });

  const unsyncedCount = photos.filter((p) => !p.driveFileId).length;
  const favCount = photos.filter((p) => p.favorite).length;

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFromLaptop(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Gallery Header & Action Bar */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-6 lg:flex-row lg:items-end">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-zinc-950">
            Live Photo Gallery
          </h1>
          <p className="mt-1 text-sm text-zinc-600 tabular-nums">
            {photos.length} photo{photos.length === 1 ? '' : 's'} received · {favCount} favorited ·{' '}
            {photos.length - unsyncedCount} saved in Google Drive
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Add from Laptop</span>
          </button>

          {photos.length > 0 && (
            <button
              type="button"
              onClick={onDownloadZip}
              disabled={isZipping}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap"
            >
              <FolderArchive className="h-3.5 w-3.5" />
              <span>{isZipping ? 'Creating ZIP…' : 'Download All (.ZIP)'}</span>
            </button>
          )}

          {isDriveConnected && unsyncedCount > 0 && (
            <button
              type="button"
              onClick={onSyncAllPendingToDrive}
              disabled={isBulkSyncing}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap"
            >
              <CloudUpload className="h-3.5 w-3.5" />
              <span>
                {isBulkSyncing ? 'Syncing to Drive…' : `Sync ${unsyncedCount} to Drive`}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onStartSlideshow}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Start Slideshow</span>
          </button>

          <button
            type="button"
            onClick={handleCopySlideshowUrl}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap"
          >
            {copiedSlideUrl ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Slideshow URL Copied</span>
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" />
                <span>Copy Slideshow URL</span>
              </>
            )}
          </button>

          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() => onCreateCollageFromFilter(filtered.map((p) => p.id))}
              className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#BE123C] whitespace-nowrap"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Make Collage ({filtered.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Filter Segmented Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          className="inline-flex items-center gap-1 rounded-lg bg-zinc-200/70 p-1"
          role="tablist"
          aria-label="Filter photos"
        >
          {(
            [
              { id: 'all', label: `All (${photos.length})` },
              { id: 'favorites', label: `Favorites (${favCount})` },
              { id: 'synced', label: `In Drive (${photos.length - unsyncedCount})` },
              { id: 'unsynced', label: `Pending (${unsyncedCount})` },
            ] as Array<{ id: GalleryFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                filter === tab.id
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenCameraTest}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-950 whitespace-nowrap"
        >
          <Camera className="h-3.5 w-3.5" />
          <span>Snap a test photo</span>
        </button>
      </div>

      {/* Gallery Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold text-zinc-900">
            {photos.length === 0 ? 'No photos in this session yet' : 'No photos match this filter'}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-600">
            {photos.length === 0
              ? 'Have guests scan your event QR code, snap a shot with your device camera, or upload photos from your laptop.'
              : 'Try switching back to All Photos to view every captured image.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {photos.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={onOpenCameraTest}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
                >
                  <Camera className="h-4 w-4" />
                  <span>Test Camera Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload Photos</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                Show All Photos
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((photo) => {
            const isSyncing = syncingPhotoIds.has(photo.id);
            return (
              <article
                key={photo.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white transition-colors hover:border-zinc-300"
              >
                {/* Media frame */}
                <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
                  <button
                    type="button"
                    onClick={() => onOpenLightbox(photo.id)}
                    className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#E11D48]"
                    aria-label={`View photo by ${photo.guestName}`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || `Photo captured by ${photo.guestName}`}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </button>

                  {/* Top-right favorite action */}
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(photo)}
                    aria-label={photo.favorite ? 'Remove favorite' : 'Mark favorite'}
                    className={`absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                      photo.favorite
                        ? 'bg-white text-[#E11D48] shadow-xs'
                        : 'bg-black/45 text-white hover:bg-black/65'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${photo.favorite ? 'fill-[#E11D48]' : ''}`} />
                  </button>
                </div>

                {/* Clean Unboxed Metadata & Controls */}
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-zinc-950">
                        {photo.guestName}
                      </h3>
                      <span className="shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums">
                        {formatPhotoTime(photo.createdAt)}
                      </span>
                    </div>

                    {photo.caption && (
                      <p className="mt-1 line-clamp-1 text-xs text-zinc-600">{photo.caption}</p>
                    )}

                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500 tabular-nums">
                      <span>{formatBytes(photo.sizeBytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {photo.driveFileId
                          ? 'Saved in Drive'
                          : isSyncing
                          ? 'Uploading to Drive…'
                          : 'Session only'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onDownloadSingle(photo)}
                        title="Download to laptop"
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Save</span>
                      </button>

                      {photo.driveFileId ? (
                        <a
                          href={photo.driveWebViewLink || 'https://drive.google.com'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                        >
                          <CloudCheck className="h-3.5 w-3.5" />
                          <span>Drive</span>
                        </a>
                      ) : (
                        isDriveConnected && (
                          <button
                            type="button"
                            onClick={() => onSyncSingleToDrive(photo)}
                            disabled={isSyncing}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50"
                          >
                            <CloudUpload className="h-3.5 w-3.5" />
                            <span>{isSyncing ? 'Syncing…' : 'Drive'}</span>
                          </button>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRequestDelete(photo)}
                      aria-label="Delete photo"
                      className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-[#E11D48]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
