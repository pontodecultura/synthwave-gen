(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let composition = null;
  let progressTimer = null;
  let rendering = false;

  const rangeFormats = {
    bpmRange: v => `${v} BPM`,
    masterVolume: v => `${v}%`,
    filterCutoff: v => `${(Number(v) / 1000).toFixed(1)} kHz`,
    filterResonance: v => `${v}%`,
    osc1Mix: v => `${v}%`, osc2Mix: v => `${v}%`, osc3Mix: v => `${v}%`,
    attackRange: v => `${v} ms`, decayRange: v => `${v} ms`, sustainRange: v => `${v}%`, releaseRange: v => `${v} ms`,
    lfoRate: v => `${Number(v).toFixed(2)} Hz`, lfoDepth: v => `${v}%`, portamento: v => `${v} ms`,
    chorusMix: v => `${v}%`, delayMix: v => `${v}%`, delayTime: v => `${v} ms`,
    reverbMix: v => `${v}%`, reverbSize: v => `${Number(v).toFixed(1)} s`, driveAmount: v => `${v}%`
  };
  const outputMap = {
    bpmRange: 'bpmValue', masterVolume: 'masterVolumeValue', filterCutoff: 'filterCutoffValue', filterResonance: 'filterResonanceValue',
    osc1Mix: 'osc1MixValue', osc2Mix: 'osc2MixValue', osc3Mix: 'osc3MixValue',
    attackRange: 'attackValue', decayRange: 'decayValue', sustainRange: 'sustainValue', releaseRange: 'releaseValue',
    lfoRate: 'lfoRateValue', lfoDepth: 'lfoDepthValue', portamento: 'portamentoValue', chorusMix: 'chorusMixValue',
    delayMix: 'delayMixValue', delayTime: 'delayTimeValue', reverbMix: 'reverbMixValue', reverbSize: 'reverbSizeValue', driveAmount: 'driveAmountValue'
  };

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function safeFileKey() { return SynthwaveComposer.KEYS[Number($('keySelect').value)].replace('#', 'sharp'); }
  function readOptions() {
    return {
      key: Number($('keySelect').value), mode: $('modeSelect').value,
      bpm: Number($('bpmRange').value), bars: Number($('barsSelect').value),
      groove: $('grooveSelect').value, density: $('densitySelect').value,
      seed: $('seedInput').value,
      lead: $('layerLead').checked, bass: $('layerBass').checked, pad: $('layerPad').checked,
      arp: $('layerArp').checked, drums: $('layerDrums').checked
    };
  }
  function updateRangeLabel(id) {
    const outputId = outputMap[id];
    if (!outputId || !$(id)) return;
    $(outputId).textContent = (rangeFormats[id] || (v => v))($(id).value);
  }
  function setStatus(text, state) {
    $('statusText').textContent = text;
    $('statusText').classList.toggle('error-text', state === 'error');
    $('statusText').classList.toggle('success-text', state === 'success');
  }
  function updateTransportBadges() {
    $('tempoBadge').textContent = `${$('bpmRange').value} BPM`;
    const key = SynthwaveComposer.KEYS[Number($('keySelect').value)];
    $('keyBadge').textContent = `${key} ${$('modeSelect').value.toUpperCase()}`;
  }
  function updateDuration() {
    $('timeText').textContent = `${formatTime(0)} / ${formatTime(composition?.durationSeconds || 0)}`;
  }
  function renderSections() {
    if (!composition) return;
    const timeline = $('sectionTimeline');
    timeline.replaceChildren();
    composition.sections.forEach(section => {
      const card = document.createElement('article');
      card.className = `section-chip section-${section.id}`;
      const heading = document.createElement('strong');
      heading.textContent = section.name;
      const range = document.createElement('span');
      range.textContent = `COMPASSOS ${section.startBar + 1}–${section.endBar}`;
      const length = document.createElement('small');
      length.textContent = `${section.bars} ${section.bars === 1 ? 'compasso' : 'compassos'}`;
      card.append(heading, range, length);
      timeline.appendChild(card);
    });
  }

  function renderChords() {
    if (!composition) return;
    renderSections();
    const grid = $('chordGrid');
    grid.replaceChildren();
    composition.chords.forEach((chord, i) => {
      const card = document.createElement('div');
      card.className = `chord-card${chord.degree === 1 ? ' tonic' : ''}`;
      card.title = `${chord.sectionName} · compasso ${i + 1}`;
      const bar = document.createElement('span'); bar.className = 'bar-number'; bar.textContent = `BAR ${String(i + 1).padStart(2, '0')}`;
      const title = document.createElement('strong'); title.textContent = chord.name;
      const roman = document.createElement('small'); roman.textContent = `${chord.sectionShortName} · GRAU ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][chord.degree - 1]}`;
      card.append(bar, title, roman); grid.appendChild(card);
    });
    const opts = composition.options;
    const key = SynthwaveComposer.KEYS[opts.key];
    $('compositionName').textContent = `${composition.title.toUpperCase()} · ${key} ${opts.mode.toUpperCase()}`;
    $('compositionInfo').textContent = `${opts.bpm} BPM · ${composition.totalBars} BARS · 4/4 · 8 PARTS`;
    $('trackSummary').textContent = composition.tracks.map(t => `${t.name}: ${t.notes.length} eventos`).join('   /   ');
  }
  function stopPlayback(resetProgress) {
    if (progressTimer !== null) window.clearInterval(progressTimer);
    progressTimer = null;
    SynthwaveAudioEngine.stop(false);
    $('playIcon').textContent = '▶';
    $('playLabel').textContent = 'PLAY COMPOSITION';
    $('playButton').classList.remove('is-playing');
    $('stopButton').disabled = true;
    if (resetProgress !== false) {
      $('progressBar').style.width = '0%';
      updateDuration();
    }
  }
  function generateComposition() {
    stopPlayback();
    composition = SynthwaveComposer.createComposition(readOptions());
    renderChords();
    $('exportMidiButton').disabled = false;
    $('exportWavButton').disabled = false;
    $('timeText').textContent = `00:00 / ${formatTime(composition.durationSeconds)}`;
    $('progressBar').style.width = '0%';
    updateTransportBadges();
    setStatus(`Composição gerada · seed ${composition.options.seed} · ${composition.tracks.length} pistas.`, 'success');
  }
  async function playComposition() {
    if (!composition) generateComposition();
    if (SynthwaveAudioEngine.isPlaying) { stopPlayback(); return; }
    try {
      setStatus('Inicializando osciladores e efeitos...');
      $('playButton').disabled = true;
      const result = await SynthwaveAudioEngine.play(composition, () => {
        stopPlayback(false);
        $('progressBar').style.width = '100%';
        $('timeText').textContent = `${formatTime(composition.durationSeconds)} / ${formatTime(composition.durationSeconds)}`;
        setStatus('Reprodução concluída.', 'success');
      });
      $('playButton').disabled = false;
      $('playIcon').textContent = 'Ⅱ';
      $('playLabel').textContent = 'PLAYING';
      $('playButton').classList.add('is-playing');
      $('stopButton').disabled = false;
      setStatus('Reproduzindo com sintetizador de três osciladores.', 'success');
      if (progressTimer !== null) window.clearInterval(progressTimer);
      progressTimer = window.setInterval(() => {
        const position = Math.min(result.duration, SynthwaveAudioEngine.getPosition());
        $('progressBar').style.width = `${Math.min(100, position / result.duration * 100)}%`;
        $('timeText').textContent = `${formatTime(position)} / ${formatTime(result.duration)}`;
      }, 80);
    } catch (error) {
      $('playButton').disabled = false;
      stopPlayback();
      setStatus(`Falha de áudio: ${error?.message || error}`, 'error');
    }
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function exportMidi() {
    if (!composition) return;
    try {
      const bytes = SynthwaveMidi.exportMidi(composition);
      downloadBlob(new Blob([bytes], { type: 'audio/midi' }), `synthwave_${safeFileKey()}_${composition.options.bpm}bpm_seed-${composition.options.seed}.mid`);
      setStatus('MIDI multifaixa exportado com pistas separadas.', 'success');
    } catch (error) { setStatus(`Falha ao exportar MIDI: ${error?.message || error}`, 'error'); }
  }
  async function exportWav() {
    if (!composition || rendering) return;
    rendering = true;
    $('exportWavButton').disabled = true;
    $('exportMidiButton').disabled = true;
    $('exportWavButton').querySelector('span').textContent = 'RENDERING...';
    document.body.classList.add('is-rendering');
    try {
      const blob = await SynthwaveAudioEngine.renderWav(composition, 48000, message => setStatus(message));
      if (!(blob instanceof Blob) || blob.size < 48000) throw new Error('O arquivo WAV retornado é pequeno ou inválido.');
      downloadBlob(blob, `synthwave_${safeFileKey()}_${composition.options.bpm}bpm_${composition.options.seed}_48kHz.wav`);
      setStatus(`WAV exportado · ${(blob.size / 1048576).toFixed(1)} MB · estéreo 48 kHz PCM 16-bit.`, 'success');
    } catch (error) {
      setStatus(`Falha ao renderizar WAV: ${error?.message || error}`, 'error');
    } finally {
      rendering = false;
      $('exportWavButton').disabled = !composition;
      $('exportMidiButton').disabled = !composition;
      $('exportWavButton').querySelector('span').textContent = 'RENDER WAV';
      document.body.classList.remove('is-rendering');
    }
  }
  function bindControls() {
    Object.keys(outputMap).forEach(id => {
      updateRangeLabel(id);
      $(id)?.addEventListener('input', () => { updateRangeLabel(id); if (id === 'bpmRange') updateTransportBadges(); });
    });
    ['keySelect', 'modeSelect', 'bpmRange'].forEach(id => $(id).addEventListener('change', updateTransportBadges));
    $('randomSeedButton').addEventListener('click', () => {
      const seed = window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967295);
      $('seedInput').value = Math.max(1, seed);
    });
    $('generateButton').addEventListener('click', generateComposition);
    $('playButton').addEventListener('click', playComposition);
    $('testAudioButton').addEventListener('click', async () => {
      const button = $('testAudioButton');
      button.disabled = true;
      try {
        setStatus('Testando a saída de áudio com uma nota C4...');
        const result = await SynthwaveAudioEngine.testAudio();
        setStatus(`Nota de teste enviada · AudioContext: ${result.state}.`, 'success');
      } catch (error) {
        setStatus(`Falha no teste de áudio: ${error?.message || error}`, 'error');
      } finally { button.disabled = false; }
    });
    $('stopButton').addEventListener('click', () => stopPlayback());
    $('exportMidiButton').addEventListener('click', exportMidi);
    $('exportWavButton').addEventListener('click', exportWav);
  }

  bindControls();
  generateComposition();
})();
