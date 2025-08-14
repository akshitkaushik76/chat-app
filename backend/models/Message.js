const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    receiver:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
    },
    group:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Group'
    },
    content:{
        type:String,
        required:true
    },
    status:{
        type:String,
        enum:['sent','delivered','read'],
        default:'sent'
    },
    sentAt:{
        type:Date,
        default:Date.now
    },
    deliveredAt:Date,
    readAt:Date
},{timestamps:true});

MessageSchema.index({receiver:1,status:1});

module.exports = mongoose.model('Message',MessageSchema);