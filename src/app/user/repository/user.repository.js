import { User } from "../model/user.model.js";

export async function updateUserByEmail(email, updatedData) {
  return await User.findOneAndUpdate(
    {email: email}, //filter
    updatedData,
    { new: true } ,
  );
}

export async function updateUserById(id, updatedData) {
  return await User.findByIdAndUpdate(id, updatedData, { new: true });
}


export function findUserById(id) {
  return User.findOne({_id: id, isDeleted: false}, {password: 0}, {})
}