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

// ============================================================
// 通用工具函数
// ============================================================

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

// ============================================================
// 通用 HTTP 错误解析（按 Content-Type 智能解析）
// ============================================================

async function parseErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => ({}));
    return json.message || json.error || JSON.stringify(json);
  }
  return response.text().catch(() => "");
}

// ============================================================
// Telegram 专用工具
// ============================================================

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

// ============================================================
// SHA-256 工具（用于 HuggingFace LFS）
// ============================================================

async function sha256Hex(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashBytes = new Uint8Array(hashBuffer);
  return Array.from(hashBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================
// Registry 基类
// ============================================================

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

// ============================================================
// Telegram 存储（参照 001 项目全面升级）
// ============================================================

// MIME 类型到文件扩展名的映射
const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-7z-compressed": "7z",
  "application/x-rar-compressed": "rar",
  "text/plain": "txt",
  "application/json": "json",
};

function guessExtensionFromMimeType(mimeType: string, fallback = "bin"): string {
  const normalized = String(mimeType || "").split(";")[0].trim().toLowerCase();
  return MIME_EXTENSION_MAP[normalized] || fallback;
}

function sanitizeFileExtension(ext: string, fallback = "bin"): string {
  const normalized = String(ext || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return fallback;
  return normalized.slice(0, 10);
}

function getFileExtension(fileName: string, mimeType: string, fallback = "bin"): string {
  const fromName = String(fileName || "").split(".").pop()?.toLowerCase();
  if (fromName && fromName !== fileName?.toLowerCase()) {
    return sanitizeFileExtension(fromName, fallback);
  }
  if (String(fileName || "").includes(".")) {
    return sanitizeFileExtension(fromName || fallback, fallback);
  }
  return sanitizeFileExtension(guessExtensionFromMimeType(mimeType, fallback), fallback);
}

function normalizeTelegramApiBase(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "https://api.telegram.org";
  const trimmed = raw.trim();
  if (!trimmed) return "https://api.telegram.org";
  try {
    return new URL(trimmed).toString().replace(/\/+$/, "");
  } catch {
    return "https://api.telegram.org";
  }
}

function buildTelegramBotApiUrl(base: string, token: string, method: string): string {
  const normalizedMethod = String(method || "").trim().replace(/^\/+/, "");
  return `${base}/bot${token}/${normalizedMethod}`;
}

function buildTelegramFileUrl(base: string, token: string, filePath: string): string {
  const normalizedPath = String(filePath || "").replace(/^\/+/, "");
  return `${base}/file/bot${token}/${normalizedPath}`;
}

/**
 * 根据 content-type 选择最佳的 Telegram 上传方法和表单字段
 */
function getTelegramUploadMethodAndField(contentType: string): { method: string; field: string } {
  const type = String(contentType || "").toLowerCase();
  if (type.startsWith("image/")) {
    return { method: "sendDocument", field: "document" };
  }
  if (type.startsWith("audio/")) {
    return { method: "sendAudio", field: "audio" };
  }
  if (type.startsWith("video/")) {
    return { method: "sendVideo", field: "video" };
  }
  return { method: "sendDocument", field: "document" };
}

/**
 * 从 Telegram 响应中提取 file_id，支持 8 种消息类型
 * photo 取最大尺寸的（file_size 最大的那张）
 */
function pickTelegramFileId(responseData: Record<string, any>): string | null {
  if (!responseData?.ok || !responseData.result) return null;
  const result = responseData.result;
  // photo: 取 file_size 最大的
  if (Array.isArray(result.photo) && result.photo.length) {
    return result.photo.reduce((prev: Record<string, any>, current: Record<string, any>) =>
      (prev?.file_size || 0) > (current?.file_size || 0) ? prev : current
    )?.file_id || null;
  }
  if (result.document?.file_id) return result.document.file_id;
  if (result.video?.file_id) return result.video.file_id;
  if (result.audio?.file_id) return result.audio.file_id;
  if (result.voice?.file_id) return result.voice.file_id;
  if (result.sticker?.file_id) return result.sticker.file_id;
  if (result.animation?.file_id) return result.animation.file_id;
  if (result.video_note?.file_id) return result.video_note.file_id;
  return null;
}

function isFlagEnabled(rawValue: unknown, defaultValue: boolean): boolean {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
  return defaultValue;
}

export class TelegramStorageClient extends RegistryBackedStorageClient {
  constructor(config: Record<string, any> | undefined, saving?: Record<string, any>) {
    super("telegram", config, saving);
  }

  private getBotBase(): string {
    return normalizeTelegramApiBase(this.config.apiBase || this.config.baseUrl);
  }

  private getBotToken(): string {
    return String(this.config.botToken || "").trim();
  }

  private getChatId(): string {
    return String(this.config.chatId || "").trim();
  }

  private shouldNotifyUpload(): boolean {
    return isFlagEnabled(
      this.config.uploadNotify ?? this.config.telegramUploadNotify,
      true
    );
  }

  // ---- 连接检测 ----
  async testConnection(): Promise<Record<string, any>> {
    const token = this.getBotToken();
    if (!token) {
      return { connected: false, configured: false, message: "Not configured" };
    }

    try {
      const response = await fetch(buildTelegramBotApiUrl(this.getBotBase(), token, "getMe"));
      const json = (await response.json().catch(() => ({}))) as Record<string, any>;
      return {
        connected: Boolean(response.ok && json.ok),
        configured: true,
        status: response.status,
        message: json?.ok ? "Connected" : String(json.description || "Telegram API request failed"),
        botUsername: json?.result?.username || "",
      };
    } catch (error: any) {
      return { connected: false, configured: true, message: error.message };
    }
  }

  // ---- 上传 ----
  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const token = this.getBotToken();
    const chatId = this.getChatId();
    if (!token || !chatId) {
      throw new Error("Telegram storage requires botToken and chatId.");
    }

    const buffer = typeof body === "string"
      ? new TextEncoder().encode(body).buffer as ArrayBuffer
      : body;
    const size = buffer.byteLength;

    // 50MB 上限检查
    const maxSize = 50 * 1024 * 1024;
    if (size > maxSize) {
      throw new Error(`Telegram upload limit exceeded (50MB). File size: ${formatBytes(size)}.`);
    }

    const normalizedKey = this.normalizeKey(key);
    const rawFileName = normalizedKey.split("/").pop() || "upload.bin";
    const extension = getFileExtension(rawFileName, contentType, "bin");
    const fileName = rawFileName.includes(".") ? rawFileName : `${rawFileName}.${extension}`;

    // 根据 content-type 选择上传方法
    const { method, field } = getTelegramUploadMethodAndField(contentType);

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append(field, new File([new Blob([buffer], { type: contentType })], fileName, { type: contentType }));

    let response = await fetch(buildTelegramBotApiUrl(this.getBotBase(), token, method), {
      method: "POST",
      body: formData,
    });

    let json = (await response.json().catch(() => ({}))) as Record<string, any>;

    // 音频上传失败时自动回退到 sendDocument
    if ((!response.ok || !json.ok) && method === "sendAudio") {
      const fallbackForm = new FormData();
      fallbackForm.append("chat_id", chatId);
      fallbackForm.append("document", new File([new Blob([buffer], { type: contentType })], fileName, { type: contentType }));
      response = await fetch(buildTelegramBotApiUrl(this.getBotBase(), token, "sendDocument"), {
        method: "POST",
        body: fallbackForm,
      });
      json = (await response.json().catch(() => ({}))) as Record<string, any>;
    }

    if (!response.ok || !json.ok) {
      throw new Error(String(json.description || `Telegram upload failed (${response.status})`));
    }

    const fileId = pickTelegramFileId(json);
    if (!fileId) {
      throw new Error("Telegram upload completed but no file_id was returned.");
    }

    // 通过 getFile 获取文件路径，构建下载 URL
    const fileInfoResponse = await fetch(
      `${buildTelegramBotApiUrl(this.getBotBase(), token, "getFile")}?file_id=${encodeURIComponent(fileId)}`
    );
    const fileInfo = (await fileInfoResponse.json().catch(() => ({}))) as Record<string, any>;
    const filePath = fileInfo?.result?.file_path || "";
    const downloadUrl = filePath ? buildTelegramFileUrl(this.getBotBase(), token, filePath) : "";
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
        chatId,
        extension,
      },
    });

    // 上传通知
    if (this.shouldNotifyUpload()) {
      try {
        await this.sendUploadNotice({
          chatId,
          replyToMessageId: messageId,
          fileName,
          fileSize: size,
          fileId,
          messageId,
          storagePath: normalizedKey,
          downloadUrl,
        });
      } catch (error) {
        console.warn("Telegram upload notice failed:", error instanceof Error ? error.message : error);
      }
    }
  }

  private async sendUploadNotice(params: {
    chatId: string;
    replyToMessageId: number | null;
    fileName: string;
    fileSize: number;
    fileId: string;
    messageId: number | null;
    storagePath: string;
    downloadUrl: string;
  }): Promise<void> {
    const token = this.getBotToken();
    if (!token || !params.chatId) return;

    const text = [
      "Upload completed",
      `Name: ${params.fileName}`,
      `Size: ${formatBytes(params.fileSize)}`,
      `Path: ${params.storagePath}`,
      `File ID: ${params.fileId}`,
      ...(params.messageId ? [`Message ID: ${params.messageId}`] : []),
      ...(params.downloadUrl ? [`Download: ${params.downloadUrl}`] : []),
    ].join("\n");

    const payload: Record<string, any> = {
      chat_id: params.chatId,
      text,
      disable_web_page_preview: true,
    };

    if (params.replyToMessageId) {
      payload.reply_to_message_id = Number(params.replyToMessageId);
      payload.allow_sending_without_reply = true;
    }

    const url = buildTelegramBotApiUrl(this.getBotBase(), token, "sendMessage");
    let response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, any>;

    // reply 失败时重试不带 reply 参数
    if (!(response.ok && json.ok) && payload.reply_to_message_id) {
      const fallbackPayload = { chat_id: params.chatId, text, disable_web_page_preview: true };
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackPayload),
      }).catch(() => undefined);
    }
  }

  // ---- 下载（每次通过 getFile API 实时获取 URL，支持 Range） ----
  async getObject(key: string): Promise<Response> {
    const token = this.getBotToken();
    const entry = this.getEntry(key);
    const fileId = entry?.metadata?.telegramFileId;

    if (!fileId) {
      return new Response("Not found", { status: 404 });
    }

    // 通过 getFile 获取最新的 file_path
    const infoResponse = await fetch(
      `${buildTelegramBotApiUrl(this.getBotBase(), token, "getFile")}?file_id=${encodeURIComponent(fileId)}`
    );
    const infoJson = (await infoResponse.json().catch(() => ({}))) as Record<string, any>;

    if (!infoResponse.ok || !infoJson.ok || !infoJson.result?.file_path) {
      // 如果 getFile 失败，回退到缓存的 downloadUrl
      if (entry?.downloadUrl) {
        const fallback = await fetch(entry.downloadUrl);
        if (fallback.ok) return fallback;
      }
      return new Response("Not found", { status: 404 });
    }

    // 更新 registry 中的 downloadUrl
    const freshUrl = buildTelegramFileUrl(this.getBotBase(), token, infoJson.result.file_path);
    if (entry) {
      entry.downloadUrl = freshUrl;
    }

    const response = await fetch(freshUrl);
    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }
    return response;
  }

  // ---- 删除 ----
  async deleteObject(key: string): Promise<void> {
    const token = this.getBotToken();
    const entry = this.getEntry(key);
    const messageId = entry?.metadata?.telegramMessageId;

    if (messageId) {
      const response = await fetch(buildTelegramBotApiUrl(this.getBotBase(), token, "deleteMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.getChatId(), message_id: Number(messageId) }),
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, any>;
      // 即使删除失败也从 registry 中移除
      if (!(response.ok && json.ok)) {
        console.warn("Telegram deleteMessage failed:", json.description || `status ${response.status}`);
      }
    }
    this.removeEntry(key);
  }
}

// ============================================================
// Discord 存储（参照 001 项目全面升级）
// ============================================================

const DISCORD_API_BASE = "https://discord.com/api/v10";

function buildDiscordWebhookMessageUrl(webhookUrl: string, messageId: string | null = null): URL {
  const base = new URL(webhookUrl);
  const path = base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname;
  const target = messageId
    ? new URL(`${base.origin}${path}/messages/${messageId}`)
    : new URL(`${base.origin}${path}`);

  // 保留 thread_id 等参数，移除 wait 参数
  base.searchParams.forEach((value, key) => {
    if (key !== "wait") target.searchParams.set(key, value);
  });
  return target;
}

function getDiscordAttachment(message: Record<string, any>): Record<string, any> | null {
  const attachment = message?.attachments?.[0];
  if (!attachment) return null;
  return {
    id: attachment.id,
    url: attachment.url,
    filename: attachment.filename,
    size: attachment.size,
    contentType: attachment.content_type,
  };
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

  // ---- 连接检测 ----
  async testConnection(): Promise<Record<string, any>> {
    let webhookInfo: Record<string, any> | null = null;
    let botInfo: Record<string, any> | null = null;

    const webhookUrl = this.getWebhookUrl();
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl);
        if (response.ok) {
          const data = (await response.json()) as Record<string, any>;
          webhookInfo = {
            mode: "webhook",
            name: data.name,
            channelId: data.channel_id,
          };
        }
      } catch {
        // ignore
      }
    }

    const botToken = this.getBotToken();
    if (botToken) {
      try {
        const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
          headers: { Authorization: `Bot ${botToken}` },
        });
        if (response.ok) {
          const data = (await response.json()) as Record<string, any>;
          botInfo = {
            mode: "bot",
            name: data.username,
            channelId: this.getChannelId(),
          };
        }
      } catch {
        // ignore
      }
    }

    if (webhookInfo && botInfo) {
      return {
        connected: true,
        mode: "bot+webhook",
        name: `${botInfo.name} / ${webhookInfo.name}`,
        channelId: botInfo.channelId || webhookInfo.channelId,
      };
    }
    if (botInfo) return { connected: true, ...botInfo };
    if (webhookInfo) return { connected: true, ...webhookInfo };
    return { connected: false };
  }

  // ---- 上传（双通道：先 Bot 后 Webhook 自动回退） ----
  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const fileName = this.normalizeKey(key).split("/").pop() || "upload.bin";
    const buffer = typeof body === "string"
      ? new TextEncoder().encode(body).buffer as ArrayBuffer
      : body;

    const size = buffer.byteLength;
    const maxSize = 25 * 1024 * 1024;
    if (size > maxSize) {
      throw new Error(`Discord upload limit exceeded (25MB). File size: ${formatBytes(size)}.`);
    }

    const errors: string[] = [];
    let result: { channelId: string; messageId: string; attachmentId: string; filename: string; size: number; contentType: string; sourceUrl: string; mode: string } | null = null;

    // 优先尝试 Bot 上传
    const botToken = this.getBotToken();
    const channelId = this.getChannelId();
    if (botToken && channelId) {
      try {
        const formData = new FormData();
        formData.append("files[0]", new File([new Blob([buffer], { type: contentType })], fileName, { type: contentType }));
        formData.append("payload_json", JSON.stringify({
          content: "",
          attachments: [{ id: 0, filename: fileName }],
        }));

        const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${botToken}` },
          body: formData,
        });

        const json = (await response.json().catch(() => ({}))) as Record<string, any>;
        if (!response.ok) {
          errors.push(`Bot: ${json.message || `HTTP ${response.status}`}`);
        } else {
          const attachment = getDiscordAttachment(json);
          if (!attachment) {
            errors.push("Bot: 未获取到 Discord 附件信息");
          } else {
            result = {
              channelId: json.channel_id,
              messageId: json.id,
              attachmentId: attachment.id,
              filename: attachment.filename,
              size: attachment.size,
              contentType: attachment.contentType,
              sourceUrl: attachment.url,
              mode: "bot",
            };
          }
        }
      } catch (error: any) {
        errors.push(`Bot: ${error.message}`);
      }
    }

    // Bot 失败时回退到 Webhook
    if (!result) {
      const webhookUrl = this.getWebhookUrl();
      if (webhookUrl) {
        try {
          const formData = new FormData();
          formData.append("files[0]", new File([new Blob([buffer], { type: contentType })], fileName, { type: contentType }));
          formData.append("payload_json", JSON.stringify({
            content: "",
            attachments: [{ id: 0, filename: fileName }],
          }));

          const uploadUrl = buildDiscordWebhookMessageUrl(webhookUrl);
          uploadUrl.searchParams.set("wait", "true");

          const response = await fetch(uploadUrl.toString(), {
            method: "POST",
            body: formData,
          });

          const json = (await response.json().catch(() => ({}))) as Record<string, any>;
          if (!response.ok) {
            errors.push(`Webhook: ${json.message || `HTTP ${response.status}`}`);
          } else {
            const attachment = getDiscordAttachment(json);
            if (!attachment) {
              errors.push("Webhook: 未获取到 Discord 附件信息");
            } else {
              result = {
                channelId: json.channel_id,
                messageId: json.id,
                attachmentId: attachment.id,
                filename: attachment.filename,
                size: attachment.size,
                contentType: attachment.contentType,
                sourceUrl: attachment.url,
                mode: "webhook",
              };
            }
          }
        } catch (error: any) {
          errors.push(`Webhook: ${error.message}`);
        }
      }
    }

    if (!result) {
      if (errors.length > 0) {
        throw new Error(`Discord upload failed: ${errors.join(" | ")}`);
      }
      throw new Error("Discord 未配置（需要 Bot 或 Webhook）");
    }

    this.registerFile(key, {
      downloadUrl: result.sourceUrl,
      contentType: result.contentType || contentType,
      size,
      lastModified: new Date().toISOString(),
      metadata: {
        discordChannelId: result.channelId,
        discordMessageId: result.messageId,
        discordAttachmentId: result.attachmentId,
        discordMode: result.mode,
      },
    });
  }

  // ---- 下载（双通道：先 Bot 查消息 → 再 Webhook 查消息） ----
  async getObject(key: string): Promise<Response> {
    const entry = this.getEntry(key);
    if (!entry) {
      return new Response("Not found", { status: 404 });
    }

    // 如果已有 downloadUrl，先尝试直接获取
    if (entry.downloadUrl) {
      const directResponse = await fetch(entry.downloadUrl);
      if (directResponse.ok) {
        return directResponse;
      }
    }

    // downloadUrl 过期或不存在，通过 API 重新查询
    const metadata = entry.metadata || {};
    const channelId = metadata.discordChannelId || this.getChannelId();
    const messageId = metadata.discordMessageId;

    if (!messageId) {
      return new Response("Not found", { status: 404 });
    }

    const lookupErrors: string[] = [];
    let attachment: Record<string, any> | null = null;

    // 先尝试 Bot 查询
    const botToken = this.getBotToken();
    if (botToken && channelId) {
      try {
        const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`, {
          headers: { Authorization: `Bot ${botToken}` },
        });
        if (response.ok) {
          const json = (await response.json()) as Record<string, any>;
          attachment = getDiscordAttachment(json);
        } else if (response.status !== 404) {
          lookupErrors.push(`bot=${response.status}`);
        }
      } catch (error: any) {
        lookupErrors.push(`bot=${error.message}`);
      }
    }

    // Bot 查不到，回退到 Webhook 查询
    if (!attachment) {
      const webhookUrl = this.getWebhookUrl();
      if (webhookUrl) {
        try {
          const response = await fetch(buildDiscordWebhookMessageUrl(webhookUrl, messageId).toString());
          if (response.ok) {
            const json = (await response.json()) as Record<string, any>;
            attachment = getDiscordAttachment(json);
          } else if (response.status !== 404) {
            lookupErrors.push(`webhook=${response.status}`);
          }
        } catch (error: any) {
          lookupErrors.push(`webhook=${error.message}`);
        }
      }
    }

    if (attachment?.url) {
      // 更新 registry 中的 downloadUrl
      entry.downloadUrl = attachment.url;
      entry.metadata.discordAttachmentId = attachment.id;

      const fileResponse = await fetch(attachment.url);
      if (!fileResponse.ok) {
        return new Response("Not found", { status: 404 });
      }
      return fileResponse;
    }

    if (lookupErrors.length > 0) {
      console.warn(`Discord file lookup errors: ${lookupErrors.join(" | ")}`);
    }
    return new Response("Not found", { status: 404 });
  }

  // ---- 删除（双通道） ----
  async deleteObject(key: string): Promise<void> {
    const entry = this.getEntry(key);
    const metadata = entry?.metadata || {};
    const channelId = metadata.discordChannelId || this.getChannelId();
    const messageId = metadata.discordMessageId;

    if (!messageId) {
      this.removeEntry(key);
      return;
    }

    // 先尝试 Bot 删除
    const botToken = this.getBotToken();
    if (botToken && channelId) {
      try {
        const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`, {
          method: "DELETE",
          headers: { Authorization: `Bot ${botToken}` },
        });
        if (response.ok || response.status === 204 || response.status === 404) {
          this.removeEntry(key);
          return;
        }
      } catch (error) {
        console.warn("Discord bot delete error:", error instanceof Error ? error.message : error);
      }
    }

    // 回退到 Webhook 删除
    const webhookUrl = this.getWebhookUrl();
    if (webhookUrl) {
      try {
        const response = await fetch(buildDiscordWebhookMessageUrl(webhookUrl, messageId).toString(), {
          method: "DELETE",
        });
        if (response.ok || response.status === 204 || response.status === 404) {
          this.removeEntry(key);
          return;
        }
      } catch (error) {
        console.warn("Discord webhook delete error:", error instanceof Error ? error.message : error);
      }
    }

    // 删除失败，但仍然从 registry 中移除
    this.removeEntry(key);
  }
}

// ============================================================
// HuggingFace 存储（参照 001 项目全面升级：LFS + 分片上传 + preupload 检测）
// ============================================================

const HF_BASE_URL = "https://huggingface.co";

function normalizeHFToken(raw: unknown): string {
  if (!raw) return "";
  let token = String(raw).trim();
  // 去除可能的引号
  token = token.replace(/^['"]+|['"]+$/g, "");
  // 去除 Bearer 前缀
  token = token.replace(/^Bearer\s+/i, "").trim();
  return token;
}

function normalizeHFRepo(raw: unknown): string {
  if (!raw) return "";
  let repo = String(raw).trim();
  // 去除引号
  repo = repo.replace(/^['"]+|['"]+$/g, "");
  // 支持完整 URL / datasets 前缀 / 纯 repoId
  repo = repo
    .replace(/^https?:\/\/huggingface\.co\//i, "")
    .replace(/^datasets\//i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = repo.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  return `${parts[0]}/${parts[1]}`;
}

function getHFCommitUrl(repoId: string, branch = "main"): string {
  return `${HF_BASE_URL}/api/datasets/${repoId}/commit/${encodeURIComponent(branch)}`;
}

function getHFLfsBatchUrl(repoId: string): string {
  return `${HF_BASE_URL}/datasets/${repoId}.git/info/lfs/objects/batch`;
}

async function readHFError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return "未知错误";
  try {
    const data = JSON.parse(text);
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

function createHFCommitBody(lines: Array<Record<string, any>>): string {
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

/**
 * 预上传检测：让 HuggingFace 服务端判定文件应该走 regular 还是 lfs 模式
 */
async function detectHFUploadMode(
  pathInRepo: string,
  fileBuffer: ArrayBuffer,
  token: string,
  repo: string
): Promise<{ success: boolean; uploadMode?: string; error?: string }> {
  const bytes = new Uint8Array(fileBuffer);
  const sampleBytes = bytes.slice(0, Math.min(bytes.byteLength, 512));
  const sampleBase64 = toBase64(sampleBytes.buffer);

  const response = await fetch(
    `${HF_BASE_URL}/api/datasets/${repo}/preupload/main`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [{
          path: pathInRepo,
          size: bytes.byteLength,
          sample: sampleBase64,
        }],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await readHFError(response);
    return {
      success: false,
      error: `HF 预上传检查失败 (${response.status}): ${errorText}`,
    };
  }

  const data = (await response.json()) as Record<string, any>;
  const files: Array<Record<string, any>> = Array.isArray(data?.files) ? data.files : [];
  const fileInfo = files.find((item) => item.path === pathInRepo) || files[0];

  return {
    success: true,
    uploadMode: fileInfo?.uploadMode || "regular",
  };
}

/**
 * 上传 LFS 对象（支持分片上传）
 */
async function uploadHFLfsObject(
  fileBuffer: ArrayBuffer,
  oid: string,
  uploadAction: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  if (!uploadAction?.href) {
    return { success: false, error: "HF LFS 返回了无效的上传地址" };
  }

  const header = uploadAction.header || {};
  const chunkSize = Number(header.chunk_size || 0);
  const partKeys = Object.keys(header)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b));

  // 分片上传
  if (chunkSize > 0 && partKeys.length > 0) {
    const completeReq: Record<string, any> = {
      oid,
      parts: [],
    };

    for (const part of partKeys) {
      const index = Number(part) - 1;
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize, fileBuffer.byteLength);
      const chunk = fileBuffer.slice(start, end);

      const partResponse = await fetch(header[part], {
        method: "PUT",
        body: chunk,
      });

      if (!partResponse.ok) {
        const errorText = await readHFError(partResponse);
        return {
          success: false,
          error: `HF LFS 分片上传失败 (${partResponse.status}): ${errorText}`,
        };
      }

      const eTag = partResponse.headers.get("ETag");
      if (!eTag) {
        return { success: false, error: "HF LFS 分片上传缺少 ETag" };
      }

      completeReq.parts.push({
        partNumber: Number(part),
        etag: eTag,
      });
    }

    // 合并分片
    const completeResponse = await fetch(uploadAction.href, {
      method: "POST",
      headers: {
        Accept: "application/vnd.git-lfs+json",
        "Content-Type": "application/vnd.git-lfs+json",
      },
      body: JSON.stringify(completeReq),
    });

    if (!completeResponse.ok) {
      const errorText = await readHFError(completeResponse);
      return {
        success: false,
        error: `HF LFS 分片合并失败 (${completeResponse.status}): ${errorText}`,
      };
    }

    return { success: true };
  }

  // 单次上传
  const uploadHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(header)) {
    if (key === "chunk_size" || /^\d+$/.test(key)) {
      continue;
    }
    if (value != null) {
      uploadHeaders[key] = String(value);
    }
  }

  const uploadResponse = await fetch(uploadAction.href, {
    method: "PUT",
    headers: uploadHeaders,
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await readHFError(uploadResponse);
    return {
      success: false,
      error: `HF LFS 上传失败 (${uploadResponse.status}): ${errorText}`,
    };
  }

  return { success: true };
}

/**
 * 完整 LFS 上传流程
 */
async function uploadToHFLfs(
  fileBuffer: ArrayBuffer,
  token: string,
  repo: string
): Promise<{ success: boolean; oid?: string; size?: number; error?: string }> {
  const oid = await sha256Hex(fileBuffer);
  const size = fileBuffer.byteLength;

  const response = await fetch(getHFLfsBatchUrl(repo), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.git-lfs+json",
      "Content-Type": "application/vnd.git-lfs+json",
    },
    body: JSON.stringify({
      operation: "upload",
      transfers: ["basic", "multipart"],
      hash_algo: "sha_256",
      ref: { name: "main" },
      objects: [{ oid, size }],
    }),
  });

  if (!response.ok) {
    const errorText = await readHFError(response);
    return {
      success: false,
      error: `HF LFS 批量握手失败 (${response.status}): ${errorText}`,
    };
  }

  const data = (await response.json()) as Record<string, any>;
  const object: Record<string, any> | null = Array.isArray(data?.objects) ? data.objects[0] : null;

  if (!object) {
    return { success: false, error: "HF LFS 返回数据格式异常" };
  }

  if (object.error) {
    const message = object.error.message || JSON.stringify(object.error);
    return { success: false, error: `HF LFS 错误: ${message}` };
  }

  // actions.upload 不存在时，表示对象已在 LFS 中，无需重复上传
  if (object.actions?.upload) {
    const uploadResult = await uploadHFLfsObject(fileBuffer, oid, object.actions.upload);
    if (!uploadResult.success) {
      return uploadResult;
    }
  }

  return { success: true, oid, size };
}

export class HuggingFaceStorageClient extends RegistryBackedStorageClient {
  constructor(config: Record<string, any> | undefined, saving?: Record<string, any>) {
    super("huggingface", config, saving);
  }

  private getToken(): string {
    return normalizeHFToken(this.config.token);
  }

  private getRepo(): string {
    return normalizeHFRepo(this.config.repo || this.config.huggingfaceRepo || this.config.datasetRepo);
  }

  private getResolveUrl(pathInRepo: string): string {
    return `${HF_BASE_URL}/datasets/${this.getRepo()}/resolve/main/${encodeURIComponent(pathInRepo)}`;
  }

  // ---- 连接检测 ----
  async testConnection(): Promise<Record<string, any>> {
    const repo = this.getRepo();
    const token = this.getToken();
    if (!repo || !token) {
      return { connected: false, configured: false, error: "未配置 HF_TOKEN 或 HF_REPO" };
    }

    try {
      const response = await fetch(
        `${HF_BASE_URL}/api/datasets/${repo}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = (await response.json()) as Record<string, any>;
        return {
          connected: true,
          configured: true,
          repoId: data.id,
          isPrivate: data.private,
        };
      }

      const errorText = await readHFError(response);
      return { connected: false, configured: true, error: `HTTP ${response.status}: ${errorText}` };
    } catch (error: any) {
      return { connected: false, configured: true, error: error.message };
    }
  }

  // ---- 获取公开下载 URL ----
  getPublicUrl(pathInRepo: string): string {
    const repo = this.getRepo();
    return repo ? `${HF_BASE_URL}/datasets/${repo}/resolve/main/${encodeURIComponent(pathInRepo)}` : "";
  }

  // ---- 上传（支持 LFS + Regular 双模式自动选择） ----
  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const repo = this.getRepo();
    const token = this.getToken();
    if (!repo || !token) {
      throw new Error("HuggingFace storage requires token and repo.");
    }

    const buffer = typeof body === "string"
      ? new TextEncoder().encode(body).buffer as ArrayBuffer
      : body;
    const pathInRepo = this.normalizeKey(key);
    const fileName = pathInRepo.split("/").pop() || "upload.bin";
    const size = buffer.byteLength;

    // 与官方 SDK 一致，先做 preupload 让服务端判定 regular / lfs
    const preupload = await detectHFUploadMode(pathInRepo, buffer, token, repo);
    if (!preupload.success) {
      throw new Error(preupload.error);
    }

    let operationLine: Record<string, any>;

    if (preupload.uploadMode === "lfs") {
      const lfsUpload = await uploadToHFLfs(buffer, token, repo);
      if (!lfsUpload.success) {
        throw new Error(lfsUpload.error);
      }

      operationLine = {
        key: "lfsFile",
        value: {
          path: pathInRepo,
          algo: "sha256",
          size: lfsUpload.size,
          oid: lfsUpload.oid,
        },
      };
    } else {
      // Regular 模式：检查大小限制
      const maxSize = 35 * 1024 * 1024;
      if (size > maxSize) {
        throw new Error(`HuggingFace regular upload limit exceeded (35MB). File size: ${formatBytes(size)}. Consider using a larger file which will auto-detect LFS mode.`);
      }

      const base64Content = toBase64(buffer);
      operationLine = {
        key: "file",
        value: {
          content: base64Content,
          path: pathInRepo,
          encoding: "base64",
        },
      };
    }

    const bodyPayload = createHFCommitBody([
      {
        key: "header",
        value: { summary: `Upload ${fileName}` },
      },
      operationLine,
    ]);

    const response = await fetch(getHFCommitUrl(repo), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-ndjson",
      },
      body: bodyPayload,
    });

    if (!response.ok) {
      const errorText = await readHFError(response);
      throw new Error(`HF 上传失败 (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as Record<string, any>;

    this.registerFile(key, {
      downloadUrl: this.getResolveUrl(pathInRepo),
      contentType,
      size,
      lastModified: new Date().toISOString(),
      metadata: {
        hfPath: pathInRepo,
        hfCommit: result.commitOid || null,
        hfUploadMode: preupload.uploadMode,
      },
    });
  }

  // ---- 下载（支持 Range） ----
  async getObject(key: string): Promise<Response> {
    const entry = this.getEntry(key);
    const pathInRepo = entry?.metadata?.hfPath || this.normalizeKey(key);
    const repo = this.getRepo();
    if (!repo) {
      return new Response("HuggingFace 仓库未配置", { status: 500 });
    }

    const url = this.getResolveUrl(pathInRepo);
    const headers: Record<string, string> = {};

    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers,
      redirect: "follow",
    });

    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }
    return response;
  }

  // ---- 删除 ----
  async deleteObject(key: string): Promise<void> {
    const repo = this.getRepo();
    const token = this.getToken();
    if (!repo || !token) {
      throw new Error("HuggingFace storage requires token and repo.");
    }

    const entry = this.getEntry(key);
    const pathInRepo = entry?.metadata?.hfPath || this.normalizeKey(key);

    const bodyPayload = createHFCommitBody([
      {
        key: "header",
        value: { summary: `Delete ${pathInRepo}` },
      },
      {
        key: "deletedFile",
        value: { path: pathInRepo },
      },
    ]);

    try {
      const response = await fetch(getHFCommitUrl(repo), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-ndjson",
        },
        body: bodyPayload,
      });

      if (response.ok) {
        this.removeEntry(key);
      } else {
        const errorText = await readHFError(response);
        console.warn(`HF delete failed (${response.status}): ${errorText}`);
      }
    } catch (error) {
      console.error("HF delete error:", error instanceof Error ? error.message : error);
    }
  }
}

// ============================================================
// GitHub 存储（参照 001 项目全面升级：Contents + Releases 双模式）
// ============================================================

function normalizeGitHubToken(value: unknown): string {
  if (!value) return "";
  return String(value).replace(/^Bearer\s+/i, "").trim();
}

function normalizeGitHubRepo(value: unknown): string {
  if (!value) return "";
  const cleaned = String(value)
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^\/+|\/+$/g, "");
  const [owner, repo] = cleaned.split("/");
  if (!owner || !repo) return "";
  return `${owner}/${repo}`;
}

function normalizeGitHubApiBase(value: unknown): string {
  if (!value) return "https://api.github.com";
  try {
    return new URL(String(value)).toString().replace(/\/+$/, "");
  } catch {
    return "https://api.github.com";
  }
}

function normalizeGitHubMode(value: unknown): string {
  const mode = String(value || "releases").trim().toLowerCase();
  return mode === "contents" ? "contents" : "releases";
}

function encodeGitHubPath(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized) return "";
  return normalized.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export class GitHubStorageClient extends RegistryBackedStorageClient {
  private cachedRelease: Record<string, any> | null = null;

  constructor(config: Record<string, any> | undefined, saving?: Record<string, any>) {
    super("github", config, saving);
  }

  private getToken(): string {
    return normalizeGitHubToken(this.config.token);
  }

  private getRepo(): string {
    return normalizeGitHubRepo(this.config.repo);
  }

  private getApiBase(): string {
    return normalizeGitHubApiBase(this.config.apiBase);
  }

  private getBranch(): string {
    return String(this.config.branch || "").trim();
  }

  private getPrefix(): string {
    return String(this.config.prefix || this.config.path || "").trim();
  }

  private getMode(): string {
    return normalizeGitHubMode(this.config.mode);
  }

  private getReleaseTag(): string {
    return String(this.config.releaseTag || this.config.tag || "").trim();
  }

  // ---- 认证头 ----
  private authHeaders(extra: Record<string, string> = {}, overrideAccept: string | null = null): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getToken()}`,
      "User-Agent": "clist-cloudflare-worker",
      Accept: overrideAccept || "application/vnd.github+json",
      ...extra,
    };
  }

  // ---- 仓库 API URL 构建 ----
  private repoApi(pathname: string): string {
    return `${this.getApiBase()}/repos/${this.getRepo()}${pathname}`;
  }

  // ---- Contents 模式路径 ----
  private contentsPath(key: string): string {
    const keyPath = normalizePath(key);
    const prefix = this.getPrefix();
    if (!prefix) return keyPath;
    return keyPath ? `${prefix}/${keyPath}` : prefix;
  }

  // ---- Releases 模式资产名 ----
  private releaseAssetName(storageKey: string = "", fallbackName: string = ""): string {
    const keyPath = normalizePath(storageKey || fallbackName || `file_${Date.now()}`);
    const merged = this.getPrefix() ? `${this.getPrefix()}/${keyPath}` : keyPath;
    return merged.replace(/\//g, "__");
  }

  // ---- 解析 upload_url 模板 ----
  private parseUploadUrl(template: string): string {
    return String(template || "").replace(/\{.+\}$/, "");
  }

  // ---- 连接检测 ----
  async testConnection(): Promise<Record<string, any>> {
    const repo = this.getRepo();
    const token = this.getToken();
    if (!repo || !token) {
      return {
        connected: false,
        configured: false,
        message: "Not configured",
      };
    }

    try {
      // 检测仓库可访问性
      const repoResponse = await fetch(this.repoApi(""), {
        headers: this.authHeaders(),
      });

      if (!repoResponse.ok) {
        const detail = await parseErrorBody(repoResponse);
        return {
          connected: false,
          configured: true,
          status: repoResponse.status,
          message: detail || "Repository access failed",
          detail: detail || undefined,
        };
      }

      const mode = this.getMode();
      if (mode === "contents") {
        return {
          connected: true,
          configured: true,
          mode: "contents",
          message: "Connected (Contents mode, 20MB limit)",
        };
      }

      // Releases 模式：验证 tag
      const releaseTag = this.getReleaseTag();
      if (releaseTag) {
        const release = await this.getReleaseByTag(releaseTag, false);
        if (!release) {
          return {
            connected: false,
            configured: true,
            mode: "releases",
            message: `Release tag "${releaseTag}" does not exist`,
          };
        }
      }

      return {
        connected: true,
        configured: true,
        mode: "releases",
        message: "Connected (Releases mode)",
      };
    } catch (error: any) {
      return {
        connected: false,
        configured: true,
        message: error.message || "Connection failed",
        detail: error.message || "Connection failed",
      };
    }
  }

  // ========== Contents API 操作 ==========

  /**
   * 获取 Contents 路径的元数据（包括 sha）
   */
  private async getContentsMetadata(pathInRepo: string): Promise<Record<string, any> | null> {
    const response = await fetch(this.repoApi(`/contents/${encodeGitHubPath(pathInRepo)}`), {
      headers: this.authHeaders(),
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const detail = await parseErrorBody(response);
      throw new Error(`GitHub contents lookup failed (${response.status}): ${detail}`);
    }
    return response.json();
  }

  private async uploadViaContents(key: string, buffer: ArrayBuffer, fileName: string): Promise<Record<string, any>> {
    const maxSize = 20 * 1024 * 1024;
    if (buffer.byteLength > maxSize) {
      throw new Error("GitHub Contents mode is limited to 20MB. Use Releases mode for larger files.");
    }

    const pathInRepo = this.contentsPath(key || fileName);
    if (!pathInRepo) {
      throw new Error("GitHub Contents mode requires a valid storage path.");
    }

    // 增量更新：先查已有 SHA
    const existing = await this.getContentsMetadata(pathInRepo);
    const payload: Record<string, any> = {
      message: `clist upload: ${pathInRepo}`,
      content: toBase64(buffer),
    };
    if (this.getBranch()) payload.branch = this.getBranch();
    if (existing?.sha) payload.sha = existing.sha;

    const response = await fetch(this.repoApi(`/contents/${encodeGitHubPath(pathInRepo)}`), {
      method: "PUT",
      headers: this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new Error(`GitHub contents upload failed (${response.status}): ${json.message || "Unknown error"}`);
    }

    return {
      storagePath: pathInRepo,
      metadata: {
        githubMode: "contents",
        githubPath: pathInRepo,
        githubSha: json.content?.sha || null,
        githubRepo: this.getRepo(),
      },
    };
  }

  private async downloadViaContents(
    key: string,
    metadata: Record<string, any> = {},
    range: string = ""
  ): Promise<Response | null> {
    const pathInRepo = metadata.githubPath || this.contentsPath(key);
    if (!pathInRepo) return null;

    const headers: Record<string, string> = {};
    if (range) headers["Range"] = range;

    const response = await fetch(this.repoApi(`/contents/${encodeGitHubPath(pathInRepo)}`), {
      headers: this.authHeaders(headers, "application/vnd.github.raw"),
      redirect: "follow",
    });

    if (!response.ok && response.status !== 206) {
      if (response.status === 404) return null;
      const detail = await parseErrorBody(response);
      throw new Error(`GitHub contents download failed (${response.status}): ${detail}`);
    }

    return response;
  }

  private async deleteViaContents(key: string, metadata: Record<string, any> = {}): Promise<boolean> {
    const pathInRepo = metadata.githubPath || this.contentsPath(key);
    if (!pathInRepo) return false;

    const existing = await this.getContentsMetadata(pathInRepo);
    if (!existing?.sha) return true;

    const payload: Record<string, any> = {
      message: `clist delete: ${pathInRepo}`,
      sha: existing.sha,
    };
    if (this.getBranch()) payload.branch = this.getBranch();

    const response = await fetch(this.repoApi(`/contents/${encodeGitHubPath(pathInRepo)}`), {
      method: "DELETE",
      headers: this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 404) return true;
    const detail = await parseErrorBody(response);
    throw new Error(`GitHub contents delete failed (${response.status}): ${detail}`);
  }

  // ========== Releases API 操作 ==========

  private async getReleaseByTag(tag: string, createIfMissing: boolean = false): Promise<Record<string, any> | null> {
    const response = await fetch(this.repoApi(`/releases/tags/${encodeURIComponent(tag)}`), {
      headers: this.authHeaders(),
    });

    if (response.status === 404) {
      if (!createIfMissing) return null;
      return this.createRelease(tag);
    }
    if (!response.ok) {
      const detail = await parseErrorBody(response);
      throw new Error(`GitHub release lookup failed (${response.status}): ${detail}`);
    }
    return response.json();
  }

  private async getLatestRelease(createIfMissing: boolean = false): Promise<Record<string, any> | null> {
    const response = await fetch(this.repoApi("/releases/latest"), {
      headers: this.authHeaders(),
    });

    if (response.status === 404) {
      if (!createIfMissing) return null;
      return this.createRelease("clist-storage");
    }
    if (!response.ok) {
      const detail = await parseErrorBody(response);
      throw new Error(`GitHub latest release lookup failed (${response.status}): ${detail}`);
    }
    return response.json();
  }

  private async createRelease(tag: string): Promise<Record<string, any>> {
    const response = await fetch(this.repoApi("/releases"), {
      method: "POST",
      headers: this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        draft: false,
        prerelease: false,
      }),
    });

    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new Error(`GitHub create release failed (${response.status}): ${json.message || "Unknown error"}`);
    }
    return json;
  }

  private async ensureRelease(): Promise<Record<string, any>> {
    if (this.cachedRelease?.id) {
      return this.cachedRelease;
    }

    const releaseTag = this.getReleaseTag();
    const release: Record<string, any> = releaseTag
      ? (await this.getReleaseByTag(releaseTag, true))!
      : (await this.getLatestRelease(true))!;

    this.cachedRelease = release;
    return release;
  }

  private async listReleaseAssets(releaseId: number): Promise<Array<Record<string, any>>> {
    const response = await fetch(this.repoApi(`/releases/${releaseId}/assets?per_page=100`), {
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const detail = await parseErrorBody(response);
      throw new Error(`GitHub release assets list failed (${response.status}): ${detail}`);
    }
    return response.json();
  }

  private async findReleaseAsset(releaseId: number, assetName: string): Promise<Record<string, any> | null> {
    const assets = await this.listReleaseAssets(releaseId);
    return assets.find((asset) => asset.name === assetName) || null;
  }

  private async deleteReleaseAssetById(assetId: number): Promise<boolean> {
    const response = await fetch(this.repoApi(`/releases/assets/${assetId}`), {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (response.ok || response.status === 404) return true;
    const detail = await parseErrorBody(response);
    throw new Error(`GitHub release asset delete failed (${response.status}): ${detail}`);
  }

  private async resolveReleaseAsset(
    key: string,
    metadata: Record<string, any> = {}
  ): Promise<Record<string, any> | null> {
    if (metadata.githubAssetId) {
      const response = await fetch(this.repoApi(`/releases/assets/${metadata.githubAssetId}`), {
        headers: this.authHeaders(),
      });

      if (response.ok) {
        return response.json();
      }
      if (response.status !== 404) {
        const detail = await parseErrorBody(response);
        throw new Error(`GitHub release asset lookup failed (${response.status}): ${detail}`);
      }
    }

    const releaseId = metadata.githubReleaseId || (await this.ensureRelease()).id;
    const assetName = metadata.githubAssetName || this.releaseAssetName(key);
    return this.findReleaseAsset(releaseId, assetName);
  }

  private async uploadViaReleases(
    key: string,
    buffer: ArrayBuffer,
    fileName: string,
    contentType: string
  ): Promise<Record<string, any>> {
    const release = await this.ensureRelease();
    const assetName = this.releaseAssetName(key, fileName);

    // 如果已存在同名 asset，先删除
    const existing = await this.findReleaseAsset(release.id, assetName);
    if (existing?.id) {
      await this.deleteReleaseAssetById(existing.id);
    }

    const uploadUrl = new URL(this.parseUploadUrl(release.upload_url));
    uploadUrl.searchParams.set("name", assetName);

    const response = await fetch(uploadUrl.toString(), {
      method: "POST",
      headers: this.authHeaders({
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
      }),
      body: buffer,
    });

    const json = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new Error(`GitHub release upload failed (${response.status}): ${json.message || "Unknown error"}`);
    }

    return {
      storagePath: this.contentsPath(key || fileName),
      metadata: {
        githubMode: "releases",
        githubRepo: this.getRepo(),
        githubReleaseId: release.id,
        githubAssetId: json.id || null,
        githubAssetName: json.name || assetName,
        githubDownloadUrl: json.browser_download_url || "",
      },
    };
  }

  private async downloadViaReleases(
    key: string,
    metadata: Record<string, any> = {},
    range: string = ""
  ): Promise<Response | null> {
    const asset = await this.resolveReleaseAsset(key, metadata);
    if (!asset?.id) return null;

    const headers: Record<string, string> = {};
    if (range) headers["Range"] = range;

    const assetApiResponse = await fetch(this.repoApi(`/releases/assets/${asset.id}`), {
      headers: this.authHeaders(headers, "application/octet-stream"),
      redirect: "manual",
    });

    if (assetApiResponse.status === 404) return null;
    if (assetApiResponse.status === 302 || assetApiResponse.status === 301) {
      const redirectUrl = assetApiResponse.headers.get("location");
      if (!redirectUrl) {
        throw new Error("GitHub release download redirect location missing.");
      }
      const response = await fetch(redirectUrl, {
        headers: range ? { Range: range } : {},
        redirect: "follow",
      });
      if (!response.ok && response.status !== 206) {
        throw new Error(`GitHub release download failed (${response.status}).`);
      }
      return response;
    }

    if (!assetApiResponse.ok && assetApiResponse.status !== 206) {
      const detail = await parseErrorBody(assetApiResponse);
      throw new Error(`GitHub release download failed (${assetApiResponse.status}): ${detail}`);
    }

    return assetApiResponse;
  }

  private async deleteViaReleases(key: string, metadata: Record<string, any> = {}): Promise<boolean> {
    const asset = await this.resolveReleaseAsset(key, metadata);
    if (!asset?.id) return true;
    return this.deleteReleaseAssetById(asset.id);
  }

  // ========== 统一接口 ==========

  async putObject(key: string, body: ArrayBuffer | string, contentType = "application/octet-stream"): Promise<void> {
    const token = this.getToken();
    const repo = this.getRepo();
    if (!token || !repo) {
      throw new Error("GitHub storage requires repo and token.");
    }

    const buffer = typeof body === "string"
      ? new TextEncoder().encode(body).buffer as ArrayBuffer
      : body;
    const fileName = this.normalizeKey(key).split("/").pop() || "upload.bin";
    const size = buffer.byteLength;
    const mode = this.getMode();

    let result: Record<string, any>;
    if (mode === "contents") {
      result = await this.uploadViaContents(key, buffer, fileName);
    } else {
      result = await this.uploadViaReleases(key, buffer, fileName, contentType);
    }

    const meta = result.metadata || {};
    // Releases 模式使用 browser_download_url；Contents 模式使用 raw 地址
    const downloadUrl = meta.githubDownloadUrl
      || `${this.getApiBase()}/repos/${repo}/contents/${encodeGitHubPath(meta.githubPath || this.contentsPath(key))}`;

    this.registerFile(key, {
      downloadUrl,
      contentType,
      size,
      lastModified: new Date().toISOString(),
      metadata: meta,
    });
  }

  async getObject(key: string): Promise<Response> {
    const token = this.getToken();
    const repo = this.getRepo();
    if (!token || !repo) {
      return new Response("GitHub not configured", { status: 500 });
    }

    const entry = this.getEntry(key);
    const metadata = entry?.metadata || {};
    const mode = String(metadata.githubMode || this.getMode()).toLowerCase();

    let response: Response | null;
    if (mode === "contents") {
      response = await this.downloadViaContents(key, metadata);
    } else {
      response = await this.downloadViaReleases(key, metadata);
    }

    if (!response) {
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

    const entry = this.getEntry(key);
    const metadata = entry?.metadata || {};
    const mode = String(metadata.githubMode || this.getMode()).toLowerCase();

    let deleted: boolean;
    if (mode === "contents") {
      deleted = await this.deleteViaContents(key, metadata);
    } else {
      deleted = await this.deleteViaReleases(key, metadata);
    }

    if (deleted) {
      this.removeEntry(key);
    }
  }
}

// ============================================================
// 工厂函数
// ============================================================

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
