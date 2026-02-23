#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const FRONTEND_ENV_PATH = path.join(FRONTEND_DIR, '.env');
const FRONTEND_ENV_EXAMPLE_PATH = path.join(FRONTEND_DIR, '.env.example');

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return;
  }

  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    return;
  }

  fs.writeFileSync(ENV_PATH, '', 'utf8');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findKeyLineIndex(lines, key) {
  const pattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);
  return lines.findIndex((line) => pattern.test(line));
}

function parseLineValue(line) {
  const idx = line.indexOf('=');
  if (idx < 0) {
    return '';
  }
  return line.slice(idx + 1).trim();
}

function hasNonEmptyValue(lines, key) {
  const idx = findKeyLineIndex(lines, key);
  if (idx < 0) {
    return false;
  }
  return parseLineValue(lines[idx]).length > 0;
}

function setValue(lines, key, value) {
  const idx = findKeyLineIndex(lines, key);
  const nextLine = `${key}=${value}`;

  if (idx >= 0) {
    lines[idx] = nextLine;
    return;
  }

  if (lines.length > 0 && lines[lines.length - 1] !== '') {
    lines.push('');
  }
  lines.push(nextLine);
}

function generateKey() {
  return crypto.randomBytes(32).toString('base64url');
}

function getValue(lines, key) {
  const idx = findKeyLineIndex(lines, key);
  if (idx < 0) {
    return '';
  }
  return parseLineValue(lines[idx]);
}

function ensureFrontendEnvFile() {
  if (fs.existsSync(FRONTEND_ENV_PATH)) {
    return;
  }

  if (fs.existsSync(FRONTEND_ENV_EXAMPLE_PATH)) {
    fs.copyFileSync(FRONTEND_ENV_EXAMPLE_PATH, FRONTEND_ENV_PATH);
    return;
  }

  fs.writeFileSync(FRONTEND_ENV_PATH, '', 'utf8');
}

function syncFrontendEnv(queryKey) {
  ensureFrontendEnvFile();

  const raw = fs.readFileSync(FRONTEND_ENV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);

  setValue(lines, 'VITE_QUERY_API_KEY', queryKey);
  if (!hasNonEmptyValue(lines, 'VITE_API_BASE_URL')) {
    setValue(lines, 'VITE_API_BASE_URL', 'http://localhost:3000');
  }

  const output = `${lines.join('\n').replace(/\n*$/, '\n')}`;
  fs.writeFileSync(FRONTEND_ENV_PATH, output, 'utf8');
}

function main() {
  ensureEnvFile();

  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const generated = {};

  if (!hasNonEmptyValue(lines, 'QUERY_API_KEY')) {
    generated.QUERY_API_KEY = generateKey();
    setValue(lines, 'QUERY_API_KEY', generated.QUERY_API_KEY);
  }

  if (!hasNonEmptyValue(lines, 'INGEST_API_KEY')) {
    generated.INGEST_API_KEY = generateKey();
    setValue(lines, 'INGEST_API_KEY', generated.INGEST_API_KEY);
  }

  const output = `${lines.join('\n').replace(/\n*$/, '\n')}`;
  fs.writeFileSync(ENV_PATH, output, 'utf8');

  const queryKey = getValue(lines, 'QUERY_API_KEY');
  if (queryKey) {
    syncFrontendEnv(queryKey);
  }

  const generatedKeys = [];
  if (generated.QUERY_API_KEY) {
    generatedKeys.push(`QUERY_API_KEY=${generated.QUERY_API_KEY}`);
  }
  if (generated.INGEST_API_KEY) {
    generatedKeys.push(`INGEST_API_KEY=${generated.INGEST_API_KEY}`);
  }

  if (generatedKeys.length > 0) {
    process.stdout.write(`${generatedKeys.join('\n')}\n`);
  }
}

main();
