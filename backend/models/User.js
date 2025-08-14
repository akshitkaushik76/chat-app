const mongoose = require('mongoose');
const express = require('express');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const UserSchema = new mongoose.Schema({
    username:{
        type:String,
        required:[true,'please provide the username to continue'],

    },
    email:{
        type:String,
        required:[true,'please provide an email address to continue'],
        unique:[true,'please provide an unique email address to continue'],
        validate:[validator.isEmail,'please provide an correct email']
    },
    password:{
        type:String,
        minlength:6,
        required:[true,'please provide a password to continue'],
        select:false
    },
    confirmpassword:{
        type:String,
        required:[true,'please confirm your password to continue'],
        validate:{
            validator:function(value) {
                return value === this.password
            },
            message:'passwords does not match ,please confirm again'
        }
    },
    keys:{
        identityKey:{type:String,required:true},
        signedPreKey:{
            keyId:{type:Number,required:true},
            publicKey:{type:String,required:true},
            signature:{type:String,required:true}
        },
        preKeys:[{
            keyId:{type:Number,required:true},
            publicKey:{type:String,required:true},
        }]
    },
    groups:[{type:mongoose.Schema.Types.ObjectId,ref:'Group'}],
    contacts:[{type:mongoose.Schema.Types.ObjectId,ref:'User'}]
})

UserSchema.pre('save',async function(next) {
    if(!this.isModified('password')) {
        return next();
    }
    this.password = await bcrypt.hash(this.password,12);
    this.confirmpassword = undefined;
    next();
 })

const user = mongoose.model('User',UserSchema);
module.exports = user