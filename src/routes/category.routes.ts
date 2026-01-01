import "dotenv/config";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

const router = Router();

// Get all categories with subcategories
router.get("/", async (_req, res) => {
    const categories = await prisma.category.findMany({
        include: { subcategories: true },
        orderBy: { id: "asc" }
    });
    res.json(categories);
});

// Get single category with subcategories
router.get("/:slug", async (req, res) => {
    const category = await prisma.category.findUnique({
        where: { slug: req.params.slug },
        include: { subcategories: true }
    });
    if (!category) return res.status(404).json({ error: "Category not found" });
    res.json(category);
});

// Create category (admin)
router.post("/", async (req, res) => {
    const { name, slug, icon } = req.body;
    const category = await prisma.category.create({ data: { name, slug, icon } });
    res.json(category);
});

// Create subcategory (admin)
router.post("/:categoryId/subcategory", async (req, res) => {
    const { name, slug } = req.body;
    const subcategory = await prisma.subCategory.create({
        data: { name, slug, categoryId: parseInt(req.params.categoryId) }
    });
    res.json(subcategory);
});

export const categoryRouter = router;
