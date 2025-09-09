// Example: Request Capture Configuration Options
export default {
    name: 'example-capture',
    description: 'Example showing all capture configuration options',
    enabled: true,
    
    urlPatterns: [
        'https://api.example.com/*',
    ],
    
    captureRules: {
        // HTTP methods to capture
        methods: ['GET', 'POST'],
        
        // Request URL patterns
        requestUrlPatterns: [
            'https://api.example.com/*',
        ],
        
        // Response URL patterns  
        responseUrlPatterns: [
            'https://api.example.com/*',
        ],
        
        // Status codes to capture (empty = all)
        statusCodes: [200, 201, 400, 401, 403, 404, 500],
        
        // NEW: Control response capture (default: true)
        captureResponses: true, // Set to false to disable response recording
        
        // Control response body capture (default: true)
        captureResponseBody: true,
        
        // Optional: Filter by request headers
        requestHeaders: {
            'authorization': null, // Must have auth header
            'content-type': 'application/json' // Must contain this value
        },
        
        // Optional: Filter by response headers
        responseHeaders: {
            'content-type': 'application/json'
        }
    },
    
    async customRequestCapture(request, sessionId) {
        return {
            endpoint: request.url().replace('https://api.example.com/', ''),
            hasAuth: !!request.headers()['authorization']
        };
    },
    
    async customResponseCapture(response, sessionId) {
        return {
            endpoint: response.url().replace('https://api.example.com/', ''),
            status: response.status(),
            hasJsonResponse: response.headers()['content-type']?.includes('application/json')
        };
    }
};
