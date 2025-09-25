# Event-Driven Tasks (EDT) Design Document

## Overview

The **Event-Driven Tasks (EDT)** module extends the node-red-task-package system to handle real-time sensor data streams and automatically manage Task Package (TP) lifecycles based on dynamic conditions. EDT provides intelligent resource conflict resolution, state management, and priority-based decision making for complex automation scenarios.

**Key Features**:
- **Real-Time Event Processing**: Handle continuous sensor data streams with smart filtering
- **Resource Conflict Resolution**: Intelligent priority-based robot and resource allocation
- **Cross-Flow State Management**: Maintain state across different flows and contexts
- **Dynamic TP Control**: Start, cancel, and update Task Packages based on events
- **Flexible Enable/Disable**: Granular control over EDT functionality by scope
- **User-Defined Logic**: Leverage existing Node-RED nodes for custom business logic

## Architecture

### System Integration

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Sensor        │    │   EDT Layer     │    │  Task Package   │
│   Streams       │────│   (Events)      │────│   (Business)    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              │
                       ┌─────────────────┐
                       │   State &       │
                       │   Priority      │
                       │   Management    │
                       └─────────────────┘
```

### Design Philosophy

- **Building Blocks, Not Solutions**: Provide flexible components that users can combine
- **Leverage Existing Nodes**: Use Function, Switch, and other Node-RED nodes for custom logic
- **Minimal Essential Nodes**: Focus only on capabilities unique to EDT
- **User Control**: Maximum flexibility in how events are processed and decisions made

## EDT Node Specifications

### Node 1: `edt-state` (State Management)
**Purpose**: Cross-flow state storage and retrieval with persistence and TTL management

#### Configuration Properties:
```javascript
{
  "storage_scope": "global|flow|node",      // Storage context
  "namespace": "bed_monitoring",            // Prevent naming conflicts
  "key_extraction": {
    "primary_key": "msg.bed_id",           // Business logic key
    "tpc_tracking": "msg.tp_data.tpc_id",  // TP instance UUID
    "tp_tracking": "msg.tp_data.tp_id"     // TP type identifier
  },
  "state_fields": [                        // Fields to track in state
    "robot_assigned",
    "priority", 
    "last_event",
    "custom_data"
  ],
  "resource_tracking": {
    "robot_key": "msg.robot_assigned",
    "track_allocation": true               // Track robot resource allocation
  },
  "persistence": true,                      // Survive Node-RED restarts
  "ttl_minutes": 60,                       // Time-to-live for entries
  "cleanup_interval": 5,                   // Cleanup frequency (minutes)
  "max_entries": 1000,                     // Memory management
  "storage_format": "business_state"       // Optimized for business logic + TP tracking
}
```

#### Input Message:
```javascript
{
  "bed_id": "ward1_room12_bed3",
  "event_type": "bed_exit",
  "robot_assigned": "tinyRobot2",
  "priority": 10,
  "timestamp": "2025-09-22T10:30:00Z",
  "tp_data": {
    "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
    "tp_id": "bed_exit_response",
    "user": "nurse_station",
    "status": "underway"
  }
}
```

#### Output Message:
```javascript
{
  "bed_id": "ward1_room12_bed3",
  "event_type": "bed_exit",
  "robot_assigned": "tinyRobot2", 
  "priority": 10,
  "tp_data": {
    "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
    "tp_id": "bed_exit_response",
    "user": "nurse_station",
    "status": "underway"
  },
  
  // Added by edt-state
  "edt_state": {
    "business_key": "ward1_room12_bed3",
    "state_change": true,  // Changed from "sit_up" to "bed_exit"
    "current": {
      "status": "bed_exit",
      "robot_assigned": "tinyRobot2",
      "priority": 10,
      "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
      "tp_id": "bed_exit_response",
      "last_event": "bed_exit",
      "timestamp": "2025-09-22T10:30:00Z"
    },
    "previous": {
      "status": "sit_up",
      "robot_assigned": "tinyRobot2", 
      "priority": 1,
      "tpc_id": "abc12345-1234-5678-9abc-123456789abc",
      "tp_id": "robot_standby",
      "last_event": "sit_up",
      "timestamp": "2025-09-22T10:25:00Z"
    },
    "resource_conflicts": {
      "tinyRobot2": {
        "has_conflict": true,
        "current_task": "delivery_to_patrol_D1",
        "current_priority": 3,
        "new_priority": 10,
        "needs_cancellation": "abc12345-1234-5678-9abc-123456789abc"
      }
    },
    "metadata": {
      "last_updated": "2025-09-22T10:30:00Z",
      "update_count": 3,
      "expires_at": "2025-09-22T11:30:00Z",
      "active_tpc_ids": ["550e8400-e29b-41d4-a716-446655440000"]
    }
  }
}
```

#### Behavior:
1. **Business Logic State Tracking**: Track beds, zones, robots (not just TP instances)
2. **TP Instance Management**: Associate business state with current/previous tpc_id (UUIDs)
3. **Resource Conflict Detection**: Identify robot allocation conflicts and priority comparisons
4. **State Transitions**: Track state changes (normal → sit_up → bed_exit)
5. **Cross-Flow Integration**: Works with tp-data-store for complete context sharing
6. **TTL Management**: Automatically expire old entries with cleanup
7. **Memory Management**: Enforce size limits and handle concurrent access

#### Internal State Storage Structure:
```javascript
// Global context: edt_state_{namespace}
{
  "edt_state_bed_monitoring": {
    // Business logic keys (beds)
    "ward1_room12_bed3": {
      "current_state": {
        "status": "bed_exit",
        "robot_assigned": "tinyRobot2",
        "priority": 10,
        "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
        "tp_id": "bed_exit_response",
        "last_event": "bed_exit",
        "timestamp": "2025-09-22T10:30:00Z"
      },
      "previous_state": {
        "status": "sit_up",
        "priority": 1,
        "tpc_id": "abc12345-1234-5678-9abc-123456789abc",
        "tp_id": "robot_standby"
      },
      "metadata": {
        "created_at": "2025-09-22T09:00:00Z",
        "expires_at": "2025-09-22T11:30:00Z",
        "update_count": 5,
        "active_tpc_ids": ["550e8400-e29b-41d4-a716-446655440000"]
      }
    }
  },
  
  // Resource allocation tracking
  "edt_state_robot_allocation": {
    "tinyRobot2": {
      "current_assignment": {
        "task_type": "bed_exit_response",
        "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
        "tp_id": "bed_exit_response",
        "location": "ward1_room12_bed3",
        "priority": 10,
        "started_at": "2025-09-22T10:30:00Z"
      },
      "previous_assignment": {
        "task_type": "delivery",
        "tpc_id": "abc12345-1234-5678-9abc-123456789abc",
        "tp_id": "tp02",
        "location": "patrol_D1",
        "priority": 3,
        "cancelled_at": "2025-09-22T10:30:00Z",
        "cancellation_reason": "bed_exit_priority"
      }
    }
  }
}
```

---

### Node 2: `edt-priority` (Priority & Conflict Resolution)
**Purpose**: Intelligent resource conflict resolution and priority-based decision making

#### Configuration Properties:
```javascript
{
  "conflict_strategy": "cancel_lower|queue|parallel|custom",
  "resource_types": ["robots", "zones", "equipment"],
  "priority_field": "msg.priority",
  "resource_field": "msg.robot_assigned",
  "decision_logic": "function(new_request, current_allocations) { /* user code */ }",
  "queue_management": {
    "max_queue_size": 10,
    "queue_strategy": "fifo|priority|custom",
    "timeout_ms": 300000
  },
  "resource_mapping": {
    "tinyRobot2": {
      "type": "robot",
      "capabilities": ["delivery", "bed_response"],
      "location_constraints": ["ward1", "ward2"]
    }
  }
}
```

#### Input Message:
```javascript
{
  "event_type": "bed_exit",
  "bed_id": "ward1_room12_bed3",
  "priority": 10,  // High priority
  "robot_requested": "tinyRobot2",
  "edt_state": {
    "current": {...},
    "previous": {...}
  }
}
```

#### Output Message:
```javascript
{
  "priority_decision": {
    "action": "cancel_and_start|queue|start_parallel|ignore",
    "reasoning": "bed_exit_overrides_delivery",
    "affected_resources": ["tinyRobot2"],
    "conflict_resolution": {
      "cancel_tasks": [
        {
          "tpc_id": "current_delivery_task", 
          "tp_id": "tp02",
          "reason": "priority_override"
        }
      ],
      "start_tasks": [
        {
          "tp_id": "bed_exit_response",
          "priority": 10,
          "payload": {...}
        }
      ],
      "queue_tasks": []
    }
  },
  "resource_allocation": {
    "tinyRobot2": {
      "previous_task": "delivery_to_patrol_D1",
      "new_task": "bed_exit_response",
      "allocation_time": "2025-09-22T10:30:00Z"
    }
  },
  "original_payload": {...}
}
```

#### Behavior:
1. **Resource Conflict Detection**: Identify when multiple events request same resources
2. **Priority Evaluation**: Compare priorities and apply conflict resolution strategy
3. **Decision Making**: Generate specific actions (cancel, queue, parallel execution)
4. **Queue Management**: Handle queued requests when resources become available
5. **Resource Tracking**: Maintain current allocation state

---

### Node 3: `edt-action` (TP Lifecycle Controller)
**Purpose**: Execute Task Package lifecycle actions based on priority decisions

#### Configuration Properties:
```javascript
{
  "tp_config_node": "tp-config-node-id",
  "action_mapping": {
    "bed_exit_response": {
      "tp_id": "bed_exit_tp",
      "payload_template": {
        "robot_name": "${robot_assigned}",
        "bed_location": "${bed_id}",
        "urgency": "high"
      }
    },
    "wheelchair_service": {
      "tp_id": "wheelchair_cycle_tp",
      "payload_template": {
        "service_queue": "${edt_state.queue}",
        "priority_zone": "${zone_id}"
      }
    }
  },
  "api_settings": {
    "timeout_ms": 5000,
    "retry_attempts": 3,
    "auth_header": "Bearer ${flow.auth_token}"
  },
  "output_format": "api_calls|tp_messages|both"
}
```

#### Input Message:
```javascript
{
  "priority_decision": {
    "action": "cancel_and_start",
    "conflict_resolution": {
      "cancel_tasks": [{
        "tpc_id": "delivery_task_123",
        "tp_id": "tp02", 
        "reason": "priority_override"
      }],
      "start_tasks": [{
        "tp_id": "bed_exit_response",
        "priority": 10,
        "payload": {
          "bed_id": "ward1_room12_bed3",
          "robot_assigned": "tinyRobot2"
        }
      }]
    }
  }
}
```

#### Output Ports:
**Port 1: TP Cancel Actions**
```javascript
{
  "tp_action": "cancel",
  "tpc_id": "delivery_task_123",
  "tp_id": "tp02",
  "reason": "bed_exit_priority_override",
  "api_call": {
    "method": "POST",
    "url": "/task-package/cancel",
    "payload": {...}
  }
}
```

**Port 2: TP Start Actions**
```javascript
{
  "tp_action": "start", 
  "tp_id": "bed_exit_response",
  "payload": {
    "robot_name": "tinyRobot2",
    "robot_fleet": "tinyRobot",
    "bed_location": "ward1_room12_bed3",
    "urgency": "high"
  },
  "api_call": {
    "method": "POST", 
    "url": "/task-package/start",
    "payload": {...}
  }
}
```

**Port 3: TP Update Actions**
```javascript
{
  "tp_action": "update",
  "tpc_id": "existing_task_456",
  "update_data": {
    "priority_change": "high",
    "new_target": "ward1_room12_bed3"
  }
}
```

#### Behavior:
1. **API Call Generation**: Create HTTP calls to TP endpoints
2. **Payload Transformation**: Apply templates and variable substitution
3. **Error Handling**: Retry failed API calls with exponential backoff
4. **Response Processing**: Handle TP API responses and errors
5. **Status Reporting**: Report action success/failure back to flow

---

### Node 4: `edt-mode` (Enable/Disable Control)
**Purpose**: Granular control over EDT functionality with scope-based activation

#### Configuration Properties:
```javascript
{
  "mode_type": "global|zone|device|tp_specific|hierarchical",
  "default_state": "enabled|disabled",
  "control_scope": {
    "zones": ["ward1/*", "patrol_*", "zone_a"],
    "robots": ["tinyRobot*", "deliveryBot"],
    "tp_types": ["bed_response", "wheelchair_service"],
    "time_based": {
      "enabled_hours": "07:00-19:00",
      "timezone": "Asia/Singapore",
      "weekend_behavior": "disabled"
    }
  },
  "enable_conditions": {
    "manual_override": true,
    "external_signal": "msg.enable_edt",
    "api_control": true,
    "emergency_mode": "force_disable"
  },
  "disable_behavior": "ignore|queue|redirect|error",
  "persistence": true  // Remember state across restarts
}
```

#### Input Message (Control):
```javascript
{
  "edt_command": "enable|disable|toggle|status",
  "scope": {
    "zones": ["ward1"],
    "robots": ["tinyRobot2"],
    "reason": "night_shift_started"
  },
  "temporary": {
    "duration_minutes": 480,  // 8 hours
    "auto_revert": true
  }
}
```

#### Input Message (Event Processing):
```javascript
{
  "event_type": "bed_exit",
  "bed_id": "ward1_room12_bed3",
  "robot_assigned": "tinyRobot2",
  "zone": "ward1"
}
```

#### Output Ports:
**Port 1: Enabled Events**
```javascript
{
  "edt_enabled": true,
  "scope_status": {
    "zone": "enabled",
    "robot": "enabled", 
    "tp_type": "enabled"
  },
  "original_event": {...}
}
```

**Port 2: Disabled Events**  
```javascript
{
  "edt_enabled": false,
  "disable_reason": "night_shift_active",
  "action_taken": "queued|ignored|redirected",
  "original_event": {...}
}
```

**Port 3: Status Updates**
```javascript
{
  "mode_change": {
    "action": "disabled",
    "scope": ["ward1"],
    "previous_state": "enabled",
    "timestamp": "2025-09-22T19:00:00Z",
    "reason": "scheduled_night_shift"
  }
}
```

#### Behavior:
1. **Scope Evaluation**: Check if event matches enabled scopes
2. **Time-Based Control**: Automatically enable/disable based on schedule
3. **Manual Override**: Accept control commands from external sources
4. **Queue Management**: Optionally queue disabled events for later processing
5. **Status Reporting**: Provide visibility into current mode states

## Flow Patterns

### Basic Event Processing
```
[Sensor Data] → [Function: Parse] → [edt-state] → [edt-action]
```

### Complex Priority Management
```
[Multiple Sensors] → [edt-mode] → [Switch: Event Type] → [edt-state] → [edt-priority] → [edt-action]
                        ↓              ↓                    ↓              ↓              ↓
                   Scope Check    Route Events        Track State    Resolve      Control TPs
```

### Your Current Use Case Enhanced
```
[Bed Sensor] → [edt-mode] → [Function: Parse bed event] → [edt-state] → [edt-priority] → [edt-action]
                   ↓                     ↓                      ↓              ↓              ↓
             Check ward enabled    Extract bed/event     Track bed state   Robot conflict   Cancel delivery,
                                                                                            Start bed response
```

### Cross-Flow Data Sharing (Your Current Pattern)
```
Main Flow:   [tp-start] → [tp-data-store] → [business logic] → [tp-end]
                              ↓
EDT Flow:    [edt-state] → [edt-priority] → [edt-action] → [Cancel Main Flow]
                              ↑
Cancel Flow: [tp-cancel] → [tp-data-get] → [cleanup with stored data]
```

## UUID Management and State Relationships

### Key Concepts

**tpc_id (Task Package Instance ID)**:
- Generated UUID for each TP execution: `550e8400-e29b-41d4-a716-446655440000`
- Unique identifier for specific task instances
- Used by TP system for lifecycle management

**Business Logic Keys**:
- Human-readable identifiers: `ward1_room12_bed3`, `zone_a`, `tinyRobot2`
- Used by EDT for state management and decision making
- Persistent across multiple TP instances

### State Relationship Mapping
```javascript
// Business Key → Multiple TP Instances over time
"ward1_room12_bed3" → {
  "current_tpc_id": "550e8400-e29b-41d4-a716-446655440000",  // Active bed-exit TP
  "previous_tpc_id": "abc12345-1234-5678-9abc-123456789abc", // Previous standby TP
  "history": [
    {"tpc_id": "def67890-...", "tp_id": "normal_monitoring", "completed_at": "..."},
    {"tpc_id": "ghi12345-...", "tp_id": "sit_up_response", "completed_at": "..."}
  ]
}

// Resource Key → Current Allocation
"tinyRobot2" → {
  "current_tpc_id": "550e8400-e29b-41d4-a716-446655440000",
  "allocated_to": "ward1_room12_bed3",
  "task_priority": 10
}
```

### Cross-Flow Data Integration
```javascript
// EDT State (Business Logic)
edt_state.get("ward1_room12_bed3") → {
  "robot_assigned": "tinyRobot2",
  "current_tpc_id": "550e8400-e29b-41d4-a716-446655440000"
}

// TP Data Store (Instance Data)
tp_data_store.get("550e8400-e29b-41d4-a716-446655440000") → {
  "rmf_robot_name": "tinyRobot2", 
  "rmf_robot_fleet": "tinyRobot",
  "payload": {...}
}

// Combined Context for tp-cancel flow
{
  "business_context": edt_state_data,    // Why this happened
  "execution_context": tp_data_store     // How to clean up
}
```

## UUID Management and State Relationships

### Key Concepts

**tpc_id (Task Package Instance ID)**:
- Generated UUID for each TP execution: `550e8400-e29b-41d4-a716-446655440000`
- Unique identifier for specific task instances
- Used by TP system for lifecycle management

**Business Logic Keys**:
- Human-readable identifiers: `ward1_room12_bed3`, `zone_a`, `tinyRobot2`
- Used by EDT for state management and decision making
- Persistent across multiple TP instances

### State Relationship Mapping
```javascript
// Business Key → Multiple TP Instances over time
"ward1_room12_bed3" → {
  "current_tpc_id": "550e8400-e29b-41d4-a716-446655440000",  // Active bed-exit TP
  "previous_tpc_id": "abc12345-1234-5678-9abc-123456789abc", // Previous standby TP
  "history": [
    {"tpc_id": "def67890-...", "tp_id": "normal_monitoring", "completed_at": "..."},
    {"tpc_id": "ghi12345-...", "tp_id": "sit_up_response", "completed_at": "..."}
  ]
}

// Resource Key → Current Allocation
"tinyRobot2" → {
  "current_tpc_id": "550e8400-e29b-41d4-a716-446655440000",
  "allocated_to": "ward1_room12_bed3",
  "task_priority": 10
}
```

### Cross-Flow Data Integration
```javascript
// EDT State (Business Logic)
edt_state.get("ward1_room12_bed3") → {
  "robot_assigned": "tinyRobot2",
  "current_tpc_id": "550e8400-e29b-41d4-a716-446655440000"
}

// TP Data Store (Instance Data)
tp_data_store.get("550e8400-e29b-41d4-a716-446655440000") → {
  "rmf_robot_name": "tinyRobot2", 
  "rmf_robot_fleet": "tinyRobot",
  "payload": {...}
}

// Combined Context for tp-cancel flow
{
  "business_context": edt_state_data,    // Why this happened
  "execution_context": tp_data_store     // How to clean up
}
```

## Integration with Task Package

### Enhanced TP API Endpoints

#### New: External TP Update Endpoint
**POST `/task-package/update`**
```javascript
{
  "tpc_id": "running_task_instance_id",
  "update_type": "priority|payload|command",
  "update_data": {
    "new_priority": 8,
    "additional_payload": {...},
    "command": "pause|resume|redirect"
  }
}
```

#### Enhanced: Existing Endpoints
- **GET `/task-package`**: Returns complete form URLs (already implemented)
- **POST `/task-package/start`**: Enhanced with priority field
- **POST `/task-package/cancel`**: Enhanced with reason field

### TP Node Refactoring

#### Current `tp-update-user-status` → `tp-custom-update`
**Purpose**: Internal flow status updates (existing functionality)
```javascript
{
  "user_status": "robot reached destination",
  "custom_data": {...}
}
```

#### New `tp-update` → External Update Receiver  
**Purpose**: Receive external updates from EDT or other systems
```javascript
{
  "tpc_id": "target_task_instance",
  "update_source": "edt|external_api|manual",
  "update_data": {...}
}
```

## Real-World Examples

### Bed Exit Scenario (Your Use Case)
```javascript
// Flow Configuration
[MQTT: hospital/bed/+/+/+/events] 
    ↓
[edt-mode: Check ward1 enabled]
    ↓ (enabled)
[Function: Parse bed event] 
    ↓
[Switch: bed-exit vs sit-up]
    ↓
[edt-state: Update bed status]
    ↓
[edt-priority: Check robot conflicts]
    ↓
[edt-action: Cancel delivery TP, start bed-exit TP]

// Complete State Management Example
{
  "edt_state_bed_monitoring": {
    "ward1_room12_bed3": {
      "current_state": {
        "status": "bed_exit",
        "robot_assigned": "tinyRobot2",
        "priority": 10,
        "tpc_id": "550e8400-e29b-41d4-a716-446655440000",  // New bed-exit TP
        "tp_id": "bed_exit_response"
      },
      "previous_state": {
        "status": "sit_up",
        "tpc_id": "abc12345-1234-5678-9abc-123456789abc",  // Previous standby TP
        "tp_id": "robot_standby"
      }
    }
  },
  "edt_state_robot_allocation": {
    "tinyRobot2": {
      "current_assignment": {
        "tpc_id": "xyz98765-4321-8765-4321-987654321xyz",  // Current delivery TP
        "tp_id": "tp02",
        "priority": 3,
        "location": "patrol_D1"
      }
    }
  }
}

// Priority Decision with UUIDs
{
  "cancel_tasks": [{
    "tpc_id": "xyz98765-4321-8765-4321-987654321xyz",  // Cancel delivery
    "tp_id": "tp02",
    "reason": "bed_exit_priority_override"
  }],
  "start_tasks": [{
    "tp_id": "bed_exit_response",
    "expected_tpc_id": "550e8400-e29b-41d4-a716-446655440000",  // Will be generated
    "payload": {
      "robot_name": "tinyRobot2",
      "robot_fleet": "tinyRobot",
      "bed_location": "ward1_room12_bed3",
      "urgency": "high"
    }
  }]
}
```

### Wheelchair Zone Scenario
```javascript
// Flow Configuration  
[HTTP: parking/zones/status]
    ↓
[Function: Detect new wheelchair]
    ↓
[edt-state: Update zone queue]
    ↓
[edt-priority: Interrupt current cycle]
    ↓
[edt-action: Start priority wheelchair service]

// State Management
{
  "service_queue": ["zone_a", "zone_b", "zone_c"],
  "robot_status": "en_route_to_zone_b",
  "priority_insertions": ["zone_a"]  // New wheelchair detected
}
```

## Implementation Questions

### Technical Architecture

1. **State Persistence Strategy**:
   - Should edt-state use Redis, SQLite, or Node-RED context?
   - How do we handle distributed Node-RED instances?
   - What's the backup/recovery strategy for critical state?
   - How do we efficiently index by both business keys and tpc_id UUIDs?

2. **Performance Considerations**:
   - How many concurrent EDT events can the system handle?
   - Should we implement event batching for high-frequency sensors?
   - What's the memory usage pattern for large state stores?
   - How do we optimize lookups across business keys and UUID mappings?
   - Should we implement state sharding for high-volume scenarios?

3. **API Integration**:
   - Should edt-action make direct HTTP calls or use internal events?
   - How do we handle TP API authentication from EDT nodes?
   - Should we support webhook notifications for EDT actions?

### User Experience

4. **Configuration Complexity**:
   - Should nodes have both simple UI and advanced JavaScript editor modes?
   - How do we provide templates for common use cases (bed monitoring, zone management)?
   - What's the learning curve for users new to EDT concepts?

5. **Debugging and Monitoring**:
   - How do users debug complex EDT flows with multiple state changes?
   - Should we provide an EDT dashboard for real-time monitoring?
   - How do we log and audit EDT decisions for compliance?

6. **Error Handling**:
   - What happens when edt-action fails to start/cancel a TP?
   - How do we handle partial failures in multi-action scenarios?
   - Should EDT have automatic recovery mechanisms?

### Integration and Deployment

7. **Backward Compatibility**:
   - Should EDT be a separate npm module or integrated into task-package?
   - How do we migrate existing flows to use EDT patterns?
   - What's the upgrade path for current task-package users?

8. **Resource Management**:
   - How do we prevent EDT from overwhelming the TP system with requests?
   - Should there be rate limiting on EDT-generated TP actions?
   - How do we handle resource exhaustion scenarios?

9. **Testing and Validation**:
   - How do we simulate sensor data for EDT testing?
   - Should we provide a test harness for complex priority scenarios?
   - How do we validate EDT behavior in production environments?
   - How do we test UUID collision scenarios and state corruption recovery?

10. **UUID and State Management**:
    - Should we provide utilities to lookup business state by tpc_id?
    - How do we handle orphaned state when TPs fail without proper cleanup?
    - Should EDT automatically clean up state when associated TPs complete?
    - How do we handle rapid state changes with multiple concurrent tpc_ids?

### Scalability and Future Features

11. **Multi-Tenant Support**:
    - Should EDT support multiple isolated environments (hospitals, warehouses)?
    - How do we handle cross-tenant resource conflicts?
    - What's the security model for EDT in shared environments?
    - How do we partition state and UUIDs across tenants?

12. **Advanced Features**:
    - Should we support machine learning for predictive EDT decisions?
    - How about time-series analysis for sensor data trends?
    - Should EDT integrate with external scheduling systems?
    - Could we provide state analytics across business keys and TP instances?

13. **Protocol Support**:
    - Beyond MQTT and HTTP, what other protocols should EDT support?
    - Should we provide WebSocket support for real-time dashboards?
    - How about integration with industrial protocols (OPC-UA, Modbus)?
    - Should we support GraphQL for complex state queries?

## Success Metrics

### Performance Targets
- **Event Processing Latency**: < 100ms from sensor to TP action
- **State Storage Performance**: Support 10,000+ concurrent state keys
- **Resource Conflict Resolution**: < 50ms decision time
- **API Response Time**: < 200ms for TP lifecycle actions

### Reliability Targets  
- **State Persistence**: 99.9% durability for critical state data
- **Event Processing**: 99.95% successful event handling
- **TP Integration**: 99.9% successful TP API calls
- **Recovery Time**: < 30 seconds for system restart scenarios

### User Experience Targets
- **Configuration Time**: < 30 minutes for typical use case setup
- **Debugging Clarity**: Clear error messages and flow visualization
- **Documentation Coverage**: 95% of features with examples
- **Community Adoption**: Active usage in 3+ different domains

---

**Document Version**: 1.1  
**Last Updated**: September 25, 2025  
**Status**: Design Phase - Enhanced with UUID Management Specifications

**Key Changes in v1.1**:
- Added detailed edt-state implementation with UUID tpc_id handling
- Clarified business logic state vs TP instance relationships
- Enhanced state storage structure with resource allocation tracking
- Added comprehensive examples with UUID management
- Updated implementation questions for state persistence and lookup optimization

*This document serves as the authoritative specification for the Event-Driven Tasks (EDT) module development and integration with the node-red-task-package system.*