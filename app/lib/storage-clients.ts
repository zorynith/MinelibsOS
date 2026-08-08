import { S3Client } from "./s3-client";
import { WebdevClient } from "./webdev-client";
import { OneDriveClient } from "./onedrive-client";
import { GoogleDriveClient } from "./gdrive-client";
import { AliyunDriveClient } from "./alicloud-client";
import { BaiduYunClient } from "./baiduyun-client";

export interface StorageClientLike {
  type: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  basePath: string;
  config?: Record<string, any>;
  saving?: Record<string, any>;
}

export type StorageClient =
  | S3Client
  | WebdevClient
  | OneDriveClient
  | GoogleDriveClient
  | AliyunDriveClient
  | BaiduYunClient
  | TelegramStorageClient
  | DiscordStorageClient
  | HuggingFaceStorageClient
  | GitHubStorageClient;

export type StorageStateClient = StorageClient & {
  getStateUpdates?: () => { config?: Record<string, any>; saving?: Record<string, any> } | null;
};

function normalizePath(value: string): string {
  return String(value || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/")
    .trim();
}

function normalizePrefix(value: string): string {
  const normalized = normalizePath(value);
  return normalized ? `${normalized}/` : "";
}

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function readStateObjects(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object") {
    return {};
  }
  if (Array.isArray(value)) {
    return {};
  }
  const entries = value as Record<string, any>;
  return Object.entries(entries).reduce<Record<string, any>>((acc, [key, entry]) => {
    if (entry && typeof entry === "object") {
      acc[key] = entry;
    }
    return acc;
  }, {});
}

function normalizeTelegramApiBase(raw: unknown): string {
  if (!raw || typeof raw !== "string") {
    return "https://api.telegram.org";
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return "https://api.telegram.org";
  }
  try {
    return new URL(trimmed).toString().replace(/\/+$|\/?$/, "");
  } catch {
    return trimmed.replace(/\/+$|\/?$/, "");
  }
}

function buildTelegramBotApiUrl(apiBase: string, token: string, method: string) {
  const normalizedMethod = String(method || "").trim().replace(/^\/+/, "");
  return `${apiBase}/bot${token}/${normalizedMethod}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function buildTelegramUploadNoticeText({
  fileName,
  fileSize,
  downloadUrl,
  storagePath,
}: {
  fileName: string;
  fileSize: number;
  downloadUrl: string;
  storagePath?: string;
}) {
  const safeName = fileName || "unnamed";
  const lines = [
    "文件上传完成",
    `名称: ${safeName}`,
  ];
  // 路径紧跟在名称下面
  if (storagePath) {
    lines.push(`路径: ${storagePath}`);
  }
  lines.push(
    `大小: ${formatBytes(fileSize)}`,
    `下载链接: ${downloadUrl || "无"}`,
  );
  return lines.join("\n");
}

async function sendTelegramUploadNotice(
  botBase: string,
  token: string,
  chatId: string,
  text: string,
  replyToMessageId?: number | null
) {
  const payload: Record<string, any> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (replyToMessageId) {
    payload.reply_to_message_id = Number(replyToMessageId);
    payload.allow_sending_without_reply = true;
  }

  const url = buildTelegramBotApiUrl(botBase, token, "sendMessage");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (response.ok && json.ok) {
    return { ok: true, json };
  }
  if (replyToMessageId) {
    const retryPayload = { ...payload };
    delete retryPayload.reply_to_message_id;
    delete retryPayload.allow_sending_without_reply;
    const retryResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(retryPayload),
    });
    const retryJson = (await retryResponse.json().catch(() => ({}))) as Record<string, any>;
    return { ok: retryResponse.ok && retryJson.ok, json: retryJson };
  }
  return { ok: false, json };
}

class RegistryBackedStorageClient {
  protected readonly type: string;
  protected readonly config: Record<string, any>;
  protected readonly saving: Record<string, any>;
  protected readonly registry: Record<string, any>;

  constructor(type: string, config: Record<string, any> | undefined, saving: Record<string, any> | undefined) {
    this.type = type;
    this.config = config || {};
    this.saving = saving || {};
    this.registry = readStateObjects(this.saving.objects);
  }

  protected getState() {
    return this.registry;
  }

  getStateUpdates() {
    return {
      saving: {
        objects: this.registry,
      },
    };
  }

  protected normalizeKey(key: string): string {
    return normalizePath(key);
  }

  protected registerFile(key: string, entry: Record<string, any>): void {
    const normalizedKey = this.normalizeKey(key);
    this.registry[normalizedKey] = {
      kind: "file",
      path: normalizedKey,
      ...entry,
    };
  }

  protected registerDirectory(key: string): void {
    const normalizedKey = this.normalizeKey(key);
    this.registry[normalizedKey] = {
      kind: "directory",
      path: normalizedKey.endsWith("/") ? normalizedKey : `${normalizedKey}/`,
      size: 0,
      contentType: "application/x-directory",
      lastModified: new Date().toISOString(),
    };
  }

  protected getEntry(key: string): Record<string, any> | null {
    const normalizedKey = this.normalizeKey(key);
    return this.registry[normalizedKey] || null;
  }

  protected removeEntry(key: string): void {
    const normalizedKey = this.normalizeKey(key);
    delete this.registry[normalizedKey];
  }

  async listObjects(prefix = "", _delimiter = "/", _maxKeys = 1000): Promise<{ objects: Array<{ key: string; name: string; size: number; lastModified: string; isDirectory: boolean; etag?: string }>; prefixes: string[]; isTruncated: boolean; nextContinuationToken?: string }> {
    const basePrefix = normalizePrefix(prefix);
    const objects: Array<{ key: string; name: string; size: number; lastModified: string; isDirectory: boolean; etag?: string }> = [];
    const prefixes = new Set<string>();

    for (const [rawKey, entry] of Object.entries(this.registry)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const key = String(rawKey);
      if (entry.kind === "directory") {
        if (basePrefix && !key.startsWith(basePrefix)) {
          continue;
        }
        const relativeName = key.startsWith(basePrefix) ? key.slice(basePrefix.length).replace(/\/$/, "") : key;
        if (!relativeName) {
          continue;
        }
        // 跳过包含 "/" 的目录名，避免把子目录（如 a/b）显示在当前层级
        if (relativeName.includes("/")) {
          continue;
        }
        prefixes.add(relativeName);
        continue;
      }
      if (basePrefix && !key.startsWith(basePrefix)) {
        continue;
      }
      const relativePath = key.startsWith(basePrefix) ? key.slice(basePrefix.length) : key;
      if (!relativePath || relativePath.includes("/")) {
        continue;
      }
      objects.push({
        key,
        name: relativePath,
        size: Number(entry.size || 0),
        lastModified: String(entry.lastModified || ""),
        isDirectory: false,
        etag: entry.etag,
      });
    }

    return {
      objects: objects.sort((a, b) => a.name.localeCompare(b.name)),
      prefixes: Array.from(prefixes).sort(),
      isTruncated: false,
    };
  }

  async getSignedUrl(key: string): Promise<string> {
    const entry = this.getEntry(key);
    if (entry?.downloadUrl) {
      return entry.downloadUrl;
    }
    return "";
  }

  async headObject(key: string): Promise<{ contentLength: number; contentType: string; lastModified: string } | null> {
    const entry = this.getEntry(key);
    if (!entry) {
      return null;
    }
    return {
      contentLength: Number(entry.size || 0),
      contentType: String(entry.contentType || "application/octet-stream"),
      lastModified: String(entry.lastModified || ""),
    };
  }

  async createFolder(folderPath: string): Promise<void> {
    this.registerDirectory(folderPath);
  }

  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    const response = await this.getObject(sourceKey);
    const body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    await this.putObject(destKey, body, contentType);
  }

  async putObject(_key: string, _body: ArrayBuffer | string, _contentType?: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async getObject(_key: string): Promise<Response> {
    throw new Error("Not implemented");
  }

  async deleteObject(_key: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async initiateMultipartUpload(_key: string, _contentType: string): Promise<string> {
    throw new Error("Multipart upload is not supported by this storage backend.");
  }

  async getSignedUploadPartUrl(_key: string, _uploadId: string, _partNumber: number): Promise<string> {
    throw new Error("Multipart upload is not supported by this storage backend.");
  }

  async uploadPart(_key: string, _uploadId: string, _partNumber: number, _body: ReadableStream | ArrayBuffer, _contentLength?: number): Promise<string> {
    throw new Error("Multipart upload is not supported by this storage backend.");
  }

  async completeMultipartUpload(_key: string, _uploadId: string, _parts: Array<{ partNumber: number; etag: string }>): Promise<void> {
    throw new Error("Multipart upload is not supported by this storage backend.");
  }

  async abortMultipartUpload(_key: string, _uploadId: string): Promise<void> {
    throw new Error("Multipart upload is not supported by this storage backend.");
  }
}

export class TelegramStorageClient extends RegistryBackedStorageClient {
  constructor(config: Record<string, any> | undefined, saving?: Record<string, any>) {
    super("telegram", config, saving);
  }

  private getBotBase(): string {
    return normalizeTelegramApiBase(this.config.apiBase || this.config.baseUrl || "https://api.telegram.org");
  }

  private getBotToken(): string {
    return String(this.config.botToken || "").trim();
  }

  private getChatId(): string {
    return String(this.config.chatId || "").trim();
  }

  private shouldNotifyUpload(): boolean {
    return true;
  }

  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const token = this.getBotToken();
    const chatId = this.getChatId();
    if (!token || !chatId) {
      throw new Error("Telegram storage requires botToken and chatId.");
    }

    const blob = typeof body === "string"
      ? new Blob([body], { type: contentType })
      : new Blob([body], { type: contentType });
    const normalizedKey = this.normalizeKey(key);
    const fileName = normalizedKey.split("/").pop() || "upload.bin";
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("document", new File([blob], fileName, { type: contentType }));

    const response = await fetch(`${this.getBotBase()}/bot${token}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok || !json.ok) {
      throw new Error(String(json.description || `Telegram upload failed (${response.status}).`));
    }

    const fileId = json.result?.document?.file_id || json.result?.video?.file_id || json.result?.photo?.[0]?.file_id || null;
    if (!fileId) {
      throw new Error("Telegram upload completed but no file_id was returned.");
    }

    const fileInfoResponse = await fetch(`${this.getBotBase()}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const fileInfo = (await fileInfoResponse.json().catch(() => ({}))) as Record<string, any>;
    const filePath = fileInfo?.result?.file_path || "";
    const downloadUrl = filePath ? `${this.getBotBase()}/file/bot${token}/${encodeURIComponent(filePath)}` : "";
    const size = typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength;
    const messageId = json.result?.message_id || null;

    this.registerFile(key, {
      downloadUrl,
      contentType,
      size,
      lastModified: new Date().toISOString(),
      metadata: {
        telegramFileId: fileId,
        telegramMessageId: messageId,
        storagePath: normalizedKey,
      },
    });

    if (this.shouldNotifyUpload()) {
      try {
        await sendTelegramUploadNotice(
          this.getBotBase(),
          token,
          chatId,
          buildTelegramUploadNoticeText({
            fileName,
            fileSize: size,
            downloadUrl,
            storagePath: normalizedKey,
          }),
          messageId
        );
      } catch (error) {
        console.warn("Telegram upload notice failed:", error instanceof Error ? error.message : error);
      }
    }
  }

  async getObject(key: string): Promise<Response> {
    const entry = this.getEntry(key);
    if (!entry?.downloadUrl) {
      return new Response("Not found", { status: 404 });
    }
    const response = await fetch(entry.downloadUrl);
    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }
    return response;
  }

  async deleteObject(key: string): Promise<void> {
    const entry = this.getEntry(key);
    const messageId = entry?.metadata?.telegramMessageId;
    if (messageId) {
      await fetch(`${this.getBotBase()}/bot${this.getBotToken()}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.getChatId(), message_id: Number(messageId) }),
      }).catch(() => undefined);
    }
    this.removeEntry(key);
  }
}

export class DiscordStorageClient extends RegistryBackedStorageClient {
  constructor(config: Record<string, any> | undefined, saving?: Record<string, any>) {
    super("discord", config, saving);
  }

  private getWebhookUrl(): string {
    return String(this.config.webhookUrl || "").trim();
  }

  private getBotToken(): string {
    return String(this.config.botToken || "").trim();
  }

  private getChannelId(): string {
    return String(this.config.channelId || "").trim();
  }

  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const fileName = this.normalizeKey(key).split("/").pop() || "upload.bin";
    const blob = typeof body === "string"
      ? new Blob([body], { type: contentType })
      : new Blob([body], { type: contentType });

    const formData = new FormData();
    formData.append("files[0]", new File([blob], fileName, { type: contentType }));
    formData.append("payload_json", JSON.stringify({ content: "", attachments: [{ id: 0, filename: fileName }] }));

    let response: Response;
    if (this.getBotToken() && this.getChannelId()) {
      response = await fetch(`https://discord.com/api/v10/channels/${this.getChannelId()}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${this.getBotToken()}` },
        body: formData,
      });
    } else {
      response = await fetch(this.getWebhookUrl(), { method: "POST", body: formData });
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new Error(String(json.message || `Discord upload failed (${response.status}).`));
    }

    const attachment = json.attachments?.[0] || null;
    if (!attachment?.url) {
      throw new Error("Discord upload missing attachment metadata.");
    }

    this.registerFile(key, {
      downloadUrl: attachment.url,
      contentType,
      size: typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength,
      lastModified: new Date().toISOString(),
      metadata: {
        discordChannelId: json.channel_id || this.getChannelId(),
        discordMessageId: json.id || null,
      },
    });
  }

  async getObject(key: string): Promise<Response> {
    const entry = this.getEntry(key);
    if (!entry?.downloadUrl) {
      return new Response("Not found", { status: 404 });
    }
    const response = await fetch(entry.downloadUrl);
    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }
    return response;
  }

  async deleteObject(key: string): Promise<void> {
    const entry = this.getEntry(key);
    const messageId = entry?.metadata?.discordMessageId;
    const channelId = entry?.metadata?.discordChannelId || this.getChannelId();
    if (messageId && this.getBotToken() && channelId) {
      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bot ${this.getBotToken()}` },
      }).catch(() => undefined);
    }
    this.removeEntry(key);
  }
}

export class HuggingFaceStorageClient extends RegistryBackedStorageClient {
  constructor(config: Record<string, any> | undefined, saving?: Record<string, any>) {
    super("huggingface", config, saving);
  }

  private getToken(): string {
    return String(this.config.token || "").trim();
  }

  private getRepo(): string {
    return String(this.config.repo || this.config.huggingfaceRepo || this.config.datasetRepo || "").trim();
  }

  private getCommitUrl(): string {
    return `https://huggingface.co/api/datasets/${this.getRepo()}/commit/main`;
  }

  private getResolveUrl(pathInRepo: string): string {
    return `https://huggingface.co/datasets/${this.getRepo()}/resolve/main/${pathInRepo}`;
  }

  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const repo = this.getRepo();
    const token = this.getToken();
    if (!repo || !token) {
      throw new Error("HuggingFace storage requires token and repo.");
    }

    const base64 = toBase64(typeof body === "string" ? new TextEncoder().encode(body).buffer as ArrayBuffer : body);
    const pathInRepo = this.normalizeKey(key);
    const bodyPayload = [
      JSON.stringify({ key: "header", value: { summary: `Upload ${pathInRepo}` } }),
      JSON.stringify({ key: "file", value: { path: pathInRepo, encoding: "base64", content: base64 } }),
    ].join("\n");

    const response = await fetch(this.getCommitUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-ndjson",
      },
      body: bodyPayload,
    });

    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new Error(String(json.error || json.message || `HuggingFace upload failed (${response.status}).`));
    }

    this.registerFile(key, {
      downloadUrl: this.getResolveUrl(pathInRepo),
      contentType,
      size: typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength,
      lastModified: new Date().toISOString(),
      metadata: {
        hfPath: pathInRepo,
        hfCommit: json.commitOid || null,
      },
    });
  }

  async getObject(key: string): Promise<Response> {
    const entry = this.getEntry(key);
    if (!entry?.downloadUrl) {
      return new Response("Not found", { status: 404 });
    }
    const response = await fetch(entry.downloadUrl, { redirect: "follow" });
    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }
    return response;
  }

  async deleteObject(key: string): Promise<void> {
    const repo = this.getRepo();
    const token = this.getToken();
    if (!repo || !token) {
      throw new Error("HuggingFace storage requires token and repo.");
    }

    const pathInRepo = this.normalizeKey(key);
    const response = await fetch(this.getCommitUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-ndjson",
      },
      body: [
        JSON.stringify({ key: "header", value: { summary: `Delete ${pathInRepo}` } }),
        JSON.stringify({ key: "deletedFile", value: { path: pathInRepo } }),
      ].join("\n"),
    });
    if (response.ok) {
      this.removeEntry(key);
    }
  }
}

export class GitHubStorageClient extends RegistryBackedStorageClient {
  constructor(config: Record<string, any> | undefined, saving?: Record<string, any>) {
    super("github", config, saving);
  }

  private getToken(): string {
    return String(this.config.token || "").trim();
  }

  private getRepo(): string {
    return String(this.config.repo || "").trim();
  }

  private getApiBase(): string {
    const raw = String(this.config.apiBase || "https://api.github.com").trim();
    return raw.replace(/\/+$/, "");
  }

  private getBranch(): string {
    return String(this.config.branch || "").trim();
  }

  private getPrefix(): string {
    return String(this.config.prefix || this.config.path || "").trim();
  }

  private repoApi(pathname: string): string {
    return `${this.getApiBase()}/repos/${this.getRepo()}${pathname}`;
  }

  private contentsPath(key: string): string {
    const normalizedKey = normalizePath(key);
    const prefix = this.getPrefix();
    if (!prefix) {
      return normalizedKey;
    }
    return normalizedKey ? `${prefix}/${normalizedKey}` : prefix;
  }

  private encodePath(path: string): string {
    return path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const token = this.getToken();
    const repo = this.getRepo();
    if (!token || !repo) {
      throw new Error("GitHub storage requires repo and token.");
    }

    const path = this.contentsPath(key);
    const payload = {
      message: `k-vault upload: ${path}`,
      content: toBase64(typeof body === "string" ? new TextEncoder().encode(body).buffer as ArrayBuffer : body),
      ...(this.getBranch() ? { branch: this.getBranch() } : {}),
    };

    const response = await fetch(this.repoApi(`/contents/${this.encodePath(path)}`), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new Error(`GitHub upload failed (${response.status}): ${String(json.message || "Unknown error")}`);
    }

    this.registerFile(key, {
      downloadUrl: `${this.getApiBase()}/repos/${repo}/contents/${this.encodePath(path)}`,
      contentType,
      size: typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength,
      lastModified: new Date().toISOString(),
      metadata: {
        githubPath: path,
        githubSha: json.content?.sha || null,
      },
    });
  }

  async getObject(key: string): Promise<Response> {
    const token = this.getToken();
    const path = this.contentsPath(key);
    const response = await fetch(this.repoApi(`/contents/${this.encodePath(path)}`), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }
    return response;
  }

  async deleteObject(key: string): Promise<void> {
    const token = this.getToken();
    const repo = this.getRepo();
    if (!token || !repo) {
      throw new Error("GitHub storage requires repo and token.");
    }

    const path = this.contentsPath(key);
    const metadata = this.getEntry(key)?.metadata;
    const payload = metadata?.githubSha
      ? { message: `k-vault delete: ${path}`, sha: metadata.githubSha, ...(this.getBranch() ? { branch: this.getBranch() } : {}) }
      : { message: `k-vault delete: ${path}`, ...(this.getBranch() ? { branch: this.getBranch() } : {}) };

    const response = await fetch(this.repoApi(`/contents/${this.encodePath(path)}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 404) {
      this.removeEntry(key);
    }
  }
}

export function createStorageClient(storage: StorageClientLike): StorageClient {
  if (storage.type === "webdev") {
    return new WebdevClient({
      endpoint: storage.endpoint,
      username: storage.accessKeyId,
      password: storage.secretAccessKey,
      basePath: storage.basePath,
    });
  }
  if (storage.type === "onedrive") {
    return new OneDriveClient({ config: storage.config, saving: storage.saving });
  }
  if (storage.type === "gdrive") {
    return new GoogleDriveClient({ config: storage.config, saving: storage.saving });
  }
  if (storage.type === "alicloud") {
    return new AliyunDriveClient({ config: storage.config, saving: storage.saving });
  }
  if (storage.type === "baiduyun") {
    return new BaiduYunClient({ config: storage.config, saving: storage.saving });
  }
  if (storage.type === "telegram") {
    return new TelegramStorageClient(storage.config, storage.saving);
  }
  if (storage.type === "discord") {
    return new DiscordStorageClient(storage.config, storage.saving);
  }
  if (storage.type === "huggingface") {
    return new HuggingFaceStorageClient(storage.config, storage.saving);
  }
  if (storage.type === "github") {
    return new GitHubStorageClient(storage.config, storage.saving);
  }
  if (storage.type === "r2") {
    return new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
      bucket: storage.bucket,
      basePath: storage.basePath,
    });
  }
  return new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    bucket: storage.bucket,
    basePath: storage.basePath,
  });
}
