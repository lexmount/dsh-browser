# DSH 0.1.0-rc.6 integration gaps

This document records host limitations discovered against the installed `@deepseek-ai/dsh@0.1.0-rc.6` implementation. They are not silently described as completed plugin features.

## 1. Native tools have no side-effect annotation field

The RC.6 native `ToolSchema` contains only `name`, `description`, and `parameters`. `defineTool` adds execution, output, timeout, concurrency, and presentation callbacks, but no `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, or equivalent permission metadata.

`presentCall().kind` controls UI presentation only. It does not invoke `ctx.approval` and does not enforce a permission decision.

Impact:

- the plugin accurately labels calls in descriptions and UI cards;
- the WorkBuddy-equivalent model safety guidance is registered in the system prompt;
- DSH does not automatically ask for approval solely because a Lexmount tool navigates, clicks, fills, evaluates JavaScript, or sends raw CDP;
- the architecture-review statement that these calls "carry DSH side-effect metadata" is not implementable on RC.6.

DSH does expose an explicit `ctx.approval.request()` service. Adding an unconditional request to every side-effect tool is not equivalent to metadata: the headless `never` policy rejects every request rather than auto-allowing it, which would make unattended browser use fail. Choosing a plugin-owned approval policy therefore requires a separate product decision instead of being hidden in the adapter.

## 2. Generic binary tool-result attachments do not exist

RC.6 `ContentBlockMap` supports text, reasoning, raster image, tool-call, and tool-result blocks. `ctx.attachments` persists raster images only.

Impact:

- screenshots are returned as real DSH image attachments;
- PDF and browser download bytes cannot be emitted as a generic attachment block;
- PDF/download tools retain browser-cli's host output path and return it as text/JSON;
- files inside the DSH workspace can still become clickable deliverables when the model references their paths in the final response, but that is a Web UI final-response feature rather than a tool-result attachment.

The architecture-review requirement to map screenshots, PDFs, and downloads uniformly to DSH attachments is only partially implementable on RC.6.

## 3. Host result policies can still transform a full snapshot

The plugin returns the complete browser-cli snapshot without truncation or pagination. The default DSH profile separately mounts spill, result-pruning, and conversation-compaction policies. Those host policies can change what ultimately remains inline for the model or durable log.

This is host behavior, not Node adapter truncation. Validation must distinguish the raw tool result from the post-policy model-visible result.

## 4. Version compatibility is pre-release compatibility

The package is implemented and tested against RC.6 services and declares peer ranges below `0.2.0`. DSH is still a release candidate; a semver-compatible RC update can change native tool or Bundle behavior. Release promotion therefore requires explicit regression against every supported DSH version rather than relying only on the declared range.
