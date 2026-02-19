import "dotenv/config";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { deleteImageByUrl } from "../utils/cloudinary.js";

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
        const transformed = categories.map((cat: any) => ({
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
        const { name, slug, icon, image } = req.body;
        const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const category = await prisma.category.create({
            data: { name, slug: categorySlug, icon, image },
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
        const { name, slug, image } = req.body;
        const categoryId = parseInt(req.params.categoryId);
        const subSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const subcategory = await prisma.subCategory.create({
            data: { name, slug: subSlug, image, categoryId }
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
        const { name, slug, icon, image } = req.body;
        const category = await prisma.category.update({
            where: { id: parseInt(req.params.id) },
            data: { name, slug, icon, image },
            include: { subcategories: true }
        });
        res.json({ ...category, subCategories: category.subcategories });
    } catch (error) {
        res.status(500).json({ error: "Failed to update category" });
    }
});

// Update subcategory
router.put("/:categoryId/subcategory/:subId", async (req, res) => {
    try {
        const { name, slug, image } = req.body;
        const subcategory = await prisma.subCategory.update({
            where: { id: parseInt(req.params.subId) },
            data: { name, slug, image }
        });
        res.json(subcategory);
    } catch (error) {
        res.status(500).json({ error: "Failed to update subcategory" });
    }
});

// Delete category
router.delete("/:id", async (req, res) => {
    try {
        const category = await prisma.category.findUnique({ where: { id: parseInt(req.params.id) } });
        await prisma.category.delete({ where: { id: parseInt(req.params.id) } });

        if (category) {
            if (category.icon) await deleteImageByUrl(category.icon);
            if (category.image) await deleteImageByUrl(category.image);
        }

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
        const subcategory = await prisma.subCategory.findUnique({ where: { id: parseInt(req.params.subId) } });
        await prisma.subCategory.delete({ where: { id: parseInt(req.params.subId) } });

        if (subcategory && subcategory.image) {
            await deleteImageByUrl(subcategory.image);
        }

        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "Cannot delete subcategory with existing products" });
        }
        res.status(500).json({ error: "Failed to delete subcategory" });
    }
});

export const categoryRouter = router;
