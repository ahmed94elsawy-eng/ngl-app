import * as conversationRepository from '../repository/conversation.repository.js'
import { logger } from '../../../pkg/logger/logger.js'
import { createConversationService } from './conversation.core.js'

export const { listConversations, sendMessage, getMessages } =
    createConversationService({ conversationRepository, logger });