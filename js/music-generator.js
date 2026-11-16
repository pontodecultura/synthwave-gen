(function (root) {
  'use strict';

  const PPQ = 480;
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALE = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11]
  };
  const PROGRESSIONS = {
    minor: [[1, 6, 3, 7], [1, 7, 6, 7], [1, 3, 7, 6], [6, 7, 1, 1], [1, 4, 6, 7]],
    major: [[1, 6, 4, 5], [6, 4, 1, 5], [1, 5, 6, 4], [4, 5, 3, 6], [1, 4, 2, 5]]
  };

  // Each version preserves the requested eight-part song form.
  const SONG_FORMS = {
    32: [2, 4, 4, 4, 4, 2, 8, 4],
    52: [4, 8, 8, 8, 8, 4, 8, 4],
    64: [4, 12, 8, 12, 8, 4, 12, 4]
  };
  const SECTION_DEFS = [
    { id: 'intro', name: 'Introdução', shortName: 'INTRO', energy: 0.48 },
    { id: 'development1', name: 'Desenvolvimento 1', shortName: 'DESENV. 1', energy: 0.70 },
    { id: 'chorus1', name: 'Refrão', shortName: 'REFRÃO', energy: 1.00 },
    { id: 'development2', name: 'Desenvolvimento 2', shortName: 'DESENV. 2', energy: 0.76 },
    { id: 'chorus2', name: 'Refrão', shortName: 'REFRÃO', energy: 1.02 },
    { id: 'bridge', name: 'Ponte', shortName: 'PONTE', energy: 0.66 },
    { id: 'chorus3', name: 'Refrão final', shortName: 'REFRÃO FINAL', energy: 1.05 },
    { id: 'outro', name: 'Fade Out + End', shortName: 'FADE OUT + END', energy: 0.64 }
  ];

  function seeded(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function () {
      a |= 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }
  function sameArray(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }

  function degreeChord(mode, degree) {
    const table = mode === 'minor'
      ? {
          1: { quality: 'm7', intervals: [0, 3, 7, 10] },
          2: { quality: 'm7b5', intervals: [0, 3, 6, 10] },
          3: { quality: 'maj7', intervals: [0, 4, 7, 11] },
          4: { quality: 'm7', intervals: [0, 3, 7, 10] },
          5: { quality: 'm7', intervals: [0, 3, 7, 10] },
          6: { quality: 'maj7', intervals: [0, 4, 7, 11] },
          7: { quality: '7', intervals: [0, 4, 7, 10] }
        }
      : {
          1: { quality: 'maj7', intervals: [0, 4, 7, 11] },
          2: { quality: 'm7', intervals: [0, 3, 7, 10] },
          3: { quality: 'm7', intervals: [0, 3, 7, 10] },
          4: { quality: 'maj7', intervals: [0, 4, 7, 11] },
          5: { quality: '7', intervals: [0, 4, 7, 10] },
          6: { quality: 'm7', intervals: [0, 3, 7, 10] },
          7: { quality: 'm7b5', intervals: [0, 3, 6, 10] }
        };
    return table[degree] || table[1];
  }
  function degreeRoot(key, mode, degree) { return (key + SCALE[mode][degree - 1]) % 12; }

  function makeVoicing(root, intervals, previous, rng, sectionId) {
    let notes = intervals.map(v => 48 + root + v);
    const variants = [];
    for (let inv = 0; inv < 4; inv++) {
      const candidate = notes.map((n, i) => n + (i < inv ? 12 : 0)).sort((a, b) => a - b);
      while (candidate[0] < 48) candidate[0] += 12;
      while (candidate[candidate.length - 1] > 79) candidate[candidate.length - 1] -= 12;
      if (candidate.every(n => n >= 48 && n <= 79)) variants.push(candidate);
    }
    if (!variants.length) return notes;
    if (!previous) return pick(rng, variants);
    // The bridge uses a more open voicing to create a harmonic contrast.
    if (sectionId === 'bridge') return variants.slice().sort((a, b) => (b[3] - b[0]) - (a[3] - a[0]))[0];
    return variants.map(v => ({
      notes: v,
      score: v.reduce((sum, n, i) => sum + Math.abs(n - (previous[i] ?? n)), 0) + rng() * 1.5
    })).sort((a, b) => a.score - b.score)[0].notes;
  }

  function makeSections(totalBars) {
    const lengths = SONG_FORMS[totalBars] || SONG_FORMS[52];
    let cursor = 0;
    return SECTION_DEFS.map((definition, index) => {
      const bars = lengths[index];
      const section = Object.assign({}, definition, {
        index,
        bars,
        startBar: cursor,
        endBar: cursor + bars,
        startBeat: cursor * 4,
        endBeat: (cursor + bars) * 4
      });
      cursor += bars;
      return section;
    });
  }

  function progressionForSection(sectionId, mode, rng, development1, development2) {
    if (sectionId === 'intro') return mode === 'minor' ? [1, 6, 3, 7] : [1, 6, 4, 5];
    if (sectionId === 'development1') return development1;
    if (sectionId === 'chorus1' || sectionId === 'chorus2' || sectionId === 'chorus3') {
      return mode === 'minor' ? [1, 6, 3, 7] : [1, 5, 6, 4];
    }
    if (sectionId === 'development2') return development2;
    if (sectionId === 'bridge') return mode === 'minor' ? [6, 4, 1, 5] : [2, 4, 1, 5];
    if (sectionId === 'outro') return mode === 'minor' ? [6, 7, 1, 1] : [4, 5, 1, 1];
    return pick(rng, PROGRESSIONS[mode]);
  }

  function getSection(sectionById, id) { return sectionById[id]; }
  function barEnergy(section, localBar) {
    if (section.id !== 'outro') return section.energy;
    const progress = (localBar + 1) / Math.max(1, section.bars);
    return section.energy * (1 - 0.78 * progress);
  }
  function velocity(base, section, localBar, randomAmount) {
    const spread = randomAmount || 0;
    return Math.round(clamp((base + spread) * barEnergy(section, localBar), 1, 122, 60));
  }

  function addNote(track, pitch, beat, duration, noteVelocity, pan, sectionId, role) {
    track.notes.push({
      pitch: Math.round(clamp(pitch, 0, 127, 60)),
      startBeat: Math.max(0, beat),
      durationBeats: Math.max(0.08, duration),
      velocity: Math.round(clamp(noteVelocity, 1, 127, 80)),
      pan: clamp(pan, -1, 1, 0),
      sectionId: sectionId || '',
      role: role || ''
    });
  }
  function getChordTones(chord, baseOctave) {
    return chord.intervals.map(interval => baseOctave + chord.root + interval);
  }

  function getMelodyScale(key, mode, low, high) {
    const pitches = [];
    for (let midi = low; midi <= high; midi++) {
      if (SCALE[mode].some(interval => (key + interval) % 12 === midi % 12)) pitches.push(midi);
    }
    return pitches;
  }

  function makeLeadBar(chord, previous, scalePitches, rng, style, density) {
    const rhythmSets = {
      intro: [[0, 2], [0, 1.5], [1, 3]],
      development: density === 'dense'
        ? [[0, 0.75, 1.5, 2.5, 3.25], [0.5, 1.25, 2, 2.75, 3.5]]
        : [[0, 1.5, 2.5], [0, 1, 2.5], [0.5, 1.5, 3]],
      chorus: [[0, 0.75, 1.5, 2.5, 3.25], [0, 1, 2, 3], [0.5, 1.5, 2.5, 3.25]],
      bridge: [[0, 2], [0, 1.5, 3]],
      outro: [[0], [0, 2]]
    };
    const rhythm = pick(rng, rhythmSets[style] || rhythmSets.development);
    const chordPitchClasses = chord.intervals.map(n => (chord.root + n) % 12);
    const notes = [];
    let last = previous;
    rhythm.forEach((offset, i) => {
      const strong = offset === 0 || offset === 2;
      let pool = scalePitches.filter(note => (!strong || chordPitchClasses.includes(note % 12)) && Math.abs(note - last) <= (style === 'chorus' ? 9 : 7));
      if (!pool.length) pool = scalePitches.filter(note => Math.abs(note - last) <= 10);
      if (!pool.length) pool = scalePitches;
      pool.sort((a, b) => Math.abs(a - last) - Math.abs(b - last));
      const near = pool.slice(0, Math.min(style === 'chorus' ? 7 : 5, pool.length));
      let chosen = pick(rng, near);
      if (style === 'bridge' && i > 0 && rng() < 0.58) {
        const lower = near.filter(note => note <= last + 1);
        if (lower.length) chosen = pick(rng, lower);
      }
      if (style === 'outro') {
        const tonicClass = chord.root;
        if (i === rhythm.length - 1) {
          const tonic = scalePitches.filter(note => note % 12 === tonicClass);
          if (tonic.length) chosen = tonic.reduce((best, note) => Math.abs(note - 72) < Math.abs(best - 72) ? note : best, tonic[0]);
        }
      }
      const next = rhythm[i + 1] ?? 4;
      const duration = Math.max(0.28, (next - offset) * (style === 'chorus' ? 0.82 : 0.78));
      notes.push({ offset, pitch: chosen, duration, accent: strong, pan: Math.sin((offset + i) * 0.8) * 0.32 });
      last = chosen;
    });
    return { notes, lastPitch: last };
  }

  function createComposition(input) {
    const opts = Object.assign({
      key: 9, mode: 'minor', bpm: 104, bars: 52, density: 'balanced', groove: 'driving', seed: 20261116,
      lead: true, bass: true, pad: true, arp: true, drums: true
    }, input || {});
    opts.key = Math.round(clamp(opts.key, 0, 11, 9));
    opts.mode = opts.mode === 'major' ? 'major' : 'minor';
    opts.bpm = Math.round(clamp(opts.bpm, 80, 128, 104));
    opts.bars = [32, 52, 64].includes(Number(opts.bars)) ? Number(opts.bars) : 52;
    opts.density = ['sparse', 'balanced', 'dense'].includes(opts.density) ? opts.density : 'balanced';
    opts.groove = ['classic', 'driving', 'half'].includes(opts.groove) ? opts.groove : 'driving';
    opts.seed = (Number(opts.seed) >>> 0) || 1;
    ['lead', 'bass', 'pad', 'arp', 'drums'].forEach(k => { opts[k] = opts[k] !== false; });

    const rng = seeded(opts.seed);
    const sections = makeSections(opts.bars);
    const sectionById = Object.fromEntries(sections.map(section => [section.id, section]));
    const development1 = pick(rng, PROGRESSIONS[opts.mode]).slice();
    const alternatives = PROGRESSIONS[opts.mode].filter(progression => !sameArray(progression, development1));
    const development2 = pick(rng, alternatives).slice();

    const chords = [];
    const degrees = [];
    let previousVoicing = null;
    sections.forEach(section => {
      const progression = progressionForSection(section.id, opts.mode, rng, development1, development2);
      section.progression = progression.slice();
      for (let localBar = 0; localBar < section.bars; localBar++) {
        let degree = progression[localBar % progression.length];
        // The last chord of the fade-out resolves to the tonic.
        if (section.id === 'outro' && localBar === section.bars - 1) degree = 1;
        const root = degreeRoot(opts.key, opts.mode, degree);
        const chordDef = degreeChord(opts.mode, degree);
        const voicing = makeVoicing(root, chordDef.intervals, previousVoicing, rng, section.id);
        const chord = {
          bar: chords.length + 1,
          degree,
          root,
          name: `${KEYS[root]}${chordDef.quality}`,
          intervals: chordDef.intervals.slice(),
          voicing,
          sectionId: section.id,
          sectionName: section.name,
          sectionShortName: section.shortName
        };
        chords.push(chord);
        degrees.push(degree);
        previousVoicing = voicing;
      }
    });

    const tracks = [];
    const byName = {};
    function track(id, name, program, channel, color, kind) {
      const item = { id, name, program, channel, color, kind, notes: [] };
      tracks.push(item);
      byName[id] = item;
      return item;
    }
    if (opts.lead) track('lead', 'Neon Lead', 81, 0, 'pink', 'synth');
    if (opts.bass) track('bass', 'Analog Bass', 38, 1, 'cyan', 'synth');
    if (opts.pad) track('pad', 'Wide Dream Pad', 89, 2, 'purple', 'synth');
    if (opts.arp) track('arp', 'Clockwork Arpeggio', 80, 3, 'amber', 'synth');
    if (opts.drums) track('drums', 'Electronic Drums', 0, 9, 'green', 'drums');

    // Pad: the harmonic bed changes voicing and energy between sections.
    if (byName.pad) {
      chords.forEach((chord, index) => {
        const section = sectionById[chord.sectionId];
        const localBar = chord.bar - section.startBar - 1;
        const octave = section.id === 'bridge' ? 19 : 12;
        const duration = section.id === 'outro' && localBar === section.bars - 1 ? 4.2 : 3.82;
        chord.voicing.forEach((pitch, n) => {
          const base = section.id === 'chorus3' ? 61 : section.id.startsWith('chorus') ? 59 : 53;
          addNote(byName.pad, pitch + octave, index * 4, duration,
            velocity(base + (n === 0 ? 5 : 0), section, localBar, rng() * 5), n % 2 ? 0.25 : -0.25, section.id, 'chord');
        });
      });
    }

    // Bass: each part gets a slightly different rhythmic contour.
    if (byName.bass) {
      chords.forEach((chord, index) => {
        const section = sectionById[chord.sectionId];
        const localBar = chord.bar - section.startBar - 1;
        const start = index * 4;
        const root = 36 + chord.root;
        const fifth = root + 7;
        let pattern;
        if (section.id === 'intro') pattern = localBar < Math.ceil(section.bars / 2) ? [] : [[0, root], [2, fifth]];
        else if (section.id === 'bridge') pattern = [[0, root], [2.5, fifth]];
        else if (section.id === 'outro') pattern = localBar % 2 === 0 ? [[0, root]] : [];
        else if (section.id === 'development2') pattern = opts.groove === 'driving'
          ? [[0, root], [1.25, fifth], [2.5, root]] : [[0, root], [2, fifth]];
        else if (section.id.startsWith('chorus')) pattern = opts.groove === 'half'
          ? [[0, root], [2.5, fifth]] : [[0, root], [1.5, fifth], [2, root], [3.5, fifth]];
        else if (opts.groove === 'classic') pattern = [[0, root], [2, fifth]];
        else if (opts.groove === 'half') pattern = [[0, root], [2.5, fifth]];
        else pattern = [[0, root], [1.5, fifth], [2, root], [3.5, fifth]];
        pattern.forEach(([offset, pitch], i) => {
          const base = section.id.startsWith('chorus') ? 100 : section.id === 'bridge' ? 78 : 88;
          addNote(byName.bass, pitch, start + offset, i % 2 ? 0.42 : 0.72,
            velocity(base, section, localBar, rng() * 8), 0, section.id, 'bass');
        });
      });
    }

    // Arpeggiator: active in the build and choruses, thinner in the intro, bridge and ending.
    if (byName.arp) {
      chords.forEach((chord, bar) => {
        const section = sectionById[chord.sectionId];
        const localBar = chord.bar - section.startBar - 1;
        const tones = getChordTones(chord, 60).concat(getChordTones(chord, 72));
        let pattern = [0, 1, 2, 3, 2, 1, 2, 3];
        if (section.id === 'intro') {
          if (localBar < Math.ceil(section.bars / 2)) return;
          pattern = [0, 2, 1, 3];
        } else if (section.id === 'development2') pattern = [0, 2, 1, 3, 2, 0];
        else if (section.id === 'bridge') pattern = [0, 2, 3, 1];
        else if (section.id === 'outro') {
          if (localBar >= Math.ceil(section.bars / 2)) return;
          pattern = [0, 1, 2, 1];
        } else if (section.id.startsWith('chorus') && opts.density === 'dense') {
          pattern = [0, 1, 2, 3, 4, 3, 2, 1];
        }
        const step = pattern.length === 4 ? 1 : 0.5;
        pattern.forEach((position, i) => {
          const pickIndex = (position + (bar % 2 ? 1 : 0)) % tones.length;
          const beat = bar * 4 + i * step;
          const base = section.id.startsWith('chorus') ? 70 : 58;
          addNote(byName.arp, tones[pickIndex], beat, Math.min(0.38, step * 0.76),
            velocity(base, section, localBar, rng() * 8), i % 2 ? 0.22 : -0.22, section.id, 'arp');
        });
      });
    }

    // A recognisable 4-bar hook is written once and brought back in all three choruses.
    if (byName.lead) {
      const scalePitches = getMelodyScale(opts.key, opts.mode, 64, 90);
      const chorusOne = sectionById.chorus1;
      const chorusMotif = [];
      let motifPrevious = 75 + (opts.key % 4);
      for (let localBar = 0; localBar < Math.min(4, chorusOne.bars); localBar++) {
        const chord = chords[chorusOne.startBar + localBar];
        const phrase = makeLeadBar(chord, motifPrevious, scalePitches, rng, 'chorus', opts.density);
        chorusMotif.push(phrase.notes);
        motifPrevious = phrase.lastPitch;
      }

      let previous = 74 + (opts.key % 5);
      sections.forEach(section => {
        for (let localBar = 0; localBar < section.bars; localBar++) {
          const absoluteBar = section.startBar + localBar;
          const chord = chords[absoluteBar];
          let phrase;
          let style;
          if (section.id.startsWith('chorus')) {
            const motifIndex = localBar % chorusMotif.length;
            phrase = { notes: chorusMotif[motifIndex], lastPitch: previous };
            style = 'chorus';
          } else if (section.id === 'intro') {
            if (localBar < Math.max(0, section.bars - 2)) continue;
            style = 'intro';
            phrase = makeLeadBar(chord, previous, scalePitches, rng, style, 'sparse');
          } else if (section.id === 'outro') {
            if (localBar < section.bars - 2) continue;
            style = 'outro';
            phrase = makeLeadBar(chord, previous, scalePitches, rng, style, 'sparse');
          } else if (section.id === 'bridge') {
            style = 'bridge';
            phrase = makeLeadBar(chord, previous, scalePitches, rng, style, 'sparse');
          } else {
            style = 'development';
            phrase = makeLeadBar(chord, previous, scalePitches, rng, style, opts.density);
          }

          phrase.notes.forEach((note, noteIndex) => {
            let pitch = note.pitch;
            if (section.id === 'chorus3' && noteIndex === phrase.notes.length - 1 && localBar % 2 === 1) pitch = Math.min(90, pitch + 12);
            if (section.id === 'bridge' && pitch > 82) pitch -= 7;
            const base = style === 'chorus' ? 93 : style === 'bridge' ? 72 : style === 'intro' ? 67 : style === 'outro' ? 63 : 78;
            const extraFill = section.id === 'chorus2' && localBar === section.bars - 1 && noteIndex === phrase.notes.length - 1;
            addNote(byName.lead, pitch, absoluteBar * 4 + note.offset,
              note.duration, velocity(base + (note.accent ? 5 : 0), section, localBar, rng() * 7), note.pan, section.id, 'lead');
            previous = pitch;
            if (extraFill && section.bars >= 4) {
              const fillPitch = scalePitches.reduce((best, candidate) => Math.abs(candidate - (pitch + 2)) < Math.abs(best - (pitch + 2)) ? candidate : best, scalePitches[0]);
              addNote(byName.lead, fillPitch, absoluteBar * 4 + 3.5, 0.28,
                velocity(72, section, localBar, 0), 0.18, section.id, 'fill');
            }
          });
        }
      });
    }

    // Electronic drums evolve with the song form instead of repeating one bar unchanged.
    if (byName.drums) {
      chords.forEach((_, bar) => {
        const chord = chords[bar];
        const section = sectionById[chord.sectionId];
        const localBar = chord.bar - section.startBar - 1;
        const start = bar * 4;
        let kickBeats = [];
        let snareBeats = [];
        let hatStep = 0.5;
        if (section.id === 'intro') {
          if (localBar === section.bars - 1) { kickBeats = [0]; snareBeats = [3]; }
          hatStep = 1;
        } else if (section.id === 'bridge') {
          kickBeats = [0]; snareBeats = [2]; hatStep = 1;
        } else if (section.id === 'outro') {
          if (localBar === 0) { kickBeats = [0]; snareBeats = [2]; }
          hatStep = 1;
        } else if (section.id === 'development2') {
          kickBeats = [0, 2.5]; snareBeats = [1, 3]; hatStep = opts.density === 'dense' ? 0.5 : 1;
        } else if (section.id.startsWith('chorus')) {
          kickBeats = opts.groove === 'half' ? [0, 2.5] : [0, 1.5, 2, 3.5];
          snareBeats = [1, 3]; hatStep = opts.density === 'dense' ? 0.25 : 0.5;
        } else {
          kickBeats = opts.groove === 'classic' ? [0, 2] : opts.groove === 'half' ? [0, 2.5] : [0, 1.5, 2];
          snareBeats = [1, 3];
          hatStep = opts.density === 'dense' ? 0.25 : 0.5;
        }
        kickBeats.forEach((beat, i) => addNote(byName.drums, 36, start + beat, 0.22,
          velocity(beat === 0 ? 115 : 101, section, localBar, 0), 0, section.id, 'kick'));
        snareBeats.forEach(beat => addNote(byName.drums, 38, start + beat, 0.18,
          velocity(92, section, localBar, 0), 0, section.id, 'snare'));
        for (let beat = 0.5; beat < 4; beat += hatStep) {
          const offbeat = Math.abs(beat % 1) > 0.1;
          const hatVelocity = section.id.startsWith('chorus') ? 54 : 43;
          addNote(byName.drums, offbeat ? 46 : 42, start + beat, 0.08,
            velocity(hatVelocity, section, localBar, 0), 0.12, section.id, 'hat');
        }
        if ((section.id === 'chorus1' || section.id === 'chorus3') && localBar === 0) {
          addNote(byName.drums, 49, start, 0.5, velocity(72, section, localBar, 0), 0, section.id, 'crash');
        }
      });
    }

    tracks.forEach(t => t.notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch));
    const totalBeats = opts.bars * 4;
    const outro = sectionById.outro;
    return {
      title: opts.mode === 'minor' ? 'Midnight Drive' : 'Neon Skyline',
      options: opts,
      sections,
      chords,
      degrees,
      tracks,
      ppq: PPQ,
      totalBars: opts.bars,
      totalBeats,
      fadeOutStartBeat: outro.startBeat,
      fadeOutEndBeat: totalBeats,
      durationSeconds: (totalBeats * 60) / opts.bpm
    };
  }

  root.SynthwaveComposer = {
    KEYS,
    PPQ,
    SONG_FORMS,
    createComposition
  };
})(window);
