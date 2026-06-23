import sharp from "sharp";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_DIMENSION = 1568; // Maximum long edge size
const JPEG_QUALITY = 82;

// ============================================================================
// IMAGE CACHE
// ============================================================================

interface CachedImage {
  base64: string;
  sha1: string;
  width: number;
  height: number;
  sizeBytes: number;
}

const imageCache = new Map<string, CachedImage>();

// ============================================================================
// IMAGE PROCESSING
// ============================================================================

/**
 * Load and process an image:
 * - Downscale to ≤1568px on long edge
 * - Convert to JPEG with quality 82
 * - Return base64 and SHA1 hash
 */
export async function imageBlock(imagePath: string): Promise<{
  source: {
    type: "base64";
    media_type: "image/jpeg";
    data: string;
  };
  imageId: string;
  sha1: string;
  dimensions: {
    width: number;
    height: number;
  };
}> {
  // Check cache first
  const cacheKey = imagePath;
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey)!;
    return {
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: cached.base64,
      },
      imageId: extractImageId(imagePath),
      sha1: cached.sha1,
      dimensions: {
        width: cached.width,
        height: cached.height,
      },
    };
  }

  // Load image from disk
  const imageBuffer = await fs.readFile(imagePath);

  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot determine dimensions for ${imagePath}`);
  }

  // Downscale if necessary
  let processedBuffer: Buffer;
  let finalWidth = metadata.width;
  let finalHeight = metadata.height;

  const maxDim = Math.max(metadata.width, metadata.height);
  if (maxDim > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / maxDim;
    finalWidth = Math.round(metadata.width * scale);
    finalHeight = Math.round(metadata.height * scale);

    processedBuffer = await sharp(imageBuffer)
      .resize(finalWidth, finalHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } else {
    processedBuffer = await sharp(imageBuffer)
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  }

  // Calculate SHA1 hash
  const sha1 = createHash("sha1").update(processedBuffer).digest("hex");

  // Convert to base64
  const base64 = processedBuffer.toString("base64");

  // Cache result
  imageCache.set(cacheKey, {
    base64,
    sha1,
    width: finalWidth,
    height: finalHeight,
    sizeBytes: processedBuffer.length,
  });

  return {
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: base64,
    },
    imageId: extractImageId(imagePath),
    sha1,
    dimensions: {
      width: finalWidth,
      height: finalHeight,
    },
  };
}

/**
 * Extract image ID from file path (filename without extension)
 */
export function extractImageId(imagePath: string): string {
  const filename = path.basename(imagePath);
  return filename.split(".")[0];
}

/**
 * Check if an image file exists
 */
export async function imageExists(imagePath: string): Promise<boolean> {
  try {
    await fs.access(imagePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get image statistics from cache
 */
export function getImageStats() {
  let totalBytes = 0;
  for (const cached of imageCache.values()) {
    totalBytes += cached.sizeBytes;
  }

  return {
    cachedImages: imageCache.size,
    totalBytes,
    totalMB: (totalBytes / 1024 / 1024).toFixed(2),
  };
}

/**
 * Clear image cache
 */
export function clearImageCache() {
  imageCache.clear();
}

/**
 * Convert image paths array to image blocks for API call
 */
export async function imagesToBlocks(
  imagePaths: string[]
): Promise<{
  source: {
    type: "base64";
    media_type: "image/jpeg";
    data: string;
  };
  imageId: string;
  sha1: string;
  dimensions: {
    width: number;
    height: number;
  };
}[]> {
  const blocks = [];

  for (const imagePath of imagePaths) {
    const block = await imageBlock(imagePath);
    blocks.push(block);
  }

  // Deduplicate by SHA1 hash
  const uniqueBlocks = new Map<string, (typeof blocks)[0]>();
  for (const block of blocks) {
    if (!uniqueBlocks.has(block.sha1)) {
      uniqueBlocks.set(block.sha1, block);
    }
  }

  return Array.from(uniqueBlocks.values());
}

/**
 * Get deduplication stats
 */
export function getDeduplicationStats(
  originalCount: number,
  deduplicatedCount: number
) {
  return {
    originalCount,
    deduplicatedCount,
    duplicatesRemoved: originalCount - deduplicatedCount,
    savedPercent: ((1 - deduplicatedCount / originalCount) * 100).toFixed(1),
  };
}
