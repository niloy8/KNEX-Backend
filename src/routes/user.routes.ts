import { Router, Request, Response } from 'express';
import { getUsers, createUser } from '../controllers/user.controller';
import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
export const userRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

userRouter.get('/', getUsers);
userRouter.post('/', createUser);

// Sync Firebase user with backend and get JWT token
userRouter.post('/sync', async (req: Request, res: Response) => {
    const { email, name, firebaseUid } = req.body;

    if (!email) {
        res.status(400).json({ error: 'Email is required' });
        return;
    }

    try {
        // Find or create user by email
        let user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            // Create new user
            user = await prisma.user.create({
                data: {
                    email,
                    name: name || email.split('@')[0],
                    password: firebaseUid || 'firebase-auth', // Use firebaseUid as password placeholder
                },
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        console.error('Error syncing user:', error);
        res.status(500).json({ error: 'Failed to sync user' });
    }
});

// Get current user info from token
userRouter.get('/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, name: true },
        });

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json(user);
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
