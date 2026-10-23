import * as userRepository from '../../user/repository/user.repository.js'
import * as messageRepository from '../repository/message.repository.js'
import { createMessageService } from './message.core.js'

export const { sendMessage, getAllMessages, getMessage, deleteMessage } =
    createMessageService({ userRepository, messageRepository });