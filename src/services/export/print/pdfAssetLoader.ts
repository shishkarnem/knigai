import { jsPDF } from 'jspdf';
import { ReadingFontId, READING_FONTS } from '../../../components/reader/ReaderThemeSelector';
import { DpiCheckWarning } from './printTypes';

export interface RegisteredPdfFonts {
  bodyFamily: string;
  headingFamily: string;
  hasBold: boolean;
  hasItalic: boolean;
  hasBoldItalic: boolean;
}

interface CachedFontPayload {
  base64: string;
}

const clientFontBase64Cache = new Map<string, CachedFontPayload>();
const loadedImageCache = new Map<string, HTMLImageElement>();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function fetchFontBase64(url: string): Promise<string | null> {
  if (clientFontBase64Cache.has(url)) {
    return clientFontBase64Cache.get(url)!.base64;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 8000) return null;
    const b64 = arrayBufferToBase64(buf);
    clientFontBase64Cache.set(url, { base64: b64 });
    return b64;
  } catch {
    return null;
  }
}

export async function registerCyrillicPdfFonts(
  doc: jsPDF,
  preferredBodyFontId: ReadingFontId = 'pt-serif'
): Promise<RegisteredPdfFonts> {
  // Always load bundled local Cyrillic PT Serif + Rubik Marker Hatch first (guaranteed offline/zero-fail)
  const [ptReg, ptBold, ptItalic, ptBoldItalic, rubikReg] = await Promise.all([
    fetchFontBase64('/fonts/PTSerif-Regular.ttf'),
    fetchFontBase64('/fonts/PTSerif-Bold.ttf'),
    fetchFontBase64('/fonts/PTSerif-Italic.ttf'),
    fetchFontBase64('/fonts/PTSerif-BoldItalic.ttf'),
    fetchFontBase64('/fonts/RubikMarkerHatch-Regular.ttf'),
  ]);

  let bodyFamily = 'helvetica';
  let hasBold = false;
  let hasItalic = false;
  let hasBoldItalic = false;

  if (ptReg) {
    doc.addFileToVFS('PTSerif-Regular.ttf', ptReg);
    doc.addFont('PTSerif-Regular.ttf', 'PTSerif', 'normal');
    bodyFamily = 'PTSerif';

    if (ptBold) {
      doc.addFileToVFS('PTSerif-Bold.ttf', ptBold);
      doc.addFont('PTSerif-Bold.ttf', 'PTSerif', 'bold');
      hasBold = true;
    }
    if (ptItalic) {
      doc.addFileToVFS('PTSerif-Italic.ttf', ptItalic);
      doc.addFont('PTSerif-Italic.ttf', 'PTSerif', 'italic');
      hasItalic = true;
    }
    if (ptBoldItalic) {
      doc.addFileToVFS('PTSerif-BoldItalic.ttf', ptBoldItalic);
      doc.addFont('PTSerif-BoldItalic.ttf', 'PTSerif', 'bolditalic');
      hasBoldItalic = true;
    }
  }

  let headingFamily = bodyFamily;
  if (rubikReg) {
    doc.addFileToVFS('RubikMarkerHatch-Regular.ttf', rubikReg);
    doc.addFont('RubikMarkerHatch-Regular.ttf', 'RubikMarkerHatch', 'normal');
    headingFamily = 'RubikMarkerHatch';
  }

  // If user chose another reading font (Merriweather, EB Garamond, Lora, Inter, etc.), load via server TTF proxy
  if (preferredBodyFontId !== 'pt-serif' && READING_FONTS[preferredBodyFontId]) {
    const gfName = READING_FONTS[preferredBodyFontId].name;
    const customName = `Custom_${preferredBodyFontId}`;
    const [cReg, cBold, cItalic] = await Promise.all([
      fetchFontBase64(`/api/export/font-ttf?family=${encodeURIComponent(gfName)}&weight=400&italic=0`),
      fetchFontBase64(`/api/export/font-ttf?family=${encodeURIComponent(gfName)}&weight=700&italic=0`),
      fetchFontBase64(`/api/export/font-ttf?family=${encodeURIComponent(gfName)}&weight=400&italic=1`),
    ]);

    if (cReg) {
      doc.addFileToVFS(`${customName}-Regular.ttf`, cReg);
      doc.addFont(`${customName}-Regular.ttf`, customName, 'normal');
      bodyFamily = customName;
      hasBold = false;
      hasItalic = false;
      hasBoldItalic = false;

      if (cBold) {
        doc.addFileToVFS(`${customName}-Bold.ttf`, cBold);
        doc.addFont(`${customName}-Bold.ttf`, customName, 'bold');
        hasBold = true;
      } else {
        doc.addFont(`${customName}-Regular.ttf`, customName, 'bold');
      }
      if (cItalic) {
        doc.addFileToVFS(`${customName}-Italic.ttf`, cItalic);
        doc.addFont(`${customName}-Italic.ttf`, customName, 'italic');
        hasItalic = true;
      } else {
        doc.addFont(`${customName}-Regular.ttf`, customName, 'italic');
      }
      if (cBold || cItalic) {
        doc.addFileToVFS(`${customName}-BI.ttf`, cBold || cItalic || cReg);
        doc.addFont(`${customName}-BI.ttf`, customName, 'bolditalic');
        hasBoldItalic = true;
      }
    }
  }

  if (bodyFamily !== 'helvetica') {
    doc.setFont(bodyFamily, 'normal');
  }

  return { bodyFamily, headingFamily, hasBold, hasItalic, hasBoldItalic };
}

export async function loadCorsSafeImage(rawUrl: string): Promise<HTMLImageElement | null> {
  if (!rawUrl || typeof window === 'undefined') return null;
  const trimmed = rawUrl.trim();
  if (loadedImageCache.has(trimmed)) {
    return loadedImageCache.get(trimmed)!;
  }

  const tryLoad = (src: string, useCors = true): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });

  const isRelativeOrSameOrigin =
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith(window.location.origin);

  try {
    const img = await tryLoad(trimmed, !trimmed.startsWith('data:'));
    // Test canvas read access
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 2;
    testCanvas.height = 2;
    const tCtx = testCanvas.getContext('2d');
    if (tCtx) {
      tCtx.drawImage(img, 0, 0, 2, 2);
      testCanvas.toDataURL('image/png');
    }
    loadedImageCache.set(trimmed, img);
    return img;
  } catch {
    if (isRelativeOrSameOrigin) return null;
    // Fallback through same-origin CORS proxy
    try {
      const proxyUrl = `/api/export/image-proxy?url=${encodeURIComponent(trimmed)}`;
      const proxiedImg = await tryLoad(proxyUrl, true);
      loadedImageCache.set(trimmed, proxiedImg);
      return proxiedImg;
    } catch {
      return null;
    }
  }
}

export interface RenderedImageResult {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  naturalWidth: number;
  naturalHeight: number;
  renderedWidthPx: number;
  renderedHeightPx: number;
  effectiveDpi: number;
}

export async function renderImageAt300Dpi(params: {
  url: string;
  targetWidthMm: number;
  targetHeightMm?: number;
  fitMode?: 'cover' | 'contain';
  posX?: number;
  posY?: number;
  zoom?: number;
  filter?: 'normal' | 'grayscale' | 'contrast' | 'sepia' | 'invert';
  colorTint?: string;
  darkOverlayAlpha?: number;
  transparent?: boolean;
  opacity?: number;
  rotationDeg?: number;
  flipX?: boolean;
}): Promise<RenderedImageResult | null> {
  const img = await loadCorsSafeImage(params.url);
  if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;

  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  const natAspect = natW / natH;

  const targetWidthMm = Math.max(5, params.targetWidthMm);
  const targetHeightMm = params.targetHeightMm
    ? Math.max(5, params.targetHeightMm)
    : targetWidthMm / natAspect;

  const targetDpi = 300;
  // Cap single canvas dimension at 4200px to keep browser memory safe while preserving crisp print quality
  const desiredPxW = Math.min(4200, Math.max(120, Math.round((targetWidthMm / 25.4) * targetDpi)));
  const desiredPxH = Math.min(4200, Math.max(120, Math.round((targetHeightMm / 25.4) * targetDpi)));

  const canvas = document.createElement('canvas');
  canvas.width = desiredPxW;
  canvas.height = desiredPxH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (!params.transparent) {
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, desiredPxW, desiredPxH);
  } else {
    ctx.clearRect(0, 0, desiredPxW, desiredPxH);
  }

  // Build CSS-compatible canvas filter
  const filters: string[] = [];
  if (params.filter === 'grayscale') filters.push('grayscale(100%)');
  else if (params.filter === 'contrast') filters.push('grayscale(100%) contrast(140%) brightness(95%)');
  else if (params.filter === 'sepia') filters.push('sepia(82%) contrast(106%)');
  else if (params.filter === 'invert') filters.push('invert(100%)');
  ctx.filter = filters.length > 0 ? filters.join(' ') : 'none';

  ctx.save();
  ctx.globalAlpha = params.opacity != null ? Math.max(0.05, Math.min(1, params.opacity)) : 1;

  const fitMode = params.fitMode || 'cover';
  if (params.rotationDeg || params.flipX) {
    const rad = ((params.rotationDeg || 0) * Math.PI) / 180;
    ctx.translate(desiredPxW / 2, desiredPxH / 2);
    ctx.rotate(rad);
    if (params.flipX) ctx.scale(-1, 1);
    ctx.drawImage(img, -desiredPxW / 2, -desiredPxH / 2, desiredPxW, desiredPxH);
  } else if (fitMode === 'cover') {
    const canvasAspect = desiredPxW / desiredPxH;
    const zoom = Math.max(1, (params.zoom ?? 100) / 100);
    const posX = (params.posX ?? 50) / 100;
    const posY = (params.posY ?? 50) / 100;

    let drawW = desiredPxW;
    let drawH = desiredPxH;
    if (natAspect > canvasAspect) {
      drawH = desiredPxH * zoom;
      drawW = drawH * natAspect;
    } else {
      drawW = desiredPxW * zoom;
      drawH = drawW / natAspect;
    }
    const offsetX = (desiredPxW - drawW) * posX;
    const offsetY = (desiredPxH - drawH) * posY;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  } else {
    ctx.drawImage(img, 0, 0, desiredPxW, desiredPxH);
  }
  ctx.restore();
  ctx.filter = 'none';

  if (params.colorTint) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = params.colorTint;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(0, 0, desiredPxW, desiredPxH);
    ctx.restore();
  }

  if (params.darkOverlayAlpha && params.darkOverlayAlpha > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, params.darkOverlayAlpha)})`;
    ctx.fillRect(0, 0, desiredPxW, desiredPxH);
  }

  const effectiveDpi = Math.round(
    Math.min(natW / (targetWidthMm / 25.4), natH / (targetHeightMm / 25.4))
  );

  return {
    dataUrl: params.transparent ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.94),
    format: params.transparent ? 'PNG' : 'JPEG',
    naturalWidth: natW,
    naturalHeight: natH,
    renderedWidthPx: desiredPxW,
    renderedHeightPx: desiredPxH,
    effectiveDpi,
  };
}

export function collectDpiWarningIfNeeded(
  warnings: DpiCheckWarning[],
  label: string,
  url: string,
  res: RenderedImageResult | null,
  minRecommendedDpi = 220
): void {
  if (!res) return;
  if (res.effectiveDpi < minRecommendedDpi) {
    warnings.push({
      label,
      url,
      actualDpi: res.effectiveDpi,
      recommendedDpi: 300,
      naturalWidth: res.naturalWidth,
      naturalHeight: res.naturalHeight,
    });
  }
}

// Vector EAN-13 Barcode generator for print ISBN block
const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

export function normalizeToEan13Digits(rawIsbn: string): string {
  const digitsOnly = (rawIsbn || '').replace(/\D/g, '');
  let base12 = (digitsOnly.length >= 12 ? digitsOnly.slice(0, 12) : ('978500' + digitsOnly).padEnd(12, '0')).slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(base12[i], 10) || 0;
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return base12 + String(check);
}

export function drawEan13BarcodeVector(
  doc: jsPDF,
  rawIsbn: string,
  x: number,
  y: number,
  widthMm: number,
  heightMm: number
): void {
  const digits = normalizeToEan13Digits(rawIsbn);
  const firstDigit = parseInt(digits[0], 10);
  const pattern = EAN_PARITY[firstDigit] || EAN_PARITY[0];

  let bits = '101'; // left guard
  for (let i = 1; i <= 6; i++) {
    const d = parseInt(digits[i], 10);
    bits += pattern[i - 1] === 'G' ? EAN_G[d] : EAN_L[d];
  }
  bits += '01010'; // center guard
  for (let i = 7; i <= 12; i++) {
    const d = parseInt(digits[i], 10);
    bits += EAN_R[d];
  }
  bits += '101'; // right guard

  const moduleW = widthMm / bits.length;
  const barH = Math.max(4, heightMm - 3.2);
  doc.setFillColor(0, 0, 0);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      const isGuard = i < 3 || (i >= 45 && i < 50) || i >= 92;
      doc.rect(x + i * moduleW, y, moduleW * 1.02, isGuard ? barH + 1.4 : barH, 'F');
    }
  }

  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(digits[0], x - 1.5, y + barH + 2.8);
  doc.text(digits.slice(1, 7), x + widthMm * 0.27, y + barH + 2.8, { align: 'center' });
  doc.text(digits.slice(7, 13), x + widthMm * 0.74, y + barH + 2.8, { align: 'center' });
}
