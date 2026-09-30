/*
storageProviders.js: where the file bytes go.
The only file that knows about Google Drive. Node only.

- StorageProvider:      the contract every storage must follow
- MockStorageProvider:  a tiny local server, for the POC (no accounts needed)
- GoogleDriveProvider:  the real Google Drive (Shared Drive + service account)
*/

import { createServer } from "node:http";
import { createSign, randomUUID } from "node:crypto";

// ---------- Contract ----------

export class StorageProvider {
  name = "base";

  // Returns { url, method, headers }: a link that accepts exactly one file.
  async createUploadTarget({ fileRecordId, folder, name, mimeType, size }) {
    throw new Error("createUploadTarget not implemented");
  }
}

// ---------- Mock storage ----------

export class MockStorageProvider extends StorageProvider {
  name = "mock";
  #server = null;
  #port;
  #sessions = new Map(); // one-time upload links: token -> file info
  #stored = new Map();   // files received: fileRecordId -> { storageKey, bytes }

  constructor(port = 4455) {
    super();
    this.#port = port;
  }

  async start() {
    this.#server = createServer((req, res) => this.#handleUpload(req, res));
    await new Promise((resolve) => this.#server.listen(this.#port, resolve));
    return this;
  }

  async stop() {
    await new Promise((resolve) => this.#server.close(resolve));
  }

  async createUploadTarget({ fileRecordId, folder, size }) {
    const token = randomUUID();
    this.#sessions.set(token, { fileRecordId, folder, size });
    return { url: `http://localhost:${this.#port}/upload/${token}`, method: "PUT", headers: {} };
  }

  getStored(fileRecordId) {
    return this.#stored.get(fileRecordId) ?? null;
  }

  #handleUpload(req, res) {
    // Let a browser page on another port call this server (CORS)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.writeHead(204).end();

    const token = req.url.split("/upload/")[1];
    const session = this.#sessions.get(token);
    if (!session || req.method !== "PUT") return res.writeHead(404).end("Unknown or used upload link");
    this.#sessions.delete(token); // one file per link

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== session.size) return res.writeHead(400).end("Size does not match");

      const storageKey = `${session.folder}/${session.fileRecordId}`;
      this.#stored.set(session.fileRecordId, { storageKey, bytes });
      res.writeHead(200).end(JSON.stringify({ storageKey }));
    });
  }
}

// ---------- Google Drive ----------

export class GoogleDriveProvider extends StorageProvider {
  name = "googleDrive";
  #credentials;
  #folderIds;
  #token = null;
  #tokenExpiresAt = 0;

  constructor(credentials, folderIds) {
    super();
    this.#credentials = credentials; // the service account JSON key
    this.#folderIds = folderIds;     // { "lpo-covers": "<drive folder id>", ... }
  }

  async createUploadTarget({ fileRecordId, folder, name, mimeType, size }) {
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this.#getAccessToken()}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({
          name: `${fileRecordId}-${name}`,
          parents: [this.#folderIds[folder]],
          appProperties: { fileRecordId }, // tag that step 3 checks
        }),
      }
    );
    if (!res.ok) throw new Error(`Drive error ${res.status}: ${await res.text()}`);

    return { url: res.headers.get("location"), method: "PUT", headers: {} };
  }

  // Sign in as the service account; reuse the token until it nearly expires.
  async #getAccessToken() {
    if (this.#token && Date.now() < this.#tokenExpiresAt - 60_000) return this.#token;

    const now = Math.floor(Date.now() / 1000);
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsigned =
      encode({ alg: "RS256", typ: "JWT" }) + "." +
      encode({
        iss: this.#credentials.client_email,
        scope: "https://www.googleapis.com/auth/drive",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      });
    const signature = createSign("RSA-SHA256").update(unsigned).sign(this.#credentials.private_key, "base64url");

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`Google sign-in failed ${res.status}: ${await res.text()}`);

    const { access_token, expires_in } = await res.json();
    this.#token = access_token;
    this.#tokenExpiresAt = Date.now() + expires_in * 1000;
    return access_token;
  }
}