-- Add layout choice for community post media.
CREATE TYPE "CommunityMediaLayout" AS ENUM ('grid', 'carousel');

ALTER TABLE "CommunityPost"
ADD COLUMN "mediaLayout" "CommunityMediaLayout" NOT NULL DEFAULT 'grid';
