/**
 * isomorphic-git's browser build expects a global Buffer in some code paths, per the
 * official bundler quick start. Assign it once. This module must be imported before
 * any git command runs.
 */
import { Buffer } from 'buffer';

declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = Buffer;
}

export {};
