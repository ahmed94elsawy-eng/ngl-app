import * as userRepository from '../repository/user.repository.js'
import { removeStoredFiles } from '../../../lib/media/file.validation.js'
import { createUserService } from './user.core.js'

export const { uploadProfilePic, uploadCv, uploadCoverImages } =
    createUserService({ userRepository, removeStoredFiles });