
import { invoke } from '../lib/tauri-mock';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WordData {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface OCRResult {
  id: string;
  captureId: string;
  text: string;
  confidence: number;
  words: WordData[];
  processingTimeMs: number;
  language: string;
}

export interface Language {
  code: string;
  name: string;
}

export interface LanguageDetection {
  language: string;
  confidence: number;
}

export interface MultiLanguageResult {
  detectedLanguages: LanguageDetection[];
  text: string;
  confidence: number;
}

/**
 * Run OCR on a full image file and persist the result.
 *
 * @param captureId - ID of the screen capture record to associate with
 * @param imagePath - Absolute path to the image on disk
 * @param language - Tesseract language code, e.g. "eng" (default "eng")
 *
 * @example
 * ```ts
 * const result = await processImage('cap-123', '/tmp/screenshot.png', 'eng');
 * console.log(result.text, result.confidence);
 * ```
 */
export async function processImage(
  captureId: string,
  imagePath: string,
  language?: string,
): Promise<OCRResult> {
  return invoke<OCRResult>('ocr_process_image', { captureId, imagePath, language });
}

/**
 * Run OCR on a rectangular region of an image.
 *
 * @param imagePath - Absolute path to the image on disk
 * @param x - Left offset of the region (pixels)
 * @param y - Top offset of the region (pixels)
 * @param width - Width of the region (pixels)
 * @param height - Height of the region (pixels)
 * @param language - Tesseract language code (default "eng")
 */
export async function processRegion(
  imagePath: string,
  x: number,
  y: number,
  width: number,
  height: number,
  language?: string,
): Promise<OCRResult> {
  return invoke<OCRResult>('ocr_process_region', { imagePath, x, y, width, height, language });
}

export async function getLanguages(): Promise<Language[]> {
  return invoke<Language[]>('ocr_get_languages');
}

export async function getResult(captureId: string): Promise<OCRResult | null> {
  return invoke<OCRResult | null>('ocr_get_result', { captureId });
}

/**
 * Run OCR and return per-word bounding boxes. Optionally preprocesses the
 * image (contrast stretch, blur) for better accuracy.
 *
 * @param imagePath - Absolute path to the image on disk
 * @param language - Tesseract language code (default "eng")
 * @param preprocess - Apply image preprocessing before OCR (default false)
 */
export async function processWithBoxes(
  imagePath: string,
  language?: string,
  preprocess?: boolean,
): Promise<OCRResult> {
  return invoke<OCRResult>('ocr_process_with_boxes', { imagePath, language, preprocess });
}

export async function detectLanguages(imagePath: string): Promise<LanguageDetection[]> {
  return invoke<LanguageDetection[]>('ocr_detect_languages', { imagePath });
}

/**
 * Run OCR with automatic language detection. The engine detects the primary
 * language first, then extracts text using that language.
 *
 * @param imagePath - Absolute path to the image on disk
 * @param preprocess - Apply image preprocessing before OCR (default false)
 */
export async function processMultiLanguage(
  imagePath: string,
  preprocess?: boolean,
): Promise<MultiLanguageResult> {
  return invoke<MultiLanguageResult>('ocr_process_multi_language', { imagePath, preprocess });
}

/**
 * Preprocess an image for better OCR accuracy (contrast stretch + blur).
 * Returns the path to the preprocessed image.
 *
 * @param imagePath - Absolute path to the source image
 * @param outputPath - Optional path to write the result (otherwise a temp file is used)
 */
export async function preprocessImage(imagePath: string, outputPath?: string): Promise<string> {
  return invoke<string>('ocr_preprocess_image', { imagePath, outputPath });
}
