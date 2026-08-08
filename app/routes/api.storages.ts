import type { Route } from "./+types/api.storages";
import {
  getAllStorages,
  getPublicStorages,
  createStorage,
  updateStorage,
  deleteStorage,
  getStorageById,
  initDatabase,
  exportStoragesForBackup,
  importStoragesFromBackup,
  type BackupData,
} from "~/lib/storage";
import {
  requireAuth,
  createSession,
  deleteSession,
  validateAdmin,
  createSessionCookie,
  deleteSessionCookie,
  getSessionIdFromCookie,
} from "~/lib/auth";
import { getRequestMeta, logAudit } from "~/lib/audit";

/**
 * 从 Telegram 聊天记录中恢复索引
 * 这是 D1 丢失后的最后手段。
 * 
 * 恢复策略：
 * 1. 优先使用备份文件（backupMessageId）
 * 2. 临时关闭 webhook → 用 getUpdates 拉取消息 → 恢复 webhook
 */
async function rebuildTelegramSavingFromChat(
  db: D1Database,
  botToken: string,
  chatId: string,
  storageId: number,
  backupMessageId?: number,
  apiBase = "https://api.telegram.org"
): Promise<{ count: number; fromBackup: boolean; details: string }> {
  const apiUrl = `${apiBase}/bot${botToken}`;

  // 策略1: 使用指定的备份文件或默认备份文件
  const storage = await getStorageById(db, storageId);
  const targetBackupId = backupMessageId || storage?.saving?.backupMessageId as number | undefined;

  if (targetBackupId) {
    try {
      // 转发备份文件消息到自己，获取文件内容
      const fwdRes = await fetch(`${apiUrl}/forwardMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          from_chat_id: chatId,
          message_id: targetBackupId,
        }),
      });
      const fwdJson = (await fwdRes.json()) as Record<string, any>;
      
      if (fwdRes.ok && fwdJson.ok) {
        const doc = fwdJson.result?.document;
        const newFwdMsgId = fwdJson.result?.message_id;
        
        if (doc?.file_id) {
          const fileRes = await fetch(`${apiUrl}/getFile?file_id=${encodeURIComponent(doc.file_id)}`);
          const fileJson = (await fileRes.json()) as Record<string, any>;
          const filePath = fileJson?.result?.file_path;
          
          if (filePath) {
            const downloadRes = await fetch(`${apiBase}/file/bot${botToken}/${encodeURIComponent(filePath)}`);
            const text = await downloadRes.text();
            const backupData = JSON.parse(text) as {
              version: number; exportedAt: string;
              files: Array<{ file_id: string; message_id: number; file_name: string; folder_path: string; size: number; download_url: string; }>;
            };

            // 删除转发的消息
            if (newFwdMsgId) {
              await fetch(`${apiUrl}/deleteMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, message_id: newFwdMsgId }),
              }).catch(() => {});
            }

            if (backupData.files && Array.isArray(backupData.files)) {
              const newObjects: Record<string, any> = {};
              const folders = new Set<string>();
              for (const f of backupData.files) {
                const fp = f.folder_path || "";
                const key = fp ? `${fp.replace(/\/+$/, "")}/${f.file_name}` : f.file_name;
                if (fp) folders.add(fp.replace(/\/+$/, ""));
                newObjects[key] = {
                  kind: "file", path: key, downloadUrl: f.download_url || "",
                  contentType: "application/octet-stream", size: f.size || 0,
                  lastModified: new Date().toISOString(),
                  metadata: {
                    telegramFileId: f.file_id, telegramMessageId: f.message_id || null,
                    fileName: f.file_name || null, folderPath: fp || null,
                  },
                };
              }
              for (const f of Array.from(folders)) {
                const dirKey = f.endsWith("/") ? f : `${f}/`;
                if (!newObjects[dirKey]) {
                  newObjects[dirKey] = {
                    kind: "directory", path: dirKey, size: 0,
                    contentType: "application/x-directory", lastModified: new Date().toISOString(),
                  };
                }
              }
              if (Object.keys(newObjects).length > 0) {
                await updateStorage(db, storageId, { saving: { objects: newObjects } });
                for (const f of backupData.files) {
                  await db.prepare(
                    `INSERT INTO telegram_files (file_id, chat_id, message_id, file_name, folder_path, size, download_url, storage_ids, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                     ON CONFLICT(file_id) DO UPDATE SET
                       chat_id = COALESCE(excluded.chat_id, telegram_files.chat_id),
                       message_id = COALESCE(excluded.message_id, telegram_files.message_id),
                       file_name = excluded.file_name, folder_path = excluded.folder_path,
                       size = excluded.size, download_url = excluded.download_url,
                       updated_at = datetime('now')`
                  )
                  .bind(f.file_id, chatId, f.message_id, f.file_name, f.folder_path || null, f.size, f.download_url, JSON.stringify([String(storageId)]))
                  .run();
                }
                return { count: backupData.files.length, fromBackup: true, details: "从备份文件恢复成功" };
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to restore from backup message:", err);
    }
  }

  // 策略2: 临时关闭 webhook，用 getUpdates 拉取最近的消息
  // 先获取当前 webhook 信息
  let originalWebhookUrl = "";
  try {
    const whInfoRes = await fetch(`${apiUrl}/getWebhookInfo`);
    const whInfo = (await whInfoRes.json()) as Record<string, any>;
    originalWebhookUrl = whInfo?.result?.url || "";
  } catch {}

  // 删除 webhook（让 getUpdates 可用）
  if (originalWebhookUrl) {
    try {
      await fetch(`${apiUrl}/deleteWebhook?drop_pending_updates=true`);
    } catch {}
  }

  let restoredCount = 0;
  try {
    // 用 getUpdates 拉取消息（offset=-1 表示从最早的未确认更新开始）
    // 先确认所有已有更新
    const ackRes = await fetch(`${apiUrl}/getUpdates?offset=-1&timeout=0`);
    const ackJson = (await ackRes.json()) as Record<string, any>;
    const updates = ackJson?.result as Array<any> || [];

    const newObjects: Record<string, any> = {};
    const folders = new Set<string>();

    for (const update of updates) {
      const msg = update.message || update.channel_post;
      if (!msg?.document?.file_id || !msg.caption) continue;
      if (!msg.caption.includes("文件上传完成")) continue;

      const pathMatch = msg.caption.match(/路径:\s*(.+)/);
      const urlMatch = msg.caption.match(/下载链接:\s*(.+)/);
      const storagePath = pathMatch?.[1]?.trim() || msg.document.file_name || "unknown";
      const downloadUrl = urlMatch?.[1]?.trim() || "";
      const fileId = msg.document.file_id;

      let folderPath = "";
      let fileName = storagePath;
      if (storagePath.includes("/")) {
        const lastSlash = storagePath.lastIndexOf("/");
        folderPath = storagePath.substring(0, lastSlash);
        fileName = storagePath.substring(lastSlash + 1);
      }
      if (folderPath) folders.add(folderPath);

      newObjects[storagePath] = {
        kind: "file", path: storagePath, downloadUrl,
        contentType: "application/octet-stream", size: msg.document.file_size || 0,
        lastModified: new Date().toISOString(),
        metadata: {
          telegramFileId: fileId, telegramMessageId: msg.message_id,
          fileName, folderPath: folderPath || null, storagePath, chatId,
        },
      };

      // 写入 telegram_files
      await db.prepare(
        `INSERT INTO telegram_files (file_id, chat_id, message_id, file_name, folder_path, size, download_url, storage_ids, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(file_id) DO UPDATE SET
           chat_id = COALESCE(excluded.chat_id, telegram_files.chat_id),
           message_id = COALESCE(excluded.message_id, telegram_files.message_id),
           file_name = excluded.file_name, folder_path = excluded.folder_path,
           download_url = excluded.download_url, updated_at = datetime('now')`
      )
      .bind(fileId, chatId, msg.message_id, fileName, folderPath || null, 0, downloadUrl, JSON.stringify([String(storageId)]))
      .run();
    }

    for (const f of Array.from(folders)) {
      const dirKey = f.endsWith("/") ? f : `${f}/`;
      if (!newObjects[dirKey]) {
        newObjects[dirKey] = {
          kind: "directory", path: dirKey, size: 0,
          contentType: "application/x-directory", lastModified: new Date().toISOString(),
        };
      }
    }

    if (Object.keys(newObjects).length > 0) {
      await updateStorage(db, storageId, { saving: { objects: newObjects } });
    }
    restoredCount = Object.values(newObjects).filter((o: any) => o.kind === "file").length;
  } catch (err) {
    console.error("Failed to restore from getUpdates:", err);
  }

  // 恢复 webhook
  if (originalWebhookUrl) {
    try {
      await fetch(`${apiUrl}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalWebhookUrl }),
      });
    } catch {}
  }

  if (restoredCount === 0) {
    return {
      count: 0,
      fromBackup: false,
      details: "未找到可恢复的文件。请先使用「备份索引」上传备份文件到 Telegram 聊天，或确保聊天中有文件上传通知消息。\n\n提示：getUpdates 只能获取 Bot 启动后尚未确认的更新，如果使用了 Webhook 模式则无法获取历史消息。建议先「备份索引」再恢复。",
    };
  }

  return { count: restoredCount, fromBackup: false, details: "从聊天消息恢复成功" };
}

/**
 * 将当前索引备份为一个 JSON 文件并上传到 Telegram 聊天
 */
async function backupTelegramIndexToChat(
  db: D1Database,
  botToken: string,
  chatId: string,
  storageId: number,
  backupName: string,
  apiBase = "https://api.telegram.org"
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  try {
    // 从存储的 saving.objects 中导出所有文件（这是真正的当前文件列表）
    const storage = await getStorageById(db, storageId);
    if (!storage) return { ok: false, error: "Storage not found" };

    const objects = (storage.saving?.objects as Record<string, any>) || {};
    const files: Array<{ file_id: string; message_id: number; file_name: string; folder_path: string; size: number; download_url: string }> = [];

    for (const [key, entry] of Object.entries(objects)) {
      if (!entry || typeof entry !== "object" || entry.kind !== "file") continue;
      const meta = entry.metadata || {};
      const folderPath = meta.folderPath || (key.includes("/") ? key.substring(0, key.lastIndexOf("/")) : "");
      const fileName = meta.fileName || key.split("/").pop() || key;
      files.push({
        file_id: meta.telegramFileId || key,
        message_id: meta.telegramMessageId || 0,
        file_name: fileName,
        folder_path: folderPath,
        size: entry.size || 0,
        download_url: entry.downloadUrl || "",
      });
    }

    const safeName = (backupName || `backup-${storageId}`).replace(/[^a-zA-Z0-9_\-.一-龥]/g, "_");
    const backupData = {
      version: 1,
      name: backupName || "",
      exportedAt: new Date().toISOString(),
      chatId,
      storageId,
      files,
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("document", new File([blob], `${safeName}.json`, { type: "application/json" }));
    const caption = backupName
      ? `📦 索引备份: ${backupName}\n${new Date().toLocaleString("zh-CN")}\n文件数: ${backupData.files.length}`
      : `索引备份 - ${new Date().toLocaleString("zh-CN")}\n文件数: ${backupData.files.length}`;
    formData.append("caption", caption);

    const response = await fetch(`${apiBase}/bot${botToken}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    const json = (await response.json()) as Record<string, any>;

    if (!response.ok || !json.ok) {
      return { ok: false, error: json.description || "Upload failed" };
    }

    const newMessageId = json.result?.message_id;

    // 保存到 backupList 中，支持多个备份
    // storage 已在上方定义，直接使用
    const existingSaving = storage.saving || {};
    const backupList: Array<{ messageId: number; name: string; date: string; fileCount: number }> =
      existingSaving.backupList || [];
    
    backupList.push({
      messageId: newMessageId,
      name: backupName || `备份 ${backupList.length + 1}`,
      date: new Date().toISOString(),
      fileCount: backupData.files.length,
    });

    await updateStorage(db, storageId, {
      saving: { ...existingSaving, backupList, backupMessageId: newMessageId },
    });

    return { ok: true, messageId: newMessageId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * 获取备份列表（指定存储）
 */
async function getTelegramBackupList(db: D1Database, storageId: number): Promise<Array<{ messageId: number; name: string; date: string; fileCount: number; storageId: number; storageName: string }>> {
  const storage = await getStorageById(db, storageId);
  if (!storage) return [];
  const list = (storage.saving?.backupList as Array<any>) || [];
  return list.map((b: any) => ({ ...b, storageId, storageName: storage.name }));
}

/**
 * 获取所有 Telegram 存储的全局备份列表
 */
async function getAllTelegramBackupLists(db: D1Database): Promise<Array<{ messageId: number; name: string; date: string; fileCount: number; storageId: number; storageName: string }>> {
  const storages = await getAllStorages(db);
  const allBackups: Array<{ messageId: number; name: string; date: string; fileCount: number; storageId: number; storageName: string }> = [];
  for (const s of storages) {
    if (s.type === "telegram") {
      const list = (s.saving?.backupList as Array<any>) || [];
      for (const b of list) {
        allBackups.push({ ...b, storageId: s.id, storageName: s.name });
      }
    }
  }
  allBackups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return allBackups;
}

/**
 * 删除备份记录
 */
async function deleteTelegramBackup(db: D1Database, storageId: number, messageId: number): Promise<boolean> {
  const storage = await getStorageById(db, storageId);
  if (!storage) return false;
  const list = (storage.saving?.backupList as Array<any>) || [];
  const newList = list.filter((b: any) => b.messageId !== messageId);
  if (newList.length === list.length) return false;
  
  // 如果删除的是当前默认备份，清除 backupMessageId
  const existingSaving = storage.saving || {};
  const updateData: Record<string, any> = { saving: { ...existingSaving, backupList: newList } };
  if (existingSaving.backupMessageId === messageId) {
    updateData.saving.backupMessageId = null;
  }
  await updateStorage(db, storageId, updateData);
  
  // 尝试删除 Telegram 上的备份消息
  const botToken = storage.config?.botToken;
  const chatId = storage.config?.chatId || storage.config?.chat_id;
  if (botToken && chatId) {
    const apiBase = storage.config?.apiBase || "https://api.telegram.org";
    await fetch(`${apiBase}/bot${botToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    }).catch(() => {});
  }
  return true;
}

async function rebuildTelegramSavingFromDb(db: D1Database, chatId: string | null, storageId: number) {
  if (!chatId) return;
  try {
    const rows = await db
      .prepare("SELECT file_id, message_id, file_name, folder_path, size, download_url, updated_at, storage_ids FROM telegram_files WHERE chat_id = ? ORDER BY updated_at DESC")
      .bind(String(chatId))
      .all<{ file_id: string; message_id: number | null; file_name: string; folder_path: string | null; size: number | null; download_url: string | null; updated_at: string; storage_ids: string }>();

    // Build map of new objects from DB and collect folders
    const newObjects: Record<string, any> = {};
    const folders = new Set<string>();
    for (const r of rows.results || []) {
      const id = String(r.file_id || "");
      const fileName = r.file_name || id;
      const folderPath = r.folder_path || "";
      const key = folderPath ? `${folderPath.replace(/\/+$/, "")}/${fileName}` : fileName;
      if (folderPath) folders.add(folderPath.replace(/\/+$/, ""));
      newObjects[key] = {
        kind: "file",
        path: key,
        downloadUrl: r.download_url || "",
        contentType: "application/octet-stream",
        size: r.size || 0,
        lastModified: r.updated_at || new Date().toISOString(),
        metadata: {
          telegramFileId: r.file_id,
          telegramMessageId: r.message_id || null,
          fileName: fileName || null,
          folderPath: folderPath || null,
        },
      };
    }

    if (Object.keys(newObjects).length === 0) return;

    // Add directory markers for each folder
    for (const f of Array.from(folders)) {
      const dirKey = f.endsWith("/") ? f : `${f}/`;
      if (!newObjects[dirKey]) {
        newObjects[dirKey] = {
          kind: "directory",
          path: dirKey,
          size: 0,
          contentType: "application/x-directory",
          lastModified: new Date().toISOString(),
        };
      }
    }

    // Merge with existing saving.objects if present
    const existing = await getStorageById(db, storageId);
    const existingObjects = (existing?.saving && existing.saving.objects) || {};
    const merged: Record<string, any> = { ...existingObjects };

    for (const [k, v] of Object.entries(newObjects)) {
      if (!merged[k]) {
        merged[k] = v;
      } else {
        // merge metadata/update fields without removing existing props
        merged[k] = {
          ...merged[k],
          downloadUrl: v.downloadUrl || merged[k].downloadUrl,
          contentType: v.contentType || merged[k].contentType,
          size: v.size || merged[k].size,
          lastModified: v.lastModified || merged[k].lastModified,
          metadata: { ...(merged[k].metadata || {}), ...(v.metadata || {}) },
        };
      }
    }

    await updateStorage(db, storageId, { saving: { objects: merged } });
  } catch (err) {
    console.error("Failed to rebuild telegram saving from db:", err);
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  await initDatabase(db);

  const { isAdmin } = await requireAuth(request, db);

  if (isAdmin) {
    const storages = await getAllStorages(db);
    return Response.json({
      storages: storages.map((s) => ({
        ...s,
        secretAccessKey: "***",
        saving: {},
      })),
      isAdmin: true,
    });
  }

  const storages = await getPublicStorages(db);
  return Response.json({
    storages: storages.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      isPublic: s.isPublic,
      guestList: s.guestList,
      guestDownload: s.guestDownload,
      guestUpload: s.guestUpload,
    })),
    isAdmin: false,
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  const db = context.cloudflare.env.DB;
  await initDatabase(db);
  const meta = getRequestMeta(request);

  const method = request.method;

  if (method === "POST") {
    const body = await request.json();
    const { action: actionType } = body as { action?: string };

    // Login action
    if (actionType === "login") {
      const { username, password } = body as { username: string; password: string };
      const isValid = await validateAdmin(username, password, context.cloudflare.env as { ADMIN_USERNAME: string; ADMIN_PASSWORD: string });

      if (!isValid) {
        await logAudit(db, {
          action: "auth.login_failed",
          userType: "guest",
          ip: meta.ip,
          userAgent: meta.userAgent,
          detail: { username },
        });
        return Response.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const sessionId = await createSession(db, "admin");
      await logAudit(db, {
        action: "auth.login",
        userType: "admin",
        ip: meta.ip,
        userAgent: meta.userAgent,
        detail: { username },
      });
      return Response.json(
        { success: true },
        {
          headers: {
            "Set-Cookie": createSessionCookie(sessionId),
          },
        }
      );
    }

    // Logout action
    if (actionType === "logout") {
      const cookieHeader = request.headers.get("Cookie");
      const sessionId = getSessionIdFromCookie(cookieHeader);
      if (sessionId) {
        await deleteSession(db, sessionId);
      }
      await logAudit(db, {
        action: "auth.logout",
        userType: "admin",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return Response.json(
        { success: true },
        {
          headers: {
            "Set-Cookie": deleteSessionCookie(),
          },
        }
      );
    }

    // Export backup (admin only)
    if (actionType === "export-backup") {
      const { isAdmin } = await requireAuth(request, db, "admin");
      if (!isAdmin) {
        return Response.json({ error: "Unauthorized" }, { status: 403 });
      }

      try {
        const backup = await exportStoragesForBackup(db);
        await logAudit(db, {
          action: "backup.export",
          userType: "admin",
          ip: meta.ip,
          userAgent: meta.userAgent,
          detail: { storages: backup.storages?.length || 0 },
        });
        return Response.json({ backup });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to export backup" },
          { status: 500 }
        );
      }
    }

    // Import backup (admin only)
    if (actionType === "import-backup") {
      const { isAdmin } = await requireAuth(request, db, "admin");
      if (!isAdmin) {
        return Response.json({ error: "Unauthorized" }, { status: 403 });
      }

      const { backup, mode } = body as { backup: BackupData; mode: 'merge' | 'replace' };

      if (!backup || !backup.storages || !Array.isArray(backup.storages)) {
        return Response.json({ error: "Invalid backup data" }, { status: 400 });
      }

      if (mode !== 'merge' && mode !== 'replace') {
        return Response.json({ error: "Invalid import mode" }, { status: 400 });
      }

      try {
        const result = await importStoragesFromBackup(db, backup, mode);
        await logAudit(db, {
          action: "backup.import",
          userType: "admin",
          ip: meta.ip,
          userAgent: meta.userAgent,
          detail: { mode, imported: result.imported, skipped: result.skipped },
        });
        return Response.json({ success: true, ...result });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to import backup" },
          { status: 500 }
        );
      }
    }

    // Create storage (admin only)
    const { isAdmin } = await requireAuth(request, db, "admin");
    if (!isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Admin manual restore action (从 D1 telegram_files 表恢复)
    if (actionType === "restore-telegram") {
      const { storageId, chatId } = body as { storageId?: number; chatId?: string };
      if (!storageId || !chatId) {
        return Response.json({ error: "storageId and chatId are required" }, { status: 400 });
      }
      try {
        await rebuildTelegramSavingFromDb(db, String(chatId), Number(storageId));
        return Response.json({ success: true });
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : "restore failed" }, { status: 500 });
      }
    }

    // 从 Telegram 聊天/备份恢复索引
    if (actionType === "restore-telegram-from-chat") {
      const { storageId, backupMessageId, targetStorageId } = body as { storageId?: number; backupMessageId?: number; targetStorageId?: number };
      if (!storageId) {
        return Response.json({ error: "storageId is required" }, { status: 400 });
      }
      // storageId = 备份来源存储（用于获取 botToken/chatId）
      // targetStorageId = 恢复到哪个存储（可选，默认恢复到来源存储）
      const sourceStorage = await getStorageById(db, Number(storageId));
      if (!sourceStorage || sourceStorage.type !== "telegram") {
        return Response.json({ error: "Source storage not found or not Telegram type" }, { status: 400 });
      }
      const targetId = targetStorageId ? Number(targetStorageId) : Number(storageId);
      const targetStorage = await getStorageById(db, targetId);
      if (!targetStorage || targetStorage.type !== "telegram") {
        return Response.json({ error: "Target storage not found or not Telegram type" }, { status: 400 });
      }
      const botToken = sourceStorage.config?.botToken;
      const chatId = sourceStorage.config?.chatId || sourceStorage.config?.chat_id;
      if (!botToken || !chatId) {
        return Response.json({ error: "Missing botToken or chatId in source storage config" }, { status: 400 });
      }
      try {
        const result = await rebuildTelegramSavingFromChat(
          db, String(botToken), String(chatId), targetId,
          backupMessageId,
          sourceStorage.config?.apiBase
        );
        return Response.json({ success: true, count: result.count, fromBackup: result.fromBackup, details: result.details });
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : "restore from chat failed" }, { status: 500 });
      }
    }

    // 获取备份列表（指定存储或全局）
    if (actionType === "list-telegram-backups") {
      const { storageId } = body as { storageId?: number };
      if (storageId) {
        const list = await getTelegramBackupList(db, Number(storageId));
        return Response.json({ backups: list });
      }
      // 全局：获取所有 Telegram 存储的备份
      const list = await getAllTelegramBackupLists(db);
      return Response.json({ backups: list });
    }

    // 删除备份
    if (actionType === "delete-telegram-backup") {
      const { storageId, messageId } = body as { storageId?: number; messageId?: number };
      if (!storageId || !messageId) {
        return Response.json({ error: "storageId and messageId are required" }, { status: 400 });
      }
      const ok = await deleteTelegramBackup(db, Number(storageId), Number(messageId));
      return Response.json({ success: ok });
    }

    // 备份索引到 Telegram 聊天
    if (actionType === "backup-telegram-index") {
      const { storageId, backupName } = body as { storageId?: number; backupName?: string };
      if (!storageId) {
        return Response.json({ error: "storageId is required" }, { status: 400 });
      }
      try {
        const storage = await getStorageById(db, Number(storageId));
        if (!storage || storage.type !== "telegram") {
          return Response.json({ error: "Storage not found or not Telegram type" }, { status: 400 });
        }
        const botToken = storage.config?.botToken;
        const chatId = storage.config?.chatId || storage.config?.chat_id;
        if (!botToken || !chatId) {
          return Response.json({ error: "Missing botToken or chatId in storage config" }, { status: 400 });
        }
        const result = await backupTelegramIndexToChat(
          db, String(botToken), String(chatId), Number(storageId),
          backupName || "",
          storage.config?.apiBase
        );
        if (result.ok) {
          return Response.json({ success: true, messageId: result.messageId });
        }
        return Response.json({ error: result.error || "Backup failed" }, { status: 500 });
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : "backup failed" }, { status: 500 });
      }
    }

    try {
      const storage = await createStorage(db, body as Parameters<typeof createStorage>[1]);
      const { saving, ...safeStorage } = storage;
      await logAudit(db, {
        action: "storage.create",
        userType: "admin",
        ip: meta.ip,
        userAgent: meta.userAgent,
        storageId: storage.id,
        detail: {
          name: storage.name,
          type: storage.type,
          isPublic: storage.isPublic,
          guestList: storage.guestList,
          guestDownload: storage.guestDownload,
          guestUpload: storage.guestUpload,
        },
      });
      // If Telegram storage, attempt to restore saved objects from telegram_files
      try {
        if ((storage.type || "").toLowerCase() === "telegram") {
          const configChatId = (body as any)?.config?.chatId || storage.config?.chatId || storage.config?.chat_id || null;
          await rebuildTelegramSavingFromDb(db, configChatId ? String(configChatId) : null, storage.id);
        }
      } catch (e) {
        console.error("telegram restore on create failed:", e);
      }
      return Response.json({ storage: { ...safeStorage, secretAccessKey: "***" } });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to create storage" },
        { status: 400 }
      );
    }
  }

  if (method === "PUT") {
    const { isAdmin } = await requireAuth(request, db, "admin");
    if (!isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...input } = body as { id: number; [key: string]: unknown };

    try {
      const storage = await updateStorage(db, id, input);
      if (!storage) {
        return Response.json({ error: "Storage not found" }, { status: 404 });
      }
      const { saving, ...safeStorage } = storage;
      await logAudit(db, {
        action: "storage.update",
        userType: "admin",
        ip: meta.ip,
        userAgent: meta.userAgent,
        storageId: storage.id,
        detail: {
          name: storage.name,
          type: storage.type,
          isPublic: storage.isPublic,
          guestList: storage.guestList,
          guestDownload: storage.guestDownload,
          guestUpload: storage.guestUpload,
        },
      });
      // If Telegram storage and chatId provided/changed, attempt to restore from telegram_files
      try {
        if ((storage.type || "").toLowerCase() === "telegram") {
          const configChatId = (input as any)?.config?.chatId || (input as any)?.config?.chat_id || storage.config?.chatId || storage.config?.chat_id || null;
          if (configChatId) {
            await rebuildTelegramSavingFromDb(db, String(configChatId), storage.id);
          }
        }
      } catch (e) {
        console.error("telegram restore on update failed:", e);
      }
      return Response.json({ storage: { ...safeStorage, secretAccessKey: "***" } });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Failed to update storage" },
        { status: 400 }
      );
    }
  }

  if (method === "DELETE") {
    const { isAdmin } = await requireAuth(request, db, "admin");
    if (!isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get("id") || "0", 10);

    if (!id) {
      return Response.json({ error: "Storage ID required" }, { status: 400 });
    }

    const deleted = await deleteStorage(db, id);
    if (!deleted) {
      return Response.json({ error: "Storage not found" }, { status: 404 });
    }

    await logAudit(db, {
      action: "storage.delete",
      userType: "admin",
      ip: meta.ip,
      userAgent: meta.userAgent,
      storageId: id,
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
