'use strict';

// Перемешанная колода для каждой комнаты: текст не повторяется, пока не показаны все.
// При новом цикле первый текст также не совпадает с последним предыдущего цикла.
function pickNextText(room, texts, random = Math.random) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Для заезда нужен хотя бы один текст');
  }

  if (!room.textQueue || room.textQueue.length === 0) {
    const queue = Array.from({ length: texts.length }, (_, index) => index);
    // Перемешивание Фишера - Йетса.
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    // В колоде последний элемент выдается первым (pop).
    if (queue.length > 1 && queue[queue.length - 1] === room.textIndex) {
      [queue[0], queue[queue.length - 1]] =
        [queue[queue.length - 1], queue[0]];
    }
    room.textQueue = queue;
  }

  const index = room.textQueue.pop();
  room.textIndex = index;
  return texts[index];
}

module.exports = { pickNextText };
