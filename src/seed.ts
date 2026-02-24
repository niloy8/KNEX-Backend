import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "./lib/prisma.js";

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

async function seed() {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.warn("SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set. Skipping seed.");
        return;
    }

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

seed()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
