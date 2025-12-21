import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";

async function seed() {
    const existing = await prisma.admin.findUnique({ where: { email: "knex.bd@gmail.com" } });
    if (existing) { console.log("Super admin already exists"); return; }
    
    await prisma.admin.create({
        data: {
            email: "knex.bd@gmail.com",
            password: await bcrypt.hash("KnexAdmin@2025", 10),
            name: "Super Admin",
            role: "superadmin",
            permissions: ["all"]
        }
    });
    console.log("Super admin created: knex.bd@gmail.com");
}

seed().catch(console.error);
