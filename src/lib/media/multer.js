import multer from 'multer';
import { AppError } from '../error/error.js';
import { allowedFields } from './file.validation.js';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file

// files are kept in memory only until fileValidation checks them, nothing touches the disk before that
function multerUpload(allowedTypes, maxFiles) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: maxFiles, fields: 10 },
    fileFilter: function (req, file, cb){
        // the claimed type can be faked: this is only a quick reject, the real check is the magic number
        if (!allowedTypes.includes(file.mimetype)){
           return cb(new AppError('invalid file format', 400), false)
        }
        cb(null, true)
    },
  })
}


export function uploadSingleFile(filename, allowedTypes = allowedFields.images) {
    return multerUpload(allowedTypes, 1).single(filename)
}


export function uploadFilesArray(filename, maxcount = 3, allowedTypes = allowedFields.images) {
    return multerUpload(allowedTypes, maxcount).array(filename, maxcount)
}

// fields: [{ name: 'avatar', maxCount: 1 }, ...]
export function uploadFields(fields, allowedTypes = allowedFields.images) {
    const total = fields.reduce((sum, f) => sum + (f.maxCount ?? 1), 0);
    return multerUpload(allowedTypes, total).fields(fields)
}