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
        // https://res.cloudinary.com/[cloud_name]/[resource_type]/upload/[transformations]/v[version]/[public_id].[ext]

        const parts = url.split('/upload/');
        if (parts.length < 2) return false;

        let remaining = parts[1];
        const pathSegments = remaining.split('/');

        // Cloudinary path usually looks like: [transformations/][vVersion/][folders/]publicId.ext

        let startIndex = 0;

        // Find the version segment (v followed by digits)
        const versionIndex = pathSegments.findIndex(seg => /^v\d+$/.test(seg));
        if (versionIndex !== -1) {
            // Everything AFTER the version is the public_id
            startIndex = versionIndex + 1;
        } else {
            // No version found. Is the first segment a transformation?
            // Heuristic: transformations often contain commas, or are very short key_value pairs
            if (pathSegments.length > 1 && (pathSegments[0].includes(',') || /^[a-z]_[^/]+$/.test(pathSegments[0]))) {
                startIndex = 1;
            }
        }

        const publicIdSegments = pathSegments.slice(startIndex);
        let pathWithExt = publicIdSegments.join('/');

        // Remove the file extension
        const lastDotIndex = pathWithExt.lastIndexOf('.');
        const publicId = lastDotIndex !== -1 ? pathWithExt.substring(0, lastDotIndex) : pathWithExt;

        console.log(`Deleting Cloudinary asset: ${publicId}`);
        const result = await cloudinary.uploader.destroy(publicId);

        if (result.result !== 'ok') {
            console.warn(`Cloudinary delete result for ${publicId}: ${result.result}`);
        }

        return result.result === 'ok';
    } catch (error) {
        console.error("Error deleting image from Cloudinary:", error);
        return false;
    }
};

export default cloudinary;
