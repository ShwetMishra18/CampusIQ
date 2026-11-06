CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'FACULTY', 'ADMIN');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "BookingPurpose" AS ENUM ('LECTURE', 'PRACTICAL', 'EXAMINATION', 'EVENT');
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_STATUS', 'VENUE_CHANGE', 'SCHEDULE_CHANGE', 'BOOKING_CANCELLED', 'NOTICE_PUBLISHED');

CREATE TABLE "User" (
  "id" UUID NOT NULL, "email" VARCHAR(254) NOT NULL, "passwordHash" TEXT NOT NULL, "name" VARCHAR(140) NOT NULL,
  "role" "UserRole" NOT NULL, "branch" VARCHAR(80), "year" INTEGER, "semester" INTEGER, "section" VARCHAR(40),
  "isActive" BOOLEAN NOT NULL DEFAULT true, "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");
CREATE INDEX "User_branch_year_semester_section_idx" ON "User"("branch", "year", "semester", "section");

CREATE TABLE "Building" (
  "id" UUID NOT NULL, "code" VARCHAR(40) NOT NULL, "name" VARCHAR(160) NOT NULL, "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Building_isDemo_code_key" ON "Building"("isDemo", "code");
CREATE INDEX "Building_isDemo_isActive_idx" ON "Building"("isDemo", "isActive");

CREATE TABLE "Floor" (
  "id" UUID NOT NULL, "buildingId" UUID NOT NULL, "name" VARCHAR(80) NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Floor_buildingId_name_key" ON "Floor"("buildingId", "name");
CREATE INDEX "Floor_buildingId_sortOrder_idx" ON "Floor"("buildingId", "sortOrder");

CREATE TABLE "Room" (
  "id" UUID NOT NULL, "buildingId" UUID NOT NULL, "floorId" UUID, "code" VARCHAR(80) NOT NULL, "name" VARCHAR(160) NOT NULL,
  "roomType" VARCHAR(60) NOT NULL DEFAULT 'classroom', "status" VARCHAR(40) NOT NULL DEFAULT 'available', "capacity" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id"), CONSTRAINT "Room_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0),
  CONSTRAINT "Room_status_valid" CHECK ("status" IN ('available', 'occupied', 'reserved', 'maintenance'))
);
CREATE UNIQUE INDEX "Room_buildingId_code_key" ON "Room"("buildingId", "code");
CREATE INDEX "Room_isDemo_buildingId_floorId_isActive_idx" ON "Room"("isDemo", "buildingId", "floorId", "isActive");
CREATE INDEX "Room_capacity_idx" ON "Room"("capacity");

CREATE TABLE "Subject" (
  "id" UUID NOT NULL, "code" VARCHAR(40), "name" VARCHAR(160) NOT NULL, "branch" VARCHAR(80), "year" INTEGER, "semester" INTEGER,
  "isDemo" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subject_isDemo_code_key" ON "Subject"("isDemo", "code");

CREATE TABLE "Booking" (
  "id" UUID NOT NULL, "requesterId" UUID NOT NULL, "roomId" UUID NOT NULL, "purpose" "BookingPurpose" NOT NULL, "details" VARCHAR(500) NOT NULL,
  "bookingDate" DATE NOT NULL, "startAt" TIMESTAMPTZ(3) NOT NULL, "endAt" TIMESTAMPTZ(3) NOT NULL, "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "isDemo" BOOLEAN NOT NULL DEFAULT false, "reviewerId" UUID, "reviewNote" VARCHAR(500), "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"), CONSTRAINT "Booking_time_valid" CHECK ("startAt" < "endAt")
);
CREATE INDEX "Booking_isDemo_roomId_bookingDate_status_idx" ON "Booking"("isDemo", "roomId", "bookingDate", "status");
CREATE INDEX "Booking_requesterId_createdAt_idx" ON "Booking"("requesterId", "createdAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_active_room_overlap" EXCLUDE USING gist ("roomId" WITH =, "isDemo" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&) WHERE ("status" IN ('PENDING', 'APPROVED'));

CREATE TABLE "AcademicSchedule" (
  "id" UUID NOT NULL, "subjectId" UUID NOT NULL, "roomId" UUID NOT NULL, "facultyId" UUID, "branch" VARCHAR(80), "year" INTEGER,
  "semester" INTEGER, "section" VARCHAR(40), "isDemo" BOOLEAN NOT NULL DEFAULT false, "startsAt" TIMESTAMPTZ(3) NOT NULL, "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "createdById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicSchedule_pkey" PRIMARY KEY ("id"), CONSTRAINT "AcademicSchedule_time_valid" CHECK ("startsAt" < "endsAt")
);
CREATE INDEX "AcademicSchedule_branch_year_semester_section_startsAt_idx" ON "AcademicSchedule"("branch", "year", "semester", "section", "startsAt");
CREATE INDEX "AcademicSchedule_isDemo_roomId_startsAt_endsAt_idx" ON "AcademicSchedule"("isDemo", "roomId", "startsAt", "endsAt");
ALTER TABLE "AcademicSchedule" ADD CONSTRAINT "AcademicSchedule_no_room_overlap" EXCLUDE USING gist ("roomId" WITH =, "isDemo" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&);

CREATE TABLE "ExaminationNotice" (
  "id" UUID NOT NULL, "title" VARCHAR(200) NOT NULL, "body" TEXT NOT NULL, "examDate" DATE, "venue" VARCHAR(160), "branch" VARCHAR(80),
  "year" INTEGER, "semester" INTEGER, "section" VARCHAR(40), "isDemo" BOOLEAN NOT NULL DEFAULT false, "publishedAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExaminationNotice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExaminationNotice_branch_year_semester_section_publishedAt_idx" ON "ExaminationNotice"("branch", "year", "semester", "section", "publishedAt");

CREATE TABLE "Announcement" (
  "id" UUID NOT NULL, "title" VARCHAR(200) NOT NULL, "body" TEXT NOT NULL, "category" VARCHAR(80) NOT NULL, "branch" VARCHAR(80),
  "year" INTEGER, "semester" INTEGER, "section" VARCHAR(40), "isDemo" BOOLEAN NOT NULL DEFAULT false, "publishedAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_branch_year_semester_section_publishedAt_idx" ON "Announcement"("branch", "year", "semester", "section", "publishedAt");

CREATE TABLE "Notification" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "type" "NotificationType" NOT NULL, "title" VARCHAR(200) NOT NULL, "body" TEXT NOT NULL,
  "bookingId" UUID, "scheduleId" UUID, "examinationNoticeId" UUID, "isRead" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL, "actorId" UUID NOT NULL, "action" VARCHAR(80) NOT NULL, "entityType" VARCHAR(80) NOT NULL, "entityId" VARCHAR(80) NOT NULL,
  "previousData" JSONB, "newData" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

CREATE TABLE "SiteSetting" ("key" VARCHAR(80) NOT NULL, "value" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key"));

ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicSchedule" ADD CONSTRAINT "AcademicSchedule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicSchedule" ADD CONSTRAINT "AcademicSchedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicSchedule" ADD CONSTRAINT "AcademicSchedule_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademicSchedule" ADD CONSTRAINT "AcademicSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExaminationNotice" ADD CONSTRAINT "ExaminationNotice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AcademicSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_examinationNoticeId_fkey" FOREIGN KEY ("examinationNoticeId") REFERENCES "ExaminationNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
