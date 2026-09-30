import { checkFile, UploadError } from "./uploadService.js";
 
export class FileUploadClient {
  #startUpload;
 
  /**
   * @param {{ startUpload: (args: { kind, relatedId, name, mimeType, size }) =>
   *   Promise<{ fileRecordId: string, target: { url, method, headers } }> }} deps
   *   In the app: the Convex action. In the demo: UploadService directly.
   */
  constructor({ startUpload }) {
    this.#startUpload = startUpload;
  }
 
  /**
   * @param {File} file
   * @param {{ kind: string, relatedId?: string, onProgress?: (fraction: number) => void, signal?: AbortSignal }} options
   * @returns {Promise<string>} fileRecordId
   */
  async upload(file, { kind, relatedId, onProgress, signal } = {}) {
    // Early check in the browser; the server checks again.
    const problem = checkFile(kind, { type: file.type, size: file.size });
    if (problem) throw new UploadError(problem);
 
    // Step 1: ask for permission and an upload target.
    const { fileRecordId, target } = await this.#startUpload({
      kind,
      relatedId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
    });
 
    // Step 2: send the bytes straight to storage.
    await FileUploadClient.sendBytes(file, target, { onProgress, signal });
 
    // Step 3 (finishUpload) will go here.
    return fileRecordId;
  }
 
  /** Sends a file to any { url, method, headers } target. */
  static sendBytes(file, target, { onProgress, signal } = {}) {
    return typeof XMLHttpRequest !== "undefined"
      ? FileUploadClient.#sendWithXhr(file, target, onProgress, signal)
      : FileUploadClient.#sendWithFetch(file, target, onProgress, signal);
  }
 
  // Browser: XHR is the only way to get upload progress.
  static #sendWithXhr(file, target, onProgress, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("Upload cancelled", "AbortError"));
 
      const xhr = new XMLHttpRequest();
      xhr.open(target.method, target.url);
      for (const [key, value] of Object.entries(target.headers ?? {})) xhr.setRequestHeader(key, value);
 
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve();
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(file);
    });
  }
 
  // Node / environments without XHR: no progress events, only 0 and 1.
  static async #sendWithFetch(file, target, onProgress, signal) {
    onProgress?.(0);
    const res = await fetch(target.url, {
      method: target.method,
      headers: target.headers,
      body: file,
      signal,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    onProgress?.(1);
  }
}
 
