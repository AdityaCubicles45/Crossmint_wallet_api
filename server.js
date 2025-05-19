const express = require('express');
const serverless = require('serverless-http');
const { handler } = require('./api');

const app = express();
app.use(express.json());

// Convert serverless handler to Express middleware
app.use(async (req, res) => {
    // Convert Express request to serverless event
    const event = {
        httpMethod: req.method,
        path: req.path,
        headers: req.headers,
        queryStringParameters: req.query,
        body: JSON.stringify(req.body),
        pathParameters: req.params
    };

    try {
        // Call the serverless handler
        const result = await handler(event);
        
        // Set response headers
        Object.entries(result.headers || {}).forEach(([key, value]) => {
            res.set(key, value);
        });

        // Send response
        res.status(result.statusCode).send(result.body);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error'
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 