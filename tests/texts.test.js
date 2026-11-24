'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const TEXTS = require('../texts');
const { pickNextText } = require('../text-picker');

test('в игре есть 200 уникальных текстов на русской раскладке', () => {
  assert.equal(TEXTS.length, 200);
  assert.equal(new Set(TEXTS).size, 200);
  for (const text of TEXTS) {
    assert.ok(text.length >= 150 && text.length <= 260, 'Текст не должен быть слишком коротким или длинным');
    assert.ok(!/[ёЁ«»“”—–\n]/.test(text), 'Нет лишних символов и переносов');
    assert.ok(!/[A-Za-z]/.test(text), 'Игровой текст набирается на русской раскладке');
  }
});

test('в одной комнате все тексты проходят без повторений', () => {
  const room = { textIndex: -1, textQueue: [] };
  const found = Array.from({ length: TEXTS.length }, () => pickNextText(room, TEXTS, () => 0.37));
  assert.equal(new Set(found).size, TEXTS.length);
});

test('на стыке двух циклов нет немедленного повтора', () => {
  const room = { textIndex: -1, textQueue: [] };
  const first = Array.from({ length: TEXTS.length }, () => pickNextText(room, TEXTS, () => 0));
  const second = Array.from({ length: TEXTS.length }, () => pickNextText(room, TEXTS, () => 0));
  assert.notEqual(first.at(-1), second[0]);
  assert.equal(new Set(second).size, TEXTS.length);
});

test('каждая комната использует свою очередь', () => {
  const a = { textIndex: -1, textQueue: [] };
  const b = { textIndex: -1, textQueue: [] };
  pickNextText(a, TEXTS, () => 0.5);
  assert.equal(a.textQueue.length, TEXTS.length - 1);
  assert.equal(b.textQueue.length, 0);
  pickNextText(b, TEXTS, () => 0.4);
  assert.equal(b.textQueue.length, TEXTS.length - 1);
  assert.equal(a.textQueue.length, TEXTS.length - 1);
});

test('колода с одним текстом и пустая коллекция', () => {
  const room = { textIndex: -1, textQueue: [] };
  assert.equal(pickNextText(room, ['Один таракан'], () => 0.5), 'Один таракан');
  assert.equal(pickNextText(room, ['Один таракан'], () => 0.5), 'Один таракан');
  assert.throws(() => pickNextText(room, []), /хотя бы один текст/);
});
