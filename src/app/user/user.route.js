import { Router } from "express";
import { uploadFilesArray, uploadSingleFile } from "../../lib/media/multer.js";
import { allowedFields, fileValidation } from "../../lib/media/file.validation.js";
import * as userController from './controller/user.controller.js'
import { authGuard } from "../../lib/auth/guard.js";

const userRouter = Router();

// A user's CV is private: only the authenticated owner can download it.
userRouter.get('/cv', authGuard, userController.downloadMyCv);

// order: auth first (an anonymous user can't make us buffer files) -> multer (size/count/claimed type)
// -> fileValidation (real type by magic number, then save) -> controller
userRouter.post('/upload-profile-pic',
    authGuard,
    uploadSingleFile('pp'),
    fileValidation(allowedFields.images, 'profile'),
    userController.uploadProfilePic
);


userRouter.post('/upload-cv',
    authGuard,
    uploadSingleFile('cv', allowedFields.files),
    fileValidation(allowedFields.files, 'cv'),
    userController.uploadCv
);


userRouter.post('/upload-cover-images',
    authGuard,
    uploadFilesArray('cover-images', 3),
    fileValidation(allowedFields.images, 'covers'),
    userController.uploadCoverImages
);

export default userRouter;