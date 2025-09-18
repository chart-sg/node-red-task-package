/** Task Package Delay Node
 *  Cancellable delay with dual outputs
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

//#region ----- Module level variables ---- //

/** Main module variables */
const mod = {
    /** @type {RED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Custom Node Name - must match HTML file and package.json */
    nodeName: 'tp-delay',
    /** @type {boolean} Turn on/off debugging */
    debug: false,
}

//#endregion

//#region ----- Module-level support functions ----- //

function inputMsgHandler(msg, send, done) {
    const node = this
    
    try {
        if (!msg.tp_data) {
            node.error('No tp_data found in message', msg)
            done()
            return
        }
        
        const flow = node.context().flow
        const delayMs = node.delay_time || 5000
        const tpc_id = msg.tp_data.tpc_id
        
        if (!tpc_id) {
            node.error('No task instance ID found in tp_data', msg)
            done()
            return
        }
        
        node.status({fill: 'yellow', shape: 'dot', text: `Delaying ${delayMs}ms - ${tpc_id.substr(0, 8)}...`})
        
        // Function to check if this specific task was cancelled
        const isTaskCancelled = () => {
            const active_tasks = flow.get('active_tasks') || []
            const task = active_tasks.find(t => t.tpc_id === tpc_id)
            
            // Check both new format and legacy format for backward compatibility
            if (task && task.cancelled) return true
            if (flow.get('current_tpc_id') === tpc_id && flow.get('task_cancelled')) return true
            
            return false
        }
        
        // Start delay timer
        const timer = setTimeout(() => {
            // Final check if cancelled during delay
            if (isTaskCancelled()) {
                // Output 2: Cancellation
                node.status({fill: 'orange', shape: 'dot', text: 'Cancelled during delay'})
                send([null, {...msg, topic: 'delay-cancelled'}])
            } else {
                // Output 1: Normal completion
                node.status({fill: 'green', shape: 'dot', text: 'Delay completed'})
                send([msg, null])
            }
            
            done()
        }, delayMs)
        
        // Store timer for potential cancellation
        node._delayTimer = timer
        
        // Check for cancellation periodically
        const cancelCheck = setInterval(() => {
            if (isTaskCancelled()) {
                clearTimeout(timer)
                clearInterval(cancelCheck)
                
                node.status({fill: 'orange', shape: 'dot', text: 'Cancelled'})
                send([null, {...msg, topic: 'delay-cancelled'}])
                done()
            }
        }, 100)
        
        node._cancelCheck = cancelCheck
        
    } catch (error) {
        node.error(`Error in delay: ${error.message}`, msg)
        done(error)
    }
}

function nodeInstance(config) {
    const RED = mod.RED
    RED.nodes.createNode(this, config) 
    
    this.name = config.name || 'tp-delay'
    this.delay_time = parseInt(config.delay_time) || 5000
    
    /** Helper function to find the first available tp-config node */
    this.findTpConfigNode = function() {
        const configNodes = RED.nodes.getType('tp-config')
        return configNodes.length > 0 ? configNodes[0] : null
    }
    
    // Auto-find tp-config node if not explicitly set
    this.config_node = RED.nodes.getNode(config.config_node) || this.findTpConfigNode()
    
    if (!this.config_node) {
        this.warn('No tp-config node found. Please add a tp-config node to your workspace.')
    }
    
    this.status({fill: 'blue', shape: 'ring', text: `Ready (${this.delay_time}ms)`})
    this.on('input', inputMsgHandler)
    
    this.on('close', (removed, done) => {
        if (this._delayTimer) clearTimeout(this._delayTimer)
        if (this._cancelCheck) clearInterval(this._cancelCheck)
        done()
    })
}

//#endregion

function TpDelay(RED) {
    mod.RED = RED
    RED.nodes.registerType(mod.nodeName, nodeInstance)
}

module.exports = function(RED) {
    TpDelay(RED)
}
