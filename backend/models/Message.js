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
    ciphertext:{
        type:String,
        required:true
    },
    contenttype:{type:String,default:'text'},
    envelope:{
      version:{type:Number,default:1},
      preKey:{type:Boolean,default:false},
      oneTimePreKeyId:{type:Number},
      deviceId:{type:Number}
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
    lastSeen:{type:Date,default:null},
    deliveredAt:Date,
    readAt:Date
},{timestamps:true});


MessageSchema.index({receiver:1,status:1,createdAt:-1});

module.exports = mongoose.model('Message',MessageSchema);