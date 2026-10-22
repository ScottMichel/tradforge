import { ConfigError, OutputError, ProviderUnavailableError, ReadError } from "tradforge";
import { describe, expect, it } from "vitest";
import { AppError, describeError } from "../src/main/errors.js";

describe("describeError", () => {
  it("sends the code and the values of an error of the application", () => {
    expect(describeError(new AppError("languages-locked", { from: "en", to: "fr" }))).toEqual({
      code: "languages-locked",
      params: { from: "en", to: "fr" },
    });
  });

  it("names the kind of an error of the library, and keeps its message as detail", () => {
    const engine = describeError(new ProviderUnavailableError("cannot reach Ollama at http://localhost:11434"));
    expect(engine).toEqual({
      code: "engine-unavailable",
      params: {},
      detail: "cannot reach Ollama at http://localhost:11434",
    });
    expect(describeError(new ConfigError([{ path: "provider.model", message: "must be a text" }])).code).toBe(
      "config-invalid",
    );
    expect(describeError(new ReadError("ui.json", "invalid JSON")).code).toBe("file-unreadable");
    expect(describeError(new OutputError("would replace a source")).code).toBe("output-refused");
  });

  it("still says something for anything else", () => {
    expect(describeError(new TypeError("x is undefined"))).toEqual({
      code: "unexpected",
      params: {},
      detail: "x is undefined",
    });
    expect(describeError("plain text").detail).toBe("plain text");
  });
});
