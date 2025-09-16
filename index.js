/** Task Package Module Entry Point
 *  Dynamic loader for all task package nodes
 *  Following TotallyInformation patterns
 * 
 * Copyright (c) 2025 CHART
 * Licensed under the ISC License
 */
'use strict'

const fs = require("fs");
const path = require("path");

module.exports = function(RED) {
    const nodesDir = path.join(__dirname, "nodes");
    
    // Check if nodes directory exists
    if (!fs.existsSync(nodesDir)) {
        console.warn("⚠️  No nodes directory found. No task package nodes will be loaded.");
        return;
    }
    
    try {
        // Get all .js files in nodes directory
        const nodeFiles = fs.readdirSync(nodesDir)
            .filter(file => file.endsWith('.js'))
            .map(file => path.join(nodesDir, file));
        
        // Load each node module
        nodeFiles.forEach(nodeFile => {
            try {
                const nodeModule = require(nodeFile);
                if (typeof nodeModule === 'function') {
                    nodeModule(RED);
                    const nodeName = path.basename(nodeFile, '.js');
                    console.log(`✅ Loaded task package node: ${nodeName}`);
                } else {
                    console.warn(`⚠️  ${nodeFile} does not export a function`);
                }
            } catch (error) {
                console.error(`❌ Error loading node from ${nodeFile}:`, error.message);
            }
        });
        
        console.log(`📦 Task Package: Loaded ${nodeFiles.length} nodes`);
        
        // Initialize API routes when Node-RED starts
        RED.events.on('runtime-event', (event) => {
            if (event.id === 'runtime-state' && event.payload.state === 'start') {
                // Add API routes to Node-RED's existing Express server
                setTimeout(() => {
                    try {
                        const taskPackageAPI = require('./lib/task-package-api');
                        
                        // Get configuration from first tp-config node found
                        const configNodes = [];
                        RED.nodes.eachNode((node) => {
                            if (node.type === 'tp-config') {
                                configNodes.push(node);
                            }
                        });
                        
                        if (configNodes.length > 0) {
                            const config = configNodes[0];
                            taskPackageAPI.init(config);
                            
                            // Add routes to Node-RED's Express app
                            taskPackageAPI.addRoutes(RED.httpNode || RED.httpAdmin);
                            console.log(`🌐 Task Package API routes added to Node-RED server`);
                            console.log(`📡 API available at http://localhost:1880/task-package/*`);
                        } else {
                            console.warn('⚠️  No tp-config node found. API routes not added.');
                        }
                    } catch (error) {
                        console.error('❌ Error initializing Task Package API:', error.message);
                    }
                }, 2000); // Wait 2 seconds for Node-RED to fully initialize
            }
        });
        
    } catch (error) {
        console.error("❌ Error loading task package nodes:", error.message);
    }
}