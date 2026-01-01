import "dotenv/config";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

const router = Router();

// Get all brands
router.get("/", async (_req, res) => {
    const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });
    res.json(brands);
});

// Create brand (admin)
router.post("/", async (req, res) => {
    const { name, slug } = req.body;
    const brand = await prisma.brand.create({ data: { name, slug } });
    res.json(brand);
});

export const brandRouter = router;
