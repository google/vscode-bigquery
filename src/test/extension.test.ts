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

// import * as assert from "assert";
// import * as vscode from "vscode";
// import * as myExtension from "../extension";
// import * as path from "path";
//
// const fixturePath = path.join(__dirname, "..", "..", "test", "fixtures");

// Test editor <-> query text selection
suite("Query text tests", function() {
  // test("Query text is read correctly", () => {
  //   let uri = vscode.Uri.file(path.join(fixturePath, "test.sql"));
  //   // call getQueryText(editor, false)
  //   // check that expectations match via assert.equal
  // });
  // test("Query text from a selection matches", function() {
  //   let uri = vscode.Uri.file(path.join(fixturePath, "test.sql"));
  //   vscode.workspace.openTextDocument(uri).then(doc => {
  //     // select the text
  //     // call getQueryText(editor, true)
  //     // confirm that selection matches via assert.equal
  //   });
  // });
});

// Test that results are written correctly (table, CSV, JSON)
suite("Output results tests", function() {
  test("JSON output is as expected", () => {
    // Get query results from fixture
    // Set config to "json"
    // Pass to writeResults
    // Capture output and match via assert.equal
  });
});
