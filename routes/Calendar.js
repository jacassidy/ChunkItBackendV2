const express = require("express");
const router = express.Router();
const cache = require('../data/Cache');

router.get('/', async (req, res) => {

    const data = req.query.data; // Access 'data' query parameter

    if (!data) {
        res.status(400).send('No data specified');
        return;
    }

    try {
        const userData = await cache.getUserGoogleData(req.cookies.accessKey, data);
        console.log(userData);
        res.json(userData);
    } catch (error) {
        console.log('Failed to retrieve user google data:', error);
        res.status(500).send('Failed to retrieve user google data');
    }
});


module.exports = router;