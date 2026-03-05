import { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        email?: string | null;
        phone?: string | null;
        username?: string | null;
      };
      requestId?: string;
      rawBody?: Buffer;
    }
  }
}

export {};
