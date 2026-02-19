import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config(); // loads CLOUDINARY_URL from .env automatically

if (!process.env.CLOUDINARY_URL) {
    throw new Error('CLOUDINARY_URL is not set in environment variables');
}

/**
 * Deletes an image from Cloudinary using its secure_url.
 * Extracts the public_id accurately even with folders and versions.
 */
export const deleteImageByUrl = async (url: string): Promise<boolean> => {
    if (!url || !url.includes("res.cloudinary.com")) return false;

    try {
        // Cloudinary URL format:
        // https://res.cloudinary.com/[cloud_name]/image/upload/v[version]/[folder]/[public_id].[ext]

        // Split by '/upload/' to get everything after it
        const parts = url.split('/upload/');
        if (parts.length < 2) return false;

        // Get the path after '/upload/' and remove the version (v12345678/) if it exists
        let pathAfterUpload = parts[1];
        if (pathAfterUpload.startsWith('v')) {
            const firstSlashIndex = pathAfterUpload.indexOf('/');
            if (firstSlashIndex !== -1) {
                pathAfterUpload = pathAfterUpload.substring(firstSlashIndex + 1);
            }
        }

        // Remove the file extension (e.g., .webp, .jpg)
        const lastDotIndex = pathAfterUpload.lastIndexOf('.');
        const publicId = lastDotIndex !== -1 ? pathAfterUpload.substring(0, lastDotIndex) : pathAfterUpload;

        console.log(`Deleting Cloudinary asset: ${publicId}`);
        const result = await cloudinary.uploader.destroy(publicId);
        return result.result === 'ok';
    } catch (error) {
        console.error("Error deleting image from Cloudinary:", error);
        return false;
    }
};

export default cloudinary;
