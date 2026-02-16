import "dotenv/config";
import { Router } from "express";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// Generate unique SKU
const generateSKU = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let sku = "SKU-";
    for (let i = 0; i < 8; i++) {
        sku += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return sku;
};

// Transform product for frontend compatibility
const transformProduct = (p: any) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice || p.price,
    discount: p.discount || 0,
    rating: p.rating || 0,
    totalRatings: p.totalRatings || 0,
    totalReviews: p.totalReviews || 0,
    image: p.images?.[0] || "",
    images: p.images || [],
    gallery: p.images?.slice(1) || [],
    features: p.features || [],
    tags: p.tags || [],
    customVariants: p.customVariants || [], // For RAM/Storage type variants
    colors: p.colors || [],
    sizes: p.sizes || [],
    productType: p.productType || "simple",
    swatchType: p.swatchType || null,
    variants: (p.variants || []).map((v: any) => ({
        id: v.id,
        name: v.name,
        image: v.image,
        images: v.images || [],
        price: v.price,
        stock: v.stock,
        sku: v.sku,
    })),
    stock: p.stock,
    stockQuantity: p.stock,
    inStock: p.stock > 0,
    sku: p.sku || "",
    isActive: p.isActive,
    category: p.subcategory?.category || null,
    categoryId: p.subcategory?.categoryId || null,
    subCategory: p.subcategory ? { id: p.subcategory.id, name: p.subcategory.name, slug: p.subcategory.slug } : null,
    subCategoryId: p.subcategoryId,
    brand: p.brand,
    brandId: p.brandId,
    reviews: p.reviews || [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
});

// Get all products with filters
router.get("/", async (req, res) => {
    try {
        const { category, subcategory, brand, minPrice, maxPrice, sort, search, inStock, page = "1", limit = "20" } = req.query;
        const where: any = {};

        if (search) {
            where.OR = [
                { title: { contains: search as string, mode: "insensitive" } },
                { description: { contains: search as string, mode: "insensitive" } },
            ];
        }

        if (subcategory) where.subcategory = { slug: subcategory as string };
        else if (category) where.subcategory = { category: { slug: category as string } };

        if (brand) where.brand = { slug: brand as string };

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice as string);
            if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
        }

        if (inStock === "true") where.stock = { gt: 0 };
        else if (inStock === "false") where.stock = 0;

        let orderBy: any = { createdAt: "desc" };
        if (sort === "price-low") orderBy = { price: "asc" };
        else if (sort === "price-high") orderBy = { price: "desc" };
        else if (sort === "rating") orderBy = { rating: "desc" };

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                include: { subcategory: { include: { category: true } }, brand: true, variants: true },
                orderBy,
                skip,
                take: parseInt(limit as string),
            }),
            prisma.product.count({ where }),
        ]);

        res.json({
            products: products.map(transformProduct),
            total,
            page: parseInt(page as string),
            totalPages: Math.ceil(total / parseInt(limit as string)),
        });
    } catch (error: any) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get brands for a category/subcategory
router.get("/brands", async (req, res) => {
    try {
        const { category, subcategory } = req.query;
        const where: any = { isActive: true };

        if (subcategory) where.subcategory = { slug: subcategory as string };
        else if (category) where.subcategory = { category: { slug: category as string } };

        const products = await prisma.product.findMany({ where, select: { brand: true }, distinct: ["brandId"] });
        res.json(products.map((p: { brand: any }) => p.brand).filter(Boolean));
    } catch (error: any) {
        console.error("Error fetching brands:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get single product by ID or slug
router.get("/:idOrSlug", async (req, res) => {
    try {
        const { idOrSlug } = req.params;
        const isId = /^\d+$/.test(idOrSlug);
        const product = await prisma.product.findUnique({
            where: isId ? { id: parseInt(idOrSlug) } : { slug: idOrSlug },
            include: { subcategory: { include: { category: true } }, brand: true, reviews: { orderBy: { createdAt: "desc" } }, variants: true },
        });

        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json(transformProduct(product));
    } catch (error: any) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: error.message });
    }
});

// Create product
router.post("/", async (req, res) => {
    try {
        const { title, description, price, originalPrice, discount, image, gallery, images, features, tags, colors, sizes, stock, stockQuantity, subcategoryId, subCategoryId, brandId, rating, productType, swatchType, variants, imageSwatch } = req.body;

        console.log("Creating product:", { title, productType, swatchType, imageSwatch, variants, tags });

        if (!title || !price) return res.status(400).json({ error: "Title and price are required" });

        const subCatId = subcategoryId || subCategoryId;
        if (!subCatId) return res.status(400).json({ error: "Subcategory is required" });

        let productImages: string[] = images && Array.isArray(images) ? images : [];
        if (!productImages.length) {
            if (image) productImages.push(image);
            if (gallery?.length) productImages.push(...gallery);
        }

        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();

        // Auto-generate unique SKU
        let sku = generateSKU();
        let skuExists = await prisma.product.findFirst({ where: { sku } });
        while (skuExists) {
            sku = generateSKU();
            skuExists = await prisma.product.findFirst({ where: { sku } });
        }

        // Build variants data from imageSwatch (color/image variants with images)
        // Note: 'variants' from frontend is for RAM/Storage type variants (name+values), stored in customVariants
        let variantsData: { name: string; image: string; images: string[]; stock: number }[] = [];
        if (imageSwatch && Array.isArray(imageSwatch) && imageSwatch.length > 0) {
            variantsData = imageSwatch.map((s: any) => ({
                name: s.name || "Variant",
                image: s.image || "",
                images: s.images && Array.isArray(s.images) ? s.images : (s.image ? [s.image] : []),
                stock: s.stock || 0,
            }));
            console.log("Image swatches to create:", JSON.stringify(variantsData, null, 2));
        }

        // Store RAM/Storage type variants in customVariants field
        const customVariantsData = variants && Array.isArray(variants) && variants.length > 0 ? variants : Prisma.JsonNull;
        console.log("Custom variants to save:", JSON.stringify(customVariantsData, null, 2));

        console.log("Variants to create:", variantsData.length);

        const product = await prisma.product.create({
            data: {
                title,
                slug,
                description: description || null,
                price: Number(price),
                originalPrice: originalPrice ? Number(originalPrice) : Number(price),
                discount: discount ? Number(discount) : null,
                rating: rating ? Number(rating) : 0,
                images: productImages,
                features: features || [],
                tags: tags || [],
                customVariants: customVariantsData,
                colors: colors || [],
                sizes: sizes || [],
                productType: productType || "simple",
                swatchType: swatchType || null,
                stock: Number(stock || stockQuantity || 0),
                sku,
                subcategoryId: Number(subCatId),
                brandId: brandId ? Number(brandId) : null,
                variants: variantsData.length > 0 ? {
                    create: variantsData,
                } : undefined,
            },
            include: { subcategory: { include: { category: true } }, brand: true, variants: true },
        });

        res.json(transformProduct(product));
    } catch (error: any) {
        console.error("Error creating product:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update product
router.put("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { title, description, price, originalPrice, discount, image, gallery, images, features, tags, colors, sizes, stock, stockQuantity, sku, subcategoryId, subCategoryId, brandId, isActive, inStock, rating, productType, swatchType, variants, imageSwatch } = req.body;

        const data: any = {};
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (price !== undefined) data.price = Number(price);
        if (originalPrice !== undefined) data.originalPrice = Number(originalPrice);
        if (discount !== undefined) data.discount = Number(discount);
        if (rating !== undefined) data.rating = Number(rating);
        if (features !== undefined) data.features = features;
        if (tags !== undefined) data.tags = tags;
        if (colors !== undefined) data.colors = colors;
        if (sizes !== undefined) data.sizes = sizes;
        if (sku !== undefined) data.sku = sku;
        if (productType !== undefined) data.productType = productType;
        if (swatchType !== undefined) data.swatchType = swatchType;

        // Store RAM/Storage type variants in customVariants field
        if (variants !== undefined) {
            data.customVariants = variants && Array.isArray(variants) && variants.length > 0 ? variants : Prisma.JsonNull;
            console.log("Updating custom variants:", JSON.stringify(data.customVariants, null, 2));
        }

        if (images !== undefined) {
            data.images = images;
        } else if (image !== undefined || gallery !== undefined) {
            const imgs: string[] = [];
            if (image) imgs.push(image);
            if (gallery?.length) imgs.push(...gallery);
            data.images = imgs;
        }

        if (stock !== undefined) data.stock = Number(stock);
        else if (stockQuantity !== undefined) data.stock = Number(stockQuantity);

        const subCatId = subcategoryId || subCategoryId;
        if (subCatId !== undefined) data.subcategoryId = Number(subCatId);
        if (brandId !== undefined) data.brandId = brandId ? Number(brandId) : null;
        if (isActive !== undefined) data.isActive = isActive;
        if (inStock !== undefined) data.isActive = inStock;

        // Handle variants update - delete existing and recreate
        // Note: imageSwatch is the image swatches data, 'variants' is for RAM/Storage type variants
        let variantsData: { name: string; image: string; images: string[]; stock: number }[] = [];
        if (imageSwatch && Array.isArray(imageSwatch) && imageSwatch.length > 0) {
            variantsData = imageSwatch.map((s: any) => ({
                name: s.name || "Variant",
                image: s.image || "",
                images: s.images && Array.isArray(s.images) ? s.images : (s.image ? [s.image] : []),
                stock: s.stock || 0,
            }));
            console.log("Updating with image swatches:", JSON.stringify(variantsData, null, 2));
        }

        // Delete existing variants and recreate if imageSwatch provided
        if (imageSwatch !== undefined) {
            await prisma.productVariant.deleteMany({ where: { productId: id } });
        }

        const product = await prisma.product.update({
            where: { id },
            data: {
                ...data,
                variants: variantsData.length > 0 ? {
                    create: variantsData,
                } : undefined,
            },
            include: { subcategory: { include: { category: true } }, brand: true, variants: true },
        });

        res.json(transformProduct(product));
    } catch (error: any) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete product
router.delete("/:id", async (req, res) => {
    try {
        await prisma.product.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting product:", error);
        res.status(500).json({ error: error.message });
    }
});

// Add review to product
router.post("/:id/reviews", async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { rating, comment, userName, userEmail } = req.body;

        if (!rating || !comment || !userName) {
            return res.status(400).json({ error: "Rating, comment, and name are required" });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }

        // Create review
        const review = await prisma.review.create({
            data: {
                rating: Number(rating),
                comment,
                userName,
                userEmail: userEmail || null,
                productId,
            },
        });

        // Update product rating
        const allReviews = await prisma.review.findMany({ where: { productId } });
        const avgRating = allReviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / allReviews.length;

        await prisma.product.update({
            where: { id: productId },
            data: {
                rating: Math.round(avgRating * 10) / 10,
                totalReviews: allReviews.length,
                totalRatings: allReviews.length,
            },
        });

        res.json(review);
    } catch (error: any) {
        console.error("Error adding review:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get reviews for product
router.get("/:id/reviews", async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const reviews = await prisma.review.findMany({
            where: { productId },
            orderBy: { createdAt: "desc" },
        });
        res.json(reviews);
    } catch (error: any) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get low stock products (Admin)
router.get("/admin/low-stock", async (req, res) => {
    try {
        const threshold = parseInt(req.query.threshold as string) || 10;

        const products = await prisma.product.findMany({
            where: {
                stock: { lte: threshold },
                isActive: true,
            },
            include: {
                subcategory: { select: { name: true } },
            },
            orderBy: { stock: "asc" },
            take: 10,
        });

        res.json({ products });
    } catch (error: any) {
        console.error("Error fetching low stock products:", error);
        res.status(500).json({ error: error.message });
    }
});

export const productRouter = router;
