import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';
import jwt from 'jsonwebtoken';

export const orderRouter = Router();

console.log('Order routes loaded!');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Debug endpoint - check if orders exist (no auth required for testing)
orderRouter.get('/debug/count', async (req: Request, res: Response) => {
    try {
        const count = await prisma.order.count();
        const orders = await prisma.order.findMany({ take: 5 });
        console.log('Debug: Order count =', count);
        res.json({ count, sampleOrders: orders });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: 'Debug failed', details: String(error) });
    }
});

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

// Admin auth middleware - uses same secret and format as admin.routes.ts
const getAdminFromToken = (req: Request): { id: number } | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
        return decoded;
    } catch (error) {
        console.error('Admin token verification failed:', error);
        return null;
    }
};

// Generate unique order number
const generateOrderNumber = (): string => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `KNX-${timestamp}-${random}`;
};

// Create new order (User)
orderRouter.post('/', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    console.log('POST /orders - userId from token:', userId);

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const {
        customerName,
        customerEmail,
        customerPhone,
        deliveryAddress,
        deliveryArea,
        paymentMethod = 'cod',
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !deliveryAddress || !deliveryArea) {
        res.status(400).json({ error: 'Please fill in all required fields' });
        return;
    }

    try {
        // Get user's cart items with variant info
        const cartItems = await prisma.cartItem.findMany({
            where: { userId },
        });

        if (cartItems.length === 0) {
            res.status(400).json({ error: 'Cart is empty' });
            return;
        }

        // Get product details
        const productIds = cartItems.map(item => item.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true,
                title: true,
                price: true,
                images: true,
                variants: {
                    select: { id: true, name: true, image: true, price: true }
                }
            },
        });

        const productMap = new Map(products.map(p => [p.id, p]));

        // Calculate totals and prepare order items with variant info
        let subtotal = 0;
        const orderItems = cartItems.map(item => {
            const product = productMap.get(item.productId);
            const selectedVariant = item.selectedVariant as { id?: number; name?: string; image?: string; price?: number } | null;
            const customSelections = item.customSelections as Record<string, string> | null;

            // Use variant price if selected, else product price
            const price = selectedVariant?.price || product?.price || 0;
            const image = selectedVariant?.image || product?.images?.[0] || '';

            subtotal += price * item.quantity;

            return {
                productId: item.productId,
                title: product?.title || 'Unknown Product',
                price,
                quantity: item.quantity,
                image,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize,
                selectedVariant: selectedVariant || undefined,
                customSelections: customSelections || undefined,
            };
        });

        const deliveryCharge = deliveryArea === 'inside' ? 80 : 150;
        const total = subtotal + deliveryCharge;

        // Create order with items including variant info
        const order = await prisma.order.create({
            data: {
                orderNumber: generateOrderNumber(),
                userId,
                customerName,
                customerEmail: customerEmail || '',
                customerPhone,
                deliveryAddress,
                deliveryArea,
                deliveryCharge,
                subtotal,
                total,
                paymentMethod,
                status: 'pending',
                paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
                items: {
                    create: orderItems,
                },
            },
            include: {
                items: true,
            },
        });

        console.log(`Order created: ${order.orderNumber} for userId: ${order.userId}`);

        // Clear user's cart after successful order
        await prisma.cartItem.deleteMany({
            where: { userId },
        });

        res.status(201).json({
            success: true,
            order: {
                id: order.id,
                orderNumber: order.orderNumber,
                total: order.total,
                status: order.status,
            },
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Get user's orders
orderRouter.get('/my-orders', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    console.log('GET /my-orders - userId from token:', userId);

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        // First check if any orders exist at all for debugging
        const totalOrders = await prisma.order.count();
        const userOrders = await prisma.order.count({ where: { userId } });
        console.log(`Total orders in DB: ${totalOrders}, Orders for user ${userId}: ${userOrders}`);

        const orders = await prisma.order.findMany({
            where: { userId },
            include: {
                items: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        console.log(`Returning ${orders.length} orders for user ${userId}`);
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get single order by ID (User)
orderRouter.get('/my-orders/:id', async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { id } = req.params;

    try {
        const order = await prisma.order.findFirst({
            where: {
                id: Number(id),
                userId,
            },
            include: {
                items: true,
            },
        });

        if (!order) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// ============ ADMIN ROUTES ============

// Get all orders (Admin)
orderRouter.get('/admin/all', async (req: Request, res: Response) => {
    console.log('GET /admin/all called');
    const admin = getAdminFromToken(req);
    console.log('Admin from token:', admin);

    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { status, page = '1', limit = '20' } = req.query;
    console.log('Query params:', { status, page, limit });

    try {
        const where = status && status !== 'All'
            ? { status: (status as string).toLowerCase() }
            : {};

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    items: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma.order.count({ where }),
        ]);

        console.log('Found orders:', orders.length, 'Total:', total);

        res.json({
            orders,
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get order statistics (Admin) - MUST be before /:id route
orderRouter.get('/admin/stats/summary', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const [
            totalOrders,
            pendingOrders,
            processingOrders,
            deliveredOrders,
            cancelledOrders,
            totalRevenue,
        ] = await Promise.all([
            prisma.order.count(),
            prisma.order.count({ where: { status: 'pending' } }),
            prisma.order.count({ where: { status: 'processing' } }),
            prisma.order.count({ where: { status: 'delivered' } }),
            prisma.order.count({ where: { status: 'cancelled' } }),
            prisma.order.aggregate({
                where: { status: 'delivered' }, // Only count delivered orders as actual sales
                _sum: { total: true },
            }),
        ]);

        res.json({
            totalOrders,
            pendingOrders,
            processingOrders,
            deliveredOrders,
            cancelledOrders,
            totalRevenue: totalRevenue._sum.total || 0,
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get sales chart data (Admin) - MUST be before /:id route
orderRouter.get('/admin/stats/sales-chart', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const days = parseInt(req.query.days as string) || 7;
        const result = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (days <= 7) {
            // Daily data for 7 days
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);

                const nextDate = new Date(date);
                nextDate.setDate(nextDate.getDate() + 1);

                const [salesAgg, ordersCount] = await Promise.all([
                    prisma.order.aggregate({
                        where: {
                            createdAt: { gte: date, lt: nextDate },
                            status: 'delivered',
                        },
                        _sum: { total: true },
                    }),
                    prisma.order.count({
                        where: {
                            createdAt: { gte: date, lt: nextDate },
                            status: 'delivered',
                        },
                    }),
                ]);

                result.push({
                    day: dayNames[date.getDay()],
                    label: `${date.getDate()}/${date.getMonth() + 1}`,
                    sales: salesAgg._sum.total || 0,
                    orders: ordersCount,
                });
            }
        } else if (days <= 30) {
            // Weekly data for month (4 weeks)
            for (let i = 3; i >= 0; i--) {
                const endDate = new Date();
                endDate.setDate(endDate.getDate() - (i * 7));
                endDate.setHours(23, 59, 59, 999);

                const startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 6);
                startDate.setHours(0, 0, 0, 0);

                const [salesAgg, ordersCount] = await Promise.all([
                    prisma.order.aggregate({
                        where: {
                            createdAt: { gte: startDate, lte: endDate },
                            status: 'delivered',
                        },
                        _sum: { total: true },
                    }),
                    prisma.order.count({
                        where: {
                            createdAt: { gte: startDate, lte: endDate },
                            status: 'delivered',
                        },
                    }),
                ]);

                result.push({
                    day: `Week ${4 - i}`,
                    label: `${startDate.getDate()}/${startDate.getMonth() + 1}-${endDate.getDate()}/${endDate.getMonth() + 1}`,
                    sales: salesAgg._sum.total || 0,
                    orders: ordersCount,
                });
            }
        } else {
            // Monthly data for year (12 months)
            for (let i = 11; i >= 0; i--) {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const year = date.getFullYear();
                const month = date.getMonth();

                const startDate = new Date(year, month, 1);
                const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

                const [salesAgg, ordersCount] = await Promise.all([
                    prisma.order.aggregate({
                        where: {
                            createdAt: { gte: startDate, lte: endDate },
                            status: 'delivered',
                        },
                        _sum: { total: true },
                    }),
                    prisma.order.count({
                        where: {
                            createdAt: { gte: startDate, lte: endDate },
                            status: 'delivered',
                        },
                    }),
                ]);

                result.push({
                    day: monthNames[month],
                    label: `${monthNames[month]} ${year}`,
                    sales: salesAgg._sum.total || 0,
                    orders: ordersCount,
                });
            }
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching sales chart:', error);
        res.status(500).json({ error: 'Failed to fetch sales chart data' });
    }
});

// Get new orders for notifications (Admin) - MUST be before /:id route
orderRouter.get('/admin/notifications', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        // Get recent orders (last 48 hours) OR any pending orders
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

        const recentOrders = await prisma.order.findMany({
            where: {
                OR: [
                    { createdAt: { gt: twoDaysAgo } },
                    { status: 'pending' },
                ],
            },
            select: {
                id: true,
                orderNumber: true,
                customerName: true,
                total: true,
                status: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 15,
        });

        const pendingCount = await prisma.order.count({
            where: { status: 'pending' },
        });

        res.json({
            orders: recentOrders,
            pendingCount,
            lastCheck: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get single order (Admin) - MUST be AFTER all specific /admin/* routes
orderRouter.get('/admin/:id', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { id } = req.params;

    try {
        const order = await prisma.order.findUnique({
            where: { id: Number(id) },
            include: {
                items: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!order) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// Update order status (Admin)
orderRouter.put('/admin/:id/status', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { id } = req.params;
    const { status, paymentStatus, notes } = req.body;

    try {
        // Get current order to check previous status
        const currentOrder = await prisma.order.findUnique({
            where: { id: Number(id) },
            include: { items: true },
        });

        if (!currentOrder) {
            res.status(404).json({ error: 'Order not found' });
            return;
        }

        const updateData: { status?: string; paymentStatus?: string; notes?: string } = {};

        if (status) updateData.status = status;
        if (paymentStatus) updateData.paymentStatus = paymentStatus;
        if (notes !== undefined) updateData.notes = notes;

        // If status is changing to "delivered", update product stock
        if (status === 'delivered' && currentOrder.status !== 'delivered') {
            // Decrease stock for each item in the order
            for (const item of currentOrder.items) {
                await prisma.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: { decrement: item.quantity },
                    },
                });
            }
            // Mark payment as paid when order is delivered
            updateData.paymentStatus = 'paid';
        }

        // If order was delivered and is being changed back (e.g., cancelled), restore stock
        if (currentOrder.status === 'delivered' && status && status !== 'delivered') {
            for (const item of currentOrder.items) {
                await prisma.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: { increment: item.quantity },
                    },
                });
            }
        }

        const order = await prisma.order.update({
            where: { id: Number(id) },
            data: updateData,
            include: {
                items: true,
            },
        });

        res.json({ success: true, order });
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Delete order (Admin)
orderRouter.delete('/admin/:id', async (req: Request, res: Response) => {
    const admin = getAdminFromToken(req);
    if (!admin) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { id } = req.params;

    try {
        await prisma.order.delete({
            where: { id: Number(id) },
        });

        res.json({ success: true, message: 'Order deleted' });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});
