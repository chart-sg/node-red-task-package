# Event-Driven Tasks (EDT) Design Document

## Overview

The **Event-Driven Tasks (EDT)** module extends the node-red-task-package system to handle real-time sensor data streams and automatically manage Task Package (TP) lifecycles based on dynamic conditions. EDT provides simple building blocks that users combine to create sophisticated automation workflows, following the Task Package philosophy of **flexibility over complexity**.

**Core Philosophy**:
- **🧩 Simple Building Blocks**: Minimal nodes that users combine creatively
- **🔀 User-Defined Logic**: Business logic stays in Function nodes and Switch nodes
- **📡 Event Memory**: Track state changes over time for intelligent responses
- **🎛️ Dynamic Control**: Runtime enable/disable via API for operational flexibility

**Key Features**:
- **State Change Detection**: Track what changes over time for any monitored entity
- **Smart Event Filtering**: Block polling duplicates and insignificant events
- **Dynamic On/Off Control**: Runtime API to enable/disable monitoring per entity
- **Reuse Existing TP Nodes**: Leverage create-tp/cancel-tp for actions
- **Cross-Flow Integration**: Works seamlessly with existing TP data patterns

## Architecture

### Design Philosophy Alignment with Task Package

**Task Package Strengths to Mirror**:
- **🧩 Minimal Core Nodes**: TP provides `tp-start`, `tp-end`, `tp-cancel`, `tp-delay` - users build complexity
- **🔀 User-Defined Logic**: Heavy use of Function nodes, Switch nodes, and standard Node-RED components  
- **📡 Event-Driven Messaging**: Simple message passing with standardized message structures
- **🔧 Flexible Configuration**: Users decide workflow patterns and business logic
- **🎨 Visual Flow Design**: Complex logic emerges from simple node connections

### System Integration

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Sensor        │    │   EDT Layer     │    │  Task Package   │
│   Streams       │────│   (3 Nodes)     │────│   (Existing)    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              │
                       ┌─────────────────┐
                       │   User Logic    │
                       │   (Function +   │
                       │    Switch)      │
                       └─────────────────┘
```

**EDT Responsibility**: Event processing and state management  
**User Responsibility**: Business logic, priority decisions, and TP control  
**Existing TP Nodes**: Action execution (create-tp, cancel-tp, tp-data-get/set)

## Core EDT Nodes (3 Nodes Only)

### Node 1: `edt-state` - Memory & Change Detection
**Purpose**: Tracks changes over time for any monitored entity (beds, robots, rooms, etc.)

#### What it does:
- **Remembers** previous state for each entity
- **Detects** when something actually changes
- **Provides** change analysis for user logic

#### Configuration:
```javascript
{
  "entity_key": "msg.bed_id",        // What to track (flexible field)
  "tracked_fields": "auto",          // Track all fields OR specify which ones
  "storage_scope": "global",         // Where to store state
  "ttl_minutes": 60                  // How long to keep history
}
```

#### Example:
```javascript
// Input: Current sensor reading
{ bed_id: "room101", event: "sit_up", timestamp: "10:30:15" }

// Output: Original data + change analysis
{
  bed_id: "room101", 
  event: "sit_up", 
  timestamp: "10:30:15",
  edt_state: {
    entity_key: "room101",
    current: { event: "sit_up", timestamp: "10:30:15" },
    previous: { event: "normal", timestamp: "10:30:01" },
    changed: true,                   // ← KEY: Something changed!
    changed_fields: ["event"],
    duration_since_change: 0
  }
}
```

---

### Node 2: `edt-filter` - Quality Control & Spam Prevention  
**Purpose**: Blocks polling duplicates, noise, and insignificant events

#### What it does:
- **Filters** duplicate events from polling
- **Prevents** spam from repeated identical events
- **Checks** significance thresholds

#### Configuration:
```javascript
{
  "pass_unchanged": false,           // Don't pass events that haven't changed
  "duplicate_window_seconds": 60,    // Don't repeat same event within window
  "significance_filter": {           // Only pass significant changes
    "temperature": "> 2 degrees",
    "weight": "> 5 kg"
  }
}
```

#### Example (Polling Scenario):
```javascript
// 1st poll: bed_exit detected
Input: { bed_id: "room101", event: "bed_exit", edt_state: { changed: true } }
Output: ✅ PASS - New event, let it through

// 2nd-5th poll: Same bed_exit (polling duplicates)
Input: { bed_id: "room101", event: "bed_exit", edt_state: { changed: false } }
Output: ❌ BLOCKED - No change detected, filter out spam
```

---

### Node 3: `edt-mode` - Dynamic On/Off Control with API
**Purpose**: Runtime enable/disable of EDT processing for specific entities via API

#### What it does:
- **Gates** event processing per entity (bed, room, robot)
- **Provides** API endpoints for dynamic control
- **Supports** time-based and manual overrides

#### Configuration:
```javascript
{
  "entity_field": "msg.bed_id",      // What to control
  "mode_scope": "bed_monitoring",    // Monitoring type
  "api_endpoint": "/edt/mode",       // API for control
  "default_state": "disabled"        // Default for new entities
}
```

#### API Endpoints:
```bash
# Enable monitoring for specific bed
POST /edt/mode/enable
{
  "entity_id": "room101_bed1",
  "scope": "bed_monitoring", 
  "reason": "High-risk patient admitted"
}

# Disable monitoring
POST /edt/mode/disable  
{
  "entity_id": "room101_bed2",
  "reason": "Patient discharged"
}

# Get current status
GET /edt/mode/status?scope=bed_monitoring
```

#### Example:
```javascript
// Bed with monitoring disabled
Input: { bed_id: "room101_bed2", event: "bed_exit" }
Output: { 
  ..., 
  edt_mode: { 
    enabled: false, 
    should_process: false 
  } 
}

// Bed with monitoring enabled  
Input: { bed_id: "room101_bed1", event: "bed_exit" }
Output: { 
  ..., 
  edt_mode: { 
    enabled: true, 
    should_process: true 
  } 
}
```

## User-Driven Flow Patterns

### Basic EDT Pattern (Recommended)
```javascript
[Sensor Data] 
    ↓
[edt-mode: Check if monitoring enabled]     // On/off control per entity
    ↓ (enabled)
[edt-state: Track state changes]            // Memory & change detection
    ↓ (changed)  
[edt-filter: Block spam/duplicates]         // Quality control
    ↓ (significant)
[Switch: "Event Type Routing"]              // USER LOGIC: Route by event
    ↓ (bed_exit) → [Function: "Emergency Logic"] → [create-tp: "bed_exit_response"]
    ↓ (sit_up) → [Function: "Standby Logic"] → [create-tp: "standby_bed"]
    ↓ (medication_due) → [Function: "Med Logic"] → [create-tp: "medication"]
```

### Real-World Hospital Example
```javascript
[HTTP Request: Poll bed sensors every 1s]
    ↓ 
{ bed_id: "room101", event: "sit_up", timestamp: "10:30:15" }
    ↓
[edt-mode: Check bed monitoring enabled] 
    ↓ { edt_mode: { enabled: true, should_process: true } }
[edt-state: Track bed changes]
    ↓ { edt_state: { changed: true, previous: "normal" } }
[edt-filter: Block polling duplicates]
    ↓ (First occurrence, passes through)
[Switch: "Event Type"]
    ↓ (sit_up)
[Function: "Standby Robot Logic"]
function(msg) {
    // User-defined business logic
    const standbyRobot = flow.get(`standby_${msg.bed_id}`);
    if (!standbyRobot) {
        msg.tp_id = "standby_bed";
        msg.payload = {
            bed_id: msg.bed_id,
            position: "foot_of_bed",
            mode: "silent"
        };
        return msg;
    }
    return null; // Already have standby
}
    ↓
[create-tp: Assign standby robot] ✅
```

### Multi-Stream Coordination Example
```javascript
// Stream 1: Bed Events
[Poll: /api/bed-events] → [edt-mode] → [edt-state] → [edt-filter] → [Switch]

// Stream 2: Patient Orientation  
[Poll: /api/orientation] → [edt-mode] → [edt-state] → [edt-filter] → [Switch]

// Both streams feed into same business logic
[Switch: Combined Event Routing]
    ↓ (bed_exit + standing) → [Function: "Emergency Response"]
    ↓ (sit_up + sitting) → [Function: "Standby Position"] 
    ↓ (medication_due) → [Function: "Medication Reminder"]
```

### Smart Resource Management Pattern
```javascript
[edt-filter: Clean events] 
    ↓
[Function: "Check Robot Conflicts"]
function(msg) {
    const robotAllocation = flow.get('robot_allocation') || {};
    const requestedRobot = msg.robot_id;
    
    if (robotAllocation[requestedRobot]) {
        // Robot busy - user decides what to do
        msg.conflict = {
            robot: requestedRobot,
            current_task: robotAllocation[requestedRobot],
            new_priority: msg.priority
        };
    }
    return msg;
}
    ↓
[Switch: "Has Conflict?"]
    ↓ (yes) → [Function: "Priority Decision"] → [cancel-tp] + [create-tp]
    ↓ (no) → [Function: "Direct Assign"] → [create-tp]
```

## Integration with Task Package System

### Reuse Existing TP Nodes
EDT leverages the existing Task Package infrastructure instead of duplicating functionality:

**Use Existing Nodes**:
- **`create-tp`** - Create task packages (manual or event-driven)
- **`cancel-tp`** - Cancel task packages (manual or event-driven)  
- **`tp-data-get/set`** - Store and retrieve task data across flows
- **`tp-delay`** - Timing control in workflows

**Enhanced Integration Patterns**:
```javascript
// EDT triggers existing TP actions
[edt-filter] → [Function: Business Logic] → [create-tp] → [tp-start] → [business logic] → [tp-end]

// Cross-flow coordination  
[edt-state] → [Function: Check conflicts] → [cancel-tp] → [tp-cancel] → [cleanup] → [tp-end]

// Data sharing between EDT and TP flows
[edt-state] → [tp-data-set] → ... → [tp-data-get] → [cleanup logic]
```

### API Endpoints (Future Enhancement)
While EDT focuses on the 3 core nodes, future API endpoints could include:

**EDT Mode Control** (for `edt-mode` node):
```bash
POST /edt/mode/enable   # Enable monitoring for entity
POST /edt/mode/disable  # Disable monitoring for entity  
GET /edt/mode/status    # Get current monitoring status
```

**EDT State Queries** (for `edt-state` node):
```bash
GET /edt/state/{entity_id}     # Get current state for entity
GET /edt/state/changes         # Get recent state changes
```

## Implementation Roadmap

### Phase 1: Core Nodes (Immediate)
**Goal**: Get basic EDT functionality working

**Nodes to Implement**:
1. **`edt-state`** - Change detection and state tracking
2. **`edt-filter`** - Spam prevention and quality control  
3. **`edt-mode`** - Basic enable/disable control (without API initially)

**Success Criteria**:
- Handle polling duplicate prevention 
- Track state changes for beds/robots/rooms
- Basic on/off control per entity
- Integration with existing `create-tp`/`cancel-tp` nodes

### Phase 2: API Integration (Future)
**Goal**: Dynamic control and external integration

**Features to Add**:
- REST API endpoints for `edt-mode` control
- Dashboard integration for monitoring enable/disable
- External system integration (hospital management systems)
- Enhanced state querying capabilities

**Success Criteria**:
- Nurse stations can enable/disable bed monitoring via API
- Dashboard shows current monitoring status
- Integration with patient admission/discharge systems

### Phase 3: Advanced Features (Later)
**Goal**: Sophisticated automation capabilities

**Potential Features** (user-driven demand):
- Advanced priority resolution helpers
- Resource conflict detection utilities  
- Time-based automatic mode switching
- Analytics and reporting on state changes
- Cross-facility coordination

## Development Questions & Decisions

### Technical Architecture
1. **Storage Strategy**: Use Node-RED global context initially, consider Redis for scaling
2. **Performance**: Target 100+ entities with 1-second polling cycles
3. **Integration**: Same npm package as task-package vs separate package
4. **API Framework**: Reuse task-package API infrastructure

### User Experience  
1. **Configuration Complexity**: Start with simple UI, add advanced options later
2. **Documentation**: Focus on practical examples and common patterns
3. **Learning Path**: Users familiar with TP concepts should understand EDT quickly

### Scope Decisions Made
1. **✅ Eliminated `edt-priority`**: Users handle priority logic in Function nodes
2. **✅ Eliminated `edt-action`**: Users leverage existing `create-tp`/`cancel-tp` nodes
3. **✅ Simplified `edt-trigger` → `edt-filter`**: Focus on spam prevention, not routing
4. **✅ Enhanced `edt-mode`**: API control is core requirement, not optional
5. **✅ Minimal Core**: 3 nodes maximum, everything else is user logic

## Success Metrics

### Performance Targets
- **Event Processing Latency**: < 100ms from sensor data to user Function node
- **State Storage Performance**: Support 1,000+ concurrent entities with 1-second polling
- **Memory Usage**: < 50MB for typical hospital ward scenario (20 beds, 5 robots)
- **Filtering Effectiveness**: > 95% reduction in duplicate polling events

### User Experience Targets  
- **Configuration Time**: < 15 minutes for basic bed monitoring setup
- **Learning Curve**: Users familiar with TP concepts understand EDT in < 1 hour
- **Documentation Coverage**: Complete examples for 5+ common use cases
- **Integration Simplicity**: Works with existing TP flows without modification

### Technical Reliability
- **State Persistence**: 99.9% durability for critical state data in global context
- **Event Processing**: 99.95% successful event handling under normal conditions
- **Node-RED Integration**: Compatible with Node-RED 1.3.0+ and task-package system
- **API Response Time**: < 200ms for edt-mode control endpoints

---

**Document Version**: 2.0  
**Last Updated**: October 9, 2025  
**Status**: Design Phase - Simplified & Focused

**Key Changes in v2.0**:
- **Eliminated complex nodes**: Removed `edt-priority` and `edt-action` - users handle this logic
- **Simplified to 3 core nodes**: `edt-state`, `edt-filter`, `edt-mode` only
- **Reuse existing TP infrastructure**: Leverage `create-tp`/`cancel-tp` instead of duplicating
- **User-driven architecture**: Business logic stays in Function/Switch nodes where users control it
- **Focused on core value**: State tracking, spam prevention, dynamic control - not decision making
- **Aligned with TP philosophy**: Simple building blocks that users combine creatively
- **Clear implementation roadmap**: Phase 1 (core nodes), Phase 2 (API), Phase 3 (advanced features)

*This document serves as the authoritative specification for the Event-Driven Tasks (EDT) module development and integration with the node-red-task-package system.*