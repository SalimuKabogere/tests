import { UploadService, InMemoryFileRepository } from "./UploadService.js";
import { MockStorageProvider } from "./storageProviders.js";

const storage = await new MockStorageProvider().start();
const service = new UploadService(new InMemoryFileRepository(), storage);

// Step 1: ask for an upload link
const { fileRecordId, uploadTarget } = await service.startUpload(
  { id: "u1", role: "Investor" },
  { kind: "paymentProof", name: "receipt.pdf", mimeType: "application/pdf", size: 5 }
);
console.log("1. got upload link:", uploadTarget.url);

// Step 2: send the bytes straight to storage
const res = await fetch(uploadTarget.url, { method: uploadTarget.method, body: "hello" });
console.log("2. storage answered:", res.status, await res.text());
console.log("   stored:", storage.getStored(fileRecordId));

// The same link can't be used twice
const again = await fetch(uploadTarget.url, { method: "PUT", body: "hello" });
console.log("   same link again:", again.status, await again.text());

await storage.stop();