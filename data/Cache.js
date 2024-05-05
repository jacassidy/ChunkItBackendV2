//This class handles the current users stored on cache 
require('dotenv').config();

const database = require('./Database');
const googleData = require('./GoogleData');
const { google } = require('googleapis');
const crypto = require('crypto');

//Session with redis:
// redisClient.on('error', function(err) {
//   console.log('Could not establish a connection with Redis. ' + err);
// });

// redisClient.on('connect', function(err) {
//   console.log('Connected to Redis successfully');
// });

// function refreshRedisClient(sessionKey){
//   redisClient.expire(sessionKey, 10 * 60); // Extend TTL to 10 minutes
// }



/**
 * user passes in their ID and router decides what data it wants returned
 * Also handles if user is not logged in yet and redirects them to the authentication page
 * @param {*} id - user ID
 * @param {*} data - data wanted passed in as an array of strings ie: ['settings', 'token']
 */

const indexes = {};
const access_tokens = {};

async function addUser(encryptedID, accessToken = null, index = null){

    const id = decryptData(encryptedID);

    //console.log('ID:', id, 'encryptedID', encryptedID);

    if(!index){
        try{
            // console.log('Getting Data:', databaseQuery)
            index = await database.getUserIndex(id);
        }catch (err){
            err.message = 'Failed to get index from database';
            throw err;
        }
    }

    console.log('Index:', index);

    if(!accessToken){
        try{
            var {token: refreshToken} = await database.getUserData(index, ['token']);
        }catch(err){
            err.message = 'Failed to get refreshToken from database';
            throw err;
        }

        try{
            accessToken = await getAccessToken(refreshToken);
        }catch(err){
            console.error('Failed to Retrieve access token from google');
            throw err;
        }
    }

    const accessKey = generateKey();

    indexes[accessKey] = index;
    access_tokens[index] = accessToken;

    return accessKey;
}

async function createUser(refreshToken, accessToken){
    try{
        var email = await googleData.email(accessToken);
    }catch(err){
        console.error('Email Not Found');
        return null;
    }

    console.log('Email Found:', email);

    const encryptedRefreshToken = encryptData(refreshToken);

    const {index, id} = await database.createUser(encryptedRefreshToken, email);

    if(!index){
        return null;
    }
    const encryptedID = encryptData(id);
    const accessKey = addUser(id, accessToken, index);

    return {user_id: encryptedID, accessKey};
}

function updateUser(accessKey){
    //extends life to 10 more min when using redis
    const index = indexes[accessKey];
    if(!index){
        throw new Error('User does not exist in database');
    }
}

function createOAuth2Client(){
    const oauth2Client = new google.auth.OAuth2(
        process.env.CLIENT_ID,       // ClientID
        process.env.CLIENT_SECRET,   // Client Secret
        process.env.REDIRECT_URL     // Redirect URL
      );

    return oauth2Client;
}

async function getAccessToken(encryptedRefreshToken){
    const oauth2Client = createOAuth2Client();
    const refreshToken = decryptData(encryptedRefreshToken);

    console.log('refresToken', refreshToken, 'encrypted', encryptedRefreshToken);

    oauth2Client.setCredentials({
        refresh_token: refreshToken
    });

    const { token } = await oauth2Client.getAccessToken();
    
    return token;
}

async function getUserData(accessKey, data){
    //in the future will use caching system with exparation to be efficient
    const userIndex = indexes[accessKey];
    if (userIndex){
        return await database.getUserData(userIndex, data);
    }else{
        return new Error('User Has Not Been Added to the Cache');
    }
}

async function getUserGoogleData(accessKey, data){
    //necessary user information
    const index = indexes[accessKey];

    if(!index){
        throw new Error('User Has Not Been Added to the Cache');
    }

    console.log('Fetching Google Data:', data);

    const accessToken = access_tokens[index];

    //fetch in googleDATA
    const returnData = {};

    // Check if 'data' contains 'tasks' and fetch tasks data
    if (data.includes('tasks')) {
        const tasks = await googleData.tasks(accessToken);
        returnData.tasksData = tasks.tasksData;
        returnData.tasksList = tasks.tasksList;
        console.log('Task Data:', returnData.tasksData);
    }

    // Check if 'data' contains 'events' and fetch events data
    if (data.includes('events')) {
        returnData.eventsData = await googleData.events(accessToken);
        console.log('Event Data:', returnData.eventsData);
    }

    // Check if 'data' contains 'user' and fetch user data
    if (data.includes('user')) {
        returnData.userData = await googleData.user(accessToken);
    }

    return returnData;
}

function generateKey(){
    return crypto.randomBytes(16).toString('hex');
}

const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encryptData(data) {
    const iv = crypto.randomBytes(16); // Generate a new IV for each encryption
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const encryptedData = iv.toString('hex') + encrypted; // Prepend IV to the encrypted data
    return encryptedData;
}

function decryptData(encryptedData) {
    try{
        const iv = Buffer.from(encryptedData.slice(0, 32), 'hex'); // Extract the IV from the encrypted data
        const payload = encryptedData.slice(32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(payload, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }catch(err){
        return null;
    }
    
}

module.exports = {
    getUserData,
    getUserGoogleData,
    addUser,
    createUser,
    updateUser
}