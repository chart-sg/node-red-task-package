/** Task Package Event Handler
 *  Shared EventEmitter for all task package nodes
 *  Inspired by @totallyinformation/node-red-contrib-events
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

const EventEmitter = require('events')

/** Shared event emitter instance for all task package nodes */
class TaskPackageEvents extends EventEmitter {
    constructor() {
        super()
        
        // Set max listeners to handle multiple nodes
        this.setMaxListeners(100)
        
        // Debug flag
        this.debug = false
        
        if (this.debug) {
            console.log('📦 Task Package Event Handler initialized')
        }
    }
    
    /** 
     * Create a namespaced event name 
     * @param {string} topic - The event topic
     * @returns {string} Namespaced event name
     */
    createEventName(topic) {
        return `task-package/${topic}`
    }
    
    /** 
     * Emit a create event for a task package
     * @param {string} tp_id - Task package ID
     * @param {object} payload - Event payload
     */
    emitCreate(tp_id, payload) {
        const eventName = this.createEventName(`create/${tp_id}`)
        if (this.debug) {
            console.log(`📤 Emitting create event: ${eventName}`)
        }
        this.emit(eventName, payload)
    }
    
    /** 
     * Emit a cancel event for a task package instance
     * @param {string} tpc_id - Task package created ID (UUID)
     * @param {object} payload - Event payload
     */
    emitCancel(tpc_id, payload) {
        const eventName = this.createEventName(`cancel/${tpc_id}`)
        if (this.debug) {
            console.log(`📤 Emitting cancel event: ${eventName}`)
        }
        this.emit(eventName, payload)
    }
    
    /** 
     * Emit a complete event for a task package instance
     * @param {string} tpc_id - Task package created ID (UUID)
     * @param {object} payload - Event payload
     */
    emitComplete(tpc_id, payload) {
        const eventName = this.createEventName(`complete/${tpc_id}`)
        if (this.debug) {
            console.log(`📤 Emitting complete event: ${eventName}`)
        }
        this.emit(eventName, payload)
    }
    
    /** 
     * Listen for create events
     * @param {string} tp_id - Task package ID to listen for
     * @param {function} callback - Event handler function
     * @returns {string} Event name for cleanup
     */
    onCreate(tp_id, callback) {
        const eventName = this.createEventName(`create/${tp_id}`)
        if (this.debug) {
            console.log(`📥 Listening for create event: ${eventName}`)
        }
        this.on(eventName, callback)
        return eventName
    }
    
    /** 
     * Listen for cancel events
     * @param {string} tpc_id - Task package created ID to listen for
     * @param {function} callback - Event handler function
     * @returns {string} Event name for cleanup
     */
    onCancel(tpc_id, callback) {
        const eventName = this.createEventName(`cancel/${tpc_id}`)
        if (this.debug) {
            console.log(`📥 Listening for cancel event: ${eventName}`)
        }
        this.on(eventName, callback)
        return eventName
    }
    
    /** 
     * Listen for complete events
     * @param {string} tpc_id - Task package created ID to listen for
     * @param {function} callback - Event handler function
     * @returns {string} Event name for cleanup
     */
    onComplete(tpc_id, callback) {
        const eventName = this.createEventName(`complete/${tpc_id}`)
        if (this.debug) {
            console.log(`📥 Listening for complete event: ${eventName}`)
        }
        this.on(eventName, callback)
        return eventName
    }
    
    /** 
     * Remove specific event listener
     * @param {string} eventName - Event name to remove
     * @param {function} callback - Callback to remove
     */
    removeEventListener(eventName, callback) {
        if (this.debug) {
            console.log(`🗑️  Removing listener for: ${eventName}`)
        }
        this.removeListener(eventName, callback)
    }
    
    /** 
     * Remove all listeners for an event
     * @param {string} eventName - Event name to clean up
     */
    removeAllEventListeners(eventName) {
        if (this.debug) {
            console.log(`🗑️  Removing all listeners for: ${eventName}`)
        }
        this.removeAllListeners(eventName)
    }
    
    /** 
     * Get current listener count for debugging
     * @param {string} eventName - Event name to check
     * @returns {number} Number of listeners
     */
    getListenerCount(eventName) {
        return this.listenerCount(eventName)
    }
    
    /** 
     * Enable debug mode
     */
    enableDebug() {
        this.debug = true
        console.log('🐛 Task Package Events debug mode enabled')
    }
    
    /** 
     * Disable debug mode
     */
    disableDebug() {
        this.debug = false
    }
}

// Export singleton instance
module.exports = new TaskPackageEvents()
