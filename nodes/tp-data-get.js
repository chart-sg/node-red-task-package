/**
 * Task Package Data Get Node
 * Retrieves task data from global context storage
 */

module.exports = function(RED) {
    'use strict'

    function TpDataGetNode(config) {
        RED.nodes.createNode(this, config)
        
        this.name = config.name || 'tp-data-get'
        this.key_field = config.key_field || 'tp_data.tpc_id' // Field to use as lookup key
        this.output_field = config.output_field || 'stored_data' // Where to put retrieved data
        this.fail_on_missing = config.fail_on_missing !== false // Default true
        this.cleanup_on_get = config.cleanup_on_get || false // Default false
        
        // Set initial status
        this.status({fill: 'blue', shape: 'ring', text: 'Ready'})
        
        // Handle incoming messages
        this.on('input', (msg) => {
            try {
                // Extract lookup key from message
                const keyPath = this.key_field.split('.')
                let lookupKey = msg
                
                for (const path of keyPath) {
                    if (lookupKey && typeof lookupKey === 'object' && lookupKey[path]) {
                        lookupKey = lookupKey[path]
                    } else {
                        if (this.fail_on_missing) {
                            this.warn(`Lookup key not found at path: ${this.key_field}`)
                            this.status({fill: 'yellow', shape: 'ring', text: 'Key not found'})
                            return
                        } else {
                            // Send message with empty stored_data
                            this.setOutputField(msg, null)
                            this.status({fill: 'grey', shape: 'ring', text: 'Key not found (ignored)'})
                            this.send(msg)
                            return
                        }
                    }
                }
                
                if (!lookupKey || typeof lookupKey !== 'string') {
                    if (this.fail_on_missing) {
                        this.warn('Invalid lookup key - must be a non-empty string')
                        this.status({fill: 'red', shape: 'ring', text: 'Invalid key'})
                        return
                    } else {
                        this.setOutputField(msg, null)
                        this.status({fill: 'grey', shape: 'ring', text: 'Invalid key (ignored)'})
                        this.send(msg)
                        return
                    }
                }
                
                // Get storage
                const storage = RED.settings.functionGlobalContext.tp_data_storage || {}
                const entry = storage[lookupKey]
                
                // Check if entry exists
                if (!entry) {
                    if (this.fail_on_missing) {
                        this.warn(`No data found for key: ${lookupKey}`)
                        this.status({fill: 'yellow', shape: 'ring', text: 'Not found'})
                        return
                    } else {
                        this.setOutputField(msg, null)
                        this.status({fill: 'grey', shape: 'ring', text: 'Not found (ignored)'})
                        this.send(msg)
                        return
                    }
                }
                
                // Check if entry has expired
                const now = Date.now()
                if (entry.expires_at && entry.expires_at < now) {
                    // Remove expired entry
                    delete storage[lookupKey]
                    RED.settings.functionGlobalContext.tp_data_storage = storage
                    
                    if (this.fail_on_missing) {
                        this.warn(`Data for key ${lookupKey} has expired`)
                        this.status({fill: 'yellow', shape: 'ring', text: 'Expired'})
                        return
                    } else {
                        this.setOutputField(msg, null)
                        this.status({fill: 'grey', shape: 'ring', text: 'Expired (ignored)'})
                        this.send(msg)
                        return
                    }
                }
                
                // Retrieve the data
                const retrievedData = {
                    data: entry.data,
                    metadata: entry.metadata,
                    stored_at: entry.stored_at,
                    retrieved_at: now
                }
                
                // Add to message
                this.setOutputField(msg, retrievedData)
                
                // Cleanup if requested
                if (this.cleanup_on_get) {
                    delete storage[lookupKey]
                    RED.settings.functionGlobalContext.tp_data_storage = storage
                    this.status({fill: 'green', shape: 'dot', text: `Retrieved & deleted ${lookupKey}`})
                } else {
                    this.status({fill: 'green', shape: 'dot', text: `Retrieved ${lookupKey}`})
                }
                
                // Send enhanced message
                this.send(msg)
                
            } catch (error) {
                this.error(`Error retrieving data: ${error.message}`, msg)
                this.status({fill: 'red', shape: 'ring', text: 'Error'})
            }
        })
        
        // Helper to set output field using dot notation
        this.setOutputField = function(msg, value) {
            const fieldPath = this.output_field.split('.')
            let current = msg
            
            // Navigate to parent object
            for (let i = 0; i < fieldPath.length - 1; i++) {
                const field = fieldPath[i]
                if (!current[field] || typeof current[field] !== 'object') {
                    current[field] = {}
                }
                current = current[field]
            }
            
            // Set the final field
            current[fieldPath[fieldPath.length - 1]] = value
        }
    }

    RED.nodes.registerType('tp-data-get', TpDataGetNode)
}
