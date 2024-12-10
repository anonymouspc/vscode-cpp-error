const vscode = require('vscode');

function activate(context) {
    // 创建一个新的问题面板（类似于 "Problems" 面板）
    const problemsPanel = vscode.window.createWebviewPanel(
        'gccProblems', // Panel ID
        'GCC Problems', // Panel Title
        vscode.ViewColumn.Beside, // 显示在侧边
        {
            enableScripts: true, // 启用 JS
            localResourceRoots: [] // 可以配置本地资源
        }
    );

    // 捕获 GCC 编译器输出并按照顺序显示
    vscode.tasks.onDidEndTaskProcess((e) => {
        const gccOutput = e.exitCode === 0 ? "" : e.execution.task.output; // 假设 GCC 输出是任务输出的一部分

        // 解析 GCC 错误输出 (简单示例，你可以做更复杂的处理)
        const problemMatches = gccOutput.match(/([^:]+):(\d+):(\d+):\s*(.*)/g);
        const problems = problemMatches ? problemMatches.map(match => {
            const [file, line, column, message] = match.split(':');
            return { file, line, column, message };
        }) : [];

        // 在 Webview 中更新显示问题
        problemsPanel.webview.html = generateHTMLForProblems(problems);
    });

    // 注册命令以打开问题面板
    let disposable = vscode.commands.registerCommand('extension.showGCCProblems', function () {
        problemsPanel.reveal(vscode.ViewColumn.Beside);
    });

    context.subscriptions.push(disposable);
}

function generateHTMLForProblems(problems) {
    let html = '<html><body>';
    problems.forEach(problem => {
        html += `<div><strong>${problem.file}:${problem.line}:${problem.column}</strong> - ${problem.message}</div>`;
    });
    html += '</body></html>';
    return html;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
