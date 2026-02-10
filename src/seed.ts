import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "knex.bd@gmail.com";
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "KnexAdmin@2025";

async function seed() {
    const existing = await prisma.admin.findUnique({ where: { email: ADMIN_EMAIL } });
    if (existing) { console.log("Super admin already exists"); return; }

    await prisma.admin.create({
        data: {
            email: ADMIN_EMAIL,
            password: await bcrypt.hash(ADMIN_PASSWORD, 10),
            name: "Super Admin",
            role: "superadmin",
            permissions: ["all"]
        }
    });
    console.log(`Super admin created: ${ADMIN_EMAIL}`);
}

seed().catch(console.error);
