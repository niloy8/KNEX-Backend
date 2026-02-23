import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import jwt from 'jsonwebtoken';
export const wishlistRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to get user from token
const getUserFromToken = (req: Request): number | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
        return decoded.userId;
    } catch {
        return null;
    }
};

// Get wishlist items
wishlistRouter.get('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const wishlistItems = await prisma.wishlistItem.findMany({
            where: { userId },
        });

        // Get product details for each wishlist item
        const productIds = wishlistItems.map((item: any) => item.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true,
                title: true,
                slug: true,
                price: true,
                originalPrice: true,
                images: true,
                stock: true,
            },
        });

        // Define interface for product details
        interface ProductWithDetails {
            id: number;
            title: string;
            slug: string;
            price: number;
            originalPrice: number | null;
            images: string[];
            stock: number;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const productMap = new Map<number, ProductWithDetails>(products.map((p: any) => [p.id, p]));

        interface WishlistItemData {
            id: number;
            productId: number;
            createdAt: Date;
        }

        const items = (wishlistItems as any[]).map((item: any) => {
            const product = productMap.get(item.productId);
            return {
                id: item.id.toString(),
                productId: item.productId,
                title: product?.title || '',
                slug: product?.slug || '',
                price: item.selectedVariant?.price || product?.price || 0,
                originalPrice: product?.originalPrice || product?.price || 0,
                image: item.selectedVariant?.image || product?.images?.[0] || '',
                inStock: (product?.stock || 0) > 0,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize,
                selectedVariant: item.selectedVariant,
                customSelections: item.customSelections,
                addedOn: item.createdAt.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                }),
            };
        });

        res.json(items);
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});

// Add to wishlist
wishlistRouter.post('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { productId, selectedColor, selectedSize, selectedVariant, customSelections } = req.body;

    if (!productId) {
        res.status(400).json({ error: 'Product ID is required' });
        return;
    }

    try {
        // Find if exactly the same item already exists in wishlist
        const existing = await prisma.wishlistItem.findFirst({
            where: {
                userId,
                productId: Number(productId),
                selectedColor: selectedColor || null,
                selectedSize: selectedSize || null,
                customSelections: { equals: customSelections || null } as any,
            },
        });

        if (existing) {
            res.json({ success: true, wishlistItem: existing, message: 'Item already in wishlist' });
            return;
        }

        const wishlistItem = await prisma.wishlistItem.create({
            data: {
                userId,
                productId: Number(productId),
                selectedColor: selectedColor || null,
                selectedSize: selectedSize || null,
                selectedVariant: selectedVariant || null,
                customSelections: customSelections || null,
            },
        });

        res.json({ success: true, wishlistItem });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ error: 'Failed to add to wishlist' });
    }
});

// Remove from wishlist
wishlistRouter.delete('/:productId', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { productId } = req.params;
    const { selectedColor, selectedSize, customSelections } = req.query;

    try {
        const where: any = {
            userId,
            productId: Number(productId),
        };

        if (selectedColor !== undefined) {
            where.selectedColor = selectedColor || null;
        }
        if (selectedSize !== undefined) {
            where.selectedSize = selectedSize || null;
        }
        if (customSelections !== undefined) {
            const parsed = customSelections ? JSON.parse(customSelections as string) : null;
            where.customSelections = { equals: parsed };
        }

        await prisma.wishlistItem.deleteMany({
            where:
                where
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ error: 'Failed to remove from wishlist' });
    }
});

// Toggle wishlist (add if not exists, remove if exists)
wishlistRouter.post('/toggle', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { productId, selectedColor, selectedSize, selectedVariant, customSelections } = req.body;

    if (!productId) {
        res.status(400).json({ error: 'Product ID is required' });
        return;
    }

    try {
        const existing = await prisma.wishlistItem.findFirst({
            where: {
                userId,
                productId: Number(productId),
                selectedColor: selectedColor || null,
                selectedSize: selectedSize || null,
                customSelections: { equals: customSelections || null } as any,
            },
        });

        if (existing) {
            await prisma.wishlistItem.delete({
                where: { id: existing.id },
            });
            res.json({ success: true, action: 'removed' });
        } else {
            await prisma.wishlistItem.create({
                data: {
                    userId,
                    productId: Number(productId),
                    selectedColor: selectedColor || null,
                    selectedSize: selectedSize || null,
                    selectedVariant: selectedVariant || null,
                    customSelections: customSelections || null,
                },
            });
            res.json({ success: true, action: 'added' });
        }
    } catch (error) {
        console.error('Error toggling wishlist:', error);
        res.status(500).json({ error: 'Failed to toggle wishlist' });
    }
});

// Check if product is in wishlist
wishlistRouter.get('/check/:productId', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { productId } = req.params;
    const { selectedColor, selectedSize, customSelections } = req.query;

    try {
        const where: any = {
            userId,
            productId: Number(productId),
            selectedColor: (selectedColor as string) || null,
            selectedSize: (selectedSize as string) || null,
        };

        if (customSelections) {
            const parsed = JSON.parse(customSelections as string);
            where.customSelections = { equals: parsed };
        } else if (customSelections === undefined) {
            // If not provided in query, we don't filter by it (allows broad check)
            // But if it IS null/empty in query, we might want strict check.
            // Usually 'check' is called with current selections.
        } else {
            where.customSelections = { equals: null };
        }

        const item = await prisma.wishlistItem.findFirst({
            where: where
        });

        res.json({ inWishlist: !!item });
    } catch (error) {
        console.error('Error checking wishlist:', error);
        res.status(500).json({ error: 'Failed to check wishlist' });
    }
});

// Sync guest wishlist to user wishlist (called on login)
wishlistRouter.post('/sync', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { items } = req.body; // Array of productIds

    if (!items || !Array.isArray(items)) {
        res.status(400).json({ error: 'Items array is required' });
        return;
    }

    try {
        // Upsert each item manually
        for (const item of items) {
            const productId = typeof item === 'number' ? item : item.productId;
            const selectedColor = item.selectedColor || null;
            const selectedSize = item.selectedSize || null;
            const selectedVariant = item.selectedVariant || null;
            const customSelections = item.customSelections || null;

            const existing = await prisma.wishlistItem.findFirst({
                where: {
                    userId,
                    productId: Number(productId),
                    selectedColor,
                    selectedSize,
                },
            });

            if (!existing) {
                await prisma.wishlistItem.create({
                    data: {
                        userId,
                        productId: Number(productId),
                        selectedColor,
                        selectedSize,
                        selectedVariant,
                        customSelections,
                    },
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error syncing wishlist:', error);
        res.status(500).json({ error: 'Failed to sync wishlist' });
    }
});

// Clear wishlist
wishlistRouter.delete('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        await prisma.wishlistItem.deleteMany({
            where: { userId },
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing wishlist:', error);
        res.status(500).json({ error: 'Failed to clear wishlist' });
    }
});
