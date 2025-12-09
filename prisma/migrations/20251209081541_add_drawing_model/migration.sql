-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "drawing" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drawing_ownerId_idx" ON "Drawing"("ownerId");

-- CreateIndex
CREATE INDEX "Drawing_updated_at_idx" ON "Drawing"("updated_at");

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
