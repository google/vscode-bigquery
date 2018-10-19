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
const BigQuery = require("@google-cloud/bigquery");
const toCSV = require("csv-stringify");
const easyTable = require("easy-table");
const flatten = require("flat");

const configPrefix = "bigquery";
let config: vscode.WorkspaceConfiguration;
let output = vscode.window.createOutputChannel("BigQuery");

// CommandMap describes a map of extension commands (defined in package.json)
// and the function they invoke.
type CommandMap = Map<string, () => void>;
let commands: CommandMap = new Map<string, () => void>([
  ["extension.runAsQuery", runAsQuery],
  ["extension.runSelectedAsQuery", runSelectedAsQuery],
  ["extension.dryRun", dryRun]
]);

export function activate(ctx: vscode.ExtensionContext) {
  config = readConfig();

  // Register all available commands and their actions.
  commands.forEach((action, name) => {
    ctx.subscriptions.push(vscode.commands.registerCommand(name, action));
  });

  // Listen for configuration changes and trigger an update, so that users don't
  // have to reload the VS Code environment after a config update.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration(configPrefix)) {
        return;
      }

      config = readConfig();
    })
  );
}

//
function readConfig(): vscode.WorkspaceConfiguration {
  try {
    return vscode.workspace.getConfiguration(configPrefix);
  } catch (e) {
    vscode.window.showErrorMessage(`failed to read config: ${e}`);
  }
}

/**
 * @param queryText
 * @param isDryRun Defaults to False.
 */
function query(queryText: string, isDryRun?: boolean): Promise<any> {
  let client = BigQuery({
    keyFilename: config.get("keyFilename"),
    projectId: config.get("projectId"),
    email: config.get("email")
  });

  let id: string;
  let job = client
    .createQueryJob({
      query: queryText,
      location: config.get("location"),
      maximumBytesBilled: config.get("maximumBytesBilled"),
      useLegacySql: config.get("useLegacySql"),
      dryRun: !!isDryRun
    })
    .then(data => {
      let job = data[0];
      id = job.id;
      const jobIdMessage = `BigQuery job ID: ${job.id}`;
      if (isDryRun) {
        vscode.window.showInformationMessage(`${jobIdMessage} (dry run)`);
        let totalBytesProcessed = job.metadata.statistics.totalBytesProcessed;
        writeDryRunSummary(id, totalBytesProcessed);
        return null;
      }
      vscode.window.showInformationMessage(jobIdMessage);

      return job.getQueryResults({
        autoPaginate: true
      });
    })
    .catch(err => {
      vscode.window.showErrorMessage(`Failed to query BigQuery: ${err}`);
      return null;
    });

  return job
    .then(data => {
      if (data) {
        writeResults(id, data[0]);
      }
    })
    .catch(err => {
      vscode.window.showErrorMessage(`Failed to get results: ${err}`);
    });
}

function writeResults(jobId: string, rows: Array<any>): void {
  output.show();
  output.appendLine(`Results for job ${jobId}:`);

  let format = config
    .get("outputFormat")
    .toString()
    .toLowerCase();

  switch (format) {
    case "csv":
      toCSV(rows, (err, res) => {
        output.appendLine(res);
      });

      break;
    case "table":
      let t = new easyTable();

      // Collect the header names; flatten nested objects into a
      // recordname.recordfield format
      let headers = [];
      Object.keys(flatten(rows[0])).forEach(name => headers.push(name));

      rows.forEach((val, idx) => {
        // Flatten each row, and for each header (name), insert the matching
        // object property (v[name])
        let v = flatten(val, { safe: true });
        headers.forEach((name, col) => {
          t.cell(name, v[name]);
        });
        t.newRow();
      });

      output.appendLine(t.toString());

      break;
    default:
      let spacing = config.get("prettyPrintJSON") ? "  " : "";
      rows.forEach(row => {
        output.appendLine(
          JSON.stringify(flatten(row, { safe: true }), null, spacing)
        );
      });
  }
}

function writeDryRunSummary(jobId: string, numBytesProcessed: string) {
  output.show();
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

function runAsQuery(): void {
  try {
    let queryText = getQueryText(vscode.window.activeTextEditor);
    query(queryText);
  } catch (err) {
    vscode.window.showErrorMessage(err);
  }
}

function runSelectedAsQuery(): void {
  try {
    let queryText = getQueryText(vscode.window.activeTextEditor, true);
    query(queryText);
  } catch (err) {
    vscode.window.showErrorMessage(err);
  }
}

function dryRun(): void {
  try {
    let queryText = getQueryText(vscode.window.activeTextEditor);
    query(queryText, true);
  } catch(err) {
    vscode.window.showErrorMessage(err);
  }
}

export function deactivate() {}
