// VidIQ Request Capture Hook Configuration
export default {
    name: 'vidiq-capture',
    description: 'Capture api.vidiq.com requests per endpoint',
    enabled: true,
    
    // URL patterns to monitor - only api.vidiq.com
    urlPatterns: [
        'https://api.vidiq.com/*',
    ],
    
    // Capture rules - catch all api.vidiq.com requests/responses
    captureRules: {
        // Capture all HTTP methods
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
        
        // Capture all api.vidiq.com requests
        requestUrlPatterns: [
            'https://api.vidiq.com/*',
        ],
        
        // Capture all api.vidiq.com responses
        responseUrlPatterns: [
            'https://api.vidiq.com/*',
        ],
        
        // Capture all status codes
        statusCodes: [], // Empty = capture all
        
        // Control response capture (default: true)
        captureResponses: true, // Set to false to disable response recording
        
        // Capture response bodies
        captureResponseBody: true,
    },
    
    // Custom request capture logic - simple endpoint extraction
    async customRequestCapture(request, sessionId) {
        const url = request.url();
        const method = request.method();
        
        console.log(`🎯 VidIQ API: ${method} ${url}`);
        
        // Extract endpoint path from api.vidiq.com
        const endpoint = url.replace('https://api.vidiq.com/', '').split('?')[0];
        
        return {
            endpoint: endpoint,
            fullUrl: url
        };
    },
    
    // Custom response capture logic - simple endpoint extraction
    async customResponseCapture(response, sessionId) {
        const url = response.url();
        const status = response.status();
        
        console.log(`🎯 VidIQ API Response: ${status} ${url}`);
        
        // Extract endpoint path from api.vidiq.com
        const endpoint = url.replace('https://api.vidiq.com/', '').split('?')[0];
        
        return {
            endpoint: endpoint,
            status: status,
            fullUrl: url
        };
    },
    
};
