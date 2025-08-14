require('dotenv').config({path:'./config.env'});
const http = require('http');
const url = require('url');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const WebSocket = require('ws');
const User = require('./models/User');
const Message = require('./models/Message');


mongoose.connect(process.env.mongo_url,{
}).then((conn)=>console.log('connected to database'))
.catch(err=>{
    console.log('error occured while connecting to the database ',err.message);
    process.exit(1);
})

const app = express();
app.use(express.json());

const signToken = (user)=> jwt.sign({userId:user._id,email:user.email},process.env.jwt_secret,{expiresIn:'70000000'});

app.post('/api/auth/register',async(req,res)=>{
    try{
       const newUser = await User.create(req.body);
       const token = signToken(newUser);
       res.status(200).json({
        status:'success',
        message:'user created successfully',
        token,
        data:newUser
       })
    }catch(err){
        res.status(500).json({
           status:'failure',
           message:err.message
        })
    }
})

app.post('/api/auth/login',async(req,res)=>{
    try{
        const {email,password} = req.body;
        const user = await User.findOne({email}).select('+password');
        if(!user) {
            return res.status(404).json({
                status:'failure',
                message:'user not found'
            })
        }
        const ok = await bcrypt.compare(password,user.password);
        if(!ok) {
            return res.status(400).json({
                status:'failure',
                message:'invalid credentials'
            })
        }
        const token = signToken(user);
        res.status(200).json({
            status:'success',
            message:'login successfull',
            token,
        })
    } catch(error) {
        res.status(500).json({
            status:'failure',
            message:error.message
        })
    }
})
const server = http.createServer(app);
const wss = new WebSocket.Server({server});
//online clients map-> userid->set<WebSocket> {supports multi-device/sessions}

const clients = new Map();

function addClient(userId,ws) {
    if(!clients.has(userId)) clients.set(userId,new Set())
    clients.get(userId).add(ws);
}

function removeClient(userId,ws) {
    const set = clients.get(userId);
    if(!(set instanceof Set)) return ;
    set.delete(ws);
    if(set.size() === 0) clients.delete(userId);
}

function sendToUser(userId,payloadObj) {
    const set = clients.get(userId);//to get all the websockets connections for user , connections->different devices available
    if(!set) return false; // if no connection means the user is offline
    const data = JSON.stringify(payloadObj);
    let delivered = false;
    for(const ws of set) {
        if(ws.readyState === WebSocket.OPEN) {//an active connection for the user
            ws.send(data);
            delivered = true;
        }
    }
    return delivered;
}

function parseTokenFromReq(req) {
    const Parsed = new url.URL(req.url,'http://localhost');
    return Parsed.searchParams.get('token');//to fetch the value of token parameter
}

function authFromReq(req) {
    const token = parseTokenFromReq(req);
    if(!token) return null;
    try{
        return jwt.verify(token,process.env.jwt_secret);
    } catch{
        return null;
    }
}

wss.on('connection',async(ws,req)=>{
    const auth = authFromReq(req);
    if(!auth?.userId) {
        ws.close(4401,'Unauthorised');
        return;
    }
    const userId = auth.userId.toString();
    ws.userId = userId;

    addClient(userId,ws);
    console.log(`ws connected: user ${userId} (online sessions: ${clients.get(userId)?.size || 0})`)

    try{
        const pending = await Message.find({receiver:userId,status:'sent'}).sort({sentAt:1});
        if(pending.length) {
            for(const msg of pending) {
                sendToUser(userId,{type:'MESSAGE',message:serializeMessage(msg)});
            }

            const now = new Date();
            await Message.updateMany({_id:{$in:pending.map(m=>m._id)}},{$set:{status:'delivered',deliveredAt:now}});

            for(const msg of pending) {
                sendToUser(msg.sender.toString(),{
                    type:'MESSAGE_STATUS',
                    messageId:msg._id,
                    status:'delivered',
                    deliveredAt:now
                });
            }
        }
    } catch(err) {
        console.log('offline delievery error', err.message);
    }

    ws.on('message',async(raw)=>{
        let data;
        try{
            data = JSON.parse(raw.toString());
        } catch{
            return ws.send(JSON.stringify({type:'ERROR',message:'invalid JSON'}));
        }
        if(!data.type) {
            return ws.send(JSON.stringify({type:'ERROR',message:'Missing type'}));
        }

        switch(data.type) {
            case 'SEND_MESSAGE':{
                const {to,content} = data;
                if(!to || !content || typeof content!== 'string') {
                    return ws.send(JSON.stringify({type:'ERROR',message:'to and content are required'}));
                }

                const receiverOnline = !!clients.get(to);

                const now = new Date();
                const msg = new Message({
                    sender:userId,
                    receiver:to,
                    content,
                    status:receiverOnline?'delivered':'sent',
                    sentAt:now,
                    deliveredAt:receiverOnline?now:undefined
                });

                try{
                    await msg.save();
                } catch(err) {
                    console.error('save message error',err.message);
                    return ws.send(JSON.stringify({type:'ERROR',message:'failed to save message'}));
                }

                ws.send(JSON.stringify({type:'MESSAGE_STATUS',messageId:msg._id,status:msg.status,sentAt:msg.sentAt,deliveredAt:msg.deliveredAt || null}));

                if(receiverOnline) {
                    sendToUser(to,{type:'MESSAGE',message:serializeMessage(msg)});
                } 
                break;
            }

            case 'ACK-READ':{
                const {messageId} = data;
                if(!messageId) return ws.send(JSON.stringify({type:'ERROR',message:'messageId required'}));
                
                const msg = await Message.findById(messageId)
                if(!msg) return ws.send(JSON.stringify({type:'ERROR',message:'Message not found'}));
                if(msg.receiver?.toString()!==userId) {
                    return ws.send(JSON.stringify({type:'ERROR',message:'Not allowed'}))
                }

                if(msg.status !== 'read') {
                    msg.status = 'read';
                    msg.readAt = new Date();
                    await msg.save();
                }
                sendToUser(msg.sender.toString(),{
                    type:'MESSAGE_STATUS',
                    messageId:msg._id,
                    status:'read',
                    readAt:msg.readAt
                })
                break;
            }
            case 'PING':{
                ws.send(JSON.stringify({type:'PONG',at:Date.now()}))
                break;
            }

            default:
                ws.send(JSON.stringify({type:'ERROR',message:`Unknown type ${data.type}`}))
        }
    });


    ws.on('close',()=>{
        removeClient(userId,ws);
        console.log(`ws disconnected : user ${userId}`)
    });
});

function serializeMessage(m) {
  return {
    id: m._id,
    sender: m.sender,
    receiver: m.receiver || null,
    group: m.group || null,
    content: m.content,            // later: encrypted blob
    status: m.status,
    sentAt: m.sentAt,
    deliveredAt: m.deliveredAt || null,
    readAt: m.readAt || null
  };
}

// -----------------------
// 5) Start server
// -----------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 HTTP+WS on http://localhost:${PORT}`);
  console.log(`🔐 WS expects JWT as query: ws://localhost:${PORT}/?token=<JWT>`);
});





