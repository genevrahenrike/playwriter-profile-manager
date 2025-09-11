import { EventEmitter } from 'events';

/**
 * ProfileEventBus - Central event system for coordinating between different automation systems
 * 
 * This allows different systems (autofill, automation, request capture, etc.) to communicate
 * through events rather than direct dependencies, creating cleaner separation of concerns.
 */
export class ProfileEventBus extends EventEmitter {
    constructor() {
        super();
        this.sessionListeners = new Map(); // Track listeners per session for cleanup
        this.eventHistory = new Map(); // Track event history per session for debugging
        
        console.log('📡 ProfileEventBus initialized');
    }

    /**
     * Emit an event for a specific session
     * @param {string} sessionId - Session ID
     * @param {string} eventName - Event name
     * @param {Object} eventData - Event data
     */
    emitSessionEvent(sessionId, eventName, eventData = {}) {
        const fullEventName = `${sessionId}:${eventName}`;
        const eventPayload = {
            sessionId,
            eventName,
            timestamp: new Date().toISOString(),
            ...eventData
        };
        
        // Store event in history for debugging
        if (!this.eventHistory.has(sessionId)) {
            this.eventHistory.set(sessionId, []);
        }
        this.eventHistory.get(sessionId).push(eventPayload);
        
        console.log(`📡 Event: ${eventName} (session: ${sessionId})`);
        
        // Emit both session-specific and global events
        this.emit(fullEventName, eventPayload);
        this.emit(eventName, eventPayload);
        
        return eventPayload;
    }

    /**
     * Subscribe to events for a specific session
     * @param {string} sessionId - Session ID
     * @param {string} eventName - Event name to listen for
     * @param {Function} handler - Event handler function
     * @returns {Function} Unsubscribe function
     */
    onSessionEvent(sessionId, eventName, handler) {
        const fullEventName = `${sessionId}:${eventName}`;
        
        // Track listener for cleanup
        if (!this.sessionListeners.has(sessionId)) {
            this.sessionListeners.set(sessionId, []);
        }
        this.sessionListeners.get(sessionId).push({ eventName: fullEventName, handler });
        
        this.on(fullEventName, handler);
        
        console.log(`📡 Subscribed to ${eventName} for session ${sessionId}`);
        
        // Return unsubscribe function
        return () => {
            this.off(fullEventName, handler);
            const listeners = this.sessionListeners.get(sessionId) || [];
            const index = listeners.findIndex(l => l.eventName === fullEventName && l.handler === handler);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }

    /**
     * Subscribe to global events (all sessions)
     * @param {string} eventName - Event name to listen for
     * @param {Function} handler - Event handler function
     * @returns {Function} Unsubscribe function
     */
    onGlobalEvent(eventName, handler) {
        this.on(eventName, handler);
        
        console.log(`📡 Subscribed to global ${eventName} events`);
        
        // Return unsubscribe function
        return () => {
            this.off(eventName, handler);
        };
    }

    /**
     * Clean up all listeners for a session
     * @param {string} sessionId - Session ID
     */
    cleanupSession(sessionId) {
        const listeners = this.sessionListeners.get(sessionId) || [];
        
        listeners.forEach(({ eventName, handler }) => {
            this.off(eventName, handler);
        });
        
        this.sessionListeners.delete(sessionId);
        this.eventHistory.delete(sessionId);
        
        console.log(`📡 Cleaned up ${listeners.length} event listeners for session ${sessionId}`);
    }

    /**
     * Get event history for a session
     * @param {string} sessionId - Session ID
     * @returns {Array} Event history
     */
    getSessionEventHistory(sessionId) {
        return this.eventHistory.get(sessionId) || [];
    }

    /**
     * Get status information
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            activeSessions: this.sessionListeners.size,
            totalListeners: Array.from(this.sessionListeners.values()).reduce((total, listeners) => total + listeners.length, 0),
            globalListeners: this.listenerCount(),
            eventHistory: Array.from(this.eventHistory.entries()).map(([sessionId, events]) => ({
                sessionId,
                eventCount: events.length
            }))
        };
    }
}

// Common event names - exported as constants for consistency
export const EVENTS = {
    // Autofill events
    AUTOFILL_STARTED: 'autofill:started',
    AUTOFILL_FIELD_FILLED: 'autofill:field_filled',
    AUTOFILL_COMPLETED: 'autofill:completed',
    AUTOFILL_FAILED: 'autofill:failed',
    AUTOFILL_STOPPED: 'autofill:stopped',
    
    // Automation events
    AUTOMATION_STARTED: 'automation:started',
    AUTOMATION_STEP_STARTED: 'automation:step_started',
    AUTOMATION_STEP_COMPLETED: 'automation:step_completed',
    AUTOMATION_STEP_FAILED: 'automation:step_failed',
    AUTOMATION_COMPLETED: 'automation:completed',
    AUTOMATION_FAILED: 'automation:failed',
    
    // Request capture events
    CAPTURE_REQUEST: 'capture:request',
    CAPTURE_RESPONSE: 'capture:response',
    CAPTURE_SUCCESS_DETECTED: 'capture:success_detected',
    
    // Browser events
    BROWSER_PAGE_LOADED: 'browser:page_loaded',
    BROWSER_NAVIGATION: 'browser:navigation',
    BROWSER_CLOSING: 'browser:closing',
    
    // Profile events
    PROFILE_LAUNCHED: 'profile:launched',
    PROFILE_CLOSED: 'profile:closed'
};