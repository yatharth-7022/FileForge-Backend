/*
  Warnings:

  - You are about to drop the column `sharedToken` on the `shared_links` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[shareToken]` on the table `shared_links` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `shareToken` to the `shared_links` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."shared_links_sharedToken_key";

-- AlterTable
ALTER TABLE "public"."shared_links" DROP COLUMN "sharedToken",
ADD COLUMN     "shareToken" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "shared_links_shareToken_key" ON "public"."shared_links"("shareToken");
