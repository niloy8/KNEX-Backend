import { prisma } from "./lib/prisma.js";

async function check() {
    try {
        const categoryCount = await prisma.category.count();
        const subcategoryCount = await prisma.subCategory.count();
        const brandCount = await prisma.brand.count();
        console.log(`Categories: ${categoryCount}`);
        console.log(`Subcategories: ${subcategoryCount}`);
        console.log(`Brands: ${brandCount}`);

        if (categoryCount > 0) {
            const categories = await prisma.category.findMany({ include: { subcategories: true } });
            console.log("Categories and Subcategories:");
            console.dir(categories, { depth: null });
        }
    } catch (error) {
        console.error("Check failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

check();
