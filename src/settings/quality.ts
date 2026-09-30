import { QUALITY, type QualityLevel } from '../config/world';

/**
 * Quality presets (step 10): pick one from the GPU name the first time, then
 * remember the player's choice in this browser. Pure apart from storage, which
 * may be missing (private windows, blocked site data): then it just isn't kept.
 */

const KEY = 'duskwood.quality';

/** Software renderers (SwiftShader, llvmpipe) and weak integrated GPUs start low or medium. */
export function detectQuality(renderer: string): QualityLevel {
  if (/swiftshader|llvmpipe|softpipe|software/i.test(renderer)) return 'low';
  if (/intel|mali|adreno|powervr|apple gpu/i.test(renderer) && !/arc/i.test(renderer)) return 'medium';
  return 'high';
}

export function isQualityLevel(v: unknown): v is QualityLevel {
  return typeof v === 'string' && v in QUALITY;
}

export function loadQuality(): QualityLevel | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return isQualityLevel(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveQuality(level: QualityLevel): void {
  try {
    window.localStorage.setItem(KEY, level);
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
}

/** The GPU's name, from WEBGL_debug_renderer_info where the browser allows it. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}
