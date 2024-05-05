//This class manages the Postgres SQL database on the server

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: +process.env.DB_PORT,
});

/**
 * Takes a successfully created user from authenticate.js, then adds this user to the database,
 * preceeding functions aid in accessing user data after the user has been created
 * @param {*} token 
 * @returns index and id of user
 */

async function createUser(token, email){
    const setQueryString = 'INSERT INTO users (token, email) VALUES ($1, $2) RETURNING index, id;';
    const variables = [encrypt(token), email];

    try{
      const res = await pool.query(setQueryString, variables);
      console.log('New User Added:', variables[1], res.rows);
      return res.rows[0];
    }catch (err){
      console.error('Failed to Create User:', variables[1], variables[0], err);
    }

    const getQueryString = 'SELECT index, id FROM users WHERE email = $1;';

    try {
      console.log('Attempting to find user');
      const res = await pool.query(getQueryString, [email]);
      console.log('worked', res);
      if (res.rows.length > 0) {
        console.log('User found:', variables[1]);
        return res.rows[0];  // Returning the user object containing index and id
      } else {
        console.log('No user found:', variables[1], variables[0]);
        return null;  // No user found
      }
    } catch (err) {
      console.error('Error in fetching user:', err);
      return null;
    }
}

async function deleteUser(index){
    const queryString = 'DELETE FROM users WHERE index = $1;';
    const variables = [index];

    try{
      await pool.query(queryString, variables);
      console.log('Deleted User:', index);
    }catch (err){
      console.error('Failed to Delete User:', index);
    }

}

async function setUserSettings(index, settings){
  const client = await pool.connect(); // Acquire a client from the pool
  try {
    await client.query('BEGIN'); // Start the transaction

    const insertPromises = settings.map(setting => {
      //Change to user settings as a json file
      //const query = 'INSERT INTO settings(setting_value) VALUES($1) RETURNING *;';
      return client.query(query, [setting]); // Execute all inserts with the same client
    });

    const results = await Promise.all(insertPromises);
    await client.query('COMMIT'); // Commit the transaction

    //Success
    //res.status(201).json(results.map(r => r.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK'); // Roll back the transaction on error
    console.error('Transaction error:', error);

    //Error
    //res.status(500).send('Failed to save settings due to an error');
  } finally {
    client.release(); // Release the client back to the pool
  }
}

/**
 * 
 * @param {*} index - Users index
 * @param {*} data - Array of strings that define desired data ex: ['id', 'token']
 * @returns 
 */

async function getUserData(index, data) {
  // Join the data array into a string to use in the SQL query
  const columns = data.join(', ');

  console.log('Columns', columns);

  try {
    const query = `SELECT ${columns} FROM users WHERE index = $1;`;
    const values = [index];
    const res = await pool.query(query, values);

    if (res.rows.length > 0) {
      return res.rows[0];  // Return the first row found
    } else {
      return null;  // No user found with the given index
    }
  } catch (err) {
    console.error('Error retrieving user data:', err);
    throw err;  // Rethrow or handle error as needed
  }
}

/**
 * Function should only be used by users to retrieve the index store in cache
 * @param {*} id 
 * @returns 
 */

async function getUserIndex(id){
  const query = 'SELECT index FROM users WHERE id = $1;';
  const values = [id];

  console.log('Searching Database for id:', id);
  
  const res = await pool.query(query, values);

  if (res.rows.length === 0) {
    throw new Error('Cannot find user');
  }

  return res.rows[0].index;
}

/**
 * Used to shut down database
 */
async function closePool(){
    pool.end();
}

function encrypt(value){
  encryptedValue = value;
  return encryptedValue;
}

function decrypt(encryptedValue){
  value = encryptedValue;
  return value;
}

module.exports = {
    createUser,
    getUserData,
    getUserIndex,
    closePool,
    deleteUser
}