//Makes calls to the Google API and manages reseting access tokens if necessary
const { google } = require('googleapis');
const dateFns = require('date-fns');

const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks.readonly',    
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

function createOAuth2Client(accessToken){
    const oauth2Client = new google.auth.OAuth2(
        process.env.CLIENT_ID,       // ClientID
        process.env.CLIENT_SECRET,   // Client Secret
        process.env.REDIRECT_URL     // Redirect URL
      );

    oauth2Client.setCredentials({
        access_token: accessToken
      });

    return oauth2Client;
}

async function email(accessToken){
    const oauth2Client = createOAuth2Client(accessToken);
      
    const oauth2 = google.oauth2({
        auth: oauth2Client,
        version: 'v2'
      });

    return new Promise((resolve, reject) => {
        oauth2.userinfo.get((err, res) => {
          if (err) {
            console.error('Error fetching user info:', err);
            reject(err); // Rejects the Promise on error
            return;
          }
    
          resolve(res.data.email); // Resolves with the email on success
        });
      });
}


  /**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

async function events(accessToken) {
    const oauth2Client = createOAuth2Client(accessToken);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    let start = dateFns.startOfWeek(new Date(), { weekStartsOn: 0 }); //start of the week
    let end = dateFns.endOfWeek(new Date(), { weekStartsOn: 0 }); //end of the week
    let event_data = [];
    const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    });
    const events = res.data.items;
    if (!events || events.length === 0) {
        // console.log('No upcoming events found.');
        return;
    }
    events.map(event => {
        let save_event = {
            summary: event.summary,
            location: event.location,
            description: event.description,
            colorId: event.colorId,
            start: event.start.dateTime,
            end: event.end.dateTime,
            id: event.id
        };
        event_data.push(save_event);
        // console.log(save_event);
    });
    return new Promise((resolve, reject) => {
        resolve(event_data);
    });
}

/**
* Lists the user's first 10 task lists.
*
* @param {google.auth.OAuth2} auth An authorized OAuth2 client.
*/
async function tasks(accessToken) {
    const oauth2Client = createOAuth2Client(accessToken);
    const service = google.tasks({ version: 'v1', auth: oauth2Client });
    // const savedTasks = JSON.parse(await fs.readFile(TASK_PATH));
    let taskData = [];
    let task_lists = [];
    const res = await service.tasklists.list({
        maxResults: 10,
    });
    const taskLists = res.data.items;
    if (taskLists && taskLists.length) {
        taskLists.forEach((taskList) => {
            let save_task_list = {
                title: taskList.title,
                id: taskList.id,
                // color: assignColor(taskList, savedTasks["taskLists"]), //assign this based on the task id
            };
            task_lists.push(save_task_list);
            // console.log(save_task_list);
        });
    } else {
        // no task lists found
        // console.log('No task lists found.');
    }
    for (const taskList of task_lists) { //need to fetch done tasks too
        const tasksResult = await service.tasks.list({
            tasklist: taskList.id,
        });
        const tasks = tasksResult.data.items;

        if (tasks && tasks.length) {
            tasks.forEach((task) => {
                let save_task = {
                    title: task.title,
                    due: dateFns.addDays(new Date(task.due), 1), //fixes weird issue where task is due a day before
                    status: task.status,
                    id: task.id,
                    list: taskList.title
                };
                taskData.push(save_task);
            });
        } else {
            // no tasks found for that task list
            console.log("No tasks found for" + taskList.title + " task list.");
        }
    }
    return new Promise((resolve, reject) => {
        const task = {
            taskData: taskData,
            taskLists: task_lists
        };
        resolve(task);

    });
}

async function assignColor(taskList, savedTasks) {
  // console.log(savedTasks);
  // console.log(taskList);
  const color = savedTasks.find(t => t.id === taskList.id).color;
  return color;
  // let color = '#8A64D6';
  // if(task.id === 'completed'){
  //     color = '#00FF00';
  // }
  // return color;
}

/**
* Lists the user's profile.
* @param {google.auth.OAuth2} auth An authorized OAuth2 client.
*/
// Function to fetch user profile using Google OAuth2
async function user(accessToken) {
    // Create an OAuth2 client using the access token
    const oauth2Client = createOAuth2Client(accessToken);
    
    // Initialize the OAuth2 API client
    const oauth2 = google.oauth2({
        auth: oauth2Client,
        version: 'v2'
    });

    // Fetch user info using the OAuth2 client
    try {
        const response = await oauth2.userinfo.get();
        const profile = response.data;
        
        // Log or return the user profile information
        console.log('ID: ' + profile.id);
        console.log('Full Name: ' + profile.name);
        console.log('Given Name: ' + profile.given_name);
        console.log('Family Name: ' + profile.family_name);
        console.log('Image URL: ' + profile.picture);
        console.log('Email: ' + profile.email);
        
        return profile; // Return the profile data for further use
    } catch (error) {
        console.error('Error fetching user info:', error);
        throw error; // Propagate the error
    }
}


  module.exports = {
    scopes,
    email,
    events,
    tasks,
    user
  }