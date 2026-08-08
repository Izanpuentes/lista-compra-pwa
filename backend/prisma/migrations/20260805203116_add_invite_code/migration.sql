/*
  Warnings:

  - A unique constraint covering the columns `[inviteCode]` on the table `House` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `inviteCode` to the `House` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "House" ADD COLUMN     "inviteCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "House_inviteCode_key" ON "House"("inviteCode");
