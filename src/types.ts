export interface CapturedPhoto {
  id: string;
  sessionId: string;
  url: string;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  guestName: string;
  caption: string;
  createdAt: string;
  favorite: boolean;
  driveFileId?: string;
  driveWebViewLink?: string;
  savedToLaptop?: boolean;
}

export interface SlideshowOverlayConfig {
  eventDate: string;
  venue: string;
  welcomeMessage: string;
  showDate: boolean;
  showVenue: boolean;
  showWelcomeMessage: boolean;
  showGuestCredit: boolean;
  showCornerQr: boolean;
  intervalSeconds: number;
}

export interface EventSession {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  photoCount: number;
  slideshow: SlideshowOverlayConfig;
  photos: CapturedPhoto[];
  hostToken?: string;
}

export type WorkspaceTab = 'qr' | 'gallery' | 'collage' | 'drive';

export type CollageLayoutId =
  | 'grid'
  | 'bento'
  | 'polaroid'
  | 'contact-sheet'
  | 'spotlight';

export type CollageAspectRatio = '1:1' | '4:5' | '16:9' | '3:4';

export type CollageThemeId = 'white' | 'ivory' | 'charcoal' | 'obsidian' | 'slate';

export interface CollageSettings {
  layout: CollageLayoutId;
  aspectRatio: CollageAspectRatio;
  theme: CollageThemeId;
  gap: number;
  cornerRadius: number;
  padding: number;
  showHeader: boolean;
  headerTitle: string;
  headerSubtitle: string;
  fitMode: 'cover' | 'contain';
  exportFormat: 'image/png' | 'image/jpeg';
}

export type CameraFilterId = 'natural' | 'warm-film' | 'editorial-bw' | 'vivid';

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'neutral' | 'success' | 'error';
}
