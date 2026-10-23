import * as identityRepository from '../repository/identity-request.repository.js'
import * as messageRepository from '../../message/repository/message.repository.js'
import * as conversationRepository from '../../conversation/repository/conversation.repository.js'
import { createIdentityRequestService } from './identity.core.js'

export const { requestIdentity, listReceived, listSent, acceptRequest, rejectRequest } =
    createIdentityRequestService({ identityRepository, messageRepository, conversationRepository });