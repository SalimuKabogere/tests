const MB = 1024 * 1024;
const IMAGES = ["image/jpeg", "image/png", "image/webp"];
const PDF = ["application/pdf"];
const WORD = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const FILE_RULES = {
  lpoCover:        { folder: "lpo-covers",        types: IMAGES,                       maxBytes: 10 * MB },
  media:           { folder: "media",             types: IMAGES,                       maxBytes: 10 * MB },
  avatar:          { folder: "avatars",           types: IMAGES,                       maxBytes: 5 * MB },
  kyc:             { folder: "kyc",               types: [...IMAGES, ...PDF],          maxBytes: 10 * MB },
  paymentProof:    { folder: "payment-proofs",    types: [...IMAGES, ...PDF],          maxBytes: 10 * MB },
  lpoDocument:     { folder: "lpo-documents",     types: [...PDF, ...WORD, ...IMAGES], maxBytes: 20 * MB },
  auditorDocument: { folder: "auditor-documents", types: [...PDF, ...WORD, ...IMAGES], maxBytes: 20 * MB },
  chatAttachment:  { folder: "chat",              types: [...IMAGES, ...PDF, ...WORD], maxBytes: 20 * MB },
  cv:              { folder: "cvs",               types: [...PDF, ...WORD],            maxBytes: 8 * MB },
};

export function checkFile(kind, { type, size }) {
  const rule = FILE_RULES[kind];
  if (!rule) return "Unknown file kind.";
  if (!rule.types.includes(type)) return "This file type is not allowed here.";
  if (!(size > 0)) return "The file is empty.";
  if (size > rule.maxBytes) return `The file is too large. The maximum is ${rule.maxBytes / MB} MB.`;
  return null;
}

export class UploadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "UploadError";
  }
}

export class FileRepository {
  async createFile(data) { throw new Error("createFile not implemented"); }
  async updateFile(id, patch) { throw new Error("updateFile not implemented"); }
  async getFile(id) { throw new Error("getFile not implemented"); }
  async getRecord(table, id) { throw new Error("getRecord not implemented"); }
}
 
export class InMemoryFileRepository extends FileRepository {
  #files = new Map();
  #tables = new Map();
 
//  add fake data
  seed(table, record) {
    this.#table(table).set(record.id, record);
    return this;
  }
 
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
 
  async getRecord(table, id) {
    return this.#table(table).get(id) ?? null;
  }
 
  #table(name) {
    if (!this.#tables.has(name)) this.#tables.set(name, new Map());
    return this.#tables.get(name);
  }
}
 
// who uploads what
export class UploadPolicy {
  static isPublicLpo = (lpo) => lpo.visibility === "Public";
  static invoiceOwner = (invoice) => invoice.investorId;
  static PROOF_STATUSES = ["Pending Payment", "Rejected"];
 
  constructor(repository) {
    this.repository = repository;
  }
 
  /**
   * @param {{ id: string, role: string } | null} user
   * @returns {Promise<{ level: "open"|"loggedIn"|"restricted", links: object }>}
   */
  async check(user, kind, relatedId) {
    switch (kind) {
      case "lpoCover": {
        this.#requireRole(user, ["admin"]);
        const lpo = await this.#related("lpos", relatedId, false); // may not be saved yet
        return {
          level: lpo && UploadPolicy.isPublicLpo(lpo) ? "open" : "restricted",
          links: { lpoId: lpo?.id },
        };
      }
      case "media":
        this.#requireRole(user, ["admin"]);
        return { level: "open", links: {} };
 
      case "avatar":
        this.#requireUser(user);
        return { level: "open", links: { ownerUserId: user.id } };
 
      case "kyc":
        this.#requireUser(user);
        return { level: "restricted", links: { ownerUserId: user.id } };
 
      case "paymentProof": {
        this.#requireUser(user);
        const invoice = await this.#related("invoices", relatedId, true);
        if (UploadPolicy.invoiceOwner(invoice) !== user.id) {
          throw new UploadError("You can only upload proof for your own invoices.");
        }
        if (!UploadPolicy.PROOF_STATUSES.includes(invoice.status)) {
          throw new UploadError("This invoice is not waiting for payment proof.");
        }
        return { level: "restricted", links: { invoiceId: invoice.id, ownerUserId: user.id } };
      }
      case "lpoDocument": {
        this.#requireRole(user, ["admin"]);
        const lpo = await this.#related("lpos", relatedId, false);
        return { level: "restricted", links: { lpoId: lpo?.id } };
      }
      case "auditorDocument": {
        this.#requireRole(user, ["auditor", "admin"]);
        const lpo = await this.#related("lpos", relatedId, true);
        return {
          level: UploadPolicy.isPublicLpo(lpo) ? "open" : "restricted",
          links: { lpoId: lpo.id },
        };
      }
      case "chatAttachment":
        this.#requireRole(user, ["admin"]);
        return { level: "restricted", links: {} };
 
      case "cv":
        return { level: "restricted", links: {} };
 
      default:
        throw new UploadError("Unknown file kind.");
    }
  }
 
  #requireUser(user) {
    if (!user) throw new UploadError("Please sign in to upload.");
  }
 
  #requireRole(user, roles) {
    this.#requireUser(user);
    if (!roles.includes(user.role)) throw new UploadError("You are not allowed to upload this file.");
  }
 
  async #related(table, id, required) {
    if (!id) {
      if (required) throw new UploadError("Missing related record.");
      return null;
    }
    const record = await this.repository.getRecord(table, id);
    if (!record) throw new UploadError("Related record not found.");
    return record;
  }
}
 
// step 1
export class UploadService {
  /**
   * @param {{ repository: FileRepository, provider: import("./storageProviders.js").StorageProvider, policy?: UploadPolicy }} deps
   */
  constructor({ repository, provider, policy }) {
    this.repository = repository;
    this.provider = provider;
    this.policy = policy ?? new UploadPolicy(repository);
  }
 
  /**
   * Check the request, create the file record, and ask storage for a
   * one-file upload target.
   * @returns {Promise<{ fileRecordId: string, target: { url: string, method: string, headers: object } }>}
   */
  async startUpload(user, { kind, relatedId, name, mimeType, size }) {
    const problem = checkFile(kind, { type: mimeType, size });
    if (problem) throw new UploadError(problem);
 
    const { level, links } = await this.policy.check(user, kind, relatedId);
 
    const file = await this.repository.createFile({
      kind,
      level,
      status: "uploading",
      provider: this.provider.name,
      storageKey: null, // set in step 3
      name,
      mimeType,
      size,
      uploadedBy: user?.id ?? null,
      ...links,
    });
 
    try {
      const target = await this.provider.createUploadTarget({
        fileRecordId: file.id,
        folder: FILE_RULES[kind].folder,
        name,
        mimeType,
        size,
      });
      return { fileRecordId: file.id, target };
    } catch (err) {
      await this.repository.updateFile(file.id, { status: "deleted" });
      throw new UploadError("Could not start the upload. Please try again.", { cause: err });
    }
  }
}
 
