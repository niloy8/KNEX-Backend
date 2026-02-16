import "dotenv/config";
import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key-change-in-production";

// Auth middleware
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
        const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });
        if (!admin) return res.status(401).json({ error: "Invalid token" });
        (req as any).admin = admin;
        next();
    } catch (error) {
        console.error("Auth error:", error);
        res.status(401).json({ error: "Invalid token" });
    }
};

// Login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const token = jwt.sign({ id: admin.id }, JWT_SECRET, { expiresIn: "7d" });
        res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, permissions: admin.permissions } });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed" });
    }
});

// Get current admin
router.get("/me", authMiddleware, (req, res) => {
    const { password, ...admin } = (req as any).admin;
    res.json(admin);
});

// Get all admins (superadmin only)
router.get("/", authMiddleware, async (req, res) => {
    if ((req as any).admin.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    const admins = await prisma.admin.findMany({ select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true } });
    res.json(admins);
});

// Create admin (superadmin only)
router.post("/", authMiddleware, async (req, res) => {
    if ((req as any).admin.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    const { email, password, name, role, permissions } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
        data: { email, password: hashed, name, role: role || "admin", permissions: permissions || [] },
        select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true }
    });
    res.json(admin);
});

// Update admin (superadmin only)
router.put("/:id", authMiddleware, async (req, res) => {
    if ((req as any).admin.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    const { name, role, permissions, password } = req.body;
    const data: any = { name, role, permissions };
    if (password) data.password = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.update({
        where: { id: parseInt(req.params.id) },
        data,
        select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true }
    });
    res.json(admin);
});

// Delete admin (superadmin only)
router.delete("/:id", authMiddleware, async (req, res) => {
    if ((req as any).admin.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    await prisma.admin.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
});

export const adminRouter = router;
