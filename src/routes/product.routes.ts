import "dotenv/config";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

const router = Router();

// Get all products with filters
router.get("/", async (req, res) => {
    const { category, subcategory, brand, minPrice, maxPrice, sort, page = "1", limit = "20" } = req.query;

    const where: any = { isActive: true };

    if (subcategory) {
        where.subcategory = { slug: subcategory as string };
    } else if (category) {
        where.subcategory = { category: { slug: category as string } };
    }

    if (brand) {
        where.brand = { slug: brand as string };
    }

    if (minPrice || maxPrice) {
        where.price = {};
        if (minPrice) where.price.gte = parseFloat(minPrice as string);
        if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    let orderBy: any = { createdAt: "desc" };
    if (sort === "price-low") orderBy = { price: "asc" };
    else if (sort === "price-high") orderBy = { price: "desc" };
    else if (sort === "rating") orderBy = { rating: "desc" };

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [products, total] = await Promise.all([
        prisma.product.findMany({
            where,
            include: { subcategory: { include: { category: true } }, brand: true },
            orderBy,
            skip,
            take: parseInt(limit as string)
        }),
        prisma.product.count({ where })
    ]);

    res.json({ products, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
});

// Get brands for a category/subcategory
router.get("/brands", async (req, res) => {
    const { category, subcategory } = req.query;

    const where: any = { isActive: true };
    if (subcategory) {
        where.subcategory = { slug: subcategory as string };
    } else if (category) {
        where.subcategory = { category: { slug: category as string } };
    }

    const products = await prisma.product.findMany({
        where,
        select: { brand: true },
        distinct: ["brandId"]
    });

    const brands = products.map(p => p.brand).filter(Boolean);
    res.json(brands);
});

// Get single product
router.get("/:slug", async (req, res) => {
    const product = await prisma.product.findUnique({
        where: { slug: req.params.slug },
        include: { subcategory: { include: { category: true } }, brand: true }
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
});

// Create product (admin)
router.post("/", async (req, res) => {
    const { title, slug, description, price, originalPrice, discount, images, features, stock, subcategoryId, brandId } = req.body;
    const product = await prisma.product.create({
        data: { title, slug, description, price, originalPrice, discount, images, features, stock, subcategoryId, brandId },
        include: { subcategory: { include: { category: true } }, brand: true }
    });
    res.json(product);
});

// Update product (admin)
router.put("/:id", async (req, res) => {
    const { title, slug, description, price, originalPrice, discount, images, features, stock, subcategoryId, brandId, isActive } = req.body;
    const product = await prisma.product.update({
        where: { id: parseInt(req.params.id) },
        data: { title, slug, description, price, originalPrice, discount, images, features, stock, subcategoryId, brandId, isActive },
        include: { subcategory: { include: { category: true } }, brand: true }
    });
    res.json(product);
});

// Delete product (admin)
router.delete("/:id", async (req, res) => {
    await prisma.product.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
});

export const productRouter = router;
