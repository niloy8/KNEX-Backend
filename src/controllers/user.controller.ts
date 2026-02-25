import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';


export const getUsers = async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
            }
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

export const createUser = async (req: Request, res: Response) => {
    const { name, email, password } = req.body;
    try {
        const user = await prisma.user.create({
            data: { name, email, password },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
            }
        });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
