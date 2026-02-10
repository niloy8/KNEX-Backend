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
                colors: true,
                sizes: true,
                customVariants: true,
                variants: {
                    select: { id: true, name: true, image: true, price: true }
                }
            },
        });

        const productMap = new Map(products.map(p => [p.id, p]));

        const items = cartItems.map(item => {
            const product = productMap.get(item.productId);
            const selectedVariant = item.selectedVariant as { id?: number; name?: string; image?: string; price?: number } | null;
            const customSelections = item.customSelections as Record<string, string> | null;

            // Use variant price if selected, else product price
            const price = selectedVariant?.price || product?.price || 0;
            const image = selectedVariant?.image || product?.images?.[0] || '';

            return {
                id: item.id.toString(),
                productId: item.productId,
                quantity: item.quantity,
                title: product?.title || '',
                slug: product?.slug || '',
                price,
                image,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize,
                selectedVariant,
                customSelections,
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

    const { productId, quantity = 1, selectedColor, selectedSize, selectedVariant, customSelections } = req.body;

    if (!productId) {
        res.status(400).json({ error: 'Product ID is required' });
        return;
    }

    try {
        // Prepare the where clause for finding existing cart item
        const whereClause = {
            userId,
            productId: Number(productId),
            selectedColor: selectedColor || null,
            selectedSize: selectedSize || null,
        };

        // Check if item with same product and options exists
        const existingItem = await prisma.cartItem.findFirst({
            where: whereClause,
        });

        if (existingItem) {
            // Update quantity
            const cartItem = await prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: existingItem.quantity + quantity },
            });
            res.json({ success: true, cartItem });
        } else {
            // Create new cart item
            const cartItem = await prisma.cartItem.create({
                data: {
                    userId,
                    productId: Number(productId),
                    quantity,
                    selectedColor: selectedColor || null,
                    selectedSize: selectedSize || null,
                    selectedVariant: selectedVariant || null,
                    customSelections: customSelections || null,
                },
            });
            res.json({ success: true, cartItem });
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

// Update cart item quantity
cartRouter.put('/:itemId', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
        res.status(400).json({ error: 'Quantity must be at least 1' });
        return;
    }

    try {
        // Verify the cart item belongs to the user
        const existingItem = await prisma.cartItem.findFirst({
            where: { id: Number(itemId), userId },
        });

        if (!existingItem) {
            res.status(404).json({ error: 'Cart item not found' });
            return;
        }

        const cartItem = await prisma.cartItem.update({
            where: { id: Number(itemId) },
            data: { quantity },
        });

        res.json({ success: true, cartItem });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

// Remove from cart
cartRouter.delete('/:itemId', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { itemId } = req.params;

    try {
        // Verify the cart item belongs to the user
        const existingItem = await prisma.cartItem.findFirst({
            where: { id: Number(itemId), userId },
        });

        if (!existingItem) {
            res.status(404).json({ error: 'Cart item not found' });
            return;
        }

        await prisma.cartItem.delete({
            where: { id: Number(itemId) },
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

    const { items } = req.body; // Array of { productId, quantity, selectedColor, selectedSize, selectedVariant, customSelections }

    if (!items || !Array.isArray(items)) {
        res.status(400).json({ error: 'Items array is required' });
        return;
    }

    try {
        // Upsert each item
        for (const item of items) {
            const whereClause = {
                userId,
                productId: Number(item.productId),
                selectedColor: item.selectedColor || null,
                selectedSize: item.selectedSize || null,
            };

            const existingItem = await prisma.cartItem.findFirst({
                where: whereClause,
            });

            if (existingItem) {
                await prisma.cartItem.update({
                    where: { id: existingItem.id },
                    data: { quantity: existingItem.quantity + item.quantity },
                });
            } else {
                await prisma.cartItem.create({
                    data: {
                        userId,
                        productId: Number(item.productId),
                        quantity: item.quantity,
                        selectedColor: item.selectedColor || null,
                        selectedSize: item.selectedSize || null,
                        selectedVariant: item.selectedVariant || null,
                        customSelections: item.customSelections || null,
                    },
                });
            }
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
