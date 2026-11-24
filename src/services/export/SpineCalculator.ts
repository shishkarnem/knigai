/**
 * Amazon KDP Spine and Cover Dimension Calculator for A5 Books
 */

export interface SpineSpecs {
  pageCount: number;
  paperType: 'cream' | 'white';
  spineWidthMm: number;
  totalWidthMm: number;
  totalHeightMm: number;
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
}

export function computeCoverSpecs(pageCount: number, paperType: 'cream' | 'white'): SpineSpecs {
  const trimWidthMm = 148; // A5 width
  const trimHeightMm = 210; // A5 height
  const bleedMm = 3.2; // Amazon KDP bleed

  // Amazon KDP page thickness factors:
  // White paper: 0.002252 in = 0.0572 mm per page
  // Cream paper: 0.0025 in = 0.0635 mm per page
  const thicknessPerLeaf = paperType === 'cream' ? 0.0635 : 0.0572;
  const spineWidthMm = Math.max(6.0, parseFloat((pageCount * thicknessPerLeaf).toFixed(2)));

  const totalWidthMm = parseFloat((bleedMm * 2 + trimWidthMm * 2 + spineWidthMm).toFixed(2));
  const totalHeightMm = parseFloat((bleedMm * 2 + trimHeightMm).toFixed(2));

  return {
    pageCount,
    paperType,
    spineWidthMm,
    totalWidthMm,
    totalHeightMm,
    trimWidthMm,
    trimHeightMm,
    bleedMm,
  };
}
