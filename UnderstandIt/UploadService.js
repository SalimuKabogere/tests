/*
Decides whether an upload is allowed, records it, and asks storage where the file should go.

- Rules: which files are allowed (type, size, folder, level
- UploadError: errors that are safe to show the user
- Repository: where file records are saved (in memory for the POC
- UploadPolicy: who may upload
- UploadService: startUpload(), which ties it all together
*/

// Rules
const MB = 1024 * 1024;
const IMAGES = ["image/png", "image/jpeg", "image/webp"];
const PDF = ["application/pdf"];

export const FILE_RULES = {
  lpoCover: {
    folder: "lpo-covers",
    maxSize: 10 * MB,
    allowedTypes: IMAGES,
    level: "open",
    adminOnly: true,
  },
  avatar: {
    folder: "avatars",
    maxSize: 5 * MB,
    allowedTypes: IMAGES,
    level: "open",
    adminOnly: false,
  },
  paymentProof: {
    folder: "payment-proofs",
    maxSize: 10 * MB,
    allowedTypes: [...IMAGES, ...PDF],
    level: "restricted",
    adminOnly: false,
  },
};

// custom error class for upload errors that are safe to show the user
export class UploadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "UploadError";
  }
}

// validation function for file uploads
export function checkFile(kind, { size, type }) {
  const rule = FILE_RULES[kind];
  if (!rule) throw new UploadError("Unknown file kind");
  if (!rule.allowedTypes.includes(type))
    throw new UploadError("File type not allowed");
  if (!(size > 0)) throw new UploadError("File is empty");
  if (size > rule.maxSize)
    throw new UploadError(`File too large. Maximum is ${rule.maxSize / MB} MB`);
}

// repository interface and contract for file records
export class FileRepository {
  async createFile(data) {
    throw new Error("createFile not implemented");
  }
  async updateFile(id, patch) {
    throw new Error("updateFile not implemented");
  }
  async getFile(id) {
    throw new Error("getFile not implemented");
  }
}

// in-memory implementation of the file repository for testing and development
export class InMemoryFileRepository extends FileRepository {
  #files = new Map();

  async createFile(data) {
    const file = { id: crypto.randomUUID(), createdAt: Date.now(), ...data };
    this.#files.set(file.id, file);
    return { ...file };
  }

  async updateFile(id, patch) {
    const file = this.#files.get(id);
    if (!file) throw new Error(`File ${id} not found`);
    Object.assign(file, patch);
    return { ...file };
  }

  async getFile(id) {
    const file = this.#files.get(id);
    return file ? { ...file } : null;
  }
}


// policy: who is allowed to upload what
export class UploadPolicy {
  check(user, kind) {
    if (!user) throw new UploadError("Please sign in to upload");
    if (FILE_RULES[kind].adminOnly && user.role !== "Admin") {
      throw new UploadError("You are not allowed to upload this file");
    }
  }
}

//orchestrator service
export class UploadService {
  constructor(repository, provider, policy = new UploadPolicy()) {
    this.repository = repository;
    this.provider = provider;
    this.policy = policy;
  }

  async startUpload(user, { kind, relatedId, name, mimeType, size }) {
    // check if the file is allowed
    checkFile(kind, { size, type: mimeType });

    // check if the user is allowed to upload this kind of file
    this.policy.check(user, kind);

    // record the file in the repository with status uploading
    const fileRecord = await this.repository.createFile({
      kind,
      relatedId: relatedId ?? null,
      name,
      mimeType,
      size,
      level: FILE_RULES[kind].level,
      status: "uploading",
      provider: this.provider.name,
      storageKey: null, 
      uploadedBy: user.id,
    });

    // Ask storage for a one-file upload link and roll back the record if it fails
    try {
      const target = await this.provider.createUploadTarget({
        fileRecordId: fileRecord.id,
        folder: FILE_RULES[kind].folder,
        name,
        mimeType,
        size,
      });
      return { fileRecordId: fileRecord.id, uploadTarget: target };
    } catch (error) {
      await this.repository.updateFile(fileRecord.id, { status: "deleted" });
      throw new UploadError("Could not start the upload. Please try again.", {
        cause: error,
      });
    }
  }
}
