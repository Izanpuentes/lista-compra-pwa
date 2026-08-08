/*
  Warnings:

  - You are about to drop the column `isBought` on the `Item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Item" DROP COLUMN "isBought",
ADD COLUMN     "categoria" TEXT NOT NULL DEFAULT 'Otros',
ADD COLUMN     "comprado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creador" TEXT NOT NULL DEFAULT 'Anónimo',
ADD COLUMN     "supermercado" TEXT NOT NULL DEFAULT 'general';

-- CreateTable
CREATE TABLE "Receta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "instrucciones" TEXT,

    CONSTRAINT "Receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingrediente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "recetaId" TEXT NOT NULL,

    CONSTRAINT "Ingrediente_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Ingrediente" ADD CONSTRAINT "Ingrediente_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
