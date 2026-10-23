
import {User} from '../../user/model/user.model.js';

export async function checkUserExistByEmail(email){
    return await User.findOne({email: email}) // {} | null

}

// only for flows that must compare the password (login)
export async function findUserByEmailWithPassword(email){
    return await User.findOne({email: email}).select('+password');
}

export async function createUser(userData){
    return await User.create(userData);
}