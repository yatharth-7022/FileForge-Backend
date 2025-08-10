/*
  Warnings:

  - You are about to drop the column `starred` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `starredAt` on the `File` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."File" DROP COLUMN "starred",
DROP COLUMN "starredAt",
ADD COLUMN     "favoriteAt" TIMESTAMP(3),
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;
