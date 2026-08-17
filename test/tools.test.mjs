import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import test from "node:test";

import { registerLexmountTools } from "../lib/tools.js";

function registerWith(runtime) {
  const definitions = [];
  registerLexmountTools(
    { tools: { register: (definition) => definitions.push(definition) } },
    runtime,
  );
  return definitions;
}

const execution = { signal: new AbortController().signal };

test("registers and executes all 31 definitions through the runner", async () => {
  const calls = [];
  const definitions = registerWith({
    runner: {
      run: async (argv, signal) => {
        calls.push({ argv, signal });
        return { clicked: true };
      },
    },
    attachments: { saveImage: async () => assert.fail("unexpected screenshot") },
  });

  assert.equal(definitions.length, 31);
  const click = definitions.find((definition) => definition.name === "lexmount_browser_click");
  assert.ok(click);
  assert.deepEqual(
    await click.execute({ session_id: "session-1", selector: "button" }, execution),
    { clicked: true },
  );
  assert.deepEqual(calls[0].argv, [
    "action",
    "click",
    "--session-id",
    "session-1",
    "--selector",
    "button",
  ]);
  assert.equal(calls[0].signal, execution.signal);
  assert.equal(click.presentCall({ session_id: "session-1", selector: "button" }).kind, "execute");
  assert.equal(click.presentCall({}), undefined);
});

test("stores a screenshot as an image attachment and removes its temporary file", async () => {
  let screenshotPath;
  let savedImage;
  const attachment = {
    attachmentId: "sha256:fixture",
    mediaType: "image/png",
    bytes: 7,
    width: 1,
    height: 1,
    name: "screenshot.png",
  };
  const definitions = registerWith({
    runner: {
      run: async (argv) => {
        screenshotPath = argv[argv.indexOf("--path") + 1];
        await writeFile(screenshotPath, Buffer.from("fixture"));
        return { path: screenshotPath, bytes: 7 };
      },
    },
    attachments: {
      saveImage: async (input) => {
        savedImage = input;
        return attachment;
      },
    },
  });
  const screenshot = definitions.find(
    (definition) => definition.name === "lexmount_browser_screenshot",
  );
  assert.ok(screenshot);
  const result = await screenshot.execute({ session_id: "session-1" }, execution);
  assert.equal(savedImage.mediaType, "image/png");
  assert.equal(savedImage.name, "screenshot.png");
  assert.equal(savedImage.data.toString(), "fixture");
  assert.deepEqual(result.attachment, attachment);
  assert.deepEqual(result.result, { bytes: 7 });
  await assert.rejects(access(screenshotPath));

  const content = screenshot.output.render({ session_id: "session-1" }, result);
  assert.equal(content[0].type, "image");
  assert.deepEqual(content[0].attachment, attachment);
  assert.equal(content[1].type, "text");
});
