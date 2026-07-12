import { describe, it, expect } from "vitest";
import { configSchema } from "./schema.js";

describe("configSchema", () => {
  it("fills defaults from an empty object", () => {
    const cfg = configSchema.parse({});
    expect(cfg.baseBranch).toBe("main");
    expect(cfg.ai.enabled).toBe(false);
    expect(cfg.risk.failThreshold).toBe(70);
    expect(cfg.output.dir).toBe(".changeguard");
  });

  it("accepts a realistic config", () => {
    const cfg = configSchema.parse({
      baseBranch: "develop",
      sensitivePaths: [{ pattern: "src/auth/**", risk: 20, category: "authentication" }],
      ai: { enabled: true, provider: "openai", minimumConfidence: 0.8 }
    });
    expect(cfg.baseBranch).toBe("develop");
    expect(cfg.sensitivePaths[0]?.risk).toBe(20);
    expect(cfg.ai.provider).toBe("openai");
  });

  it("rejects an out-of-range threshold", () => {
    const res = configSchema.safeParse({ risk: { failThreshold: 200 } });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown ai provider", () => {
    const res = configSchema.safeParse({ ai: { provider: "anthropic" } });
    expect(res.success).toBe(false);
  });
});
