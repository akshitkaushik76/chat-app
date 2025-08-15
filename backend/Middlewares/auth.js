const express = require('express');
const User = require('../models/User');
const util = require('util');
const jwt  = require('jsonwebtoken');

exports.requireAuth = async(req,res,next)=>{
    try{
    const testToken = req.headers.authorization;
    let token;
    if(testToken && testToken.StartWith('Bearer')) {
        token  = testToken.split(' ')[1];
    }
    console.log(token);
    if(!token) {
        return res.status(401).json({
            status:'failure',
            message:'unauthorized access'
        })
    }
    const decodedToken = await util.promisify(jwt.verify)(token,process.env.jwt_secret);
    console.log(decodedToken);
    const user = await User.findById(decodedToken._id);
    console.log(user);
    if(!user) {
        res.status(401).json({
            status:'unauthorized',
            message:'the user with credentials does not exist'
        })
    }
    req.user = user;
    next();
} catch(error) {
    console.log(err.message);
    return res.status(401).json({
        status:'fail',
        message:'invalid or expired token'
    })
}
}
