import "dotenv/config";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

const router = Router();

// Get all categories with subcategories
router.get("/", async (_req, res) => {
    try {
        console.log("Fetching categories...");
        const categories = await prisma.category.findMany({
            include: { subcategories: true },
            orderBy: { id: "asc" }
        });
        console.log("Categories found:", categories.length);
        // Transform to match frontend expected format (subCategories)
        const transformed = categories.map(cat => ({
            ...cat,
            subCategories: cat.subcategories
        }));
        res.json(transformed);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ error: "Failed to fetch categories" });
    }
});

// Get single category with subcategories
router.get("/:slug", async (req, res) => {
    try {
        const category = await prisma.category.findUnique({
            where: { slug: req.params.slug },
            include: { subcategories: true }
        });
        if (!category) return res.status(404).json({ error: "Category not found" });
        res.json({ ...category, subCategories: category.subcategories });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch category" });
    }
});

// Create category (admin)
router.post("/", async (req, res) => {
    try {
        const { name, slug, icon } = req.body;
        const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const category = await prisma.category.create({
            data: { name, slug: categorySlug, icon },
            include: { subcategories: true }
        });
        res.json({ ...category, subCategories: category.subcategories });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Category with this name or slug already exists" });
        }
        res.status(500).json({ error: "Failed to create category" });
    }
});

// Create subcategory (admin)
router.post("/:categoryId/subcategory", async (req, res) => {
    try {
        const { name, slug } = req.body;
        const categoryId = parseInt(req.params.categoryId);
        const subSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const subcategory = await prisma.subCategory.create({
            data: { name, slug: subSlug, categoryId }
        });
        res.json(subcategory);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Subcategory with this slug already exists in this category" });
        }
        res.status(500).json({ error: "Failed to create subcategory" });
    }
});

// Update category
router.put("/:id", async (req, res) => {
    try {
        const { name, slug, icon } = req.body;
        const category = await prisma.category.update({
            where: { id: parseInt(req.params.id) },
            data: { name, slug, icon },
            include: { subcategories: true }
        });
        res.json({ ...category, subCategories: category.subcategories });
    } catch (error) {
        res.status(500).json({ error: "Failed to update category" });
    }
});

// Delete category
router.delete("/:id", async (req, res) => {
    try {
        await prisma.category.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "Cannot delete category with existing subcategories or products" });
        }
        res.status(500).json({ error: "Failed to delete category" });
    }
});

// Delete subcategory
router.delete("/:categoryId/subcategory/:subId", async (req, res) => {
    try {
        await prisma.subCategory.delete({ where: { id: parseInt(req.params.subId) } });
        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "Cannot delete subcategory with existing products" });
        }
        res.status(500).json({ error: "Failed to delete subcategory" });
    }
});

export const categoryRouter = router;
