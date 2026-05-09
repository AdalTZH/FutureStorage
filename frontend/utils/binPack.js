/**
 * First-Fit Decreasing bin-packing for 3D items into a storage unit.
 * Returns placement positions for each item.
 */

/**
 * @param {Array<{id: string, w: number, h: number, d: number, label: string}>} items
 * @param {{w: number, h: number, d: number}} container - storage unit dimensions in meters
 * @returns {Array<{id: string, x: number, y: number, z: number, w: number, h: number, d: number, label: string, fits: boolean}>}
 */
export function packItems(items, container) {
  // Sort by volume descending (first-fit decreasing)
  const sorted = [...items].sort((a, b) => (b.w * b.h * b.d) - (a.w * a.h * a.d));

  const placed = [];
  // Simple shelf-based packing: fill along X, then Z, then Y (upward)
  let curX = 0;
  let curY = 0;
  let curZ = 0;
  let rowMaxH = 0;  // tallest item in current row
  let layerMaxD = 0; // deepest item in current layer

  for (const item of sorted) {
    // Try to place along X axis
    if (curX + item.w <= container.w) {
      placed.push({ ...item, x: curX, y: curY, z: curZ, fits: true });
      curX += item.w + 0.02; // 2cm gap
      rowMaxH = Math.max(rowMaxH, item.h);
      layerMaxD = Math.max(layerMaxD, item.d);
    }
    // Move to next row (along Z)
    else if (curZ + layerMaxD + item.d <= container.d) {
      curX = 0;
      curZ += layerMaxD + 0.02;
      layerMaxD = item.d;
      placed.push({ ...item, x: curX, y: curY, z: curZ, fits: true });
      curX += item.w + 0.02;
      rowMaxH = Math.max(rowMaxH, item.h);
    }
    // Move to next layer (upward along Y)
    else if (curY + rowMaxH + item.h <= container.h) {
      curX = 0;
      curY += rowMaxH + 0.02;
      curZ = 0;
      rowMaxH = item.h;
      layerMaxD = item.d;
      placed.push({ ...item, x: curX, y: curY, z: curZ, fits: true });
      curX += item.w + 0.02;
    }
    // Doesn't fit
    else {
      placed.push({ ...item, x: 0, y: container.h + 0.1, z: 0, fits: false });
    }
  }

  return placed;
}

/**
 * Convert available m³ into approximate container dimensions (assume 2:1:1.5 ratio)
 */
export function volumeToContainer(availableM3) {
  // Typical storage unit proportions: wider than deep, moderate height
  // w : h : d = 2 : 1.5 : 1
  const ratio_w = 2, ratio_h = 1.5, ratio_d = 1;
  const scale = Math.cbrt(availableM3 / (ratio_w * ratio_h * ratio_d));
  return {
    w: +(ratio_w * scale).toFixed(2),
    h: +(ratio_h * scale).toFixed(2),
    d: +(ratio_d * scale).toFixed(2),
  };
}
