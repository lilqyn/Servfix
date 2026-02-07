-- Allow guest interactions on community posts
ALTER TABLE "CommunityPostLike"
  ADD COLUMN "guestId" TEXT,
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "CommunityPostSave"
  ADD COLUMN "guestId" TEXT,
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "CommunityPostComment"
  ADD COLUMN "guestId" TEXT,
  ALTER COLUMN "authorId" DROP NOT NULL;

CREATE UNIQUE INDEX "CommunityPostLike_postId_guestId_key"
  ON "CommunityPostLike" ("postId", "guestId");
CREATE INDEX "CommunityPostLike_guestId_idx"
  ON "CommunityPostLike" ("guestId");

CREATE UNIQUE INDEX "CommunityPostSave_postId_guestId_key"
  ON "CommunityPostSave" ("postId", "guestId");
CREATE INDEX "CommunityPostSave_guestId_idx"
  ON "CommunityPostSave" ("guestId");

CREATE INDEX "CommunityPostComment_guestId_idx"
  ON "CommunityPostComment" ("guestId");
