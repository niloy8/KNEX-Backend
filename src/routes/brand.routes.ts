import "dotenv/config";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

// Get all brands
router.get("/", async (_req, res) => {
    try {
        console.log("Fetching brands...");
        const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });
        console.log("Brands found:", brands.length);
        res.json(brands);
    } catch (error) {
        console.error("Error fetching brands:", error);
        res.status(500).json({ error: "Failed to fetch brands" });
    }
});

// Create brand (admin)
router.post("/", async (req, res) => {
    try {
        const { name, slug } = req.body;
        if (!name) {
            return res.status(400).json({ error: "Brand name is required" });
        }
        const brandSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const brand = await prisma.brand.create({ data: { name, slug: brandSlug } });
        res.json(brand);
    } catch (error: any) {
        console.error("Error creating brand:", error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Brand with this name or slug already exists" });
        }
        res.status(500).json({ error: "Failed to create brand" });
    }
});

// Delete brand
router.delete("/:id", async (req, res) => {
    try {
        await prisma.brand.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "Cannot delete brand with existing products" });
        }
        res.status(500).json({ error: "Failed to delete brand" });
    }
});

export const brandRouter = router;
