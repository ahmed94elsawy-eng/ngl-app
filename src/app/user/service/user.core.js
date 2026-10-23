import { userNotExist } from '../errors.js';

const asList = (v) => (Array.isArray(v) ? [...v] : v ? [v] : []);

// factory so it can be tested without a database or a disk
export function createUserService({ userRepository, removeStoredFiles }) {

    // order matters: DB first, then delete the old files. Whatever fails, the user keeps a valid file.
    async function replaceUserFiles(userId, field, files, multiple) {
        const newPaths = files.map((f) => f.url);

        const user = await userRepository.findUserById(userId);
        if (!user) {
            await removeStoredFiles(newPaths);
            throw userNotExist;
        }

        const oldPaths = asList(user[field]);
        try {
            await userRepository.updateUserById(userId, { [field]: multiple ? newPaths : newPaths[0] });
        } catch (err) {
            await removeStoredFiles(newPaths); // don't leave an orphan, the old file is untouched
            throw err;
        }

        if (oldPaths.length) await removeStoredFiles(oldPaths);
        return multiple ? newPaths : newPaths[0];
    }

    return {
        uploadProfilePic: (userId, file) => replaceUserFiles(userId, 'profilePicPath', [file], false),
        uploadCv: (userId, file) => replaceUserFiles(userId, 'cvPath', [file], false),
        // replaces the whole set of cover images
        uploadCoverImages: (userId, files) => replaceUserFiles(userId, 'coverImagePaths', files, true),
    };
}