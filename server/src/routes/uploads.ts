import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { isS3Configured, signS3Key, uploadToS3 } from "../utils/s3.js";

export const uploadsRouter = Router();

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!SUPPORTED_TYPES.has(file.mimetype)) {
      cb(new Error("Only JPG, PNG, or WebP images are supported."));
      return;
    }
    cb(null, true);
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!SUPPORTED_VIDEO_TYPES.has(file.mimetype)) {
      cb(new Error("Only MP4, WebM, or MOV videos are supported."));
      return;
    }
    cb(null, true);
  },
});

const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Image must be 3MB or less." });
        return;
      }
      res.status(400).json({ error: "Unable to upload image." });
      return;
    }

    if (err instanceof Error) {
      res.status(400).json({ error: err.message || "Unable to upload image." });
      return;
    }

    res.status(400).json({ error: "Unable to upload image." });
  });
};

const handleVideoUpload = (req: Request, res: Response, next: NextFunction) => {
  videoUpload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Video must be 25MB or less." });
        return;
      }
      res.status(400).json({ error: "Unable to upload video." });
      return;
    }

    if (err instanceof Error) {
      res.status(400).json({ error: err.message || "Unable to upload video." });
      return;
    }

    res.status(400).json({ error: "Unable to upload video." });
  });
};

const convertToWebp = async (buffer: Buffer) => {
  const qualitySteps = [80, 70, 60, 50];

  for (const quality of qualitySteps) {
    const output = await sharp(buffer)
      .rotate()
      .webp({ quality })
      .toBuffer();

    if (output.length <= MAX_UPLOAD_BYTES) {
      return output;
    }
  }

  throw new Error("Image is larger than 3MB after compression.");
};

const createUploadHandler =
  (prefix: "services" | "community" | "avatars" | "banners") =>
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      return res.status(500).json({
        error: "S3 is not configured. Set AWS_REGION and AWS_S3_BUCKET.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Image file is required." });
    }

    const webpBuffer = await convertToWebp(req.file.buffer);
    const key = `${prefix}/${req.user!.id}/${Date.now()}-${randomUUID()}.webp`;

    await uploadToS3({
      key,
      body: webpBuffer,
      contentType: "image/webp",
    });

    const signedUrl = await signS3Key(key);

    res.json({ key, signedUrl });
  });

const getVideoExtension = (mimetype: string) => {
  switch (mimetype) {
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "mp4";
  }
};

const createVideoUploadHandler =
  (prefix: "community") =>
  asyncHandler(async (req, res) => {
    if (!isS3Configured()) {
      return res.status(500).json({
        error: "S3 is not configured. Set AWS_REGION and AWS_S3_BUCKET.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Video file is required." });
    }

    const extension = getVideoExtension(req.file.mimetype);
    const key = `${prefix}/${req.user!.id}/${Date.now()}-${randomUUID()}.${extension}`;

    await uploadToS3({
      key,
      body: req.file.buffer,
      contentType: req.file.mimetype,
    });

    const signedUrl = await signS3Key(key);

    res.json({ key, signedUrl });
  });

uploadsRouter.post(
  "/service-image",
  authRequired,
  requireRole("provider", "admin"),
  handleUpload,
  createUploadHandler("services"),
);

uploadsRouter.post(
  "/community-image",
  authRequired,
  handleUpload,
  createUploadHandler("community"),
);

uploadsRouter.post(
  "/community-video",
  authRequired,
  handleVideoUpload,
  createVideoUploadHandler("community"),
);

uploadsRouter.post(
  "/profile-avatar",
  authRequired,
  handleUpload,
  createUploadHandler("avatars"),
);

uploadsRouter.post(
  "/profile-banner",
  authRequired,
  handleUpload,
  createUploadHandler("banners"),
);
