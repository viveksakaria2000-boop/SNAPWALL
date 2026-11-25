import type { User } from 'firebase/auth';
import {
  CloudUpload,
  Download,
  ExternalLink,
  FolderArchive,
  FolderDown,
  LogOut,
  Trash2,
} from 'lucide-react';
import type { CapturedPhoto, DriveFolderInfo } from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import { formatBytes, formatPhotoTime } from '../services/sessionApi';

interface DriveSyncViewProps {
  eventTitle: string;
  photos: CapturedPhoto[];
  driveUser: User | null;
  driveFolder: DriveFolderInfo | null;
  isSigningIn: boolean;
  autoSyncDrive: boolean;
  onToggleAutoSyncDrive: (enabled: boolean) => void;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  syncingPhotoIds: Set<string>;
  isBulkSyncing: boolean;
  onSyncSingleToDrive: (photo: CapturedPhoto) => void;
  onSyncAllPendingToDrive: () => void;
  autoSaveLaptop: boolean;
  laptopFolderName: string | null;
  supportsFolderPicker: boolean;
  onToggleAutoSaveLaptop: () => void;
  onDownloadSingle: (photo: CapturedPhoto) => void;
  onDownloadZip: () => void;
  isZipping: boolean;
  onRequestDelete: (photo: CapturedPhoto) => void;
}

export function DriveSyncView({
  eventTitle,
  photos,
  driveUser,
  driveFolder,
  isSigningIn,
  autoSyncDrive,
  onToggleAutoSyncDrive,
  onGoogleSignIn,
  onGoogleSignOut,
  syncingPhotoIds,
  isBulkSyncing,
  onSyncSingleToDrive,
  onSyncAllPendingToDrive,
  autoSaveLaptop,
  laptopFolderName,
  supportsFolderPicker,
  onToggleAutoSaveLaptop,
  onDownloadSingle,
  onDownloadZip,
  isZipping,
  onRequestDelete,
}: DriveSyncViewProps) {
  const syncedCount = photos.filter((p) => Boolean(p.driveFileId)).length;
  const pendingCount = photos.length - syncedCount;

  return (
    <div className="space-y-8">
      <div className="border-b border-zinc-200 pb-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-zinc-950">
          Google Drive &amp; Laptop Sync
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Automatically save every guest photo into your Google Drive folder or directly onto your
          laptop as soon as it is captured.
        </p>
      </div>

      {/* Two-Column Destination Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Google Drive Sync Card */}
        <section className="flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-zinc-950">
                  Google Drive Auto-Sync
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                  Creates a dedicated folder for <span className="font-medium">{eventTitle}</span>{' '}
                  in your Google Drive and uploads photos automatically.
                </p>
              </div>
              {driveUser && (
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>

            {driveUser ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-zinc-200/80 bg-[#F8F8F7] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-950">
                        {driveUser.displayName || driveUser.email}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{driveUser.email}</p>
                    </div>
                    {driveFolder?.webViewLink && (
                      <a
                        href={driveFolder.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                      >
                        <span>Open Folder</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-zinc-600">
                    Destination folder:{' '}
                    <span className="font-medium text-zinc-900">
                      {driveFolder?.name || `SnapWall - ${eventTitle}`}
                    </span>
                  </p>
                </div>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-zinc-950">
                      Auto-upload incoming guest photos
                    </p>
                    <p className="text-xs text-zinc-500">
                      Upload each new shot to Google Drive the moment it arrives.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSyncDrive}
                    onChange={(e) => onToggleAutoSyncDrive(e.target.checked)}
                    className="h-4 w-4 accent-[#E11D48]"
                  />
                </label>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-zinc-200/80 bg-[#F8F8F7] p-5">
                <p className="text-xs leading-relaxed text-zinc-600">
                  Sign in with your Google account to save guest photos and exported collages
                  directly into Google Drive. This app only accesses files and folders it creates.
                </p>
                <div className="mt-4">
                  <GoogleSignInButton
                    onClick={onGoogleSignIn}
                    disabled={isSigningIn}
                    label={isSigningIn ? 'Signing in…' : 'Sign in with Google'}
                  />
                </div>
              </div>
            )}
          </div>

          {driveUser && (
            <div className="mt-5 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4">
              <span className="font-mono text-xs text-zinc-600 tabular-nums">
                {syncedCount} synced · {pendingCount} pending
              </span>
              <button
                type="button"
                onClick={onSyncAllPendingToDrive}
                disabled={pendingCount === 0 || isBulkSyncing}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                <span>
                  {isBulkSyncing
                    ? 'Uploading…'
                    : pendingCount > 0
                    ? `Upload ${pendingCount} Pending`
                    : 'All Photos Synced'}
                </span>
              </button>
            </div>
          )}
        </section>

        {/* Laptop Local Backup Card */}
        <section className="flex flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white p-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-zinc-950">
              Laptop Local Storage
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Save incoming photos directly to a local folder on your laptop or download the entire
              event archive as a single ZIP file.
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-zinc-200/80 bg-[#F8F8F7] p-4">
                <p className="text-sm font-semibold text-zinc-950">
                  {autoSaveLaptop
                    ? laptopFolderName
                      ? `Auto-saving directly to "${laptopFolderName}"`
                      : 'Auto-downloading incoming shots to Downloads'
                    : 'Automatic laptop save is paused'}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {supportsFolderPicker
                    ? 'Pick a folder on your laptop so every new guest photo writes straight to disk without browser download prompts.'
                    : 'When enabled, each newly received guest photo automatically triggers a file download to your laptop.'}
                </p>
                <button
                  type="button"
                  onClick={onToggleAutoSaveLaptop}
                  className={`mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    autoSaveLaptop
                      ? 'bg-zinc-950 text-white hover:bg-zinc-800'
                      : 'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50'
                  }`}
                >
                  <FolderDown className="h-4 w-4" />
                  <span>
                    {autoSaveLaptop
                      ? 'Turn Off Laptop Auto-Save'
                      : supportsFolderPicker
                      ? 'Choose Laptop Folder & Enable'
                      : 'Enable Auto-Download to Laptop'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4">
            <span className="font-mono text-xs text-zinc-600 tabular-nums">
              {photos.length} photo{photos.length === 1 ? '' : 's'} ready
            </span>
            <button
              type="button"
              onClick={onDownloadZip}
              disabled={photos.length === 0 || isZipping}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-40 whitespace-nowrap"
            >
              <FolderArchive className="h-3.5 w-3.5" />
              <span>{isZipping ? 'Packing ZIP…' : 'Download All (.ZIP)'}</span>
            </button>
          </div>
        </section>
      </div>

      {/* Sync Activity Table */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white">
        <div className="border-b border-zinc-100 px-6 py-4">
          <h2 className="font-display text-base font-semibold text-zinc-950">
            Session Backup Log
          </h2>
        </div>

        {photos.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            Captured guest photos will appear here with their Drive and laptop backup status.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs font-medium text-zinc-500">
                  <th className="px-6 py-3 font-medium">Photo</th>
                  <th className="px-4 py-3 font-medium">Captured</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Google Drive</th>
                  <th className="px-6 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {photos.map((photo) => {
                  const isSyncing = syncingPhotoIds.has(photo.id);
                  return (
                    <tr key={photo.id} className="hover:bg-zinc-50/70">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={photo.url}
                            alt={photo.guestName}
                            referrerPolicy="no-referrer"
                            className="h-10 w-12 rounded-md object-cover bg-zinc-100"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-950">{photo.guestName}</p>
                            {photo.caption && (
                              <p className="truncate text-xs text-zinc-500">{photo.caption}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600 tabular-nums whitespace-nowrap">
                        {formatPhotoTime(photo.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600 tabular-nums whitespace-nowrap">
                        {formatBytes(photo.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {photo.driveFileId ? (
                          <a
                            href={photo.driveWebViewLink || 'https://drive.google.com'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                          >
                            <span>Synced</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : isSyncing ? (
                          <span className="text-zinc-500">Uploading…</span>
                        ) : (
                          <span className="text-zinc-500">Not uploaded</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onDownloadSingle(photo)}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Save</span>
                          </button>

                          {driveUser && !photo.driveFileId && (
                            <button
                              type="button"
                              onClick={() => onSyncSingleToDrive(photo)}
                              disabled={isSyncing}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              <CloudUpload className="h-3.5 w-3.5" />
                              <span>Drive</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onRequestDelete(photo)}
                            aria-label="Delete photo"
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-[#E11D48]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
