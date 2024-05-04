//Manages user needing to log in with google auth and serves as a redirect if they are not logged in
require('dotenv').config();
const express = require("express");
const router = express.Router();
const { scopes } = require('../data/GoogleData');
const { google } = require('googleapis');
const cache = require('../data/Cache');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Console } = require('console');

// const { promisify } = require('util');

// const OAuth2 = google.auth.OAuth2;

router.use((req, res, next) => {
    console.log('\n' + req.originalUrl);
    next();
});

function generateKey(){
    return crypto.randomBytes(16).toString('hex');
}

// Helper function to create a new OAuth2 client
function createOAuth2Client() {
    return new google.auth.OAuth2(
      process.env.CLIENT_ID,       // ClientID
      process.env.CLIENT_SECRET,   // Client Secret
      process.env.REDIRECT_URL     // Redirect URL
    );
  }

router.get('/google', readRefreshToken, googleAuthenticate); 

router.get('/', readRefreshToken, (req, res) =>{
    // if(req.query.redirect){
    //     res.redirect(`/authenticate/google?redirect=${req.query.redirect}`);
    // }else{
    //     res.redirect(`/authenticate/google`);
    // }
    return googleAuthenticate(req, res);
});

async function googleAuthenticate(req, res){
    const redirect = req.query.redirect ? decodeURIComponent(req.query.redirect) : process.env.FRONT_END_HOME;

    const oauth2Client = createOAuth2Client();

    const stateKey = generateKey();

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Will return a refresh token.
      scope: scopes,
      response_type: 'code',
      state: stateKey // Use the session ID or another unique identifier
    });

    // console.log('State sent to google ' + stateKey);
  
    /*
    router.get('/google/login', (req, res) => {
        const oauth2Client = createOAuth2Client();
        const url = oauth2Client.generateAuthUrl({
            access_type: 'online', // Only returns access token
            scope: ['openid', 'profile', 'email'], // Limited scope for login
        });
        res.redirect(url);
    });

    router.get('/google/signup', (req, res) => {
        const oauth2Client = createOAuth2Client();
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Will return a refresh token
            scope: scopes, // Your usual signup scopes
        });
        res.redirect(url);
    });
    */

    createStateCookie(res, stateKey);
    console.log('About to redirect to', url);
    return res.redirect(url);
  }

async function getTokens(code){
    const oauth2Client = createOAuth2Client();

    const {tokens} = await oauth2Client.getToken(code);
    console.log('Refresh Tokens:');
    console.log(tokens.refresh_token);
    return tokens;
    // return tokens;
}
  
  // Route for OAuth callback
router.get('/google/callback', async (req, res) => {
    //add saving redirect between callback
    const redirect = null;

    const key = req.cookies.state;
        
    if(!key){
        console.log('Key Missing, possible timeout');
        return res.status(403).send('Key Missing, possible timeout');
    }
    console.log('Found key, deleting state Cookie');

    clearStateCookie(res, key);

    const { state, code } = req.query;

    if(key !== state){
        console.log('STATE MISMATCH; POSSIBLE CSRF!');
        return res.status(403).send('State mismatch, possible Attack!');
    }

    console.log('Key state match');

    console.log('Code is', code);

    try{
        var tokens = await getTokens(code);
    }catch(err){
        console.log(err);
        return res.status(500).send('Cannot Grab Tokens');
    }

    console.log('Retrieved Tokens');

    if(!tokens.refresh_token){
        console.error('Tokens null');
        return res.status(500).send('Authentication failed');
    }

    try{
        const {user_id, accessKey} = await cache.createUser(tokens.refresh_token, tokens.access_token);
        console.log('Created user in Cache');
        
        const refreshKey = createRefreshKey(req, user_id);
        createRefreshCookie(res, refreshKey);

        console.log('Created Refresh Key');
        createAccessCookie(res, accessKey);
        console.log('Access Cookie Created');
        console.log('Successful log in');
        // return res.status(100).send('Successfully Logged in');
    }catch (err){
        console.log(err);
        return res.status(500).send('Failed to create / retrieve database infromation, please try again');


    }
    if(redirect){
        console.log('Redirecting to', redirect);
        return res.redirect(redirect);
    }
    return res.status(200).send('Successfully Logged in');

  });


function createClinetIdentifyer(req){
    const userAgent = req.headers['user-agent'];
    const xForwardedFor = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    //update to check if mobile device, if so store Advertising ID instead of IP
    //find better way to identify device for issued refresh token
    const clientIdentifier = crypto.createHash('sha256').update(userAgent + xForwardedFor).digest('hex');
    return clientIdentifier;
}

function createRefreshKey(req, user_id) {

    const refreshKey = jwt.sign({
        user_id: user_id,
        bind: createClinetIdentifyer(req)
    }, process.env.JWT_KEY, { expiresIn: '60d' }); // Token expires in 60 days

    return refreshKey;
}


async function readRefreshToken(req, res, next) {
    console.log('Reading Refresh Token');

    const refreshKey = req.cookies.refreshKey; // Extract token from cookies
    // const redirect = decodeURIComponent(req.query.redirect);
    
    if (!refreshKey) {
        console.error('Client Missing Refresh Key');
        return next(); //coninues user to /authenticate page
    }

    console.log('Refresh Key Found');

    try{
        var decoded = jwt.verify(refreshKey, process.env.JWT_KEY);
    }catch (err){
        console.error('Invalid Refresh Key');
        clearRefreshCookie(res, refreshKey);
        return next();
        // return res.status(500).send('Invalid Refresh Key');
    }

    console.log('JWT Verified');

    // req.user = decoded; // Attach user information to req object

    //mange session data
    
    if (decoded.bind !== createClinetIdentifyer(req)) {
        //Token possibly stolen, redirect user to delete their current userID and generate a new one
        console.error( new Error('Key Bind Mismatch: Deleting Refresh Key'));
        clearRefreshCookie(res, refreshKey);

        return next();
    }

    //console.log(decoded.user_id);
    try{
        var accessKey = await cache.addUser(decoded.user_id);
    }catch(err){
        console.error('Failed to add user to cache: ', err);
        return res.status(500).send('Filed to add user, please try again');
    }
    console.log('User Validated');

    console.log('User Added to Cache');

    createAccessCookie(res, accessKey);

    console.log('Access Cookie Created');
    // console.log('Redirecting to', redirect);
    // if(redirect){
    //     return res.redirect(redirect); // Continue to the next middleware or route handler
    // }

    return res.status(200).send('Successfully Logged in');
}

async function readAccessToken(req, res, next) {

    console.log('Reading Access Token');

    const origionalURL = req.originalUrl;

    const accessKey = req.cookies.accessKey;

    // Manually extend session expiration
    if (!accessKey) {
        return res.redirect(`/authenticate?redirect=${encodeURIComponent(origionalURL)}`); // Modify with your actual login route
    }

    //validate access token

    try{
        cache.updateUser(accessKey);
    }catch(err){
        clearAccessCookie(res, accessKey);
        console.log(err.message);
        return res.redirect(`/authenticate?redirect=${encodeURIComponent(origionalURL)}`); // Modify with your actual login route

    }

    createAccessCookie(res, accessKey);
    
    return next();
}

function createAccessCookie(res, key){
    res.cookie('accessKey', key, {
        //domain: process.env.FRONT_END_HOME, // accessible across subdomains
        path: '/', // accessible across all paths
        httpOnly: true,  // Cookie cannot be accessed by client-side scripts
        secure: true,    // Ensure you're using HTTPS
        sameSite: 'Lax', // Strict same site policy
        maxAge: 1000 * 60 * 10 // 10 minutes in milliseconds
    });
}

function clearAccessCookie(res, key){
    res.clearCookie('accessKey', key, {
        //domain: process.env.FRONT_END_HOME, // accessible across subdomains
        path: '/', // accessible across all paths
        httpOnly: true,  // Cookie cannot be accessed by client-side scripts
        secure: true,    // Ensure you're using HTTPS
        sameSite: 'Lax', // Strict same site policy
        maxAge: 1000 * 60 * 10 // 10 minutes in milliseconds
    });
}

function createRefreshCookie(res, key){
    res.cookie('refreshKey', key, {
        //domain: process.env.FRONT_END_HOME, // accessible across subdomains
        path: '/', // accessible across all paths
        httpOnly: true,  // Cookie cannot be accessed by client-side scripts
        secure: true,    // Ensure you're using HTTPS
        sameSite: 'Lax', // Strict same site policy
        maxAge: 1000 * 60 * 60 * 24 * 60 // 60 days in milliseconds
    });
}

function clearRefreshCookie(res, key){
    res.clearCookie('refreshKey', key, {
        //domain: process.env.FRONT_END_HOME, // accessible across subdomains
        path: '/', // accessible across all paths
        httpOnly: true,  // Cookie cannot be accessed by client-side scripts
        secure: true,    // Ensure you're using HTTPS
        sameSite: 'Lax', // Strict same site policy
        maxAge: 1000 * 60 * 60 * 24 * 60 // 60 days in milliseconds
    });
}

function createStateCookie(res, key){
    res.cookie('state', key, {
        //domain: process.env.FRONT_END_HOME, // accessible across subdomains
        path: '/', // accessible across all paths
        httpOnly: true,  // Cookie cannot be accessed by client-side scripts
        secure: true,    // Ensure you're using HTTPS
        sameSite: 'None', // Strict same site policy
        maxAge: 1000 * 60 * 2 // 2 minutes in milliseconds
    });
}

function clearStateCookie(res, key){
    res.clearCookie('state', key, {
        //domain: process.env.FRONT_END_HOME, // accessible across subdomains
        path: '/', // accessible across all paths
        httpOnly: true,  // Cookie cannot be accessed by client-side scripts
        secure: true,    // Ensure you're using HTTPS
        sameSite: 'None', // Strict same site policy
        maxAge: 1000 * 60 * 2 // 2 minutes in milliseconds
    });
}


module.exports = {
    router,
    readAccessToken
};