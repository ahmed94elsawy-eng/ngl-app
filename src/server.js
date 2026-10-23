

import http from 'http';
import mongoose from 'mongoose';
import { createApp } from "./app.js";
import { connectDB } from './lib/db/mongoose.js';
import { env } from './lib/config/env.js';
import { logger } from './pkg/logger/logger.js';

const app = createApp()

const server = http.createServer(app)

async function start(){
    try{
        await connectDB();
        server.listen(env.port, ()=>
            logger.info(`server running on port ${env.port}`)
        )
    }catch(err){
        logger.error('failed to start server', { error: err.message });
        process.exit(1);
    }
}

async function shutdown(){
    // force exit if connections hang
    setTimeout(() => process.exit(1), 10000).unref();
    server.close(async()=>{
        await mongoose.disconnect()
        process.exit(0)
    });
}


process.on('SIGINT', shutdown)

process.on('SIGTERM', shutdown)

start();