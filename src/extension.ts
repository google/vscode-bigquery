// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use strict";
import * as vscode from "vscode";
import { BigQuery } from "@google-cloud/bigquery";
import { stringify as toCSV } from "csv-stringify";
import EasyTable from "easy-table";
import { tenderize } from "tenderizer";
import { flatten } from "flat";

type Output = {
  show: (preserveFocus: boolean) => void;
  appendLine: (value: string) => void;
};

type Config = {
  keyFilename: string;
  projectId: string;
  useLegacySql: boolean;
  location: string;
  maximumBytesBilled?: string;
  preserveFocus: boolean;
  outputFormat: OutputFormat;
  prettyPrintJSON: boolean;
};

type OutputFormat = "json" | "csv" | "table";

export async function activate(ctx: vscode.ExtensionContext) {
  try {
    const configSection = "bigquery";
    const config: Config = {
      keyFilename: "",
      projectId: "",
      useLegacySql: false,
      location: "US",
      preserveFocus: true,
      outputFormat: "json",
      prettyPrintJSON: true,
    };
    await readConfig(configSection, config);

    // Register all available commands and their actions.
    // CommandMap describes a map of extension commands (defined in package.json)
    // and the function they invoke.
    new Map<string, () => void>([
      ["extension.runAsQuery", wrap(runAsQuery, config)],
      ["extension.runSelectedAsQuery", wrap(runSelectedAsQuery, config)],
      ["extension.dryRun", wrap(dryRun, config)],
    ]).forEach((action, name) => {
      ctx.subscriptions.push(vscode.commands.registerCommand(name, action));
    });

    // Listen for configuration changes and trigger an update, so that users don't
    // have to reload the VS Code environment after a config update.
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (!event.affectsConfiguration(configSection)) {
          return;
        }

        await readConfig(configSection, config);
      })
    );
  } catch (err) {
    vscode.window.showErrorMessage(`${err}`);
  }
}

export function deactivate() {}

async function readConfig(section: string, config: Config): Promise<void> {
  try {
    const c = vscode.workspace.getConfiguration(section);
    config.keyFilename = c.get<string>("keyFilename") ?? config.keyFilename;
    config.projectId = c.get<string>("projectId") ?? config.projectId;
    config.useLegacySql = c.get<boolean>("useLegacySql") ?? config.useLegacySql;
    config.location = c.get<string>("location") ?? config.location;
    config.maximumBytesBilled =
      c.get<string>("maximumBytesBilled") ?? config.maximumBytesBilled;
    config.preserveFocus =
      c.get<boolean>("preserveFocus") ?? config.preserveFocus;
    config.outputFormat =
      c.get<OutputFormat>("outputFormat") ?? config.outputFormat;
    config.prettyPrintJSON =
      c.get<boolean>("prettyPrintJSON") ?? config.prettyPrintJSON;
  } catch (e) {
    throw new Error(`failed to read config: ${e}`);
  }
}

function wrap(
  fn: (
    editor: vscode.TextEditor,
    config: Config,
    output: vscode.OutputChannel
  ) => void,
  config: Config
): () => void {
  const output = vscode.window.createOutputChannel("BigQuery");
  return () => {
    try {
      if (!vscode.window.activeTextEditor) {
        throw new Error("no active text editor");
      }
      fn(vscode.window.activeTextEditor, config, output);
    } catch (err) {
      vscode.window.showErrorMessage(`${err}`);
    }
  };
}

function runAsQuery(
  textEditor: vscode.TextEditor,
  config: Config,
  output: Output
): void {
  query(getQueryText(textEditor), config, output);
}

function runSelectedAsQuery(
  textEditor: vscode.TextEditor,
  config: Config,
  output: vscode.OutputChannel
): void {
  query(getQueryText(textEditor, true), config, output);
}

function dryRun(
  textEditor: vscode.TextEditor,
  config: Config,
  output: vscode.OutputChannel
): void {
  query(getQueryText(textEditor), config, output, true);
}

/**
 * @param queryText
 * @param isDryRun Defaults to False.
 */
async function query(
  queryText: string,
  config: Config,
  output: Output,
  isDryRun?: boolean
): Promise<any> {
  let client = new BigQuery({
    keyFilename: config.keyFilename,
    projectId: config.projectId,
  });

  try {
    const data = await client.createQueryJob({
      query: queryText,
      location: config.location,
      maximumBytesBilled: config.maximumBytesBilled,
      useLegacySql: config.useLegacySql,
      dryRun: !!isDryRun,
    });

    const job = data[0];
    const id = job.id;
    if (!id) {
      throw new Error(`no job ID`);
    }
    const jobIdMessage = `BigQuery job ID: ${job.id}`;
    if (isDryRun) {
      vscode.window.showInformationMessage(`${jobIdMessage} (dry run)`);
      let totalBytesProcessed = job.metadata.statistics.totalBytesProcessed;
      writeDryRunSummary(id, totalBytesProcessed, config, output);
      return null;
    }
    vscode.window.showInformationMessage(jobIdMessage);

    try {
      const d = await job.getQueryResults({
        autoPaginate: true,
      });
      if (d) {
        writeResults(id, d[0], config, output);
      }
    } catch (err) {
      output.show(config.preserveFocus);
      output.appendLine(`Failed to get results: ${err}`);
    }
  } catch (err) {
    output.show(config.preserveFocus);
    output.appendLine(`Failed to query BigQuery: ${err}`);
    return null;
  }
}

function writeResults(
  jobId: string,
  rows: Array<any>,
  config: Config,
  output: Output
): void {
  output.show(config.preserveFocus);
  output.appendLine(`Results for job ${jobId}:`);

  let format = config.outputFormat.toString().toLowerCase();

  switch (format) {
    case "csv":
      toCSV(rows, (err?: Error, res?: string) => {
        if (res) {
          output.appendLine(res);
        }
      });

      break;
    case "table":
      output.appendLine(table(rows));
      break;
    default:
      let spacing = config.prettyPrintJSON ? "  " : "";
      rows.forEach((row) => {
        output.appendLine(
          JSON.stringify(flatten(row, { safe: true }), null, spacing)
        );
      });
  }
}

export function table(rows: Array<any>): string {
  const t = new EasyTable();
  rows.forEach((row) => {
    tenderize(row).forEach((o) => {
      Object.keys(o).forEach((key) => t.cell(key, o[key]));
      t.newRow();
    });
  });
  return t.toString();
}

function writeDryRunSummary(
  jobId: string,
  numBytesProcessed: string,
  config: Config,
  output: Output
) {
  output.show(config.preserveFocus);
  output.appendLine(`Results for job ${jobId} (dry run):`);
  output.appendLine(`Total bytes processed: ${numBytesProcessed}`);
  output.appendLine(``);
}

function getQueryText(
  editor: vscode.TextEditor,
  onlySelected?: boolean
): string {
  if (!editor) {
    throw new Error("No active editor window was found");
  }

  // Only return the selected text
  if (onlySelected) {
    let selection = editor.selection;
    if (selection.isEmpty) {
      throw new Error("No text is currently selected");
    }

    return editor.document.getText(selection).trim();
  }

  let text = editor.document.getText().trim();
  if (!text) {
    throw new Error("The editor window is empty");
  }

  return text;
}
