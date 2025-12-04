import { LeafNode } from "./task";

export const retry =
  (maxAttempts: number) =>
  async <I, O>(prevPromise: Promise<I>, leaf: LeafNode<I, O>): Promise<O> =>
    prevPromise.then(async (input) => {
      let lastError: any;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await leaf.task(input);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    });

export const timeout =
  (timeoutMs: number) =>
  async <I, O>(prevPromise: Promise<I>, leaf: LeafNode<I, O>): Promise<O> =>
    prevPromise.then((input) =>
      Promise.race([
        leaf.task(input),
        new Promise<O>((_, reject) =>
          setTimeout(() => reject(new Error("Task timeout")), timeoutMs)
        ),
      ])
    );
