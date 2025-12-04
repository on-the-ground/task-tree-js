export type Task<I, O> = (i: I) => Promise<O>;

// Execution Strategy
export type Strategy =
  | { type: "retry"; maxAttempts: number }
  | { type: "transactional" }
  | { type: "timeout"; duration: number };

// Strategy Marker
type StrategyMarker = {
  markerType: "start" | "end";
  strategy: Strategy;
};

// AST 노드 타입
export type LeafNode<I, O> = {
  nodeType: "leaf";
  task: Task<I, O>;
  name: string;
};

export type TaskNode<I, O> =
  | LeafNode<I, O>
  | {
      nodeType: "sequence";
      children: TaskNode<any, any>[];
      name: string;
      strategy?: Strategy;
    }
  | {
      nodeType: "parallel";
      children: TaskNode<I, any>[];
      name: string;
      strategy?: Strategy;
    };

// Task 구조 DSL
export function leaf<I, O>(name: string, task: Task<I, O>): TaskNode<I, O> {
  return { nodeType: "leaf", task, name };
}

export function sequence<I, O>(
  name: string,
  children: TaskNode<any, any>[],
  strategy?: Strategy
): TaskNode<I, O> {
  return { nodeType: "sequence", children, name, strategy };
}

export function parallel<I, O>(
  name: string,
  children: TaskNode<I, any>[],
  strategy?: Strategy
): TaskNode<I, O> {
  return { nodeType: "parallel", children, name, strategy };
}

function isEveryLeaf(
  queue: (TaskNode<any, any> | StrategyMarker)[]
): queue is (LeafNode<any, any> | StrategyMarker)[] {
  return queue.every(
    (node) => "markerType" in node || node.nodeType === "leaf"
  );
}

export class ExecutableLeafTasks {
  private constructor(
    readonly chain: (LeafNode<any, any> | StrategyMarker)[]
  ) {}

  static align(
    queue: (LeafNode<any, any> | StrategyMarker)[],
    startMarker: TaskNode<any, any> | StrategyMarker
  ): ExecutableLeafTasks {
    const startIndex = queue.findIndex((n) => n === startMarker);
    if (startIndex === -1) throw new Error("fail to find marker"); // 못찾으면 throw
    return new ExecutableLeafTasks([
      ...queue.slice(startIndex),
      ...queue.slice(0, startIndex),
    ]);
  }

  execute = async <I, O>(input: I): Promise<O> => {
    let result: Promise<any> = Promise.resolve(input);
    const strategyStack: Strategy[] = [];

    for (const item of this.chain) {
      if ("markerType" in item) {
        // Strategy marker
        if (item.markerType === "start") {
          strategyStack.push(item.strategy);
        } else {
          strategyStack.pop();
        }
      } else {
        // Leaf node
        const leafNode = item;
        const currentStrategy = strategyStack[strategyStack.length - 1];

        if (currentStrategy) {
          result = this.applyStrategy(result, leafNode, currentStrategy);
        } else {
          result = result.then(leafNode.task);
        }
      }
    }

    return result as Promise<O>;
  };

  private async applyStrategy(
    promise: Promise<any>,
    leafNode: LeafNode<any, any>,
    strategy: Strategy
  ): Promise<any> {
    switch (strategy.type) {
      case "retry":
        return promise.then((input) =>
          this.retryTask(leafNode.task, input, strategy.maxAttempts)
        );
      case "timeout":
        return promise.then((input) =>
          this.timeoutTask(leafNode.task, input, strategy.duration)
        );
      case "transactional":
        // Transactional은 일단 기본 실행으로 (실제로는 rollback 메커니즘 필요)
        return promise.then(leafNode.task);
      default:
        return promise.then(leafNode.task);
    }
  }

  private async retryTask<I, O>(
    task: Task<I, O>,
    input: I,
    maxAttempts: number
  ): Promise<O> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await task(input);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async timeoutTask<I, O>(
    task: Task<I, O>,
    input: I,
    duration: number
  ): Promise<O> {
    return Promise.race([
      task(input),
      new Promise<O>((_, reject) =>
        setTimeout(() => reject(new Error("Task timeout")), duration)
      ),
    ]);
  }

  // Strategy wrapper: start marker -> business logic -> end marker
  private static withStrategy(
    node: { strategy?: Strategy; name: string },
    queue: (TaskNode<any, any> | StrategyMarker)[],
    startMarker: TaskNode<any, any> | StrategyMarker,
    isRoot: boolean,
    businessLogic: () => TaskNode<any, any> | LeafNode<any, any>
  ): TaskNode<any, any> | StrategyMarker | LeafNode<any, any> {
    // Start marker
    let startStrategyMarker: StrategyMarker | null = null;
    if (node.strategy) {
      startStrategyMarker = {
        markerType: "start",
        strategy: node.strategy,
      };
      queue.push(startStrategyMarker);
    }

    // Business logic
    const target = businessLogic();

    // End marker
    if (node.strategy) {
      const endMarker: StrategyMarker = {
        markerType: "end",
        strategy: node.strategy,
      };
      queue.push(endMarker);
    }

    // Return new startMarker
    if (startStrategyMarker) {
      return isRoot ? startStrategyMarker : startMarker;
    } else {
      return isRoot ? target : startMarker;
    }
  }

  // Flatten: AST를 BFS로 순회하며 모든 구조 노드를 leaf task들로 평탄화
  static flatten<I, O>(root: TaskNode<I, O>): ExecutableLeafTasks {
    const queue: (TaskNode<any, any> | StrategyMarker)[] = [root];
    let startMarker: TaskNode<any, any> | StrategyMarker = root;

    while (!isEveryLeaf(queue)) {
      const node = queue.shift()!;

      if ("markerType" in node) {
        queue.push(node);
        continue;
      }

      switch (node.nodeType) {
        case "leaf":
          queue.push(node);
          break;

        case "sequence":
          const seqStartMarker = this.withStrategy(
            node,
            queue,
            startMarker,
            node === startMarker,
            () => {
              queue.push(...node.children);
              return node.children[0];
            }
          );
          if (node === startMarker) {
            startMarker = seqStartMarker;
          }
          break;

        case "parallel":
          const parallelLeaf: LeafNode<any, any> = leaf(node.name, (input) => {
            const childPromises = node.children.map((child) =>
              ExecutableLeafTasks.flatten(child).execute(input)
            );
            return Promise.all(childPromises)
              .then(innerZip(node.children.map((c) => c.name)))
              .then(Object.fromEntries);
          }) as LeafNode<any, any>;

          const parStartMarker = this.withStrategy(
            node,
            queue,
            startMarker,
            node === startMarker,
            () => {
              queue.push(parallelLeaf);
              return parallelLeaf;
            }
          );
          if (node === startMarker) {
            startMarker = parStartMarker;
          }
          break;
      }
    }

    return ExecutableLeafTasks.align(queue, startMarker);
  }
}

export const merge = <I, O>(rootNode: TaskNode<I, O>): LeafNode<I, O> => ({
  nodeType: "leaf",
  task: ExecutableLeafTasks.flatten(rootNode).execute,
  name: rootNode.name,
});

const innerZip =
  <T>(arr1: T[]) =>
  <U>(arr2: U[]) => {
    const len = arr1.length > arr2.length ? arr2.length : arr1.length;
    const ret = [];
    for (let i = 0; i < len; i++) {
      ret.push([arr1[i], arr2[i]] as const);
    }
    return ret;
  };
