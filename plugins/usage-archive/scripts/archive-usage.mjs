#!/usr/bin/env node
/**
 * Claude Code / Codex の利用量を ccusage で集計し、月別 JSON として保存する。
 * 各行は「日×エージェント」単位（例: { period: "2026-08-01", agent: "claude", ... }）。
 *
 *   node archive-usage.mjs           その場で集計して保存する
 *   node archive-usage.mjs --hook    前回実行から一定日数経っていればバックグラウンドで集計する
 */

import { spawn, spawnSync } from 'node:child_process';
import {
	appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
	renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 1.5年分 + 余裕2ヶ月
const KEEP_MONTHS = 20;
const INTERVAL_DAYS = 1;
const MS_PER_DAY = 86_400_000;

const ARCHIVE_DIR = process.env.USAGE_ARCHIVE_DIR || path.join(homedir(), 'usage-archive');
// 出力形式の変更やサプライチェーン攻撃を避けるため完全に固定する。
// --by-agent は 20.0.15 以降でしか使えない。更新は動作を確認してから手で上げる
const CCUSAGE_CMD = 'npx -y ccusage@20.0.20';

const STAMP_FILE = path.join(ARCHIVE_DIR, '.last-run');
const LOG_FILE = path.join(ARCHIVE_DIR, 'run.log');
const CCUSAGE_CONFIG_FILE = path.join(ARCHIVE_DIR, 'ccusage-config.json');
const SELF = fileURLToPath(import.meta.url);

// SessionStart フックの stdout は Claude のコンテキストに入るため、出力はログにだけ書く
function log(message) {
	try {
		mkdirSync(ARCHIVE_DIR, { recursive: true });
		appendFileSync(LOG_FILE, `${new Date().toISOString()}  ${message}\n`);
	} catch { /* ログの失敗で本体を止めない */ }
}

function isDue() {
	if (!existsSync(STAMP_FILE)) return true;
	const elapsedDays = (Date.now() - statSync(STAMP_FILE).mtimeMs) / MS_PER_DAY;
	return elapsedDays >= INTERVAL_DAYS;
}

function touchStamp() {
	mkdirSync(ARCHIVE_DIR, { recursive: true });
	writeFileSync(STAMP_FILE, new Date().toISOString());
}

function runCcusage(args) {
	const result = spawnSync(`${CCUSAGE_CMD} ${args}`, {
		shell: true,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		windowsHide: true,
		// ccusage は実行ディレクトリの .ccusage/ccusage.json を読むため、作業プロジェクトの外で実行する
		cwd: ARCHIVE_DIR,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`ccusage exited with ${result.status}: ${(result.stderr || '').trim().slice(0, 500)}`);
	}
	return result.stdout ?? '';
}

function rowKey(row) {
	return `${row.period}|${row.agent}`;
}

// 壊れたファイルを上書きして過去データを失わないよう、読めなければ例外にする
function readExistingRows(file) {
	if (!existsSync(file)) return [];
	const json = JSON.parse(readFileSync(file, 'utf8'));
	if (!Array.isArray(json?.rows)) throw new Error('rows 配列がありません');
	return json.rows;
}

// ccusage には直近30日分しか見えないため、見えなくなった日は既存の行を残す。
// 同じ日・同じエージェントはトークン数が多い方を採る（ログが途中まで消えた日の
// 不完全な値で既存の記録を上書きしないため）。
function mergeRows(existingRows, freshRows) {
	const merged = new Map(existingRows.map((row) => [rowKey(row), row]));
	for (const row of freshRows) {
		const old = merged.get(rowKey(row));
		if (!old || row.totalTokens >= old.totalTokens) merged.set(rowKey(row), row);
	}
	return [...merged.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b)));
}

// これより古い月（YYYY-MM）を削除する
function oldestMonthToKeep() {
	const now = new Date();
	const cutoff = new Date(now.getFullYear(), now.getMonth() - KEEP_MONTHS + 1, 1);
	return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
}

function archive() {
	mkdirSync(ARCHIVE_DIR, { recursive: true });
	if (!existsSync(CCUSAGE_CONFIG_FILE)) writeFileSync(CCUSAGE_CONFIG_FILE, '{}\n');

	const raw = runCcusage(`daily --json --by-agent --breakdown --config "${CCUSAGE_CONFIG_FILE}"`);
	const start = raw.indexOf('{');
	if (start < 0) throw new Error('ccusage の出力に JSON が含まれていません');

	const days = JSON.parse(raw.slice(start)).daily ?? [];
	const rows = days.flatMap((day) => (day.agents ?? []).map((agent) => ({ period: day.period, ...agent })));
	if (rows.length === 0) {
		log('集計対象のデータがありません。アーカイブは変更しませんでした。');
		return;
	}

	const byMonth = new Map();
	for (const row of rows) {
		const month = row.period.slice(0, 7);
		byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
	}

	const capturedAt = new Date().toISOString();
	for (const [month, freshRows] of byMonth) {
		const file = path.join(ARCHIVE_DIR, `${month}.json`);

		let existingRows;
		try {
			existingRows = readExistingRows(file);
		} catch (error) {
			log(`skip: ${file} が読めないため更新しません (${error?.message ?? error})`);
			continue;
		}

		const merged = mergeRows(existingRows, freshRows);
		const tmp = `${file}.${process.pid}.tmp`;
		writeFileSync(tmp, `${JSON.stringify({ month, capturedAt, rows: merged }, null, 2)}\n`);
		renameSync(tmp, file);
		log(`saved: ${file} (${merged.length} rows)`);
	}

	const oldest = oldestMonthToKeep();
	for (const name of readdirSync(ARCHIVE_DIR)) {
		const match = /^(\d{4}-\d{2})\.json$/.exec(name);
		if (match && match[1] < oldest) {
			unlinkSync(path.join(ARCHIVE_DIR, name));
			log(`pruned: ${name}`);
		}
	}
}

const mode = process.argv[2] ?? '--run';

if (mode === '--hook') {
	// フックは即座に返し、集計は切り離した子プロセスで行う
	if (!isDue()) process.exit(0);
	const child = spawn(process.execPath, [SELF, '--run'], {
		detached: true,
		stdio: 'ignore',
		windowsHide: true,
	});
	child.unref();
	process.exit(0);
}

try {
	archive();
	// 失敗したときは次のセッション開始で再試行されるよう、成功後にだけ記録する
	touchStamp();
} catch (error) {
	log(`ERROR: ${error?.message ?? error}`);
	process.exitCode = 1;
}
