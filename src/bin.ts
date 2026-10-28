#!/usr/bin/env node
import { createRequire } from "node:module";
import { runCli } from "./cli.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
process.exitCode = await runCli(process.argv.slice(2), version);
