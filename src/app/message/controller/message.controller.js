import { validateBody } from "../../../lib/validation/validation.js"
import { sendMessageDto, listMessagesDto, messageIdDto } from "../dto/message.dto.js"
import * as messageService from '../service/message.service.js' 


export async function sendMessage(req, res, next) {
    try{
        // validate data
        const data = validateBody(sendMessageDto, req.body);
        const {content, receiver} = data;
        // recorded for moderation only, it is never returned to anyone
        const sender = req.user?.id;
        const createMessage = await messageService.sendMessage(content, receiver, sender)
        res.status(201).json({
            message: 'message created successfully',
            success: true,
            data: createMessage
        })

    }catch(error){
        next(error)
    }
}


export async function getAllMessages(req, res, next) {
    try{    
        const { page, limit } = validateBody(listMessagesDto, req.query);
        const { items, pagination } = await messageService.getAllMessages(req.user.id, { page, limit });
        res.json({
            message: "ok",
            success: true,
            data: items,
            pagination
        })

    }catch(error){
       next(error) 
    }
}


export async function getMessage(req, res, next) {
    try{
        const { id } = validateBody(messageIdDto, req.params);
        const message = await messageService.getMessage(req.user.id, id);
        res.json({ message: "ok", success: true, data: message })
    }catch(error){
        next(error)
    }
}


export async function deleteMessage(req, res, next) {
    try{
        const { id } = validateBody(messageIdDto, req.params);
        await messageService.deleteMessage(req.user.id, id);
        res.json({ message: "message deleted successfully", success: true })
    }catch(error){
        next(error)
    }
}