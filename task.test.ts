import { describe, test, expect } from "vitest";
import { leaf, sequence, parallel, leafChainOf } from "./task";
import { retry, timeout } from "./sample-strategy";

describe("Task DSL", () => {
  test("basic sequence and parallel execution", async () => {
    const program = leafChainOf(
      sequence("rootask", [
        sequence("task1_1", [
          leaf("task2_1", async (i: string) => i + "task2_1"),
          parallel("task2_2", [
            leaf("p1", async (i: string) => i + "p1"),
            leaf("p2", async (i: string) => i + "p2"),
          ]),
        ]),
        leaf("task1_2", async (i: object) => JSON.stringify(i) + "task1_2"),
      ])
    );

    const result = await program("start: ");
    expect(result).toBe(
      '{"p1":"start: task2_1p1","p2":"start: task2_1p2"}task1_2'
    );
  });

  test("retry strategy - should retry failed tasks", async () => {
    let attemptCount = 0;

    const program = leafChainOf(
      sequence(
        "root",
        [
          leaf("failing-task", async (i: string) => {
            attemptCount++;
            if (attemptCount < 3) {
              throw new Error("Simulated failure");
            }
            return i + " success!";
          }),
        ],
        retry(3)
      )
    );

    const result = await program("retry-test:");

    expect(result).toBe("retry-test: success!");
    expect(attemptCount).toBe(3);
  });

  test("timeout strategy - should timeout slow tasks", async () => {
    const program = leafChainOf(
      sequence(
        "root",
        [
          leaf("slow-task", async (i: string) => {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return i + " completed";
          }),
        ],
        timeout(1000)
      )
    );
    await expect(program("timeout-test:")).rejects.toThrow("Task timeout");
  });

  test("nested strategy - should apply retry only to inner sequence", async () => {
    let nestedAttempt = 0;

    const program = leafChainOf(
      sequence("outer", [
        leaf("task1", async (i: string) => {
          return i + "-t1";
        }),
        sequence(
          "inner-with-retry",
          [
            leaf("task2-fail", async (i: string) => {
              nestedAttempt++;
              if (nestedAttempt < 2) {
                throw new Error("Inner task failed");
              }
              return i + "-t2";
            }),
          ],
          retry(3)
        ),
        leaf("task3", async (i: string) => {
          return i + "-t3";
        }),
      ])
    );

    const result = await program("nested:");
    expect(result).toBe("nested:-t1-t2-t3");
    expect(nestedAttempt).toBe(2);
  });
});
