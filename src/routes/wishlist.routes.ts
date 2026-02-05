import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
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
        const productIds = wishlistItems.map(item => item.productId);
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

        const productMap = new Map(products.map(p => [p.id, p]));

        const items = wishlistItems.map(item => {
            const product = productMap.get(item.productId);
            return {
                id: item.id.toString(),
                productId: item.productId,
                title: product?.title || '',
                slug: product?.slug || '',
                price: product?.price || 0,
                originalPrice: product?.originalPrice || product?.price || 0,
                image: product?.images?.[0] || '',
                inStock: (product?.stock || 0) > 0,
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

    const { productId } = req.body;

    if (!productId) {
        res.status(400).json({ error: 'Product ID is required' });
        return;
    }

    try {
        const wishlistItem = await prisma.wishlistItem.upsert({
            where: {
                userId_productId: { userId, productId: Number(productId) },
            },
            update: {},
            create: {
                userId,
                productId: Number(productId),
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

    try {
        await prisma.wishlistItem.delete({
            where: {
                userId_productId: { userId, productId: Number(productId) },
            },
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

    const { productId } = req.body;

    if (!productId) {
        res.status(400).json({ error: 'Product ID is required' });
        return;
    }

    try {
        const existing = await prisma.wishlistItem.findUnique({
            where: {
                userId_productId: { userId, productId: Number(productId) },
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

    try {
        const item = await prisma.wishlistItem.findUnique({
            where: {
                userId_productId: { userId, productId: Number(productId) },
            },
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
        // Upsert each item
        for (const productId of items) {
            await prisma.wishlistItem.upsert({
                where: {
                    userId_productId: { userId, productId: Number(productId) },
                },
                update: {},
                create: {
                    userId,
                    productId: Number(productId),
                },
            });
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
