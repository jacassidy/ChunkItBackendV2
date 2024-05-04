//Enviromental Varaiables
require('dotenv').config();

//Necessary Middleware
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require("cors");
const authenticate = require('./routes/Authenticate.js');

//Routers
var settingsRouter = require("./routes/Settings.js");
var calendarRouter = require("./routes/Calendar.js");
var authenticationRouter = authenticate.router;

//database
const database = require('./data/Database.js');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

//Necessary for all app fucntion
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

process.env.DEV === 'true' && app.use(express.static(path.join(__dirname, 'public')));

//Set up endpoints
app.use("/authenticate", authenticationRouter);
app.use(authenticate.readAccessToken);
app.use("/calendar", calendarRouter);
app.use("/settings", settingsRouter);

app.get('/', (req, res) => {
  res.status(200).send('Home');
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

//Error Handler
app.use(function(err, req, res, next) {
  /*
    General Error Formating:

    const err = new Error('Something went wrong');
    err.status = 500;
    err.message = 'Internal Server Error';
    err.type = 'DatabaseError';
    err.detail = 'Failed to connect to the database';
    err.userMessage = 'Unable to retrieve data. Please try again later.';
    err.timestamp = new Date().toISOString();
    next(err);

  */


  // Ensure that an error status code is set; default to 500 if not specified
  const statusCode = err.statusCode || 500;
  let message = "An unexpected error occurred";

  switch (statusCode) {
    case 400:
      message = 'Bad Request: The server could not understand the request due to invalid syntax.';
      break;
    case 401:
      message = 'Unauthorized: The request has failed authentication.';
      break;
    case 403:
      message = 'Forbidden: The server is refusing to respond to the request.';
      break;
    case 404:
      message = 'Not Found: The server can not find the requested resource.';
      break;
    case 405:
      message = 'Method Not Allowed: The method specified in the request is not allowed for the resource.';
      break;
    case 408:
      message = 'Request Timeout: The server timed out waiting for the rest of the request from the client.';
      break;
    case 501:
      message = 'Not Implemented: The server does not support the functionality required to fulfill the request.';
      break;
    case 503:
      message = 'Service Unavailable: The server is currently unable to handle the request due to a temporary overloading or maintenance.';
      break;
    case 504:
      message = 'Gateway Timeout: The server, while acting as a gateway, did not receive a response in time.';
      break;
    case 500:
      if(err.type === 'database'){

      }

      message = 'Internal Server Error: The server encountered an unexpected condition which prevented it from fulfilling the request.';
      break;
    default:
      message = 'Unknown Error: An unexpected error occurred.';
  }

  // Append the specific error message if present
  if (err.message) {
    message += `\n Specific error: ${err.message}`;
  }

  res.locals.message = message;
  res.locals.error = process.env.DEV === 'true' ? err : {};

  console.error(err); // Log error details for server-side debugging
  res.status(statusCode).render('error').send({ error: message });
});

//Shutdown
async function shutdown(signal){
  console.log(`${signal} received. Closing database pool and shutting down the app...`);
    try {
        await database.closePool();
        await redisClient.quit();
        console.log('Database pool has been closed.');
        process.exit(0); // Successful exit
    } catch (err) {
        console.error('Failed to close the database pool:', err);
        process.exit(1); // Exit with error
    }
}

const PORT = +process.env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handling
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));


// module.exports = app;
