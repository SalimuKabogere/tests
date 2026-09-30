import { UploadService, InMemoryFileRepository } from "./UploadService.js";

const provider = { name: "fake", async createUploadTarget({ fileRecordId }) {
  return { url: `https://example.test/${fileRecordId}`, method: "PUT", headers: {} };
}};
const service = new UploadService(new InMemoryFileRepository(), provider);
const cover = { kind: "lpoCover", name: "c.jpg", mimeType: "image/jpeg", size: 2000 };

console.log(await service.startUpload({ id: "a1", role: "Admin" }, cover));
for (const [label, user, req] of [
  ["investor uploads a cover", { id: "u1", role: "Investor" }, cover],
  ["logged out", null, cover],
  ["SVG", { id: "u1", role: "Investor" }, { ...cover, kind: "avatar", mimeType: "image/svg+xml" }],
]) {
  try { await service.startUpload(user, req); } catch (e) { console.log(`✘ ${label}: ${e.message}`); }
}