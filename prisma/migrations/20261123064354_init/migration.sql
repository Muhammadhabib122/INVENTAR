-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'COMMISSION', 'VIEWER');

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('LAT', 'CYR');

-- CreateEnum
CREATE TYPE "SectionStatus" AS ENUM ('ACTIVE', 'DONE');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "ExtraKind" AS ENUM ('NOT_IN_DB', 'OTHER_SECTION');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('GOOD', 'FAIR', 'BAD', 'REPAIR');

-- CreateEnum
CREATE TYPE "PendingReason" AS ENUM ('OTHER_ROOM', 'OTHER_SECTION', 'NOT_IN_DB', 'LOCKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'COMMISSION',
    "lang" "Lang" NOT NULL DEFAULT 'LAT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBuilding" (
    "userId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,

    CONSTRAINT "UserBuilding_pkey" PRIMARY KEY ("userId","buildingId")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "importInfo" JSONB NOT NULL DEFAULT '{}',
    "rev" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionFile" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'initial',

    CONSTRAINT "SectionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "inv" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "mol" TEXT NOT NULL DEFAULT '',
    "dept" TEXT NOT NULL DEFAULT '',
    "sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ord" INTEGER NOT NULL DEFAULT 0,
    "delistedAt" TIMESTAMP(3),

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Found" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "inv" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'scan',

    CONSTRAINT "Found_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Duplicate" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "inv" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Duplicate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extra" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "inv" TEXT NOT NULL,
    "kind" "ExtraKind" NOT NULL,
    "otherSectionId" TEXT,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoInvItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "condition" "Condition" NOT NULL DEFAULT 'GOOD',
    "note" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoInvItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingScan" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "inv" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "PendingReason" NOT NULL,
    "info" JSONB NOT NULL DEFAULT '{}',
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "PendingScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildingId" TEXT,
    "sectionId" TEXT,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "parsed" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "sectionId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrashEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sectionId" TEXT,
    "payload" JSONB NOT NULL,
    "deletedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),
    "restoredBy" TEXT,

    CONSTRAINT "TrashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmzRoom" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TmzRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmzEntry" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "good" INTEGER NOT NULL DEFAULT 0,
    "bad" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TmzEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");

-- CreateIndex
CREATE INDEX "Section_buildingId_idx" ON "Section"("buildingId");

-- CreateIndex
CREATE INDEX "SectionFile_sectionId_idx" ON "SectionFile"("sectionId");

-- CreateIndex
CREATE INDEX "Item_inv_idx" ON "Item"("inv");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sectionId_inv_key" ON "Item"("sectionId", "inv");

-- CreateIndex
CREATE UNIQUE INDEX "Room_sectionId_name_key" ON "Room"("sectionId", "name");

-- CreateIndex
CREATE INDEX "Found_sectionId_roomId_idx" ON "Found"("sectionId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Found_sectionId_inv_key" ON "Found"("sectionId", "inv");

-- CreateIndex
CREATE INDEX "Duplicate_sectionId_inv_idx" ON "Duplicate"("sectionId", "inv");

-- CreateIndex
CREATE INDEX "Extra_otherSectionId_inv_idx" ON "Extra"("otherSectionId", "inv");

-- CreateIndex
CREATE UNIQUE INDEX "Extra_sectionId_inv_key" ON "Extra"("sectionId", "inv");

-- CreateIndex
CREATE INDEX "NoInvItem_sectionId_roomId_idx" ON "NoInvItem"("sectionId", "roomId");

-- CreateIndex
CREATE INDEX "PendingScan_sectionId_userId_resolvedAt_idx" ON "PendingScan"("sectionId", "userId", "resolvedAt");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_sectionId_idx" ON "AuditLog"("sectionId");

-- CreateIndex
CREATE INDEX "TrashEntry_deletedAt_idx" ON "TrashEntry"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TmzRoom_buildingId_name_key" ON "TmzRoom"("buildingId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TmzEntry_roomId_name_unit_key" ON "TmzEntry"("roomId", "name", "unit");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBuilding" ADD CONSTRAINT "UserBuilding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBuilding" ADD CONSTRAINT "UserBuilding_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionFile" ADD CONSTRAINT "SectionFile_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Found" ADD CONSTRAINT "Found_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duplicate" ADD CONSTRAINT "Duplicate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extra" ADD CONSTRAINT "Extra_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoInvItem" ADD CONSTRAINT "NoInvItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingScan" ADD CONSTRAINT "PendingScan_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TmzRoom" ADD CONSTRAINT "TmzRoom_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TmzEntry" ADD CONSTRAINT "TmzEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TmzRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
