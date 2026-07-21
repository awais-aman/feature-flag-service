-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('BOOLEAN', 'STRING', 'NUMBER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('TENANT_CREATE', 'FLAG_CREATE', 'FLAG_UPDATE', 'FLAG_ARCHIVE', 'FLAG_RESTORE', 'ENV_CONFIG_UPDATE');

-- CreateEnum
CREATE TYPE "EnvironmentName" AS ENUM ('development', 'staging', 'production');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "apiKeyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" "EnvironmentName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "FlagType" NOT NULL,
    "defaultValue" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag_environment_configs" (
    "id" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
    "variants" JSONB,
    "targetingRules" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flag_environment_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "flagId" TEXT,
    "environmentId" TEXT,
    "action" "AuditAction" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_apiKeyHash_key" ON "tenants"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "environments_tenantId_name_key" ON "environments"("tenantId", "name");

-- CreateIndex
CREATE INDEX "feature_flags_tenantId_archivedAt_idx" ON "feature_flags"("tenantId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_tenantId_key_key" ON "feature_flags"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "flag_environment_configs_flagId_environmentId_key" ON "flag_environment_configs"("flagId", "environmentId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_flagId_createdAt_idx" ON "audit_logs"("tenantId", "flagId", "createdAt");

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_environment_configs" ADD CONSTRAINT "flag_environment_configs_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flag_environment_configs" ADD CONSTRAINT "flag_environment_configs_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "feature_flags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
