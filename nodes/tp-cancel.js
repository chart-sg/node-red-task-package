/** Task Package Cancel Node
 *  Handles task package cancellation with no input required
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

/** --- Type Definitions --- */
// @typedef {import('node-red')} RED

//#region ----- Module level variables ---- //

const tpEvents = require('../lib/task-package-events')

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-cancel',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

/** 
 * Handle incoming cancel events for this task package instance
 * @param {object} payload - The event payload from API layer
 * @param {string} tpc_id - The specific task instance being cancelled
 */
function handleCancelEvent(payload, tpc_id) {
    // `this` context is the node instance
    const node = this
    
    try {
        const flow = node.context().flow
        
        // Find the specific task in active tasks array
        const active_tasks = flow.get('active_tasks') || []
        const task_index = active_tasks.findIndex(task => task.tpc_id === tpc_id)
        
        if (task_index === -1) {
            if (mod.debug) {
                node.log(`Task ${tpc_id} not found in this flow's active tasks`)
            }
            return
        }
        
        const task = active_tasks[task_index]
        
        // Check if this task matches our configured tp_id
        if (node.tp_id && task.tp_id !== node.tp_id) {
            if (mod.debug) {
                node.log(`Task ${tpc_id} has tp_id ${task.tp_id}, but this node is configured for ${node.tp_id}`)
            }
            return
        }
        
        // Set cancellation flag for this specific task
        task.cancelled = true
        task.cancelled_at = new Date().toISOString()
        
        // Update active tasks array
        active_tasks[task_index] = task
        flow.set('active_tasks', active_tasks)
        
        // For backward compatibility, also set legacy flow context if this is the current task
        if (flow.get('current_tpc_id') === tpc_id) {
            flow.set('task_cancelled', true)
        }
        
        // Create output message for cancellation flow
        const msg = {
            tp_data: {
                tpc_id: tpc_id,
                tp_id: task.tp_id,
                tp_name: task.tp_name,
                mode: 'cancel',
                cancelled_at: task.cancelled_at
            },
            payload: payload.payload || {},
            topic: `task-package/${tpc_id}/cancelled`,
            _tpOriginator: node.id
        }
        
        // Set node status
        node.status({fill: 'red', shape: 'dot', text: `Cancelled: ${tpc_id.substr(0, 8)}...`})
        
        // Send message to cancellation flow
        node.send(msg)
        
        if (mod.debug) {
            node.log(`Cancelled task package instance: ${tpc_id}`)
        }
        
    } catch (error) {
        node.error(`Error handling cancel event: ${error.message}`, payload)
        node.status({fill: 'red', shape: 'ring', text: 'Error'})
    }
}

/** 
 * Set up cancel event listeners for tasks matching our tp_id
 */
function setupCancelListeners() {
    const node = this
    const flow = node.context().flow
    
    // Track which tasks we're already listening to
    node._active_listeners = node._active_listeners || new Set()
    
    // Check for new tasks periodically
    const checkInterval = setInterval(() => {
        const active_tasks = flow.get('active_tasks') || []
        
        // Filter tasks by our configured tp_id (if specified)
        const relevantTasks = node.tp_id ? 
            active_tasks.filter(task => task.tp_id === node.tp_id) : 
            active_tasks
        
        // Start listening to new relevant tasks
        relevantTasks.forEach(task => {
            if (!node._active_listeners.has(task.tpc_id) && !task.cancelled) {
                // Start listening for cancel events for this specific task instance
                const cancelEventHandler = (payload) => handleCancelEvent.call(node, payload, task.tpc_id)
                const eventName = tpEvents.onCancel(task.tpc_id, cancelEventHandler)
                
                // Store for cleanup
                if (!node._event_handlers) node._event_handlers = new Map()
                node._event_handlers.set(task.tpc_id, {
                    eventName: eventName,
                    handler: cancelEventHandler
                })
                
                node._active_listeners.add(task.tpc_id)
                
                if (mod.debug) {
                    node.log(`Now listening for cancel events: ${task.tpc_id} (tp_id: ${task.tp_id})`)
                }
            }
        })
        
        // Clean up listeners for completed/cancelled tasks
        const active_tpc_ids = new Set(relevantTasks.map(t => t.tpc_id))
        for (const tpc_id of node._active_listeners) {
            if (!active_tpc_ids.has(tpc_id)) {
                const handler_info = node._event_handlers.get(tpc_id)
                if (handler_info) {
                    tpEvents.off(handler_info.eventName, handler_info.handler)
                    node._event_handlers.delete(tpc_id)
                }
                node._active_listeners.delete(tpc_id)
                
                if (mod.debug) {
                    node.log(`Stopped listening for: ${tpc_id}`)
                }
            }
        }
        
        // Update status to show which tp_id we're monitoring
        const monitoring_count = node._active_listeners.size
        if (monitoring_count > 0) {
            const statusText = node.tp_id ? 
                `Monitoring ${monitoring_count} ${node.tp_id} task(s)` :
                `Monitoring ${monitoring_count} task(s)`
            node.status({fill: 'yellow', shape: 'ring', text: statusText})
        } else {
            const statusText = node.tp_id ? 
                `Waiting for ${node.tp_id} tasks` :
                'No active tasks'
            node.status({fill: 'grey', shape: 'ring', text: statusText})
        }
        
    }, 1000) // Check every second
    
    // Store interval for cleanup
    node._checkInterval = checkInterval
}

/** 
 * Run when an actual instance of our node is committed to a flow
 * @param {object} config The Node-RED config object
 */
function nodeInstance(config) {
    // As a module-level named function, it will inherit `mod` and other module-level variables
    
    // If you need it - which you will here - or just use mod.RED if you prefer:
    const RED = mod.RED

    // Create the node instance - `this` can only be referenced AFTER here
    RED.nodes.createNode(this, config) 

    // Transfer config items from the Editor panel to the runtime
    this.name = config.name || 'tp-cancel'
    this.tp_id = config.tp_id  // Task package ID to monitor
    
    /** Helper function to find the first available tp-config node */
    this.findTpConfigNode = function() {
        let configNode = null
        RED.nodes.eachNode((node) => {
            if (node.type === 'tp-config' && !configNode) {
                configNode = RED.nodes.getNode(node.id)
            }
        })
        return configNode
    }
    
    // Auto-find tp-config node if not explicitly set
    this.config_node = RED.nodes.getNode(config.config_node) || this.findTpConfigNode()
    
    if (!this.config_node) {
        this.warn('No tp-config node found. Please add a tp-config node to your workspace.')
    }
    
    if (!this.tp_id) {
        this.warn('No task package ID configured - will monitor all tasks')
    }
    
    // Set initial status based on configuration
    const initialText = this.tp_id ? 
        `Waiting for ${this.tp_id} tasks` : 
        'Waiting for tasks'
    this.status({fill: 'blue', shape: 'ring', text: initialText})
    
    // Initialize tracking variables
    this._active_listeners = new Set()
    this._event_handlers = new Map()
    this._checkInterval = null
    
    // Start monitoring for tasks to cancel
    setupCancelListeners.call(this)
    
    if (mod.debug) {
        this.log('tp-cancel node initialized')
    }

    /** Clean up on node removal/shutdown */
    this.on('close', (removed, done) => {
        // Clean up interval
        if (this._checkInterval) {
            clearInterval(this._checkInterval)
        }
        
        // Remove all event listeners
        if (this._event_handlers) {
            for (const [tpc_id, handler_info] of this._event_handlers) {
                tpEvents.off(handler_info.eventName, handler_info.handler)
            }
            this._event_handlers.clear()
        }
        
        if (this._active_listeners) {
            this._active_listeners.clear()
        }
        
        if (mod.debug) {
            this.log('tp-cancel node closing')
        }
        
        done()
    })
}

//#endregion

/** 
 * Complete module definition for our Node. This is where things actually start.
 * @param {RED} RED The Node-RED runtime object
 */
function TpCancel(RED) {
    // Save a reference to the RED runtime for convenience
    mod.RED = RED
    
    // Register the node type
    RED.nodes.registerType(mod.nodeName, nodeInstance)
    
    if (mod.debug) {
        RED.log.info(`✅ Registered node: ${mod.nodeName}`)
    }
}

// Export the module definition, this is consumed by Node-RED on startup.
module.exports = function(RED) {
    TpCancel(RED)
}
