import type { Route } from "./+types/api.telegram-webhook";
import { initDatabase, getStorageById, updateStorage } from "~/lib/storage";

/**
 * Telegram Webhook 端点
 * 接收 Telegram 推送的消息更新，解析 bot 自己发送的文件通知消息，
 * 从中提取文件元数据并写入 telegram_files 表和 saving_json。
 * 
 * 通知消息格式（由 buildTelegramUploadNoticeText 生成）：
 *   文件上传完成
 *   名称: example.txt
 *   路径: folder/subfolder/example.txt
 *   大小: 1.50 MB
 *   下载链接: https://api.telegram.org/file/bot...
 */

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  document?: {
    file_id: string;
    file_name?: string;
    file_size?: number;
  };
  caption?: string;
}

interface ParsedFileInfo {
  fileName: string;
  storagePath: string;
  fileSize: number;
  downloadUrl: string;
}

function parseFileNoticeCaption(caption: string): ParsedFileInfo | null {
  // 必须包含标志性开头
  if (!caption.includes("文件上传完成")) return null;

  const nameMatch = caption.match(/名称:\s*(.+)/);
  const pathMatch = caption.match(/路径:\s*(.+)/);
  const sizeMatch = caption.match(/大小:\s*(.+)/);
  const urlMatch = caption.match(/下载链接:\s*(.+)/);

  const fileName = nameMatch?.[1]?.trim() || "unknown";
  const storagePath = pathMatch?.[1]?.trim() || fileName;
  const downloadUrl = urlMatch?.[1]?.trim() || "";

  // 解析大小字符串（如 "1.50 MB"）
  let fileSize = 0;
  if (sizeMatch) {
    const sizeStr = sizeMatch[1].trim();
    const numMatch = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      const unit = (numMatch[2] || "B").toUpperCase();
      const multipliers: Record<string, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 };
      fileSize = Math.round(num * (multipliers[unit] || 1));
    }
  }

  return { fileName, storagePath, fileSize, downloadUrl };
}

function deriveFolderPath(storagePath: string): { folderPath: string | null; fileName: string } {
  if (storagePath.includes("/")) {
    const lastSlash = storagePath.lastIndexOf("/");
    return {
      folderPath: storagePath.substring(0, lastSlash),
      fileName: storagePath.substring(lastSlash + 1),
    };
  }
  return { folderPath: null, fileName: storagePath };
}

export async function action({ request, context }: Route.ActionArgs) {
  const db = context.cloudflare.env.DB;
  await initDatabase(db);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    
    // 处理普通消息和频道消息
    const msg = update.message || update.channel_post;
    if (!msg || !msg.document || !msg.caption) {
      // 不是文件消息或没有 caption，忽略
      return Response.json({ ok: true });
    }

    const doc = msg.document;
    const caption = msg.caption;

    // 解析 caption
    const parsed = parseFileNoticeCaption(caption);
    if (!parsed) {
      // 不是我们的上传通知，忽略
      return Response.json({ ok: true });
    }

    const chatId = String(msg.chat.id);
    const fileId = doc.file_id;
    const messageId = msg.message_id;
    const { folderPath, fileName } = deriveFolderPath(parsed.storagePath);

    // Upsert into telegram_files
    await db.prepare(
      `INSERT INTO telegram_files (file_id, chat_id, message_id, file_name, folder_path, size, download_url, storage_ids, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', datetime('now'))
       ON CONFLICT(file_id) DO UPDATE SET
         chat_id = COALESCE(excluded.chat_id, telegram_files.chat_id),
         message_id = COALESCE(excluded.message_id, telegram_files.message_id),
         file_name = excluded.file_name,
         folder_path = excluded.folder_path,
         size = excluded.size,
         download_url = excluded.download_url,
         updated_at = datetime('now')`
    )
    .bind(fileId, chatId, messageId, fileName, folderPath, parsed.fileSize, parsed.downloadUrl)
    .run();

    // Also update any Telegram storage's saving_json that uses this chatId
    // Find all telegram-type storages with this chatId
    const storages = await db.prepare(
      "SELECT id, saving_json FROM storages WHERE type = 'telegram'"
    ).all<{ id: number; saving_json: string | null }>();

    for (const row of storages.results || []) {
      const storage = await getStorageById(db, row.id);
      if (!storage) continue;
      
      const configChatId = storage.config?.chatId || storage.config?.chat_id;
      if (String(configChatId) !== chatId) continue;

      // Update this storage's saving.objects
      const existingObjects = (storage.saving && storage.saving.objects) || {};
      const key = parsed.storagePath;

      // Only add if not already present (avoid overwriting with potentially stale data)
      if (!existingObjects[key]) {
        existingObjects[key] = {
          kind: "file",
          path: key,
          downloadUrl: parsed.downloadUrl,
          contentType: "application/octet-stream",
          size: parsed.fileSize,
          lastModified: new Date().toISOString(),
          metadata: {
            telegramFileId: fileId,
            telegramMessageId: messageId,
            storagePath: parsed.storagePath,
            chatId,
            fileName,
            folderPath,
          },
        };

        // Also ensure parent directories exist
        if (folderPath) {
          const parts = folderPath.split("/");
          let currentPath = "";
          for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const dirKey = `${currentPath}/`;
            if (!existingObjects[dirKey]) {
              existingObjects[dirKey] = {
                kind: "directory",
                path: dirKey,
                size: 0,
                contentType: "application/x-directory",
                lastModified: new Date().toISOString(),
              };
            }
          }
        }

        await updateStorage(db, row.id, { saving: { objects: existingObjects } });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    // Always return 200 to Telegram to prevent retries
    return Response.json({ ok: false, error: String(err) });
  }
}

// GET 用于设置 webhook 和健康检查
export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  await initDatabase(db);
  
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "set-webhook") {
    // 设置 webhook — 需要知道当前 worker 的 URL
    const workerUrl = url.searchParams.get("url");
    if (!workerUrl) {
      return Response.json({ error: "Missing 'url' parameter" }, { status: 400 });
    }

    // 从第一个 Telegram 存储中获取 botToken
    const storages = await db.prepare(
      "SELECT config_json FROM storages WHERE type = 'telegram' LIMIT 1"
    ).first<{ config_json: string | null }>();
    
    if (!storages) {
      return Response.json({ error: "No Telegram storage configured" }, { status: 400 });
    }

    let config: Record<string, any> = {};
    try { config = JSON.parse(storages.config_json || "{}"); } catch {}

    const botToken = config.botToken;
    if (!botToken) {
      return Response.json({ error: "No botToken in Telegram storage config" }, { status: 400 });
    }

    const webhookUrl = `${workerUrl}/api/telegram-webhook`;
    const apiBase = config.apiBase || "https://api.telegram.org";

    try {
      const response = await fetch(`${apiBase}/bot${botToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const result = await response.json();
      return Response.json({ ok: true, webhookUrl, result });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  if (action === "get-webhook-info") {
    const storages = await db.prepare(
      "SELECT config_json FROM storages WHERE type = 'telegram' LIMIT 1"
    ).first<{ config_json: string | null }>();
    
    if (!storages) {
      return Response.json({ error: "No Telegram storage configured" }, { status: 400 });
    }

    let config: Record<string, any> = {};
    try { config = JSON.parse(storages.config_json || "{}"); } catch {}

    const botToken = config.botToken;
    if (!botToken) {
      return Response.json({ error: "No botToken" }, { status: 400 });
    }

    const apiBase = config.apiBase || "https://api.telegram.org";
    const response = await fetch(`${apiBase}/bot${botToken}/getWebhookInfo`);
    const result = await response.json();
    return Response.json({ ok: true, result });
  }

  return Response.json({ ok: true, message: "Telegram webhook endpoint" });
}
