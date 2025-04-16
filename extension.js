const vscode = require('vscode');
const fs = require('fs');

function activate(context) {

    context.subscriptions.push(errorView);
    context.subscriptions.push(errorClear);
    context.subscriptions.push(errorUpdate);
    context.subscriptions.push(errorFocus);
    context.subscriptions.push(errorJump);
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
                command: 'cpp_error.jump',
                title: '跳转到指定位置',
                arguments: [errorEntry]
            },
            iconPath: String(errorEntry.message).trim().startsWith('fatal error:') || 
                      String(errorEntry.message).trim().startsWith('error:')       ? new vscode.ThemeIcon('error') :
                      String(errorEntry.message).trim().startsWith('warning:')     ? new vscode.ThemeIcon('warning') :
                      String(errorEntry.message).trim().startsWith('note:')        ? new vscode.ThemeIcon('chevron-right') :
                                                                                     new vscode.ThemeIcon('ellipsis'),
            collapsibleState: vscode.TreeItemCollapsibleState.None, 
        };
    }

    getChildren() {
        return this.data;
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
  }
}

const errorList = new ErrorList();

const errorView = vscode.window.createTreeView('error_info', {
    treeDataProvider: errorList
});

const errorClear = vscode.tasks.onDidStartTask(e => {
    if (e.execution && e.execution.task.name.includes('build')) {
        let filename = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/bin/${e.execution.task.name.split('.')[0]}/log.txt`;
        fs.writeFileSync(filename, "", 'utf-8')
        errorList.data = [];
        errorList.refresh();
    }
});

const errorUpdate = vscode.tasks.onDidEndTask(e => {
    if (e.execution && e.execution.task.name.includes('build')) {
        let filename = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/bin/${e.execution.task.name.split('.')[0]}/log.txt`;
        fs.readFileSync(filename, 'utf-8').split('\n').forEach(line => {
            let error = parse(line);
            if (error)
                errorList.data.push(error);
        });
        errorList.refresh();
    }
});

const errorFocus = vscode.tasks.onDidEndTask(e => {
    if (e.execution && e.execution.task.name.includes('build') && e.exitCode != 0)
        if (errorList.data.length > 0)
            vscode.commands.executeCommand('error_info.focus');
});

const errorJump = vscode.commands.registerCommand('cpp_error.jump', errorEntry => {
    let file = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/${errorEntry.file}`;
    if (!fs.existsSync(file))
        file = errorEntry.file;
    
    vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false }).then(editor => {
        const position = new vscode.Position(errorEntry.line-1, Math.max(errorEntry.column-1, 0));
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(position, position);
    });
});

function parse(line) { 
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
}
