import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';

export const addressRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Get user from token
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

// Get all addresses for user
addressRouter.get('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const addresses = await prisma.address.findMany({
            where: { userId },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        res.json(addresses);
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});

// Get single address
addressRouter.get('/:id', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const addressId = parseInt(req.params.id);

    try {
        const address = await prisma.address.findFirst({
            where: { id: addressId, userId },
        });

        if (!address) {
            res.status(404).json({ error: 'Address not found' });
            return;
        }

        res.json(address);
    } catch (error) {
        console.error('Error fetching address:', error);
        res.status(500).json({ error: 'Failed to fetch address' });
    }
});

// Create new address
addressRouter.post('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { type, name, phone, address, area, city, isDefault } = req.body;

    if (!name || !phone || !address || !area) {
        res.status(400).json({ error: 'Name, phone, address, and area are required' });
        return;
    }

    try {
        // If this is set as default, unset other defaults
        if (isDefault) {
            await prisma.address.updateMany({
                where: { userId, isDefault: true },
                data: { isDefault: false },
            });
        }

        // If this is the first address, make it default
        const count = await prisma.address.count({ where: { userId } });
        const shouldBeDefault = isDefault || count === 0;

        const newAddress = await prisma.address.create({
            data: {
                userId,
                type: type || 'home',
                name,
                phone,
                address,
                area,
                city: city || 'Dhaka',
                isDefault: shouldBeDefault,
            },
        });

        res.status(201).json(newAddress);
    } catch (error) {
        console.error('Error creating address:', error);
        res.status(500).json({ error: 'Failed to create address' });
    }
});

// Update address
addressRouter.put('/:id', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const addressId = parseInt(req.params.id);
    const { type, name, phone, address, area, city, isDefault } = req.body;

    try {
        // Check if address belongs to user
        const existing = await prisma.address.findFirst({
            where: { id: addressId, userId },
        });

        if (!existing) {
            res.status(404).json({ error: 'Address not found' });
            return;
        }

        // If setting as default, unset other defaults
        if (isDefault && !existing.isDefault) {
            await prisma.address.updateMany({
                where: { userId, isDefault: true },
                data: { isDefault: false },
            });
        }

        const updated = await prisma.address.update({
            where: { id: addressId },
            data: {
                type: type ?? existing.type,
                name: name ?? existing.name,
                phone: phone ?? existing.phone,
                address: address ?? existing.address,
                area: area ?? existing.area,
                city: city ?? existing.city,
                isDefault: isDefault ?? existing.isDefault,
            },
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ error: 'Failed to update address' });
    }
});

// Set address as default
addressRouter.patch('/:id/default', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const addressId = parseInt(req.params.id);

    try {
        // Check if address belongs to user
        const existing = await prisma.address.findFirst({
            where: { id: addressId, userId },
        });

        if (!existing) {
            res.status(404).json({ error: 'Address not found' });
            return;
        }

        // Unset all defaults for this user
        await prisma.address.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
        });

        // Set this as default
        const updated = await prisma.address.update({
            where: { id: addressId },
            data: { isDefault: true },
        });

        res.json(updated);
    } catch (error) {
        console.error('Error setting default address:', error);
        res.status(500).json({ error: 'Failed to set default address' });
    }
});

// Delete address
addressRouter.delete('/:id', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const addressId = parseInt(req.params.id);

    try {
        // Check if address belongs to user
        const existing = await prisma.address.findFirst({
            where: { id: addressId, userId },
        });

        if (!existing) {
            res.status(404).json({ error: 'Address not found' });
            return;
        }

        await prisma.address.delete({
            where: { id: addressId },
        });

        // If deleted address was default, set another as default
        if (existing.isDefault) {
            const nextAddress = await prisma.address.findFirst({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            });
            if (nextAddress) {
                await prisma.address.update({
                    where: { id: nextAddress.id },
                    data: { isDefault: true },
                });
            }
        }

        res.json({ message: 'Address deleted successfully' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ error: 'Failed to delete address' });
    }
});
