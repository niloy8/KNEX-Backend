-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'admin';
