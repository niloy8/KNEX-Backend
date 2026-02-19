import "dotenv/config";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { deleteImageByUrl } from "../utils/cloudinary.js";

const router = Router();

// Get all categories with subcategories and sub-subcategories
router.get("/", async (_req, res) => {
    try {
        console.log("Fetching categories...");
        const categories = await prisma.category.findMany({
            include: {
                subcategories: {
                    include: { subsubcategories: true }
                }
            },
            orderBy: { id: "asc" }
        });
        console.log("Categories found:", categories.length);
        // Transform to match frontend expected format (subCategories, subSubCategories)
        const transformed = categories.map((cat: any) => ({
            ...cat,
            subCategories: cat.subcategories.map((sub: any) => ({
                ...sub,
                subSubCategories: sub.subsubcategories
            }))
        }));
        res.json(transformed);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ error: "Failed to fetch categories" });
    }
});

// Get single category with subcategories and sub-subcategories
router.get("/:slug", async (req, res) => {
    try {
        const category = await prisma.category.findUnique({
            where: { slug: req.params.slug },
            include: {
                subcategories: {
                    include: { subsubcategories: true }
                }
            }
        });
        if (!category) return res.status(404).json({ error: "Category not found" });
        res.json({
            ...category,
            subCategories: category.subcategories.map((sub: any) => ({
                ...sub,
                subSubCategories: sub.subsubcategories
            }))
        });
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
            data: { name, slug: subSlug, image, categoryId },
            include: { subsubcategories: true }
        });
        res.json({ ...subcategory, subSubCategories: subcategory.subsubcategories });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Subcategory with this slug already exists in this category" });
        }
        res.status(500).json({ error: "Failed to create subcategory" });
    }
});

// Create sub-subcategory (admin)
router.post("/:categoryId/subcategory/:subId/subsubcategory", async (req, res) => {
    try {
        const { name, slug, image } = req.body;
        const subId = parseInt(req.params.subId);
        const subSubSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const subsubcategory = await prisma.subSubCategory.create({
            data: { name, slug: subSubSlug, image, subCategoryId: subId }
        });
        res.json(subsubcategory);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Sub-subcategory with this slug already exists in this subcategory" });
        }
        console.error("Error creating sub-subcategory:", error);
        res.status(500).json({ error: "Failed to create sub-subcategory" });
    }
});

// Update category
router.put("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, slug, icon, image } = req.body;

        // Snapshot old images
        const oldCategory = await prisma.category.findUnique({ where: { id } });

        const category = await prisma.category.update({
            where: { id },
            data: { name, slug, icon, image },
            include: { subcategories: true }
        });

        // Cleanup
        if (oldCategory) {
            if (oldCategory.icon && oldCategory.icon !== icon) await deleteImageByUrl(oldCategory.icon);
            if (oldCategory.image && oldCategory.image !== image) await deleteImageByUrl(oldCategory.image);
        }

        res.json({ ...category, subCategories: category.subcategories });
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ error: "Failed to update category" });
    }
});

// Update subcategory
router.put("/:categoryId/subcategory/:subId", async (req, res) => {
    try {
        const subId = parseInt(req.params.subId);
        const { name, slug, image } = req.body;

        // Snapshot old image
        const oldSub = await prisma.subCategory.findUnique({ where: { id: subId } });

        const subcategory = await prisma.subCategory.update({
            where: { id: subId },
            data: { name, slug, image },
            include: { subsubcategories: true }
        });

        // Cleanup
        if (oldSub && oldSub.image && oldSub.image !== image) {
            await deleteImageByUrl(oldSub.image);
        }

        res.json({ ...subcategory, subSubCategories: subcategory.subsubcategories });
    } catch (error) {
        console.error("Error updating subcategory:", error);
        res.status(500).json({ error: "Failed to update subcategory" });
    }
});

// Update sub-subcategory
router.put("/:categoryId/subcategory/:subId/subsubcategory/:subSubId", async (req, res) => {
    try {
        const subSubId = parseInt(req.params.subSubId);
        const { name, slug, image } = req.body;

        // Snapshot old image
        const oldSubSub = await prisma.subSubCategory.findUnique({ where: { id: subSubId } });

        const subsubcategory = await prisma.subSubCategory.update({
            where: { id: subSubId },
            data: { name, slug, image }
        });

        // Cleanup
        if (oldSubSub && oldSubSub.image && oldSubSub.image !== image) {
            await deleteImageByUrl(oldSubSub.image);
        }

        res.json(subsubcategory);
    } catch (error) {
        console.error("Error updating sub-subcategory:", error);
        res.status(500).json({ error: "Failed to update sub-subcategory" });
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
        const subId = parseInt(req.params.subId);
        const subcategory = await prisma.subCategory.findUnique({ where: { id: subId } });
        await prisma.subCategory.delete({ where: { id: subId } });

        if (subcategory && subcategory.image) {
            await deleteImageByUrl(subcategory.image);
        }

        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "Cannot delete subcategory with existing sub-subcategories or products" });
        }
        res.status(500).json({ error: "Failed to delete subcategory" });
    }
});

// Delete sub-subcategory
router.delete("/:categoryId/subcategory/:subId/subsubcategory/:subSubId", async (req, res) => {
    try {
        const subSubId = parseInt(req.params.subSubId);
        const subsubcategory = await prisma.subSubCategory.findUnique({ where: { id: subSubId } });
        await prisma.subSubCategory.delete({ where: { id: subSubId } });

        if (subsubcategory && subsubcategory.image) {
            await deleteImageByUrl(subsubcategory.image);
        }

        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "Cannot delete sub-subcategory with existing products" });
        }
        res.status(500).json({ error: "Failed to delete sub-subcategory" });
    }
});

export const categoryRouter = router;
