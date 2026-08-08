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
      const folderPath = (r.folder_path || "").replace(/\/+$/, "");
      // 构建文件的存储 key：优先使用 folder_path，如果为空则尝试从 file_name 推断路径
      // （上传通知中已标明路径，如 "docs/sub/报告.pdf"，恢复时据此重建文件夹）
      let key: string;
      if (folderPath) {
        key = `${folderPath}/${fileName}`;
      } else if (fileName.includes("/")) {
        // 文件名中包含路径分隔符，说明上传通知中标明了路径
        key = fileName;
        const parentPath = fileName.substring(0, fileName.lastIndexOf("/"));
        if (parentPath) folders.add(parentPath);
      } else {
        key = fileName;
      }
      if (folderPath) folders.add(folderPath);
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

    // Add directory markers for each folder, including parent folders
    for (const f of Array.from(folders)) {
      // 递归添加所有父级目录
      const parts = f.split("/");
      for (let i = 0; i < parts.length; i++) {
        const ancestor = parts.slice(0, i + 1).join("/");
        const dirKey = ancestor.endsWith("/") ? ancestor : `${ancestor}/`;
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

    // Admin manual restore action
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
