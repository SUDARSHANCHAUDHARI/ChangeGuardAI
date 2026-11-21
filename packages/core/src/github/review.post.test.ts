import { describe, it, expect, vi, beforeEach } from "vitest";
import { REVIEW_MARKER } from "./review.js";

// Octokit is constructed inside postPrComment, so the module is mocked rather
// than injected. Kept in its own file because vi.mock applies per file.
const state = vi.hoisted(() => ({
  comments: [] as { id: number; body: string; user: { login: string } | null }[],
  login: "sudarshan-bot",
  loginFails: false,
  updated: [] as number[],
  created: 0
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    issues = {
      listComments: "listComments",
      updateComment: async ({ comment_id }: { comment_id: number }) => {
        state.updated.push(comment_id);
        return { data: { html_url: "u" } };
      },
      createComment: async () => {
        state.created += 1;
        return { data: { id: 999, html_url: "c" } };
      }
    };
    users = {
      getAuthenticated: async () => {
        if (state.loginFails) throw new Error("403");
        return { data: { login: state.login } };
      }
    };
    paginate = async () => state.comments;
  }
}));

const { postPrComment } = await import("./review.js");
const ref = { owner: "o", repo: "r", number: 1 };

beforeEach(() => {
  state.comments = [];
  state.login = "sudarshan-bot";
  state.loginFails = false;
  state.updated = [];
  state.created = 0;
});

describe("postPrComment comment ownership", () => {
  it("does not touch a marker comment written by someone else", async () => {
    state.comments = [{ id: 7, body: `${REVIEW_MARKER}\nimpostor`, user: { login: "stranger" } }];
    const res = await postPrComment("t", ref, "body");
    expect(state.updated).toEqual([]);
    expect(state.created).toBe(1);
    expect(res.action).toBe("created");
  });

  it("updates its own marker comment", async () => {
    state.comments = [{ id: 7, body: `${REVIEW_MARKER}\nold`, user: { login: "sudarshan-bot" } }];
    const res = await postPrComment("t", ref, "body");
    expect(state.updated).toEqual([7]);
    expect(state.created).toBe(0);
    expect(res.action).toBe("updated");
  });

  it("requires the marker at the start, not merely somewhere in the body", async () => {
    state.comments = [
      { id: 8, body: `quoting the report: ${REVIEW_MARKER}`, user: { login: "sudarshan-bot" } }
    ];
    await postPrComment("t", ref, "body");
    expect(state.updated).toEqual([]);
    expect(state.created).toBe(1);
  });

  it("falls back to the Actions identity when /user is not callable", async () => {
    state.loginFails = true;
    state.comments = [
      { id: 9, body: `${REVIEW_MARKER}\nold`, user: { login: "github-actions[bot]" } }
    ];
    await postPrComment("t", ref, "body");
    expect(state.updated).toEqual([9]);
  });
});
