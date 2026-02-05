import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config.js";

const buildS3Client = () =>
  new S3Client({
    region: env.AWS_REGION,
    credentials:
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

export const isS3Configured = () => Boolean(env.AWS_REGION && env.AWS_S3_BUCKET);

export const uploadToS3 = async ({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer;
  contentType: string;
}) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not configured.");
  }

  const s3 = buildS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
};

export const signS3Key = async (key?: string | null) => {
  if (!isS3Configured() || !key) {
    return null;
  }

  if (key.startsWith("http")) {
    return null;
  }

  const s3 = buildS3Client();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    }),
    { expiresIn: 60 * 60 },
  );
};

export const normalizeS3Key = (value: string) => {
  if (!value || !value.startsWith("http")) {
    return value;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const bucket = env.AWS_S3_BUCKET;

    if (!bucket || !host.includes("amazonaws.com")) {
      return value;
    }

    let path = url.pathname.replace(/^\/+/, "");

    if (path.startsWith(`${bucket}/`)) {
      path = path.slice(bucket.length + 1);
    }

    return decodeURIComponent(path);
  } catch {
    return value;
  }
};
