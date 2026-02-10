import { Router, Request, Response } from 'express';
import { getUsers, createUser } from '../controllers/user.controller';
import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';
export const userRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Admin auth helper
const getAdminFromToken = (req: Request): { id: number } | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
        return decoded;
    } catch {
        return null;
    }
};

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

// Update current user profile
userRouter.put('/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

        const { name, email } = req.body;

        const updated = await prisma.user.update({
            where: { id: decoded.userId },
            data: {
                ...(name && { name }),
                ...(email && { email }),
            },
            select: { id: true, email: true, name: true },
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ========== ADMIN CUSTOMER ENDPOINTS ==========

// Get customer statistics (Admin)
userRouter.get('/admin/stats', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        // Get total customers (users with at least one order)
        const customersWithOrders = await prisma.user.findMany({
            where: { orders: { some: {} } },
            select: { id: true },
        });
        const totalCustomers = customersWithOrders.length;

        // Get active customers (ordered in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const activeCustomers = await prisma.user.count({
            where: {
                orders: {
                    some: {
                        createdAt: { gte: thirtyDaysAgo },
                    },
                },
            },
        });

        // Calculate average spend (only from delivered orders)
        const totalRevenue = await prisma.order.aggregate({
            where: { status: 'delivered' },
            _sum: { total: true },
        });
        const avgSpend = totalCustomers > 0 ? Math.round((totalRevenue._sum.total || 0) / totalCustomers) : 0;

        // New customers this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const newCustomersThisMonth = await prisma.user.count({
            where: {
                orders: { some: {} },
                createdAt: { gte: startOfMonth },
            },
        });

        res.json({
            totalCustomers,
            activeCustomers,
            avgSpend,
            newCustomersThisMonth,
        });
    } catch (error) {
        console.error('Error fetching customer stats:', error);
        res.status(500).json({ error: 'Failed to fetch customer statistics' });
    }
});

// Get all customers with order data (Admin)
userRouter.get('/admin/customers', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string;
        const sortBy = req.query.sortBy as string || 'orders';
        const sortOrder = req.query.sortOrder as string || 'desc';

        // Build where clause
        const where: any = {
            orders: { some: {} }, // Only users with orders
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Get customers with aggregated order data
        const customers = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                orders: {
                    select: {
                        id: true,
                        total: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        });

        // Process and sort customers
        const processedCustomers = customers.map(customer => {
            const completedOrders = customer.orders.filter(o => o.status === 'delivered');
            const totalSpent = completedOrders.reduce((sum, o) => sum + o.total, 0);
            const lastOrder = customer.orders.length > 0
                ? customer.orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
                : null;

            return {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                totalOrders: customer.orders.length,
                completedOrders: completedOrders.length,
                totalSpent,
                avgOrderValue: customer.orders.length > 0 ? Math.round(totalSpent / customer.orders.length) : 0,
                lastOrderDate: lastOrder?.createdAt || null,
                joinedAt: customer.createdAt,
            };
        });

        // Sort
        processedCustomers.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'email':
                    comparison = a.email.localeCompare(b.email);
                    break;
                case 'spent':
                    comparison = a.totalSpent - b.totalSpent;
                    break;
                case 'orders':
                default:
                    comparison = a.totalOrders - b.totalOrders;
                    break;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        // Paginate
        const total = processedCustomers.length;
        const paginatedCustomers = processedCustomers.slice((page - 1) * limit, page * limit);

        res.json({
            customers: paginatedCustomers,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Export customers as CSV (Admin) - Enhanced with full order details
userRouter.get('/admin/customers/export', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const customers = await prisma.user.findMany({
            where: { orders: { some: {} } },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                orders: {
                    select: {
                        id: true,
                        orderNumber: true,
                        total: true,
                        subtotal: true,
                        deliveryCharge: true,
                        status: true,
                        paymentMethod: true,
                        paymentStatus: true,
                        customerPhone: true,
                        deliveryAddress: true,
                        deliveryArea: true,
                        createdAt: true,
                        items: {
                            select: {
                                id: true,
                                productId: true,
                                title: true,
                                price: true,
                                quantity: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        // Build comprehensive CSV with one row per order item
        const headers = [
            'Customer ID',
            'Customer Name',
            'Customer Email',
            'Phone',
            'Joined Date',
            'Total Orders',
            'Lifetime Value',
            'Order ID',
            'Order Number',
            'Order Date',
            'Order Status',
            'Payment Method',
            'Payment Status',
            'Delivery Area',
            'Delivery Address',
            'Order Subtotal',
            'Delivery Charge',
            'Order Total',
            'Item ID',
            'Product ID',
            'Product Title',
            'Item Price',
            'Quantity',
            'Item Total'
        ];

        const rows: string[] = [];

        for (const customer of customers) {
            const completedOrders = customer.orders.filter(o => o.status === 'delivered');
            const lifetimeValue = completedOrders.reduce((sum, o) => sum + o.total, 0);

            for (const order of customer.orders) {
                for (const item of order.items) {
                    const row = [
                        customer.id,
                        `"${customer.name.replace(/"/g, '""')}"`,
                        customer.email,
                        order.customerPhone || '',
                        new Date(customer.createdAt).toLocaleDateString(),
                        customer.orders.length,
                        lifetimeValue,
                        order.id,
                        order.orderNumber,
                        new Date(order.createdAt).toLocaleDateString(),
                        order.status,
                        order.paymentMethod,
                        order.paymentStatus,
                        order.deliveryArea,
                        `"${order.deliveryAddress.replace(/"/g, '""')}"`,
                        order.subtotal,
                        order.deliveryCharge,
                        order.total,
                        item.id,
                        item.productId,
                        `"${item.title.replace(/"/g, '""')}"`,
                        item.price,
                        item.quantity,
                        item.price * item.quantity
                    ].join(',');

                    rows.push(row);
                }
            }
        }

        const csv = [headers.join(','), ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=customers-orders-detailed-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting customers:', error);
        res.status(500).json({ error: 'Failed to export customers' });
    }
});
