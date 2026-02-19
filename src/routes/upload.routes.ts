import "dotenv/config";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cloudinary from "../utils/cloudinary.js";

const router = Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for memory storage
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

// Helper to upload buffer to Cloudinary
async function uploadToCloudinary(buffer: Buffer, originalName: string, folder: string = "knex_uploads"): Promise<any> {
    return new Promise((resolve, reject) => {
        const publicId = path.parse(originalName).name;
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: `${publicId}-${Date.now()}`,
                resource_type: "auto",
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        uploadStream.end(buffer);
    });
}

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

    // Target size: 30-60KB
    const targetMin = 30 * 1024;
    const targetMax = 60 * 1024;

    if (compressed.length <= targetMax) {
        return { buffer: compressed, filename: newFilename };
    }

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
            break;
        } else if (compressed.length > targetMax) {
            maxQuality = quality - 1;
        } else {
            minQuality = quality + 1;
        }
        attempts++;
    }

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
        const result = await uploadToCloudinary(buffer, filename);

        res.json({
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            sizeKB: (buffer.length / 1024).toFixed(2) + " KB"
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Failed to upload image to Cloudinary" });
    }
});

// Multiple images upload
router.post("/multiple", upload.array("images", 10), async (req, res) => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No images provided" });
        }

        const uploadPromises = files.map(async (file) => {
            const { buffer, filename } = await compressImage(file.buffer, file.originalname);
            const result = await uploadToCloudinary(buffer, filename);
            return {
                url: result.secure_url,
                public_id: result.public_id,
                sizeKB: (buffer.length / 1024).toFixed(2) + " KB"
            };
        });

        const results = await Promise.all(uploadPromises);

        res.json({
            success: true,
            images: results
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Failed to upload images to Cloudinary" });
    }
});

// Delete image from Cloudinary
router.delete("/:public_id", async (req, res) => {
    try {
        const result = await cloudinary.uploader.destroy(req.params.public_id);
        if (result.result === "ok") {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Image not found on Cloudinary", details: result });
        }
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ error: "Failed to delete image from Cloudinary" });
    }
});

export const uploadRouter = router;
