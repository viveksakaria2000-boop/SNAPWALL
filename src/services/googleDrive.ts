import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { DriveFolderInfo } from '../types';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedProvider: GoogleAuthProvider | null = null;

function getSafeAuth(): { auth: Auth; provider: GoogleAuthProvider } | null {
  try {
    if (!cachedApp) {
      cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    }
    if (!cachedAuth) {
      cachedAuth = getAuth(cachedApp);
    }
    if (!cachedProvider) {
      const provider = new GoogleAuthProvider();
      for (const scope of SCOPES) {
        provider.addScope(scope);
      }
      cachedProvider = provider;
    }
    return { auth: cachedAuth, provider: cachedProvider };
  } catch (err) {
    console.warn('Firebase Auth unavailable in current browser context:', err);
    return null;
  }
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  const ctx = getSafeAuth();
  if (!ctx) {
    onAuthFailure?.();
    return () => {};
  }
  try {
    return onAuthStateChanged(ctx.auth, (user: User | null) => {
      if (user) {
        if (cachedAccessToken) {
          onAuthSuccess?.(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          onAuthFailure?.();
        }
      } else {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    });
  } catch {
    onAuthFailure?.();
    return () => {};
  }
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  const ctx = getSafeAuth();
  if (!ctx) {
    throw new Error('Google Sign-In could not initialize in this browser window.');
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(ctx.auth, ctx.provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Drive access token was not returned. Please try signing in again.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => cachedAccessToken;

export const logoutGoogle = async (): Promise<void> => {
  const ctx = getSafeAuth();
  if (ctx) {
    await ctx.auth.signOut().catch(() => {});
  }
  cachedAccessToken = null;
};

function requireToken(): string {
  if (!cachedAccessToken) {
    throw new Error('Google Drive session expired. Please sign in with Google again.');
  }
  return cachedAccessToken;
}

export async function ensureEventFolder(folderName: string): Promise<DriveFolderInfo> {
  const token = requireToken();
  const safeName = folderName.replace(/['\\]/g, '').trim() || 'SnapWall Event Photos';

  const query = encodeURIComponent(
    `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)&pageSize=5`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (searchRes.status === 401) {
    cachedAccessToken = null;
    throw new Error('Google Drive authorization expired. Please sign in again.');
  }
  if (!searchRes.ok) {
    throw new Error('Could not check existing folders in Google Drive.');
  }

  const searchJson = (await searchRes.json()) as {
    files?: Array<{ id: string; name: string; webViewLink?: string }>;
  };

  if (searchJson.files && searchJson.files.length > 0) {
    const existing = searchJson.files[0];
    return {
      id: existing.id,
      name: existing.name,
      webViewLink: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
    };
  }

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: safeName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    }
  );

  if (!createRes.ok) {
    throw new Error('Could not create the event folder in Google Drive.');
  }

  const created = (await createRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };
  return {
    id: created.id,
    name: created.name,
    webViewLink: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
  };
}

export async function uploadBlobToDrive(
  blob: Blob,
  filename: string,
  folderId?: string
): Promise<{ id: string; name: string; webViewLink: string }> {
  const token = requireToken();

  const metadata: Record<string, unknown> = {
    name: filename,
    mimeType: blob.type || 'image/jpeg',
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', blob, filename);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Google Drive authorization expired. Please sign in again.');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || 'Failed to upload image to Google Drive.');
  }

  const uploaded = (await res.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    id: uploaded.id,
    name: uploaded.name,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = requireToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (res.status === 404) {
    return;
  }
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Google Drive authorization expired. Please sign in again.');
  }
  if (!res.ok) {
    throw new Error('Could not delete file from Google Drive.');
  }
}
