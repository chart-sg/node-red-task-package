/** Task Package Node Utilities
 *  Shared utilities for business logic tp-nodes
 *  Copyright (c) 2025 CHART
 *  Licensed under the ISC License
 */
'use strict'

/**
 * Check if a message is part of a cleanup/cancellation flow
 * This should only apply to messages that are ROUTED TO cleanup flows,
 * not the original cancellation events themselves
 * @param {object} msg - The message object
 * @returns {boolean} True if this is a cleanup flow
 */
function isCleanupFlow(msg) {
    // Explicitly marked as cleanup
    if (msg._tpCleanup || msg._tpCleanupReason) {
        return true;
    }
    
    // Messages from tp-cancel output (for cleanup flows)
    if (msg._tpOriginator && msg.tp_data?.mode === 'cancel') {
        return true;
    }
    
    // Messages that have been routed through cancel outputs
    if (msg.topic && msg.topic.includes('delay-cancelled')) {
        return true;
    }
    
    return false;
}

/**
 * Check if a specific task is cancelled (for business logic nodes)
 * Cleanup flows are never considered cancelled to allow proper cleanup execution
 * @param {object} flow - Flow context
 * @param {string} tpc_id - Task instance ID
 * @param {object} msg - Message object (to check if cleanup flow)
 * @returns {boolean} True if task is cancelled and this is NOT a cleanup flow
 */
function isTaskCancelled(flow, tpc_id, msg) {
    // If this is a cleanup flow, never consider it cancelled
    if (isCleanupFlow(msg)) {
        return false;
    }
    
    // Check task-specific cancellation in active_tasks array
    const active_tasks = flow.get('active_tasks') || [];
    const task = active_tasks.find(t => t.tpc_id === tpc_id);
    
    return task && task.cancelled;
}

/**
 * Mark a message as part of a cleanup flow
 * @param {object} msg - Message to mark
 * @param {string} reason - Reason for cleanup (optional)
 * @returns {object} Modified message
 */
function markAsCleanup(msg, reason = 'cancelled') {
    return {
        ...msg,
        _tpCleanup: true,
        _tpCleanupReason: reason,
        topic: msg.topic || `cleanup-${reason}`
    };
}

/**
 * Generic cancellation-aware node handler for business logic nodes
 * @param {object} node - Node instance
 * @param {object} msg - Input message
 * @param {function} businessLogic - Function to execute business logic
 * @param {function} send - Send function
 * @param {function} done - Done function
 * @param {object} options - Options object
 * @param {boolean} options.supportsCancellation - Whether this node supports cancellation (default: true)
 * @param {string} options.nodeType - Type of node for status messages
 */
function handleCancellableNode(node, msg, businessLogic, send, done, options = {}) {
    const {
        supportsCancellation = true,
        nodeType = 'processing'
    } = options;

    try {
        if (!msg.tp_data) {
            node.error('No tp_data found in message', msg);
            done();
            return;
        }

        const flow = node.context().flow;
        const tpc_id = msg.tp_data.tpc_id;
        
        if (!tpc_id) {
            node.error('No task instance ID found in tp_data', msg);
            done();
            return;
        }

        // Check if this is a cleanup flow
        const isCleanup = isCleanupFlow(msg);
        const statusPrefix = isCleanup ? '[CLEANUP] ' : '';

        // Check for cancellation before processing (if supported and not cleanup)
        if (supportsCancellation && isTaskCancelled(flow, tpc_id, msg)) {
            node.status({fill: 'orange', shape: 'dot', text: `${statusPrefix}Cancelled`});
            send([null, markAsCleanup(msg, 'cancelled')]);
            done();
            return;
        }

        // Update status to show processing
        node.status({fill: 'yellow', shape: 'dot', text: `${statusPrefix}${nodeType} - ${tpc_id.substr(0, 8)}...`});

        // Execute business logic
        businessLogic(msg, (result) => {
            if (result.cancelled) {
                // Business logic detected cancellation
                node.status({fill: 'orange', shape: 'dot', text: `${statusPrefix}Cancelled during ${nodeType}`});
                send([null, markAsCleanup(msg, 'cancelled')]);
            } else if (result.error) {
                // Business logic had an error
                node.status({fill: 'red', shape: 'dot', text: `${statusPrefix}Error`});
                node.error(result.error, msg);
                send([null, markAsCleanup(msg, 'error')]);
            } else {
                // Normal completion
                const statusText = isCleanup ? `[CLEANUP] ${nodeType} completed` : `${nodeType} completed`;
                node.status({fill: 'green', shape: 'dot', text: statusText});
                send([result.msg || msg, null]);
            }
            done();
        });

    } catch (error) {
        node.error(`Error in ${nodeType}: ${error.message}`, msg);
        done(error);
    }
}

module.exports = {
    isCleanupFlow,
    isTaskCancelled,
    markAsCleanup,
    handleCancellableNode
};