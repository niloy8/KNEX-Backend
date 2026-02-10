import "dotenv/config";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for memory storage (we'll process before saving)
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max upload
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed."));
        }
    },
});

// Compress image to target size (30-60KB) while maintaining quality
async function compressImage(buffer: Buffer, filename: string): Promise<{ buffer: Buffer; filename: string }> {
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, ext);
    const timestamp = Date.now();
    const newFilename = `${baseName}-${timestamp}.webp`;

    let quality = 80;
    let compressed = await sharp(buffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();

    // Target size: 30-60KB (30720 - 61440 bytes)
    const targetMin = 30 * 1024;
    const targetMax = 60 * 1024;

    // If image is already small enough, return it
    if (compressed.length <= targetMax) {
        return { buffer: compressed, filename: newFilename };
    }

    // Binary search for optimal quality
    let minQuality = 10;
    let maxQuality = 80;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        quality = Math.floor((minQuality + maxQuality) / 2);

        compressed = await sharp(buffer)
            .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();

        if (compressed.length >= targetMin && compressed.length <= targetMax) {
            break; // Found good quality
        } else if (compressed.length > targetMax) {
            maxQuality = quality - 1;
        } else {
            minQuality = quality + 1;
        }
        attempts++;
    }

    // If still too large, try with smaller dimensions
    if (compressed.length > targetMax) {
        const dimensions = [800, 600, 400];
        for (const dim of dimensions) {
            compressed = await sharp(buffer)
                .resize(dim, dim, { fit: "inside", withoutEnlargement: true })
                .webp({ quality: 60 })
                .toBuffer();

            if (compressed.length <= targetMax) break;
        }
    }

    return { buffer: compressed, filename: newFilename };
}

// Single image upload
router.post("/single", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image provided" });
        }

        const { buffer, filename } = await compressImage(req.file.buffer, req.file.originalname);
        const filePath = path.join(uploadsDir, filename);

        await fs.promises.writeFile(filePath, buffer);

        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
        const imageUrl = `${baseUrl}/uploads/${filename}`;

        res.json({
            success: true,
            url: imageUrl,
            filename,
            size: buffer.length,
            sizeKB: (buffer.length / 1024).toFixed(2) + " KB"
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Failed to upload image" });
    }
});

// Multiple images upload
router.post("/multiple", upload.array("images", 10), async (req, res) => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No images provided" });
        }

        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
        const results = [];

        for (const file of files) {
            const { buffer, filename } = await compressImage(file.buffer, file.originalname);
            const filePath = path.join(uploadsDir, filename);

            await fs.promises.writeFile(filePath, buffer);

            results.push({
                url: `${baseUrl}/uploads/${filename}`,
                filename,
                size: buffer.length,
                sizeKB: (buffer.length / 1024).toFixed(2) + " KB"
            });
        }

        res.json({
            success: true,
            images: results
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Failed to upload images" });
    }
});

// Delete image
router.delete("/:filename", async (req, res) => {
    try {
        const filePath = path.join(uploadsDir, req.params.filename);

        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Image not found" });
        }
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ error: "Failed to delete image" });
    }
});

export const uploadRouter = router;
