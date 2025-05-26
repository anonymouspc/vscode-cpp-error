const vscode = require('vscode');
const fs = require('fs');

function activate(context) {
    context.subscriptions.push(errorView);
    context.subscriptions.push(errorUpdate);
    context.subscriptions.push(errorJump);
    context.subscriptions.push(errorAutoUpdate);
    context.subscriptions.push(errorAutoFocus)
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}




class ErrorList {
    constructor() {
        this.data = []
        this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    }

    getTreeItem(errorEntry) {
        return {
            label: errorEntry.message,
            command: {
                command: 'errorJump',
                arguments: [errorEntry]
            },
            iconPath: errorEntry.message.trim().startsWith('fatal error:') || 
                      errorEntry.message.trim().startsWith('error:')       ? new vscode.ThemeIcon('error') :
                      errorEntry.message.trim().startsWith('warning:')     ? new vscode.ThemeIcon('warning') :
                      errorEntry.message.trim().startsWith('note:')        ? new vscode.ThemeIcon('chevron-right') :
                                                                             new vscode.ThemeIcon('ellipsis'),
            collapsibleState: errorEntry.detail.length != 0 ? vscode.TreeItemCollapsibleState.Collapsed :
                                                              vscode.TreeItemCollapsibleState.None
        }
    }

    getChildren(errorEntry) {
        if (errorEntry == undefined) // Top tree.
            return this.data;
        else
            return errorEntry.detail;
    }

    refresh() {
        this.onDidChangeTreeDataEmitter.fire();
    }
}

class ErrorEntry {
  constructor(file, line, column, message) {
      this.file = file;
      this.line = line;
      this.column = column;
      this.message = message;
      this.detail = [];
  }
}



const errorList = new ErrorList();

const errorView = vscode.window.createTreeView('errorView', {
    treeDataProvider: errorList
});

const errorUpdate = vscode.commands.registerCommand('errorUpdate', () => {
    parseErrorList();
    formatErrorList();
    errorList.refresh();
});

const errorJump = vscode.commands.registerCommand('errorJump', errorEntry => {
    let file = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/${errorEntry.file}`;
    if (!fs.existsSync(file)) // Not a relative path
        file = errorEntry.file;
    
    vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false }).then(editor => {
        const position = new vscode.Position(errorEntry.line-1, Math.max(errorEntry.column-1, 0));
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(position, position);
    });
});

const errorAutoUpdate = errorView.onDidChangeVisibility(view => {
    if (view.visible)
        vscode.commands.executeCommand('errorUpdate')
});

const errorAutoFocus = vscode.tasks.onDidEndTask(e => {
    if (e.execution && e.execution.task.name.includes('build') && e.exitCode != 0) {
        vscode.commands.executeCommand('errorUpdate');
        if (errorList.data.length > 0)
            vscode.commands.executeCommand('errorView.focus');
    }
});






function parseErrorList() {
    errorList.data = []
    let filename = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/bin/log.txt`;
    fs.readFileSync(filename, 'utf-8').split('\n').forEach(line => {
        let error = parseErrorLine(line);
        if (error != null)
            errorList.data.push(error);
    });
}

function parseErrorLine(line) { 
    // Remove color
    line = line.replace(/\x1b\[[0-9;]+m/g, '');

    // 123 | source.code(raw)
    // +++ |+#include <iostream>
    //     |          ^~~~~~~~~~
    // [[empty-line]]
    if (line.match(/\s*[0-9]+\s*\|.*/) || 
        line.match(/\s*[\+]+\s*\|.*/) ||
        line.match(/\s+\|[\s^~]+/) || 
        String(line).trim() == '')
        return null;

    let match = [];
    
    // In file included from path/to/file:12,
    match = line.match(/In file included from ([A-Z]:[^:]*|[^:]+):(\d+)(?:,|:)/)
    if (match)
        return new ErrorEntry(match[1], match[2], 1, match[0]);

    //                  from path/to/file:34:
    match = line.match(/                 from ([A-Z]:[^:]*|[^:]+):(\d+)(?:,|:)/)
    if (match)
        return new ErrorEntry(match[1], match[2], 1, match[0]);

    // In static member function '__builtin_memcpy',
    match = line.match(/In .*/)
    if (match)
        return null;

    //     inlined from 'constexpr function(args)' at path/to/file:12:34,
    match = line.match(/    inlined from '(?:[^']*)' at ([A-Z]:[^:]*|[^:]+):(\d+):(\d+)(?:,|:)/)
    if (match)
        return new ErrorEntry(match[1], match[2], match[3], match[0]);

    // path/to/file:12:34: error: message...
    match = line.match(/([A-Z]:[^:]*|[^:]+):(\d+):(\d+):(.*)/); 
    if (match)
        return new ErrorEntry(match[1], match[2], match[3], match[4]);

    // path/to/file:12: error: message...
    match = line.match(/([A-Z]:[^:]*|[^:]+):(\d+):(.*)/);
    if (match)
        return new ErrorEntry(match[1], match[2], 1, match[3]);

    // path/to/file: In instantiation of...
    match = line.match(/([A-Z]:[^:]*|[^:]+):(.*)/);
    if (match)
        return new ErrorEntry(match[1], 1, 1, match[2]);

    // Unrecognized
    console.log(`Failed to parse "${line}"`);
    return null
}

function formatErrorList() {
    let index           = 0;
    let target_index    = 0;
    let prefix_indecies = [];

    while (index < errorList.data.length) {
        if (errorList.data[index].message.trim().startsWith("fatal error:") ||
            errorList.data[index].message.trim().startsWith("error:")       ||
            errorList.data[index].message.trim().startsWith("warning:")) {
                if (prefix_indecies.length != 0) {
                    for (prefix_index of prefix_indecies) {
                        errorList.data[index].detail.push(errorList.data[prefix_index]);
                        errorList.data.splice(prefix_index, 1);
                        --index;
                        prefix_indecies.forEach(idx => { --idx; });
                    }
                    prefix_indecies = [];
                }
                target_index = index;
            }
                
        else if (errorList.data[index].message.trim().startsWith("note:")) {
            errorList.data[target_index].detail.push(errorList.data[index]);
            errorList.data.splice(index, 1);
            --index;
        }
        else 
            prefix_indecies.push(index);

        ++index;
    }
}