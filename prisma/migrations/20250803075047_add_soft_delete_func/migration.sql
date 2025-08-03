-- AlterTable
ALTER TABLE "public"."File" ADD COLUMN     "deleteById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_deleteById_fkey" FOREIGN KEY ("deleteById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
