-- AlterTable
ALTER TABLE `Conversation` MODIFY `updatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `ConversationUser` MODIFY `updatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Message` MODIFY `updatedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `updatedAt` DATETIME(3) NULL;
