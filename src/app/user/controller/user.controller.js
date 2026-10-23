import * as path from "node:path";
import { access } from "node:fs/promises";
import * as userService from "../service/user.service.js";
import * as userRepository from "../repository/user.repository.js";
import { AppError } from "../../../lib/error/error.js";


export const uploadProfilePic = async (req, res, next) =>{
    try{
        const profilePicPath = await userService.uploadProfilePic(req.user.id, req.file);
        res.json({message: "upload profile successfully.", success: true, data: { profilePicPath }})
    }catch(error){
        next(error)
    }
}

export const uploadCv = async (req, res, next) =>{
    try{
        await userService.uploadCv(req.user.id, req.file);
        // Return the authenticated download endpoint, not a public filesystem URL.
        res.json({message: "upload cv successfully.", success: true, data: { cvPath: '/api/user/cv' }});
    }catch(error){
        next(error)
    }
}

export const downloadMyCv = async (req, res, next) => {
    try {
        const user = await userRepository.findUserById(req.user.id);
        if (!user?.cvPath) throw new AppError('CV not found', 404);

        const privateCvRoot = path.resolve(process.cwd(), 'uploads', 'cv');
        const privateCvRootPrefix = privateCvRoot + path.sep;
        const filePath = path.resolve(process.cwd(), user.cvPath);

        // Defend against malformed paths stored in the database.
        if (!filePath.startsWith(privateCvRootPrefix)) throw new AppError('CV not found', 404);
        try {
            await access(filePath);
        } catch (error) {
            if (error?.code === 'ENOENT' || error?.code === 'EACCES') throw new AppError('CV not found', 404);
            throw error;
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="my-cv.pdf"');
        res.sendFile(filePath, (error) => {
            if (error && !res.headersSent) next(error);
        });
    } catch (error) {
        next(error);
    }
};

export const uploadCoverImages = async (req, res, next) =>{
    try{
        const coverImagePaths = await userService.uploadCoverImages(req.user.id, req.files);
        res.json({message: "upload cover images successfully.", success: true, data: { coverImagePaths }})
    }catch(error){
        next(error)
    }
}