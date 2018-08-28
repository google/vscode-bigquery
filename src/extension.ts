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

"use strict"
import * as vscode from "vscode"
const BigQuery = require("@google-cloud/bigquery")
const toCSV = require("csv-stringify")

const configPrefix = "bigquery"
let config: vscode.WorkspaceConfiguration
let output = vscode.window.createOutputChannel("BigQuery")

export function activate(context: vscode.ExtensionContext) {
  config = readConfig()

  let disposable = vscode.commands.registerCommand(
    "extension.runAsQuery",
    runAsQuery
  )
  context.subscriptions.push(disposable)

  disposable = vscode.commands.registerCommand(
    "extension.runSelectedAsQuery",
    runSelectedAsQuery
  )
  context.subscriptions.push(disposable)
}

function readConfig(): vscode.WorkspaceConfiguration {
  try {
    return vscode.workspace.getConfiguration(configPrefix)
  } catch (e) {
    console.error(`failed to read config: ${e}`)
  }
}

function query(queryText: string): Promise<any> {
  let client = BigQuery({
    keyFilename: config.get("keyFilename"),
    projectId: config.get("projectId"),
    email: config.get("email")
  })

  let id: string
  let job = client
    .createQueryJob({
      query: queryText,
      location: config.get("location"),
      maximumBytesBilled: config.get("maximumBytesBilled"),
      useLegacySql: config.get("useLegacySql")
    })
    .then(data => {
      let job = data[0]
      id = job.id
      vscode.window.showInformationMessage(`BigQuery job ID: ${job.id}`)

      return job.getQueryResults({
        autoPaginate: true
      })
    })
    .catch(err => {
      vscode.window.showErrorMessage(`Failed to query BigQuery: ${err}`)
      return null
    })

  return job
    .then(data => {
      if (data) {
        writeResults(id, data[0])
      }
    })
    .catch(err => {
      vscode.window.showErrorMessage(`Failed to get results: ${err}`)
    })
}

function writeResults(jobId: string, rows: Array<any>): void {
  output.show()
  output.appendLine(`Results for job ${jobId}:`)

  let format = config
    .get("outputFormat")
    .toString()
    .toLowerCase()

  switch (format) {
    case "csv":
      toCSV(rows, (err, res) => {
        output.appendLine(res)
      })
      break
    default:
      output.appendLine(JSON.stringify(rows))
  }
}

function getQueryText(
  editor: vscode.TextEditor,
  onlySelected?: boolean
): string {
  if (!editor) {
    throw "No active editor window was found"
  }

  // Only return the selected text
  if (onlySelected) {
    let selection = editor.selection
    if (selection.isEmpty) {
      throw "No text is currently selected"
    }

    return editor.document.getText(selection).trim()
  }

  let text = editor.document.getText().trim()
  if (!text) {
    throw "The editor window is empty"
  }

  return text
}

function runAsQuery(): void {
  try {
    let queryText = getQueryText(vscode.window.activeTextEditor)
    query(queryText)
  } catch (err) {
    vscode.window.showErrorMessage(err)
  }
}

function runSelectedAsQuery(): void {
  try {
    let queryText = getQueryText(vscode.window.activeTextEditor, true)
    query(queryText)
  } catch (err) {
    vscode.window.showErrorMessage(err)
  }
}

export function deactivate() {}
