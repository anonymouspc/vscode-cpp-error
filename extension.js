const vscode = require('vscode');

function activate(context) {
    const errorList = new ErrorList();
    const errorView = vscode.window.createTreeView('error_info', {
        treeDataProvider: errorList
    });

    const taskBegin = vscode.tasks.onDidStartTask(e => {
        if (e.execution && e.execution.task.name.includes("compile")) {
            console.log("Start logging");
            errorList.data = [];
        }
    });

    const taskOutput = vscode.languages.onDidChangeDiagnostics(e => {
        console.log(`current ${vscode.languages.getDiagnostics().length} errors`);
        console.log(vscode.languages.getDiagnostics());
        // vscode.languages.getDiagnostics().forEach(diagnostics => {
        //     uri = diagnostics[0];
        //     console.log(uri);
        //     // diagnostics[1].forEach(diagnostic => {
        //     //     console.log(`Message logging: uri=${uri}, line=${diagnostic.range.start.line}, column=${diagnostic.range.start.character}, severity=${diagnostic.severity}, message=${diagnostic.message}`);
        //     //     errorList.data.push(new ErrorEntry(diagnostic.message));
        //     // });
        // });
    });

    const taskEnd = vscode.tasks.onDidEndTask(e => {
        if (e.execution && e.execution.task.name.includes("compile")) {
            console.log("End logging");
            errorList.refresh();
        }
    });

    context.subscriptions.push(errorView);
    context.subscriptions.push(taskBegin);
    context.subscriptions.push(taskOutput);
    context.subscriptions.push(taskEnd);
}

function deactivate() {}

class ErrorList {
    constructor() {
        this.data = []
        this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    }

    getTreeItem(element) {
        return {
            label: element.label,
            collapsibleState: vscode.TreeItemCollapsibleState.None 
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
  constructor(label) {
      this.label = label;
  }
}

module.exports = {
    activate,
    deactivate
};
