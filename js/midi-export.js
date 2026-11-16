(function (root) {
  'use strict';

  const PPQ = 480;
  const asciiText = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const textBytes = text => Array.from(new TextEncoder().encode(asciiText(text)));
  const u16 = n => [(n >>> 8) & 255, n & 255];
  const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

  function variableLength(value) {
    let buffer = Math.max(0, Math.floor(value)) & 0x7F;
    const bytes = [];
    while ((value = Math.floor(value / 128)) > 0) {
      buffer <<= 8;
      buffer |= ((value & 0x7F) | 0x80);
    }
    while (true) {
      bytes.push(buffer & 255);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  }

  function meta(type, data) { return [0xFF, type, ...variableLength(data.length), ...data]; }
  function chunk(id, data) { return [...textBytes(id), ...u32(data.length), ...data]; }

  function makeConductorTrack(composition) {
    const bpm = composition.options.bpm;
    const microsecondsPerBeat = Math.round(60000000 / bpm);
    const tempo = [
      (microsecondsPerBeat >>> 16) & 255,
      (microsecondsPerBeat >>> 8) & 255,
      microsecondsPerBeat & 255
    ];
    const events = [
      { tick: 0, priority: -3, bytes: meta(0x03, textBytes('NEON DRIVE - Conductor')) },
      { tick: 0, priority: -2, bytes: meta(0x01, textBytes(`${composition.title || 'Synthwave'} · ${composition.totalBars || composition.options.bars} compassos`)) },
      { tick: 0, priority: -1, bytes: meta(0x51, tempo) },
      { tick: 0, priority: 0, bytes: meta(0x58, [4, 2, 24, 8]) }
    ];
    (composition.sections || []).forEach((section, index) => {
      const label = `${String(index + 1).padStart(2, '0')} - ${section.name} (compassos ${section.startBar + 1}-${section.endBar})`;
      events.push({ tick: Math.round(section.startBeat * (composition.ppq || PPQ)), priority: 1, bytes: meta(0x06, textBytes(label)) });
    });
    events.sort((a, b) => a.tick - b.tick || a.priority - b.priority);
    const data = [];
    let lastTick = 0;
    for (const event of events) {
      data.push(...variableLength(Math.max(0, event.tick - lastTick)), ...event.bytes);
      lastTick = event.tick;
    }
    data.push(0x00, ...meta(0x2F, []));
    return chunk('MTrk', data);
  }

  function makeNoteTrack(track, composition, ppq) {
    const events = [];
    let order = 0;
    const push = (tick, priority, bytes) => events.push({ tick: Math.max(0, Math.round(tick)), priority, order: order++, bytes });
    const channel = track.channel & 0x0F;

    push(0, -4, meta(0x03, textBytes(track.name)));
    if (track.channel !== 9) push(0, -3, [0xC0 | channel, track.program & 0x7F]);

    // Explicit channel level makes the MIDI start at a predictable, healthy level.
    push(0, -2, [0xB0 | channel, 7, 110]);
    push(0, -1, [0xB0 | channel, 11, 127]);

    // Channel volume and expression automate the final fade in compatible DAWs.
    if (Number.isFinite(composition.fadeOutStartBeat) && Number.isFinite(composition.fadeOutEndBeat)) {
      const fadeStart = composition.fadeOutStartBeat * ppq;
      const fadeLength = Math.max(1, (composition.fadeOutEndBeat - composition.fadeOutStartBeat) * ppq);
      [
        [0, 110],
        [1 / 3, 76],
        [2 / 3, 34],
        [1, 0]
      ].forEach(([fraction, level]) => {
        const tick = fadeStart + Math.round(fadeLength * fraction);
        push(tick, 0, [0xB0 | channel, 7, level]);
        push(tick, 1, [0xB0 | channel, 11, level]);
      });
    }

    track.notes.forEach(note => {
      const start = Math.max(0, Math.round(note.startBeat * ppq));
      const end = Math.max(start + 1, Math.round((note.startBeat + note.durationBeats) * ppq));
      push(end, 2, [0x80 | channel, note.pitch & 0x7F, 0]);
      push(start, 3, [0x90 | channel, note.pitch & 0x7F, note.velocity & 0x7F]);
    });

    events.sort((a, b) => a.tick - b.tick || a.priority - b.priority || a.order - b.order);
    const data = [];
    let lastTick = 0;
    for (const event of events) {
      data.push(...variableLength(Math.max(0, event.tick - lastTick)), ...event.bytes);
      lastTick = event.tick;
    }
    data.push(0x00, ...meta(0x2F, []));
    return chunk('MTrk', data);
  }

  function exportMidi(composition) {
    if (!composition || !Array.isArray(composition.tracks)) throw new Error('Não existe composição MIDI para exportar.');
    const ppq = composition.ppq || PPQ;
    const tracks = [makeConductorTrack(composition), ...composition.tracks.map(track => makeNoteTrack(track, composition, ppq))];
    const header = [...textBytes('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(ppq)];
    return new Uint8Array([...header, ...tracks.flat()]);
  }

  root.SynthwaveMidi = { exportMidi, variableLength };
})(window);
