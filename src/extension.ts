import * as vscode from "vscode";
import * as dotenv from "dotenv";
import * as path from "path";
import { analyzePrompt } from "./scoring";

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "";
dotenv.config({ path: path.join(workspaceRoot, ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ─── Types ─────────────────────────────────────────────────────────────────────

type Mode = "optimize" | "explain" | "generate" | "documentation";
type Confidence = "high" | "medium" | "low";

interface AIResponse {
    improvedPrompt: string;
    explanation: string;
    feedback: string[];
    score: number;
    confidence?: Confidence;
}

interface HistoryEntry {
    original: string;
    improved: string;
    score: number;
    mode: Mode;
    timestamp: string;
}

// ─── Globals ───────────────────────────────────────────────────────────────────

let statusBarItem: vscode.StatusBarItem;
let sidebarProvider: TheoriaSidebarProvider | undefined;

// ─── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
    console.log("[Theoria] Extension activated");

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(wand) Theoria";
    statusBarItem.tooltip = "Open Theoria Prompt Refiner (Ctrl+Shift+T)";
    statusBarItem.command = "theoria.openPanel";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    sidebarProvider = new TheoriaSidebarProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("theoria.sidebarView", sidebarProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider("*", new TheoriaCodeActionProvider(), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("theoria.openPanel", () => {
            const selectedText = vscode.window.activeTextEditor
                ?.document.getText(vscode.window.activeTextEditor.selection).trim() ?? "";
            sidebarProvider?.reveal(selectedText);
        }),
        vscode.commands.registerCommand("theoria.refinePrompt", () => {
            const selectedText = vscode.window.activeTextEditor
                ?.document.getText(vscode.window.activeTextEditor!.selection).trim() ?? "";
            sidebarProvider?.reveal(selectedText);
        }),
        vscode.commands.registerCommand("theoria.refineSelection", () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const text = editor.document.getText(editor.selection).trim();
            if (!text) { vscode.window.showWarningMessage("Theoria: Select some text first."); return; }
            sidebarProvider?.reveal(text);
        })
    );
}

export function deactivate() { statusBarItem?.dispose(); }

// ─── Sidebar Provider ──────────────────────────────────────────────────────────

class TheoriaSidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _pendingPrefill?: string;

    constructor(private readonly _context: vscode.ExtensionContext) {}

    public reveal(prefillText?: string) {
        vscode.commands.executeCommand("theoria.sidebarView.focus");
        if (prefillText) {
            if (this._view) {
                this._view.webview.postMessage({ command: "prefill", text: prefillText });
            } else {
                this._pendingPrefill = prefillText;
            }
        }
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._buildHtml();

        // Send history on startup
        this._sendHistory(webviewView);

        if (this._pendingPrefill) {
            webviewView.webview.postMessage({ command: "prefill", text: this._pendingPrefill });
            this._pendingPrefill = undefined;
        }

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case "refine":
                    await this._handleRefine(msg.text, msg.mode as Mode ?? "optimize", webviewView);
                    break;
                case "copy":
                    await vscode.env.clipboard.writeText(msg.text);
                    vscode.window.showInformationMessage("Theoria: Copied to clipboard.");
                    break;
                case "replace":
                    await this._handleReplace(msg.text);
                    break;
                case "loadHistory":
                    this._sendHistory(webviewView);
                    break;
                case "clearHistory":
                    await this._context.globalState.update("theoria.history", []);
                    this._sendHistory(webviewView);
                    break;
            }
        });
    }

    private _sendHistory(view: vscode.WebviewView) {
        const history = this._getHistory();
        view.webview.postMessage({ command: "history", items: history });
    }

    private _getHistory(): HistoryEntry[] {
        return this._context.globalState.get<HistoryEntry[]>("theoria.history", []);
    }

    private _saveHistory(entry: HistoryEntry) {
        const history = this._getHistory();
        history.unshift(entry);
        if (history.length > 20) { history.pop(); }
        this._context.globalState.update("theoria.history", history);
    }

    private async _handleRefine(userInput: string, mode: Mode, view: vscode.WebviewView) {
        if (!userInput?.trim()) { return; }

        view.webview.postMessage({ command: "loading" });
        statusBarItem.text = "$(sync~spin) Theoria: Refining...";

        const apiKey = this._getApiKey();
        if (!apiKey) {
            const localScore = analyzePrompt(userInput);
            view.webview.postMessage({
                command: "result",
                original: userInput,
                improved: userInput,
                explanation: "No API key found. Add OPENROUTER_API_KEY to your .env file or Theoria settings.",
                score: localScore.score,
                breakdown: localScore.breakdown,
                feedback: localScore.feedback,
                confidence: "low",
            });
            statusBarItem.text = "$(wand) Theoria";
            return;
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/theoria-ai",
                    "X-Title": "Theoria",
                },
                body: JSON.stringify({
                    model: vscode.workspace.getConfiguration("theoria").get("model", "anthropic/claude-3-haiku"),
                    messages: [{ role: "user", content: buildSystemPrompt(userInput, mode) }],
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
            }

            const data = await response.json() as { choices?: { message?: { content?: string } }[] };
            const rawContent = data.choices?.[0]?.message?.content ?? "";
            const parsed = safeParseAIResponse(rawContent, userInput);

            // Score the IMPROVED prompt (not the original) — this fills the chips
            const improvedScore = analyzePrompt(parsed.improvedPrompt);

            // Derive confidence from score if AI didn't provide it
            const confidence: Confidence = parsed.confidence
                ?? (parsed.score >= 85 ? "high" : parsed.score >= 70 ? "medium" : "low");

            this._saveHistory({
                original: userInput,
                improved: parsed.improvedPrompt,
                score: parsed.score,
                mode,
                timestamp: new Date().toISOString(),
            });

            // Send result + updated history
            view.webview.postMessage({
                command: "result",
                original: userInput,
                improved: parsed.improvedPrompt,
                explanation: parsed.explanation,
                score: parsed.score,
                breakdown: improvedScore.breakdown,   // ← improved prompt breakdown
                feedback: improvedScore.feedback,
                confidence,
            });
            this._sendHistory(view);

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[Theoria] Error:", msg);
            const localScore = analyzePrompt(userInput);
            view.webview.postMessage({
                command: "result",
                original: userInput,
                improved: userInput,
                explanation: `Error: ${msg}`,
                score: localScore.score,
                breakdown: localScore.breakdown,
                feedback: [...localScore.feedback, `API error: ${msg}`],
                confidence: "low",
            });
        } finally {
            statusBarItem.text = "$(wand) Theoria";
        }
    }

    private async _handleReplace(text: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
            await editor.edit(b => b.replace(editor.selection, text));
        } else {
            vscode.window.showWarningMessage("Theoria: No text selected in the active editor.");
        }
    }

    private _getApiKey(): string {
        const settingsKey = vscode.workspace.getConfiguration("theoria").get<string>("openrouterApiKey", "").trim();
        if (settingsKey) { return settingsKey; }
        return process.env.OPENROUTER_API_KEY?.trim() ?? "";
    }

    private _getLogoSvg(): string {
        // Unique Theoria mark: geometric "T" + three ascending dots = refine/improve
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="22" height="22">'
            + '<rect width="36" height="36" rx="8" fill="#1a1a1d"/>'
            + '<rect x="6" y="10" width="16" height="2.5" rx="1.25" fill="#d97757"/>'
            + '<rect x="13" y="10" width="2.5" height="15" rx="1.25" fill="#d97757"/>'
            + '<circle cx="27" cy="22" r="2" fill="#b85c38"/>'
            + '<circle cx="27" cy="16.5" r="2" fill="#d97757"/>'
            + '<circle cx="27" cy="11" r="2" fill="#e8967a"/>'
            + '</svg>';
    }

    private _buildHtml(): string {
        const logoSvg = this._getLogoSvg();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Theoria</title>
  <style>
    :root {
      --bg:         #111113;
      --surface:    #1a1a1d;
      --surface2:   #222226;
      --surface3:   #2a2a2f;
      --border:     #2e2e36;
      --border-hi:  #3c3c46;
      --accent:     #4fc3f7;
      --accent2:    #7c6af7;
      --accent-dim: #142030;
      --text:       #d0d0d8;
      --text-dim:   #80808c;
      --text-mute:  #48484f;
      --green:      #4ade80;
      --orange:     #fb923c;
      --red:        #f87171;
      --green-dim:  #0f2a18;
      --orange-dim: #2a1800;
      --radius:     6px;
      --radius-lg:  10px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --mono: 'Cascadia Code', 'Fira Code', Consolas, monospace;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      font-size: 12px;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* ─── Scrollbar */
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border-hi); border-radius: 2px; }

    /* ─── Header */
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 12px 8px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 8px; }
    .logo-svg-wrap { display: flex; align-items: center; flex-shrink: 0; }
    .logo-svg-wrap svg { border-radius: 5px; }
    .header-title { font-size: 0.75em; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim); }

    /* ─── Tabs */
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      background: var(--bg);
    }
    .tab {
      flex: 1; padding: 7px 4px;
      font-size: 0.7em; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--text-mute); cursor: pointer; text-align: center;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
      user-select: none;
    }
    .tab:hover { color: var(--text-dim); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

    /* ─── Panels */
    .panel { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    .panel.active { display: flex; }
    .scroll { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }

    /* ─── Input area */
    .input-area {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      display: flex; flex-direction: column; gap: 7px;
    }
    .row { display: flex; gap: 6px; align-items: center; }
    .label { font-size: 0.64em; text-transform: uppercase; letter-spacing: 0.09em; color: var(--text-mute); font-weight: 700; }

    select {
      flex: 1; background: var(--surface2); border: 1px solid var(--border-hi);
      color: var(--text); font-family: var(--font); font-size: 0.82em;
      padding: 5px 7px; border-radius: var(--radius); outline: none; cursor: pointer;
      transition: border-color 0.15s;
    }
    select:focus { border-color: var(--accent); }
    select option { background: var(--surface2); }

    textarea {
      width: 100%; min-height: 76px; max-height: 140px;
      background: var(--surface2); border: 1px solid var(--border-hi);
      border-radius: var(--radius); color: var(--text); font-family: var(--font);
      font-size: 0.88em; line-height: 1.55; padding: 7px 9px;
      resize: vertical; outline: none; transition: border-color 0.15s;
    }
    textarea:focus { border-color: var(--accent); }
    textarea::placeholder { color: var(--text-mute); }

    .btn {
      display: flex; align-items: center; justify-content: center;
      padding: 6px 12px; border: none; border-radius: var(--radius);
      font-family: var(--font); font-size: 0.8em; font-weight: 700;
      letter-spacing: 0.04em; cursor: pointer; transition: background 0.15s, opacity 0.15s;
      white-space: nowrap;
    }
    .btn:disabled { opacity: 0.38; cursor: not-allowed; }
    .btn.primary { background: var(--accent); color: #000; width: 100%; }
    .btn.primary:hover:not(:disabled) { background: #81d4fa; }
    .btn.ghost { background: transparent; color: var(--text-dim); border: 1px solid var(--border-hi); }
    .btn.ghost:hover { background: var(--surface2); color: var(--text); }
    .btn.sm { padding: 4px 9px; font-size: 0.75em; }
    .btn.danger { color: var(--red); border-color: #5a2020; }
    .btn.danger:hover { background: #2a0e0e; }

    /* ─── Cards */
    .section-label { font-size: 0.63em; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-mute); font-weight: 700; margin-bottom: 4px; }

    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden;
    }
    .card-body {
      padding: 9px 10px; font-size: 0.85em; line-height: 1.65;
      white-space: pre-wrap; word-break: break-word; color: var(--text);
    }
    .card-body.mono { font-family: var(--mono); color: #9ecbeb; font-size: 0.82em; }
    .card.improved { border-color: #1a3a50; }
    .card-actions {
      display: flex; gap: 5px; padding: 6px 9px;
      border-top: 1px solid var(--border); background: var(--surface2);
    }

    /* ─── Explanation */
    .expl-box {
      padding: 8px 10px; background: var(--accent-dim);
      border: 1px solid #1d3f58; border-radius: var(--radius);
      font-size: 0.82em; color: #80cef0; line-height: 1.6;
    }

    /* ─── Confidence badge */
    .confidence-row { display: flex; align-items: center; gap: 6px; }
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 20px;
      font-size: 0.68em; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
    }
    .badge-dot { width: 5px; height: 5px; border-radius: 50%; }
    .badge.high { background: #0f2a1a; border: 1px solid #2a5a30; color: var(--green); }
    .badge.high .badge-dot { background: var(--green); }
    .badge.medium { background: #2a1800; border: 1px solid #5a3300; color: var(--orange); }
    .badge.medium .badge-dot { background: var(--orange); }
    .badge.low { background: #2a0e0e; border: 1px solid #5a2020; color: var(--red); }
    .badge.low .badge-dot { background: var(--red); }

    /* ─── Score */
    .score-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; }
    .score-top { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .ring-wrap { position: relative; width: 56px; height: 56px; flex-shrink: 0; }
    .ring-wrap svg { transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: var(--border-hi); stroke-width: 4; }
    .ring-fill { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1), stroke 0.4s; }
    .ring-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
    .ring-num { font-size: 1em; font-weight: 700; }
    .ring-denom { font-size: 0.52em; color: var(--text-mute); margin-top: 1px; }
    .score-right { flex: 1; }
    .score-lbl { font-size: 0.7em; font-weight: 600; color: var(--text); margin-bottom: 5px; }
    .bar-track { background: var(--border-hi); height: 4px; border-radius: 3px; overflow: hidden; margin-bottom: 5px; }
    .bar-fill { height: 100%; border-radius: 3px; transition: width 0.9s cubic-bezier(.4,0,.2,1); }
    .bar-labels { display: flex; justify-content: space-between; font-size: 0.6em; color: var(--text-mute); }

    /* ─── Breakdown chips */
    .chip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 8px; }
    .chip { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; }
    .chip.earned { border-color: #1e4428; }
    .chip-name { font-size: 0.62em; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-mute); margin-bottom: 3px; }
    .chip.earned .chip-name { color: var(--green); }
    .chip-track { background: var(--border-hi); height: 3px; border-radius: 2px; overflow: hidden; margin-bottom: 3px; }
    .chip-bar { height: 100%; border-radius: 2px; transition: width 0.7s ease; }
    .chip-val { font-size: 0.68em; font-weight: 600; }

    /* ─── Feedback */
    .fb-item {
      display: flex; gap: 6px; align-items: flex-start;
      background: var(--orange-dim); border: 1px solid #3a2200;
      border-radius: 4px; padding: 6px 8px; font-size: 0.8em; color: #fbbf7a;
      margin-bottom: 4px;
    }
    .fb-dot { width: 4px; height: 4px; background: var(--orange); border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
    .no-fb {
      display: flex; gap: 6px; align-items: center;
      background: var(--green-dim); border: 1px solid #1e4428;
      border-radius: 4px; padding: 6px 8px; font-size: 0.8em; color: #86efac;
    }
    .ok-dot { width: 5px; height: 5px; background: var(--green); border-radius: 50%; flex-shrink: 0; }

    /* ─── States */
    .state-box { display: none; }
    .state-box.active { display: block; }

    .empty-hint {
      text-align: center; padding: 40px 12px;
      color: var(--text-mute); font-size: 0.83em; line-height: 1.75;
    }
    .empty-hint strong { color: var(--text-dim); display: block; margin-bottom: 8px; font-size: 1.05em; letter-spacing: 0.04em; }

    .loading-box { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 36px 0; }
    .spinner { width: 26px; height: 26px; border: 2px solid var(--border-hi); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.75s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text { color: var(--text-dim); font-size: 0.82em; animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:0.35} 50%{opacity:1} }

    /* ─── Templates */
    .template-grid { display: flex; flex-direction: column; gap: 5px; }
    .tpl-btn {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--radius); cursor: pointer; transition: border-color 0.15s, background 0.15s;
      text-align: left;
    }
    .tpl-btn:hover { border-color: var(--border-hi); background: var(--surface3); }
    .tpl-icon { font-size: 0.9em; flex-shrink: 0; }
    .tpl-info {}
    .tpl-name { font-size: 0.78em; font-weight: 600; color: var(--text); }
    .tpl-desc { font-size: 0.7em; color: var(--text-mute); margin-top: 1px; }

    /* ─── History */
    .hist-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .hist-item {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 7px 10px; cursor: pointer;
      transition: border-color 0.15s, background 0.15s; margin-bottom: 5px;
    }
    .hist-item:hover { border-color: var(--border-hi); background: var(--surface2); }
    .hist-preview { font-size: 0.82em; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hist-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
    .hist-score { font-size: 0.68em; font-weight: 700; }
    .hist-mode { font-size: 0.65em; color: var(--text-mute); text-transform: uppercase; letter-spacing: 0.06em; }
    .hist-time { font-size: 0.6em; color: var(--text-mute); }
    .hist-empty { text-align: center; padding: 30px 12px; color: var(--text-mute); font-size: 0.82em; line-height: 1.6; }

    /* ─── Toast */
    .toast {
      position: fixed; bottom: 10px; right: 10px; left: 10px;
      background: #242428; color: var(--text);
      padding: 7px 12px; border-radius: 4px; font-size: 0.78em; font-weight: 500;
      border-left: 2px solid var(--accent); box-shadow: 0 3px 14px rgba(0,0,0,0.5);
      opacity: 0; transform: translateY(6px); transition: opacity 0.2s, transform 0.2s;
      pointer-events: none; z-index: 999;
    }
    .toast.show { opacity: 1; transform: none; }
    .toast.ok { border-left-color: var(--green); }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="logo-svg-wrap">${logoSvg}</div>
      <span class="header-title">Theoria</span>
    </div>
  </div>

  <!-- Input area -->
  <div class="input-area">
    <div class="row">
      <span class="label">Mode</span>
      <select id="mode-select">
        <option value="optimize">Optimize Prompt</option>
        <option value="explain">Explain</option>
        <option value="generate">Generate Code</option>
        <option value="documentation">Documentation</option>
      </select>
    </div>
    <textarea id="input" placeholder="Paste or type a prompt to refine...&#10;Ctrl+Enter to submit"></textarea>
    <button class="btn primary" id="btn-refine" onclick="doRefine()">Refine with AI</button>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <div class="tab active" id="tab-result" onclick="switchTab('result')">Result</div>
    <div class="tab" id="tab-templates" onclick="switchTab('templates')">Templates</div>
    <div class="tab" id="tab-history" onclick="switchTab('history')">History</div>
  </div>

  <!-- Panel: Result -->
  <div class="panel active" id="panel-result">
    <div class="scroll" id="result-scroll">
      <!-- Empty state -->
      <div class="state-box active" id="state-empty">
        <div class="empty-hint">
          <strong>Theoria — Prompt Refiner</strong>
          Type a prompt above and click Refine, or select text in the editor and press Ctrl+Shift+T.
        </div>
      </div>

      <!-- Loading state -->
      <div class="state-box" id="state-loading">
        <div class="loading-box">
          <div class="spinner"></div>
          <div class="loading-text">Refining your prompt with AI...</div>
        </div>
      </div>

      <!-- Result state -->
      <div class="state-box" id="state-result">

        <!-- Confidence + Explanation -->
        <div>
          <div class="confidence-row" style="margin-bottom:6px">
            <div class="label">Confidence</div>
            <div class="badge" id="conf-badge"><div class="badge-dot"></div><span id="conf-label">—</span></div>
          </div>
          <div class="expl-box" id="r-explanation"></div>
        </div>

        <!-- Original -->
        <div>
          <div class="section-label">Original</div>
          <div class="card"><div class="card-body" id="r-original"></div></div>
        </div>

        <!-- Improved -->
        <div>
          <div class="section-label">Refined Prompt</div>
          <div class="card improved">
            <div class="card-body mono" id="r-improved"></div>
            <div class="card-actions">
              <button class="btn ghost sm" onclick="doCopy()">Copy</button>
              <button class="btn ghost sm" onclick="doReplace()">Replace Selection</button>
            </div>
          </div>
        </div>

        <!-- Score -->
        <div class="score-card">
          <div class="score-top">
            <div class="ring-wrap">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle class="ring-bg" cx="28" cy="28" r="22"/>
                <circle class="ring-fill" id="ring-fill" cx="28" cy="28" r="22"
                  stroke-dasharray="138.2" stroke-dashoffset="138.2"/>
              </svg>
              <div class="ring-text">
                <span class="ring-num" id="ring-num">—</span>
                <span class="ring-denom">/100</span>
              </div>
            </div>
            <div class="score-right">
              <div class="score-lbl">Prompt Quality Score</div>
              <div class="bar-track"><div class="bar-fill" id="score-bar" style="width:0%"></div></div>
              <div class="bar-labels"><span>Weak</span><span>Good</span><span>Excellent</span></div>
            </div>
          </div>
          <div>
            <div class="section-label" style="margin-bottom:5px">Breakdown (refined prompt)</div>
            <div class="chip-grid" id="chip-grid"></div>
          </div>
          <div style="margin-top:8px" id="feedback-area"></div>
        </div>

      </div><!-- /state-result -->
    </div><!-- /scroll -->
  </div><!-- /panel-result -->

  <!-- Panel: Templates -->
  <div class="panel" id="panel-templates">
    <div class="scroll">
      <div class="section-label">Quick-Start Templates</div>
      <div class="template-grid" id="template-grid"></div>
    </div>
  </div>

  <!-- Panel: History -->
  <div class="panel" id="panel-history">
    <div class="scroll">
      <div class="hist-header">
        <div class="section-label">Recent Prompts</div>
        <button class="btn ghost sm danger" onclick="clearHistory()">Clear</button>
      </div>
      <div id="history-list"></div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

<script>
  const vscode = acquireVsCodeApi();
  let lastImproved = '';

  // ── Templates data
  const TEMPLATES = [
    {
      icon: '&#x1F331;',
      name: 'Beginner Concept',
      desc: 'Learn a new library or concept with simple examples',
      text: 'Acting as an expert software developer, explain the core concept of [Insert Topic, e.g., NumPy] in Python. Keep the explanation under 150 words, ensure it is easy for a beginner to understand, and provide a single real-world code example so I can utilize it later.'
    },
    {
      icon: '&#x1F4D6;',
      name: 'Intermediate Usage',
      desc: 'Understand practical implementations and best practices',
      text: 'Explain how to implement [Insert Topic, e.g., Data Aggregation] using [Insert Library, e.g., Pandas]. Provide a clear, step-by-step tutorial with practical code examples. Highlight common pitfalls to avoid and explain the best practices for production use. Ensure the tone is instructional.'
    },
    {
      icon: '&#x1F680;',
      name: 'Advanced Deep Dive',
      desc: 'Explore architecture, trade-offs, and optimization',
      text: 'Provide a deep architectural dive into [Insert Topic, e.g., Scikit-Learn Pipelines]. Analyze the performance trade-offs, memory constraints, and scalability limits. Include advanced optimization techniques, and provide a comprehensive code example demonstrating how to architect a scalable solution for this domain.'
    },
  ];

  // ── Render templates
  function renderTemplates() {
    const grid = document.getElementById('template-grid');
    grid.innerHTML = '';
    TEMPLATES.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tpl-btn';
      btn.innerHTML = \`<span class="tpl-icon">\${t.icon}</span>
        <div class="tpl-info">
          <div class="tpl-name">\${t.name}</div>
          <div class="tpl-desc">\${t.desc}</div>
        </div>\`;
      btn.onclick = () => {
        document.getElementById('input').value = t.text;
        switchTab('result');
        document.getElementById('input').focus();
        showToast('Template loaded — click Refine to process');
      };
      grid.appendChild(btn);
    });
  }
  renderTemplates();

  // ── Tabs
  function switchTab(name) {
    ['result','templates','history'].forEach(t => {
      document.getElementById('tab-'+t).classList.toggle('active', t===name);
      document.getElementById('panel-'+t).classList.toggle('active', t===name);
    });
  }

  // ── Result states
  function showResultState(id) {
    ['state-empty','state-loading','state-result'].forEach(s => {
      document.getElementById(s).classList.toggle('active', s===id);
    });
  }

  // ── Messages from extension
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'prefill') {
      document.getElementById('input').value = msg.text || '';
      document.getElementById('input').focus();
      switchTab('result');
    }
    if (msg.command === 'loading') {
      document.getElementById('btn-refine').disabled = true;
      showResultState('state-loading');
      switchTab('result');
    }
    if (msg.command === 'result') {
      renderResult(msg);
      document.getElementById('btn-refine').disabled = false;
      switchTab('result');
    }
    if (msg.command === 'history') {
      renderHistory(msg.items || []);
    }
  });

  // ── Streaming reveal effect
  function streamText(el, text, delayMs) {
    el.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
      const chunk = text.slice(i, i + 6);
      el.textContent += chunk;
      i += 6;
      if (i >= text.length) { clearInterval(interval); el.textContent = text; }
    }, delayMs);
  }

  function renderResult(d) {
    lastImproved = d.improved || '';

    // Explanation
    document.getElementById('r-explanation').textContent = d.explanation || '';

    // Confidence badge
    const conf = d.confidence || 'low';
    const badge = document.getElementById('conf-badge');
    const confLabel = document.getElementById('conf-label');
    badge.className = 'badge ' + conf;
    badge.querySelector('.badge-dot').className = 'badge-dot';
    confLabel.textContent = conf.charAt(0).toUpperCase() + conf.slice(1);

    // Original (instant)
    document.getElementById('r-original').textContent = d.original || '';

    // Improved — streaming reveal
    const improvedEl = document.getElementById('r-improved');
    streamText(improvedEl, d.improved || '', 18);

    // Score
    const score = Number(d.score) || 0;
    const color = score >= 80 ? 'var(--green)' : score >= 55 ? 'var(--orange)' : 'var(--red)';
    const circ = 138.2;
    const offset = circ - (score / 100) * circ;
    const ring = document.getElementById('ring-fill');
    ring.style.stroke = color;
    requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = offset; }));
    const numEl = document.getElementById('ring-num');
    numEl.textContent = score;
    numEl.style.color = color;
    const bar = document.getElementById('score-bar');
    bar.style.background = color;
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = score + '%'; }));

    // Breakdown chips
    const grid = document.getElementById('chip-grid');
    grid.innerHTML = '';
    const breakdown = d.breakdown || {};
    const maxPer = 20;
    Object.entries(breakdown).forEach(([key, val]) => {
      const v = Number(val);
      const earned = v > 0;
      const pct = (v / maxPer) * 100;
      const c = earned ? 'var(--green)' : 'var(--border-hi)';
      const chip = document.createElement('div');
      chip.className = 'chip' + (earned ? ' earned' : '');
      chip.innerHTML = \`<div class="chip-name">\${key}</div>
        <div class="chip-track"><div class="chip-bar" style="width:0%;background:\${c}"></div></div>
        <div class="chip-val" style="color:\${c}">\${v}/\${maxPer}</div>\`;
      grid.appendChild(chip);
      // Animate bar after paint
      requestAnimationFrame(() => requestAnimationFrame(() => {
        chip.querySelector('.chip-bar').style.width = pct + '%';
      }));
    });

    // Feedback
    const fb = document.getElementById('feedback-area');
    fb.innerHTML = '';
    const feedback = d.feedback || [];
    if (feedback.length > 0) {
      fb.innerHTML = '<div class="section-label" style="margin-bottom:5px">Suggestions</div>';
      feedback.forEach(f => {
        fb.innerHTML += \`<div class="fb-item"><div class="fb-dot"></div><span>\${f}</span></div>\`;
      });
    } else {
      fb.innerHTML = '<div class="no-fb"><div class="ok-dot"></div><span>Prompt scores well across all dimensions.</span></div>';
    }

    showResultState('state-result');
  }

  // ── History
  function renderHistory(items) {
    const list = document.getElementById('history-list');
    if (!items || items.length === 0) {
      list.innerHTML = '<div class="hist-empty">No history yet. Refine some prompts and they will appear here.</div>';
      return;
    }
    list.innerHTML = '';
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'hist-item';
      const score = Number(item.score);
      const scoreColor = score >= 80 ? 'var(--green)' : score >= 55 ? 'var(--orange)' : 'var(--red)';
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' ' +
                      date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      el.innerHTML = \`
        <div class="hist-preview">\${item.original}</div>
        <div class="hist-meta">
          <span class="hist-score" style="color:\${scoreColor}">Score \${score}</span>
          <span class="hist-mode">\${item.mode || 'optimize'}</span>
          <span class="hist-time">\${timeStr}</span>
        </div>\`;
      el.onclick = () => {
        document.getElementById('input').value = item.original;
        switchTab('result');
        document.getElementById('input').focus();
        showToast('Loaded from history');
      };
      list.appendChild(el);
    });
  }

  function clearHistory() {
    vscode.postMessage({ command: 'clearHistory' });
    showToast('History cleared');
  }

  // ── Actions
  function doRefine() {
    const text = document.getElementById('input').value.trim();
    if (!text) { showToast('Enter a prompt first'); return; }
    const mode = document.getElementById('mode-select').value;
    vscode.postMessage({ command: 'refine', text, mode });
  }

  function doCopy() {
    vscode.postMessage({ command: 'copy', text: lastImproved });
    showToast('Copied to clipboard', 'ok');
  }

  function doReplace() {
    vscode.postMessage({ command: 'replace', text: lastImproved });
    showToast('Replaced selection in editor', 'ok');
  }

  function showToast(msg, type='') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' '+type : '');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // Ctrl+Enter to submit
  document.getElementById('input').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doRefine(); }
  });
</script>
</body>
</html>`;
    }
}

// ─── CodeAction Provider ───────────────────────────────────────────────────────

class TheoriaCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] {
        const selectedText = document.getText(range).trim();
        if (!selectedText || selectedText.length < 3) { return []; }
        const action = new vscode.CodeAction("Refine with Theoria", vscode.CodeActionKind.QuickFix);
        action.command = { command: "theoria.refineSelection", title: "Refine with Theoria" };
        return [action];
    }
}

// ─── System Prompt (mode-aware) ────────────────────────────────────────────────

function buildSystemPrompt(rawPrompt: string, mode: Mode): string {
    const modeInstructions: Record<Mode, string> = {
        optimize: `Transform this vague or incomplete prompt into a clear, precise, and highly effective prompt that produces excellent results from AI coding assistants. Include the goal, tech stack if known, expected output format, edge cases, constraints (performance/security/scalability), and what must NOT change.`,
        explain: `Rewrite this prompt to ask the AI to explain the topic clearly with concrete examples, analogies, step-by-step breakdown, and a summary. The output should be beginner-friendly but technically accurate.`,
        generate: `Rewrite this prompt to ask the AI to generate production-ready code. Include: language/framework requirements, function signatures, error handling, input validation, edge cases, inline comments, and test examples.`,
        documentation: `Rewrite this prompt to ask the AI to produce comprehensive technical documentation including: overview, installation steps, API reference with all parameters and return types, usage examples with code snippets, common pitfalls, and a changelog section.`,
    };

    return `You are an expert prompt engineer. ${modeInstructions[mode]}

CRITICAL: Return ONLY a raw JSON object. No markdown fences, no prose outside JSON. Start with { and end with }.

Required structure:
{"improvedPrompt":"...","explanation":"...","score":85,"confidence":"high"}

Rules:
- improvedPrompt: Fully rewritten prompt. Be specific, complete, and unambiguous. Do not truncate.
- explanation: One sentence explaining the single most impactful improvement.
- score: Integer 0-100 rating the IMPROVED prompt's effectiveness (clarity + specificity + completeness + constraints).
- confidence: "high" if prompt is excellent and complete, "medium" if good but could be more specific, "low" if prompt has gaps.

User's raw prompt:
"""
${rawPrompt}
"""`;
}

// ─── Safe JSON Parser ──────────────────────────────────────────────────────────

function safeParseAIResponse(content: string, originalInput: string): AIResponse {
    console.log("[Theoria] AI RAW:", content);
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) { cleaned = jsonMatch[0]; }
    cleaned = cleaned.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    console.log("[Theoria] AI CLEANED:", cleaned);

    try {
        const parsed = JSON.parse(cleaned) as Partial<AIResponse & { confidence: Confidence }>;
        const improvedPrompt = typeof parsed.improvedPrompt === "string" && parsed.improvedPrompt.trim()
            ? parsed.improvedPrompt : originalInput;
        const explanation = typeof parsed.explanation === "string" && parsed.explanation.trim()
            ? parsed.explanation : "Prompt refined for clarity and specificity.";
        const feedback: string[] = Array.isArray(parsed.feedback) && parsed.feedback.every(f => typeof f === "string")
            ? parsed.feedback : [];
        const score = typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 100
            ? parsed.score : 70;
        const confidence: Confidence = (["high","medium","low"].includes(parsed.confidence ?? ""))
            ? parsed.confidence! : (score >= 85 ? "high" : score >= 70 ? "medium" : "low");

        return { improvedPrompt, explanation, feedback, score, confidence };
    } catch (err) {
        console.error("[Theoria] JSON parse failed:", err);
        const rawText = content.trim();
        const looksLikePrompt = rawText.length > 20 && !rawText.startsWith("{");
        return {
            improvedPrompt: looksLikePrompt ? rawText : originalInput,
            explanation: looksLikePrompt ? "AI returned plain text — used directly." : "Could not parse AI response.",
            feedback: [],
            score: 60,
            confidence: "medium",
        };
    }
}