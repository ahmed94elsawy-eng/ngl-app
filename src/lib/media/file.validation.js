import { fileTypeFromBuffer } from "file-type";
import { createUploadPipeline, createFileValidation } from "./upload.core.js";

// types are checked twice: the claimed mimetype (multer, cheap) and the real content (magic number)
export const allowedFields ={
    images: ['image/png', 'image/jpeg'],
    files: ['application/pdf'], // .doc is not detectable by content reliably, so it was removed
    videos: ['video/mp4'],
    audios: ['audio/mpeg']
}

const pipeline = createUploadPipeline({ detect: fileTypeFromBuffer });

// Middleware: validates by magic number, then saves to uploads/<folder>/<uuid>.<ext>
// usage: fileValidation(allowedFields.images, 'profile')
export const fileValidation = createFileValidation({ pipeline, defaultTypes: allowedFields.images });

// best-effort delete of stored files (one path or a list)
export const removeStoredFiles = pipeline.removeStored;