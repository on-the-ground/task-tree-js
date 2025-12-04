# @on-the-ground/task-tree-js

Task-oriented programming DSL with lazy evaluation and execution strategies.

## Features

- 🌳 **Task Tree Structure**: Build complex workflows as composable AST nodes
- 🔄 **Lazy Evaluation**: Separate program structure from execution
- 🎯 **Execution Strategies**: Built-in retry, timeout, and transactional patterns
- ⚡ **Parallel Execution**: Run tasks concurrently with `parallel()`
- 🔗 **Sequential Execution**: Chain tasks with `sequence()`
- 📦 **Universal Support**: Works in Node.js and browsers (ESM & CJS)

## Installation

```bash
npm install @on-the-ground/task-tree-js
```

## Usage

### Basic Example

```typescript
import {
  leaf,
  sequence,
  parallel,
  squashTree,
} from "@on-the-ground/task-tree-js";

// Define tasks
const workflow = sequence("main", [
  leaf("task1", async (input: string) => input + " -> processed"),
  parallel("parallel-tasks", [
    leaf("task2a", async (input: string) => input + " -> A"),
    leaf("task2b", async (input: string) => input + " -> B"),
  ]),
  leaf("task3", async (input: object) => JSON.stringify(input)),
]);

// Execute
const result = await squashTree(workflow).task("start");
console.log(result);
```

### Retry Strategy

```typescript
const taskWithRetry = sequence(
  "api-call",
  [
    leaf("fetch-data", async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed");
      return response.json();
    }),
  ],
  { type: "retry", maxAttempts: 3 }
);

const data = await squashTree(taskWithRetry).task("https://api.example.com");
```

### Timeout Strategy

```typescript
const taskWithTimeout = sequence(
  "slow-operation",
  [
    leaf("process", async (data: string) => {
      // Long running operation
      return processData(data);
    }),
  ],
  { type: "timeout", duration: 5000 } // 5 seconds
);
```

### Nested Strategies

```typescript
const complexWorkflow = sequence("main", [
  leaf("step1", async (i: string) => i + "-step1"),
  sequence(
    "retry-section",
    [
      leaf("risky-operation", async (i: string) => {
        // May fail, will retry
        return riskyCall(i);
      }),
    ],
    { type: "retry", maxAttempts: 3 }
  ),
  leaf("step3", async (i: string) => i + "-step3"),
]);
```

## API

### `leaf(name, task)`

Create a leaf task node.

- `name`: Task identifier
- `task`: Async function `(input: I) => Promise<O>`

### `sequence(name, children, strategy?)`

Execute tasks sequentially, passing output to next input.

- `name`: Sequence identifier
- `children`: Array of TaskNode
- `strategy`: Optional execution strategy

### `parallel(name, children, strategy?)`

Execute tasks concurrently with same input.

- `name`: Parallel identifier
- `children`: Array of TaskNode
- `strategy`: Optional execution strategy

### `squashTree(rootNode)`

Squash all task nodes into single executable leaf node.

Returns `LeafNode` with `.task(input)` method.

## Execution Strategies

### Retry

```typescript
{ type: "retry", maxAttempts: number }
```

Automatically retry failed tasks.

### Timeout

```typescript
{ type: "timeout", duration: number }
```

Cancel tasks exceeding duration (milliseconds).

### Transactional

```typescript
{
  type: "transactional";
}
```

Placeholder for transactional execution (rollback support).

## Architecture

This library implements:

- **Code as Data**: Tasks are AST nodes that can be transformed
- **BFS Flattening**: Converts tree structure to linear execution chain
- **Strategy Pattern**: Execution behaviors as metadata
- **Lazy Evaluation**: Build once, execute multiple times

## License

MIT
