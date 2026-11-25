import type {
  CapturedPhoto,
  CollageAspectRatio,
  CollageSettings,
  CollageThemeId,
} from '../types';

export interface CollageThemePalette {
  id: CollageThemeId;
  label: string;
  bg: string;
  frameBg: string;
  titleColor: string;
  subtitleColor: string;
  borderColor: string;
  polaroidBg: string;
}

export const COLLAGE_THEMES: Record<CollageThemeId, CollageThemePalette> = {
  white: {
    id: 'white',
    label: 'Gallery White',
    bg: '#FFFFFF',
    frameBg: '#F4F4F5',
    titleColor: '#141416',
    subtitleColor: '#71717A',
    borderColor: '#E4E4E7',
    polaroidBg: '#FFFFFF',
  },
  ivory: {
    id: 'ivory',
    label: 'Warm Ivory',
    bg: '#F7F4EE',
    frameBg: '#ECE7DD',
    titleColor: '#1C1917',
    subtitleColor: '#78716C',
    borderColor: '#E0D9CC',
    polaroidBg: '#FFFDF9',
  },
  slate: {
    id: 'slate',
    label: 'Cool Slate',
    bg: '#EEF0F4',
    frameBg: '#E2E6EE',
    titleColor: '#0F172A',
    subtitleColor: '#64748B',
    borderColor: '#CBD5E1',
    polaroidBg: '#FFFFFF',
  },
  charcoal: {
    id: 'charcoal',
    label: 'Studio Charcoal',
    bg: '#18181B',
    frameBg: '#27272A',
    titleColor: '#FAFAFA',
    subtitleColor: '#A1A1AA',
    borderColor: '#3F3F46',
    polaroidBg: '#F4F4F5',
  },
  obsidian: {
    id: 'obsidian',
    label: 'Jet Obsidian',
    bg: '#050505',
    frameBg: '#141416',
    titleColor: '#FFFFFF',
    subtitleColor: '#A1A1AA',
    borderColor: '#27272A',
    polaroidBg: '#FFFFFF',
  },
};

export function getCanvasDimensions(aspect: CollageAspectRatio, scale = 1): { width: number; height: number } {
  const base: Record<CollageAspectRatio, { width: number; height: number }> = {
    '1:1': { width: 2000, height: 2000 },
    '4:5': { width: 2000, height: 2500 },
    '16:9': { width: 2560, height: 1440 },
    '3:4': { width: 2100, height: 2800 },
  };
  const dim = base[aspect];
  return {
    width: Math.round(dim.width * scale),
    height: Math.round(dim.height * scale),
  };
}

export interface CollageSlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  photoIndex: number;
  isPolaroid?: boolean;
  frameNumber?: string;
}

export function computeCollageSlots(
  photoCount: number,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number,
  settings: CollageSettings
): CollageSlotRect[] {
  const count = Math.max(1, photoCount);
  const gap = settings.gap;

  if (settings.layout === 'bento' && count >= 3) {
    const slots: CollageSlotRect[] = [];
    const maxSlots = Math.min(count, 9);
    const leftW = Math.round((areaW - gap) * 0.56);
    const rightW = areaW - gap - leftW;

    if (maxSlots === 3) {
      slots.push({ x: areaX, y: areaY, w: leftW, h: areaH, photoIndex: 0 });
      const rh = (areaH - gap) / 2;
      slots.push({ x: areaX + leftW + gap, y: areaY, w: rightW, h: rh, photoIndex: 1 });
      slots.push({ x: areaX + leftW + gap, y: areaY + rh + gap, w: rightW, h: rh, photoIndex: 2 });
      return slots;
    }

    if (maxSlots === 4) {
      const topH = Math.round((areaH - gap) * 0.62);
      const botH = areaH - gap - topH;
      slots.push({ x: areaX, y: areaY, w: leftW, h: topH, photoIndex: 0 });
      slots.push({ x: areaX + leftW + gap, y: areaY, w: rightW, h: topH, photoIndex: 1 });
      const halfW = (areaW - gap) / 2;
      slots.push({ x: areaX, y: areaY + topH + gap, w: halfW, h: botH, photoIndex: 2 });
      slots.push({ x: areaX + halfW + gap, y: areaY + topH + gap, w: halfW, h: botH, photoIndex: 3 });
      return slots;
    }

    // 5 to 9 photos editorial bento
    const heroH = Math.round((areaH - gap) * 0.62);
    const bottomH = areaH - gap - heroH;
    slots.push({ x: areaX, y: areaY, w: leftW, h: heroH, photoIndex: 0 });

    const rightStackCount = maxSlots >= 7 ? 3 : 2;
    const rh = (heroH - gap * (rightStackCount - 1)) / rightStackCount;
    for (let i = 0; i < rightStackCount; i++) {
      slots.push({
        x: areaX + leftW + gap,
        y: areaY + i * (rh + gap),
        w: rightW,
        h: rh,
        photoIndex: 1 + i,
      });
    }

    const bottomCount = maxSlots - 1 - rightStackCount;
    const bw = (areaW - gap * (bottomCount - 1)) / bottomCount;
    for (let i = 0; i < bottomCount; i++) {
      slots.push({
        x: areaX + i * (bw + gap),
        y: areaY + heroH + gap,
        w: bw,
        h: bottomH,
        photoIndex: 1 + rightStackCount + i,
      });
    }
    return slots;
  }

  if (settings.layout === 'spotlight' && count >= 5) {
    const slots: CollageSlotRect[] = [];
    const maxSlots = Math.min(count, 9);
    const cols = 3;
    const rows = 3;
    const cellW = (areaW - gap * (cols - 1)) / cols;
    const cellH = (areaH - gap * (rows - 1)) / rows;

    // Center hero occupies 1 big central area or 2x2 highlight
    if (maxSlots === 5) {
      const sideW = Math.round((areaW - gap * 2) * 0.27);
      const centerW = areaW - gap * 2 - sideW * 2;
      const sideH = (areaH - gap) / 2;
      slots.push({ x: areaX + sideW + gap, y: areaY, w: centerW, h: areaH, photoIndex: 0 });
      slots.push({ x: areaX, y: areaY, w: sideW, h: sideH, photoIndex: 1 });
      slots.push({ x: areaX, y: areaY + sideH + gap, w: sideW, h: sideH, photoIndex: 2 });
      slots.push({ x: areaX + sideW + centerW + gap * 2, y: areaY, w: sideW, h: sideH, photoIndex: 3 });
      slots.push({
        x: areaX + sideW + centerW + gap * 2,
        y: areaY + sideH + gap,
        w: sideW,
        h: sideH,
        photoIndex: 4,
      });
      return slots;
    }

    // 6-9 photos: 3x3 ring around a slightly elevated center slot
    const order = [4, 0, 1, 2, 3, 5, 6, 7, 8];
    for (let i = 0; i < maxSlots; i++) {
      const gridPos = order[i];
      const r = Math.floor(gridPos / 3);
      const c = gridPos % 3;
      slots.push({
        x: areaX + c * (cellW + gap),
        y: areaY + r * (cellH + gap),
        w: cellW,
        h: cellH,
        photoIndex: i,
      });
    }
    return slots;
  }

  if (settings.layout === 'polaroid') {
    const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const cellW = (areaW - gap * (cols - 1)) / cols;
    const cellH = (areaH - gap * (rows - 1)) / rows;
    const tilts = [-2.4, 1.8, -1.5, 2.2, -1.9, 1.4, -2.1, 2.5, -1.2, 1.9, -2.3, 1.6];

    const slots: CollageSlotRect[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const itemsInRow = r === rows - 1 ? count - r * cols : cols;
      const rowOffset = itemsInRow < cols ? ((cols - itemsInRow) * (cellW + gap)) / 2 : 0;
      const inset = Math.min(cellW, cellH) * 0.05;
      slots.push({
        x: areaX + rowOffset + c * (cellW + gap) + inset,
        y: areaY + r * (cellH + gap) + inset,
        w: cellW - inset * 2,
        h: cellH - inset * 2,
        rotation: tilts[i % tilts.length],
        photoIndex: i,
        isPolaroid: true,
      });
    }
    return slots;
  }

  if (settings.layout === 'contact-sheet') {
    const cols = count <= 2 ? count : count <= 6 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const cellW = (areaW - gap * (cols - 1)) / cols;
    const cellH = (areaH - gap * (rows - 1)) / rows;
    const slots: CollageSlotRect[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      slots.push({
        x: areaX + c * (cellW + gap),
        y: areaY + r * (cellH + gap),
        w: cellW,
        h: cellH,
        photoIndex: i,
        frameNumber: `${String(i + 1).padStart(2, '0')}A`,
      });
    }
    return slots;
  }

  // Default: Smart Balanced Grid
  let cols = Math.ceil(Math.sqrt(count));
  if (settings.aspectRatio === '16:9' && count >= 3) {
    cols = Math.min(count, Math.ceil(Math.sqrt(count * 1.4)));
  } else if ((settings.aspectRatio === '4:5' || settings.aspectRatio === '3:4') && count >= 3) {
    cols = Math.max(2, Math.floor(Math.sqrt(count * 0.9)));
  }
  const rows = Math.ceil(count / cols);
  const cellH = (areaH - gap * (rows - 1)) / rows;

  const slots: CollageSlotRect[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const itemsInRow = r === rows - 1 ? count - r * cols : cols;
    const cellW = (areaW - gap * (itemsInRow - 1)) / itemsInRow;
    slots.push({
      x: areaX + c * (cellW + gap),
      y: areaY + r * (cellH + gap),
      w: cellW,
      h: cellH,
      photoIndex: i,
    });
  }
  return slots;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawImageFitted(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: 'cover' | 'contain'
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;

  if (fit === 'contain') {
    let drawW = w;
    let drawH = h;
    if (imgRatio > boxRatio) {
      drawH = w / imgRatio;
    } else {
      drawW = h * imgRatio;
    }
    const dx = x + (w - drawW) / 2;
    const dy = y + (h - drawH) / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);
    return;
  }

  // Cover crop
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (imgRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function renderCollageToCanvas(
  canvas: HTMLCanvasElement,
  photos: CapturedPhoto[],
  settings: CollageSettings,
  scale = 1
): Promise<CollageSlotRect[]> {
  const { width, height } = getCanvasDimensions(settings.aspectRatio, scale);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const theme = COLLAGE_THEMES[settings.theme];
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  const scaledPadding = Math.round(settings.padding * scale);
  const scaledGap = Math.round(settings.gap * scale);
  const scaledRadius = Math.round(settings.cornerRadius * scale);

  const headerH = settings.showHeader ? Math.round(170 * scale) : 0;
  const footerH = settings.layout === 'contact-sheet' ? Math.round(64 * scale) : 0;

  if (settings.showHeader) {
    const titleSize = Math.round(58 * scale);
    const subSize = Math.round(24 * scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = theme.titleColor;
    ctx.font = `600 ${titleSize}px "Fraunces", Georgia, serif`;
    ctx.fillText(
      settings.headerTitle.trim() || 'Evening Celebration',
      width / 2,
      scaledPadding + Math.round(52 * scale)
    );

    if (settings.headerSubtitle.trim()) {
      ctx.fillStyle = theme.subtitleColor;
      ctx.font = `500 ${subSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.fillText(
        settings.headerSubtitle.trim(),
        width / 2,
        scaledPadding + Math.round(112 * scale)
      );
    }
  }

  const areaX = scaledPadding;
  const areaY = scaledPadding + headerH;
  const areaW = width - scaledPadding * 2;
  const areaH = height - scaledPadding * 2 - headerH - footerH;

  const scaledSettings: CollageSettings = {
    ...settings,
    gap: scaledGap,
    padding: scaledPadding,
    cornerRadius: scaledRadius,
  };

  const slots = computeCollageSlots(photos.length, areaX, areaY, areaW, areaH, scaledSettings);

  // Load images in parallel
  const loadedImages = await Promise.all(
    photos.map((p) => loadHtmlImage(p.url).catch(() => null))
  );

  for (const slot of slots) {
    const photo = photos[slot.photoIndex];
    const img = loadedImages[slot.photoIndex];

    ctx.save();
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h / 2;

    if (slot.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((slot.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    if (slot.isPolaroid) {
      const borderSide = Math.round(Math.min(slot.w, slot.h) * 0.055);
      const borderBottom = Math.round(Math.min(slot.w, slot.h) * 0.19);

      // Soft studio drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.14)';
      ctx.shadowBlur = Math.round(24 * scale);
      ctx.shadowOffsetY = Math.round(10 * scale);
      ctx.fillStyle = theme.polaroidBg;
      drawRoundedRectPath(ctx, slot.x, slot.y, slot.w, slot.h, Math.round(6 * scale));
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = theme.borderColor;
      ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
      ctx.stroke();

      const innerX = slot.x + borderSide;
      const innerY = slot.y + borderSide;
      const innerW = slot.w - borderSide * 2;
      const innerH = slot.h - borderSide - borderBottom;

      ctx.save();
      drawRoundedRectPath(ctx, innerX, innerY, innerW, innerH, Math.round(2 * scale));
      ctx.clip();
      ctx.fillStyle = theme.frameBg;
      ctx.fillRect(innerX, innerY, innerW, innerH);
      if (img) {
        drawImageFitted(ctx, img, innerX, innerY, innerW, innerH, settings.fitMode);
      }
      ctx.restore();

      // Polaroid caption footer
      if (photo) {
        const label = photo.caption || photo.guestName;
        ctx.fillStyle = '#3F3F46';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `italic 500 ${Math.max(11, Math.round(22 * scale))}px "Fraunces", Georgia, serif`;
        ctx.fillText(
          label.slice(0, 28),
          slot.x + slot.w / 2,
          innerY + innerH + borderBottom / 2
        );
      }
    } else if (slot.frameNumber) {
      const labelBand = Math.round(34 * scale);
      const imgH = slot.h - labelBand;

      ctx.save();
      drawRoundedRectPath(ctx, slot.x, slot.y, slot.w, imgH, scaledRadius);
      ctx.clip();
      ctx.fillStyle = theme.frameBg;
      ctx.fillRect(slot.x, slot.y, slot.w, imgH);
      if (img) {
        drawImageFitted(ctx, img, slot.x, slot.y, slot.w, imgH, settings.fitMode);
      }
      ctx.restore();

      ctx.fillStyle = theme.subtitleColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `500 ${Math.max(10, Math.round(18 * scale))}px "JetBrains Mono", monospace`;
      ctx.fillText(slot.frameNumber, slot.x + Math.round(4 * scale), slot.y + imgH + labelBand * 0.58);

      if (photo) {
        ctx.textAlign = 'right';
        ctx.fillText(
          photo.guestName.slice(0, 18),
          slot.x + slot.w - Math.round(4 * scale),
          slot.y + imgH + labelBand * 0.58
        );
      }
    } else {
      ctx.save();
      drawRoundedRectPath(ctx, slot.x, slot.y, slot.w, slot.h, scaledRadius);
      ctx.clip();
      ctx.fillStyle = theme.frameBg;
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      if (img) {
        drawImageFitted(ctx, img, slot.x, slot.y, slot.w, slot.h, settings.fitMode);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  if (settings.layout === 'contact-sheet') {
    ctx.fillStyle = theme.subtitleColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.max(10, Math.round(18 * scale))}px "JetBrains Mono", monospace`;
    ctx.fillText(
      `SNAPWALL CONTACT SHEET  ·  ${photos.length} FRAMES`,
      scaledPadding,
      height - scaledPadding / 2 - Math.round(14 * scale)
    );
  }

  return slots;
}

export async function exportCollageBlob(
  photos: CapturedPhoto[],
  settings: CollageSettings
): Promise<Blob> {
  const offscreen = document.createElement('canvas');
  await renderCollageToCanvas(offscreen, photos, settings, 1);

  return new Promise<Blob>((resolve, reject) => {
    offscreen.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to render collage image.'));
          return;
        }
        resolve(blob);
      },
      settings.exportFormat,
      settings.exportFormat === 'image/jpeg' ? 0.94 : undefined
    );
  });
}
