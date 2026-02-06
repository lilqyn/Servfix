import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { asyncHandler } from "../utils/async-handler.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import { isS3Configured, signS3Key, uploadToS3 } from "../utils/s3.js";

export const uploadsRouter = Router();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const SUPPORTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

const isSupportedImage = (file: Express.Multer.File) => {
  const mimetype = file.mimetype?.toLowerCase();
  if (mimetype && SUPPORTED_TYPES.has(mimetype)) {
    return true;
  }
  const name = file.originalname?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isSupportedImage(file)) {
      cb(new Error("Only JPG, PNG, WebP, or HEIC/HEIF images are supported."));
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
        res.status(400).json({ error: "Image must be 10MB or less." });
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
  const qualitySteps = [82, 72, 60, 50, 40];
  const pipeline = sharp(buffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true });

  for (const quality of qualitySteps) {
    const output = await pipeline.clone().webp({ quality }).toBuffer();

    if (output.length <= MAX_OUTPUT_BYTES) {
      return output;
    }
  }

  throw new Error("Image is too large after compression. Try a smaller image.");
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

    let webpBuffer: Buffer;
    try {
      webpBuffer = await convertToWebp(req.file.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload image.";
      return res.status(400).json({ error: message });
    }
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
