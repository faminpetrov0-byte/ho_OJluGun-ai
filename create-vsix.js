#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Создание VSIX пакета ho_OJluGun AI...');

// Создаем минимальные файлы для сборки
const distDir = path.join(__dirname, 'dist');
const webviewBuildDir = path.join(__dirname, 'webview-ui', 'build');

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

if (!fs.existsSync(webviewBuildDir)) {
    fs.mkdirSync(webviewBuildDir, { recursive: true });
}

// Создаем минимальный extension.js
const extensionJs = `
// ho_OJluGun AI Extension
const vscode = require('vscode');

function activate(context) {
    console.log('🚀 ho_OJluGun AI activated!');
    
    // Регистрируем тестовую команду
    let disposable = vscode.commands.registerCommand('ho-ojlugun-ai.testCommand', function () {
        vscode.window.showInformationMessage('🎯 ho_OJluGun AI works! Extension is loaded.');
    });
    
    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
`;

fs.writeFileSync(path.join(distDir, 'extension.js'), extensionJs);

// Создаем минимальный webview build
fs.writeFileSync(path.join(webviewBuildDir, 'index.js'), '// Webview build placeholder');
fs.writeFileSync(path.join(webviewBuildDir, 'index.html'), '<html><body>ho_OJluGun AI</body></html>');

console.log('✅ Файлы созданы');

// Создаем VSIX
try {
    execSync('npx vsce package --no-dependencies', { stdio: 'inherit' });
    console.log('🎉 VSIX пакет создан успешно!');
} catch (error) {
    console.error('❌ Ошибка создания VSIX:', error.message);
}