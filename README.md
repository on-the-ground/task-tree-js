# @on-the-ground/task-tree-js

Task-oriented programming DSL with lazy evaluation and execution strategies.

## Features

- 🌳 **Task Tree Structure**: Build complex workflows as composable AST nodes
- 🔄 **Lazy Evaluation**: Separate program structure from execution
- 🎯 **Pluggable Strategies**: Customizable execution strategies (retry, timeout, etc.)
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
  leafChainOf,
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

// Compile to executable function
const program = leafChainOf(workflow);

// Execute
const result = await program("start");
console.log(result);
```

### Retry Strategy

```typescript
import { retry } from "@on-the-ground/task-tree-js/sample-strategy";

const taskWithRetry = sequence(
  "api-call",
  [
    leaf("fetch-data", async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed");
      return response.json();
    }),
  ],
  retry(3) // Retry up to 3 times
);

const program = leafChainOf(taskWithRetry);
const data = await program("https://api.example.com");
```

### Timeout Strategy

```typescript
import { timeout } from "@on-the-ground/task-tree-js/sample-strategy";

const taskWithTimeout = sequence(
  "slow-operation",
  [
    leaf("process", async (data: string) => {
      // Long running operation
      return processData(data);
    }),
  ],
  timeout(5000) // 5 seconds
);

const program = leafChainOf(taskWithTimeout);
const result = await program("input-data");
```

### Nested Strategies

```typescript
import { retry } from "@on-the-ground/task-tree-js/sample-strategy";

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
    retry(3) // Only this section will retry
  ),
  leaf("step3", async (i: string) => i + "-step3"),
]);

const program = leafChainOf(complexWorkflow);
const result = await program("input");
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

### `leafChainOf(rootNode)`

Compile task tree into an executable function.

Returns `(input: I) => Promise<O>` function.

## Execution Strategies

Strategies are higher-order functions that wrap task execution with additional behavior.

### Built-in Strategies

Import from `@on-the-ground/task-tree-js/sample-strategy`:

#### `retry(maxAttempts)`

Automatically retry failed tasks.

```typescript
import { retry } from "@on-the-ground/task-tree-js/sample-strategy";

sequence("task", [...tasks], retry(3));
```

#### `timeout(duration)`

Cancel tasks exceeding duration (milliseconds).

```typescript
import { timeout } from "@on-the-ground/task-tree-js/sample-strategy";

sequence("task", [...tasks], timeout(5000));
```

### Custom Strategies

The `Strategy` type is a higher-order function interface:

```typescript
type Strategy = <I, O>(
  prevPromise: Promise<I>,
  leaf: LeafNode<I, O>
) => Promise<O>;
```

- `prevPromise`: The promise from the previous task in the chain
- `leaf`: The current leaf node containing the task to execute
- Returns: A promise of the output type

Create your own strategies by implementing this interface:

```typescript
import { Strategy, LeafNode } from "@on-the-ground/task-tree-js";

const myStrategy: Strategy = async <I, O>(
  prevPromise: Promise<I>,
  leaf: LeafNode<I, O>
): Promise<O> => {
  return prevPromise.then(async (input) => {
    // Add custom logic: logging, caching, error handling, etc.
    console.log(`Executing: ${leaf.name}`);
    const result = await leaf.task(input);
    console.log(`Completed: ${leaf.name}`);
    return result;
  });
};
```

## Architecture

This library implements:

- **Code as Data**: Tasks are AST nodes that can be transformed
- **BFS Flattening**: Converts tree structure to linear execution chain
- **Strategy Pattern**: Execution behaviors as metadata
- **Lazy Evaluation**: Build once, execute multiple times

## License

MIT
