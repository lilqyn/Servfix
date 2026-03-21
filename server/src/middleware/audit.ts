import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";

/**
 * Middleware that logs admin mutations (POST/PATCH/PUT/DELETE) to the AuditLog table.
 * Attach after authRequired so req.user is available.
 * Logs after the response is sent to avoid slowing down the request.
 */
export function auditAdmin(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();

  // Only log state-changing methods
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    return next();
  }

  // Capture original json to intercept response
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    // Log asynchronously after response
    setImmediate(() => {
      const userId = req.user?.id ?? null;
      const path = req.originalUrl || req.path;

      // Extract entity type and ID from URL pattern like /admin/users/:id/status
      const segments = path.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
      const entityType = segments[0] ?? "unknown";
      const entityId = segments[1] ?? null;
      const action = `${method} ${path}`;

      prisma.auditLog
        .create({
          data: {
            actorId: userId,
            action,
            entityType,
            entityId: entityId ?? "n/a",
            payload: JSON.parse(JSON.stringify({
              method,
              path,
              statusCode: res.statusCode,
              params: req.params,
              body: sanitizeBody(req.body),
            })),
          },
        })
        .catch(() => {
          // Audit logging should never crash the app
        });
    });

    return originalJson(body);
  };

  next();
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const sanitized = { ...(body as Record<string, unknown>) };
  // Strip potentially sensitive fields
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.token;
  delete sanitized.secret;
  delete sanitized.secretKey;
  return sanitized;
}
