import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
export const cartRouter = Router();

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

// Get cart items
cartRouter.get('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const cartItems = await prisma.cartItem.findMany({
            where: { userId },
            include: {
                user: false,
            },
        });

        // Get product details for each cart item
        const productIds = cartItems.map(item => item.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true,
                title: true,
                slug: true,
                price: true,
                images: true,
            },
        });

        const productMap = new Map(products.map(p => [p.id, p]));

        const items = cartItems.map(item => {
            const product = productMap.get(item.productId);
            return {
                id: item.id.toString(),
                productId: item.productId,
                quantity: item.quantity,
                title: product?.title || '',
                slug: product?.slug || '',
                price: product?.price || 0,
                image: product?.images?.[0] || '',
            };
        });

        res.json(items);
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

// Add to cart
cartRouter.post('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { productId, quantity = 1 } = req.body;

    if (!productId) {
        res.status(400).json({ error: 'Product ID is required' });
        return;
    }

    try {
        const cartItem = await prisma.cartItem.upsert({
            where: {
                userId_productId: { userId, productId: Number(productId) },
            },
            update: {
                quantity: { increment: quantity },
            },
            create: {
                userId,
                productId: Number(productId),
                quantity,
            },
        });

        res.json({ success: true, cartItem });
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

// Update cart item quantity
cartRouter.put('/:productId', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
        res.status(400).json({ error: 'Quantity must be at least 1' });
        return;
    }

    try {
        const cartItem = await prisma.cartItem.update({
            where: {
                userId_productId: { userId, productId: Number(productId) },
            },
            data: { quantity },
        });

        res.json({ success: true, cartItem });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

// Remove from cart
cartRouter.delete('/:productId', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { productId } = req.params;

    try {
        await prisma.cartItem.delete({
            where: {
                userId_productId: { userId, productId: Number(productId) },
            },
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing from cart:', error);
        res.status(500).json({ error: 'Failed to remove from cart' });
    }
});

// Sync guest cart to user cart (called on login)
cartRouter.post('/sync', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { items } = req.body; // Array of { productId, quantity }

    if (!items || !Array.isArray(items)) {
        res.status(400).json({ error: 'Items array is required' });
        return;
    }

    try {
        // Upsert each item
        for (const item of items) {
            await prisma.cartItem.upsert({
                where: {
                    userId_productId: { userId, productId: Number(item.productId) },
                },
                update: {
                    quantity: { increment: item.quantity },
                },
                create: {
                    userId,
                    productId: Number(item.productId),
                    quantity: item.quantity,
                },
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error syncing cart:', error);
        res.status(500).json({ error: 'Failed to sync cart' });
    }
});

// Clear cart
cartRouter.delete('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        await prisma.cartItem.deleteMany({
            where: { userId },
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});
