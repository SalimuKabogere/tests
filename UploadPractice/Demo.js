import { UploadService, InMemoryFileRepository } from "./uploadService.js";
import { GoogleDriveProvider, MockStorageProvider } from "./storageProviders.js";
import { FileUploadClient } from "./uploadClient.js";
 
const useDrive = process.env.STORAGE === "drive";
const provider = useDrive ? new GoogleDriveProvider() : await new MockStorageProvider().start();
 
// Fake app data, standing in for Convex.
const repository = new InMemoryFileRepository()
  .seed("invoices", { id: "inv45", investorId: "u1", status: "Pending Payment" });
 
const service = new UploadService({ repository, provider });
 
// In the app, startUpload is the Convex action and the user comes from the login.
const clientFor = (user) =>
  new FileUploadClient({ startUpload: (args) => service.startUpload(user, args) });
 
const alice = { id: "u1", role: "investor" };
const bob = { id: "u2", role: "investor" };
const receipt = new File([Buffer.alloc(200_000, 1)], "receipt.jpg", { type: "image/jpeg" });
 
async function run(title, fn) {
  try {
    console.log(`\n✔ ${title}\n`, await fn());
  } catch (err) {
    console.log(`\n✘ ${title}\n  ${err.name}: ${err.message}${err.cause ? `\n  cause: ${err.cause.message}` : ""}`);
  }
}
 
await run("Alice uploads proof for her own invoice", async () => {
  const fileRecordId = await clientFor(alice).upload(receipt, {
    kind: "paymentProof",
    relatedId: "inv45",
    onProgress: (p) => console.log(`  progress ${Math.round(p * 100)}%`),
  });
  const record = await repository.getFile(fileRecordId);
  const stored = provider.getStored?.(fileRecordId);
  return {
    record,
    stored: stored ? { storageKey: stored.storageKey, bytes: stored.bytes.length } : "(check Drive)",
  };
});
 
await run("Bob tries to upload proof for Alice's invoice", () =>
  clientFor(bob).upload(receipt, { kind: "paymentProof", relatedId: "inv45" })
);
 
await run("Alice tries to upload an SVG", () =>
  clientFor(alice).upload(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }), {
    kind: "paymentProof",
    relatedId: "inv45",
  })
);
 
await run("Someone sends more bytes than they declared", async () => {
  const { target } = await service.startUpload(alice, {
    kind: "avatar", name: "me.jpg", mimeType: "image/jpeg", size: 10,
  });
  await FileUploadClient.sendBytes(new File([Buffer.alloc(5000)], "me.jpg"), target);
});
 
await provider.stop?.();
 
