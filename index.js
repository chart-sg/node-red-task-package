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
        console.warn("No nodes directory found. No task package nodes will be loaded.");
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
                    console.log(`Loaded task package node: ${nodeName}`);
                } else {
                    console.warn(`${nodeFile} does not export a function`);
                }
            } catch (error) {
                console.error(`Error loading node from ${nodeFile}:`, error.message);
            }
        });
        
        console.log(`Task Package: Loaded ${nodeFiles.length} nodes`);
        
    } catch (error) {
        console.error("Error loading task package nodes:", error.message);
    }
}