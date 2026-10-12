CREATE TYPE "CategoryBackgroundType" AS ENUM ('COLOR', 'IMAGE', 'TEXTURE', 'PATTERN', 'GRADIENT');

ALTER TABLE "Category"
ADD COLUMN "backgroundType" "CategoryBackgroundType" NOT NULL DEFAULT 'COLOR',
ADD COLUMN "backgroundValue" TEXT,
ADD COLUMN "backgroundOverlay" TEXT,
ADD COLUMN "backgroundCss" TEXT,
ADD COLUMN "visualScrollEnabled" BOOLEAN NOT NULL DEFAULT false;
