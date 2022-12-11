-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `deleted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `deleted` BOOLEAN NOT NULL DEFAULT false;
