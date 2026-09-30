import { createSign, randomUUID } from "node:crypto";
import { createServer } from "node:http";
 
export class StorageProvider {
  get name() {
    throw new Error(`${this.constructor.name} must define name`);
  }
  async createUploadTarget(input) {
    throw new Error(`${this.constructor.name} must implement createUploadTarget`);
  }
}

const b64url = (value) => Buffer.from(value).toString("base64url");
 
export class GoogleDriveProvider extends StorageProvider {
  static SESSION_URL =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true";
  static TOKEN_URL = "https://oauth2.googleapis.com/token";
 
  #credentials;
  #folderIds;
  #origin;
  #token = null;
  #tokenExpiresAt = 0;
 
  /**
   * Defaults come from env: GOOGLE_SERVICE_ACCOUNT_JSON, DRIVE_FOLDER_IDS, APP_ORIGIN.
   * @param {{ credentials?: object, folderIds?: Record<string,string>, origin?: string }} [options]
   */
  constructor({ credentials, folderIds, origin } = {}) {
    super();
    this.#credentials = credentials ?? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "null");
    this.#folderIds = folderIds ?? JSON.parse(process.env.DRIVE_FOLDER_IDS ?? "{}");
    this.#origin = origin ?? process.env.APP_ORIGIN; // lets the browser PUT pass CORS
    if (!this.#credentials?.client_email || !this.#credentials?.private_key) {
      throw new Error("GoogleDriveProvider: missing service account credentials");
    }
  }
 
  get name() {
    return "googleDrive";
  }
 
  async createUploadTarget({ fileRecordId, folder, name, mimeType, size }) {
    const parent = this.#folderIds[folder];
    if (!parent) throw new Error(`No Drive folder configured for "${folder}"`);
 
    const res = await fetch(GoogleDriveProvider.SESSION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.#getAccessToken()}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(size),
        ...(this.#origin ? { Origin: this.#origin } : {}),
      },
      body: JSON.stringify({
        name: `${fileRecordId}-${name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 150)}`,
        parents: [parent],
        appProperties: { fileRecordId }, // the tag step 3 checks
      }),
    });
    if (!res.ok) throw new Error(`Drive session failed (${res.status}): ${await res.text()}`);
 
    const url = res.headers.get("location");
    if (!url) throw new Error("Drive did not return a session URL");
    return { url, method: "PUT", headers: {} };
  }
 
  /** Service-account sign-in, reused until 5 minutes before it expires. */
  async #getAccessToken() {
    if (this.#token && Date.now() < this.#tokenExpiresAt - 5 * 60_000) return this.#token;
 
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(JSON.stringify({
      iss: this.#credentials.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: GoogleDriveProvider.TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }));
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${claims}`)
      .sign(this.#credentials.private_key, "base64url");
 
    const res = await fetch(GoogleDriveProvider.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${await res.text()}`);
 
    const { access_token, expires_in } = await res.json();
    this.#token = access_token;
    this.#tokenExpiresAt = Date.now() + expires_in * 1000;
    return access_token;
  }
}
 
// mock storage
export class MockStorageProvider extends StorageProvider {
  #port;
  #server = null;
  #sessions = new Map(); 
  #stored = new Map(); 
 
  constructor({ port = 4455 } = {}) {
    super();
    this.#port = port;
  }
 
  get name() {
    return "mock";
  }
 
  async start() {
    this.#server = createServer((req, res) => this.#handle(req, res));
    await new Promise((resolve) => this.#server.listen(this.#port, resolve));
    this.#port = this.#server.address().port;
    return this;
  }
 
  async stop() {
    await new Promise((resolve) => this.#server?.close(resolve));
    this.#server = null;
  }
 
  async createUploadTarget({ fileRecordId, folder, name, mimeType, size }) {
    if (!this.#server) throw new Error("MockStorageProvider: call start() first");
    const token = randomUUID();
    this.#sessions.set(token, { fileRecordId, folder, name, mimeType, size });
    return { url: `http://localhost:${this.#port}/upload/${token}`, method: "PUT", headers: {} };
  }
 
  /** What the mock received for a file (for the demo and tests). */
  getStored(fileRecordId) {
    return this.#stored.get(fileRecordId) ?? null;
  }
 
  #handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
 
    const token = req.url.match(/^\/upload\/([\w-]+)$/)?.[1];
    const session = token && this.#sessions.get(token);
    if (!session) return res.writeHead(404).end("Unknown or used upload URL");
    if (req.method !== "PUT") return res.writeHead(405).end("Use PUT");
    this.#sessions.delete(token); // one file per URL, like Drive
 
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > session.size) {
        res.writeHead(400).end("More bytes than declared");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (received !== session.size) return res.writeHead(400).end("Size does not match");
      const storageKey = `${session.folder}/${session.fileRecordId}`;
      this.#stored.set(session.fileRecordId, { ...session, storageKey, bytes: Buffer.concat(chunks) });
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ storageKey }));
    });
  }
}
 
