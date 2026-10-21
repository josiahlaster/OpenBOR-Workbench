import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom does not implement these browser APIs used by the app shell.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });

// jsdom's Blob/File does not implement the async text() helper used by the importer.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  (Blob.prototype as { text?: () => Promise<string> }).text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
      reader.readAsText(this);
    });
  };
}
