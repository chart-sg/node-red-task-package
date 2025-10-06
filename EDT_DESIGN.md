# Event-Driven Tasks (EDT) Design Document

## Overview

The **Event-Driven Tasks (EDT)** module extends the node-red-task-package system to handle real-time sensor data streams and automatically manage Task Package (TP) lifecycles based on dynamic conditions. EDT provides intelligent resource conflict resolution, state management, and priority-based decision making for interactive robot automation scenarios.

**Key Features**:
- **Real-Time Event Processing**: Handle continuous sensor data streams with smart filtering
- **Graceful Task Interruption**: Intelligently interrupt interactive tasks (education, social visits) for emergencies
- **Resource Conflict Resolution**: Priority-based robot allocation with graceful handoff capabilities
- **Cross-Flow State Management**: Maintain state across different flows and contexts
- **Dynamic TP Control**: Start, cancel, and update Task Packages based on events
- **Human-Robot Collaboration**: Enable smooth transitions between robot and human staff
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
  "robot_assigned": "temi_robot_1",
  "priority": 10,
  "timestamp": "2025-09-22T10:30:00Z",
  "current_task": {
    "type": "patient_education",
    "location": "ward1_room8_bed2",
    "interruptible": true
  },
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
      "status": "bed_exit_emergency",
      "robot_assigned": "temi_robot_1",
      "priority": 10,
      "tpc_id": "550e8400-e29b-41d4-a716-446655440000",
      "tp_id": "bed_exit_response",
      "last_event": "bed_exit",
      "timestamp": "2025-09-22T10:30:00Z"
    },
    "previous": {
      "status": "patient_education",
      "robot_assigned": "temi_robot_1", 
      "priority": 3,
      "tpc_id": "abc12345-1234-5678-9abc-123456789abc",
      "tp_id": "diabetes_education",
      "last_event": "education_session",
      "location": "ward1_room8_bed2",
      "can_handoff_to_human": true,
      "timestamp": "2025-09-22T10:25:00Z"
    },
    "resource_conflicts": {
      "temi_robot_1": {
        "has_conflict": true,
        "current_task": "patient_education_diabetes",
        "current_location": "ward1_room8_bed2",
        "current_priority": 3,
        "new_priority": 10,
        "interruption_strategy": "graceful_handoff",
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
    "temi_robot_1": {
      "type": "social_robot",
      "capabilities": ["patient_education", "social_interaction", "emergency_response", "medication_reminders"],
      "location_constraints": ["ward1", "ward2"],
      "interruptible_tasks": ["patient_education", "social_interaction", "routine_patrol"],
      "handoff_capable": true
    },
    "delivery_robot_1": {
      "type": "delivery_robot",
      "capabilities": ["medication_delivery", "supply_transport"],
      "location_constraints": ["all_wards"],
      "interruptible_tasks": [],
      "handoff_capable": false
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

### Patient Education Interrupted by Bed Exit Emergency
```javascript
// Flow Configuration
[MQTT: hospital/bed/+/+/+/events] 
    ↓
[edt-mode: Check ward1 enabled]
    ↓ (enabled)
[Function: Parse bed event] 
    ↓
[Switch: bed-exit vs sit-up vs normal]
    ↓
[edt-state: Update bed status]
    ↓
[edt-priority: Check robot conflicts - Temi doing education]
    ↓
[edt-action: Gracefully interrupt education, start bed-exit emergency response]

// Priority Matrix for Realistic Scenarios
Task Type                | Priority | Can Interrupt | Handoff to Human
------------------------|----------|---------------|------------------
Bed exit emergency      |    10    |     Never     |       No
Medication reminder     |     8    |  Only by 10   |      Yes
Call button response    |     7    |  Only by 8+   |      Yes
Patient education       |     3    |  Yes (5+)     |      Yes
Social interaction      |     2    |  Yes (3+)     |      Yes
Routine patrol          |     1    |  Yes (2+)     |       No
    ↓
[edt-priority: Check robot conflicts]
    ↓
[edt-action: Cancel delivery TP, start bed-exit TP]

// Complete State Management Example
{
  "edt_state_bed_monitoring": {
    "ward1_room12_bed3": {
      "current_state": {
        "status": "bed_exit_emergency",
        "robot_assigned": "temi_robot_1",
        "priority": 10,
        "tpc_id": "550e8400-e29b-41d4-a716-446655440000",  // New emergency response TP
        "tp_id": "bed_exit_emergency_response"
      },
      "previous_state": {
        "status": "normal",
        "tpc_id": "abc12345-1234-5678-9abc-123456789abc",  // Previous monitoring TP
        "tp_id": "bed_monitoring"
      }
    },
    "ward1_room8_bed2": {
      "current_state": {
        "status": "education_interrupted",
        "robot_assigned": null,  // Robot reassigned
        "priority": 3,
        "handoff_to_human": true,
        "session_progress": "60%",
        "topic": "diabetes_management"
      }
    }
  },
  "edt_state_robot_allocation": {
    "temi_robot_1": {
      "current_assignment": {
        "tpc_id": "550e8400-e29b-41d4-a716-446655440000",  // Emergency response
        "tp_id": "bed_exit_emergency_response",
        "priority": 10,
        "location": "ward1_room12_bed3",
        "task_type": "emergency_response"
      },
      "previous_assignment": {
        "tpc_id": "xyz98765-4321-8765-4321-987654321xyz",  // Interrupted education
        "tp_id": "patient_education",
        "priority": 3,
        "location": "ward1_room8_bed2",
        "task_type": "patient_education",
        "interrupted_at": "60%",
        "handoff_status": "pending_human_takeover"
      }
    }
  }
}

// Priority Decision with Graceful Interruption
{
  "cancel_tasks": [{
    "tpc_id": "xyz98765-4321-8765-4321-987654321xyz",  // Cancel education
    "tp_id": "patient_education",
    "reason": "bed_exit_emergency_override",
    "cancellation_type": "graceful_interruption",
    "handoff_message": "Excuse me, I need to attend to an urgent matter. A nurse will continue with you shortly.",
    "session_state": {
      "progress": "60%",
      "topic": "diabetes_management",
      "resume_with_human": true
    }
  }],
  "start_tasks": [{
    "tp_id": "bed_exit_emergency_response",
    "expected_tpc_id": "550e8400-e29b-41d4-a716-446655440000",
    "payload": {
      "robot_name": "temi_robot_1",
      "robot_fleet": "temi",
      "bed_location": "ward1_room12_bed3",
      "urgency": "high",
      "response_type": "immediate_assessment",
      "emergency_protocols": ["patient_safety", "nurse_notification"]
    }
  }],
  "notify_staff": [{
    "location": "ward1_room8_bed2",
    "message": "Patient education session interrupted at 60% completion. Please continue diabetes management education.",
    "priority": "medium"
  }]
}
```

### Practical Interruption Scenarios

#### Scenario 1: Temi Education → Bed Exit Emergency
```javascript
// Initial State: Temi teaching diabetes management
Current Task: {
  "tp_id": "patient_education",
  "robot": "temi_robot_1", 
  "location": "ward1_room8_bed2",
  "priority": 3,
  "progress": "60% complete"
}

// Emergency Event: Patient fall at different bed
Event: {
  "type": "bed_exit",
  "location": "ward1_room12_bed3",
  "priority": 10,
  "robot_needed": "temi_robot_1"
}

// EDT Action: Graceful interruption
Action: {
  "message_to_patient": "Excuse me, I need to attend to an urgent matter. A nurse will continue with you shortly.",
  "cancel_task": "patient_education",
  "start_task": "bed_exit_emergency",
  "notify_staff": "Education session interrupted at 60% - resume with human staff"
}
```

#### Scenario 2: Social Visit → Medication Reminder
```javascript
// Initial State: Temi chatting with lonely patient
Current Task: {
  "tp_id": "social_interaction",
  "robot": "temi_robot_1",
  "location": "ward2_room5_bed1", 
  "priority": 2,
  "emotional_support": true
}

// Scheduled Event: Insulin reminder for diabetic patient
Event: {
  "type": "medication_reminder",
  "location": "ward2_room7_bed2",
  "priority": 8,
  "medication": "insulin",
  "time_critical": true
}

// EDT Action: Polite transition
Action: {
  "message_to_patient": "It's been lovely talking with you. I need to help another patient with their medication now. I'll try to visit again later!",
  "cancel_task": "social_interaction", 
  "start_task": "medication_reminder",
  "schedule_return": "after_medication_complete"
}
```

#### Scenario 3: Routine Patrol → Call Button Response
```javascript
// Initial State: Temi doing hallway safety patrol
Current Task: {
  "tp_id": "safety_patrol",
  "robot": "temi_robot_1",
  "location": "ward1_hallway",
  "priority": 1,
  "route_progress": "25%"
}

// Patient Event: Call button pressed
Event: {
  "type": "call_button", 
  "location": "ward1_room3_bed1",
  "priority": 7,
  "patient_request": "assistance_needed"
}

// EDT Action: Immediate response
Action: {
  "cancel_task": "safety_patrol",
  "start_task": "call_button_response",
  "resume_patrol": "after_call_complete"
}
```
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

**Document Version**: 1.2  
**Last Updated**: October 3, 2025  
**Status**: Design Phase - Enhanced with Practical Robot Interaction Scenarios

**Key Changes in v1.2**:
- Updated examples to focus on realistic robot interruption scenarios (patient education, social interaction)
- Replaced impractical delivery interruption examples with Temi robot use cases
- Added graceful task interruption patterns with human handoff capabilities
- Enhanced priority matrix with interruptible task categories and handoff capabilities
- Improved resource mapping to include social robots vs delivery robots
- Added comprehensive practical scenarios (education interruption, medication reminders, call button response)
- Updated state management examples to reflect realistic hospital workflow

**Key Changes in v1.1**:
- Added detailed edt-state implementation with UUID tpc_id handling
- Clarified business logic state vs TP instance relationships
- Enhanced state storage structure with resource allocation tracking
- Added comprehensive examples with UUID management
- Updated implementation questions for state persistence and lookup optimization

*This document serves as the authoritative specification for the Event-Driven Tasks (EDT) module development and integration with the node-red-task-package system.*